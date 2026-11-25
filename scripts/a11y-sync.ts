/**
 * 维护者模式同步脚本：在 .cache/a11y-lab 里装最新 lint，
 * 从 lab 的 aria-query 生成 aria 数据，再用探针重新生成各 lint 的规则表。
 *
 * 生成文件覆盖 src/a11y 下的同名文件；lint 版本漂移后重跑即可。
 * 探针自检或不变量失败时直接抛错，任何文件都不会写出。
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ProbeFs } from '../src/a11y/probe';
import { probe } from '../src/a11y/probe';
import type { AriaQuerySource } from '../src/a11y/probe/aria-gen';
import {
  ariaKeys,
  generateAriaTypes,
  generateSamples,
  nameRules,
  samplesOf,
} from '../src/a11y/probe/aria-gen';
import type { DetectedLint } from '../src/a11y/probe/detect';
import { detectLints } from '../src/a11y/probe/detect';
import { nodeExec } from '../src/a11y/probe/exec';
import {
  generateProfiles,
  mergeProfilesSnapshot,
} from '../src/a11y/probe/profiles-gen';
import { PROFILES } from '../src/a11y/probe/profiles.generated';
import { runBiome } from '../src/a11y/probe/runners/biome';
import { runBun } from '../src/a11y/probe/runners/bun';
import { runEslint } from '../src/a11y/probe/runners/eslint';
import { runOxlint } from '../src/a11y/probe/runners/oxlint';
import type { ProfileData } from '../src/a11y/probe/serialize';
import { serializeProfile } from '../src/a11y/probe/serialize';
import { createLab, labDirOf, runCmd } from './lab';

const root = resolve(import.meta.dir, '..');

const LINTS = ['eslint', 'oxlint', 'biome', 'bun'] as const;
type LintName = (typeof LINTS)[number];

// readonly 元组的 includes 只收元组成员类型，判不了任意 string；
// 先收宽成 string[]，收窄交给下面的类型谓词。
const LINT_NAMES: readonly string[] = LINTS;

const isLintName = (name: string): name is LintName =>
  LINT_NAMES.includes(name);

const USAGE =
  'usage: bun run a11y:sync [--lint=eslint,oxlint,biome,bun] [--keep]';

const args = process.argv.slice(2);
const keep = args.includes('--keep');
const lintArg = args.find((a) => a.startsWith('--lint='));
for (const arg of args) {
  if (arg === '--keep' || arg.startsWith('--lint=')) continue;
  // 严格解析：拼错或空格形式的参数宁可失败，也不能悄悄回落到默认全量。
  throw new Error(`unknown argument: ${arg}\n${USAGE}`);
}

const wanted = [
  ...new Set(
    (lintArg === undefined
      ? [...LINTS]
      : lintArg.slice('--lint='.length).split(',')
    ).map((name) => {
      if (!isLintName(name)) {
        throw new Error(
          `unknown lint '${name}'; expected one of: ${LINTS.join(', ')}`,
        );
      }
      return name;
    }),
  ),
];

// aria-query 是无类型的 CJS 包，按文件 URL 装载后只剩 any；
// 这里声明脚本依赖的最小形状（lab 实测：aria/roles 均为 Map）。
interface AriaQueryMaps {
  readonly aria: ReadonlyMap<
    string,
    Omit<AriaQuerySource['aria'][number], 'name'>
  >;
  readonly roles: ReadonlyMap<
    string,
    Omit<AriaQuerySource['roles'][number], 'name'>
  >;
}

// ProbeFs 的 node:fs 适配：write 要自建父目录，rm 递归且不因不存在报错。
const fs: ProbeFs = {
  write: (path, content) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  },
  rm: (path) => rmSync(path, { recursive: true, force: true }),
};

// 失败也不能留下几百 MB 的 lab：统一在 finally 清理，--keep 保留排查现场。
try {
  console.log(`[a11y-sync] preparing lab at ${labDirOf(root)}`);
  // 四个 lint 全量装（含未点名的）：lab 里有没有 oxlint 标记决定 bun lint
  // 走内嵌 oxlint 模式还是默认规则集，bun 表的录制条件因此固定含 oxlint。
  const { cwd: lab } = createLab({
    root,
    lints: LINTS.map((name) => ({ name })),
    extraDeps: ['aria-query'],
  });

  console.log('[a11y-sync] loading aria-query from the lab');
  const maps = (await import(
    pathToFileURL(join(lab, 'node_modules/aria-query/lib/index.js')).href
  )) as AriaQueryMaps;
  const source: AriaQuerySource = {
    aria: [...maps.aria.entries()].map(([name, def]) => ({ name, ...def })),
    roles: [...maps.roles.entries()].map(([name, def]) => ({ name, ...def })),
  };

  const nameRule = nameRules(source);
  const roles = Object.keys(nameRule);
  const keys = ariaKeys(source);
  const samples = samplesOf(source);

  console.log(`[a11y-sync] ${roles.length} roles, ${keys.length} aria keys`);

  console.log('[a11y-sync] detecting installed lints');
  // bun 也是 detect 的一部分：lab 装了 oxlint，探出的 bin 带
  // --jsx-a11y-plugin（与内置表录制时的命令一致）。
  const detected = detectLints({
    cwd: lab,
    exec: nodeExec,
    readJson: (path) => JSON.parse(readFileSync(path, 'utf8')),
    exists: existsSync,
    wanted,
  });

  const lints: DetectedLint[] = [];
  for (const name of wanted) {
    const lint = detected.find((d) => d.name === name);
    // 装了却探测不到（安装失败/探测失败）不能静默跳过：
    // 漏写一张表会让漂移检查形同虚设。
    if (lint === undefined) {
      throw new Error(`${name} was requested but not detected in the lab`);
    }
    lints.push(lint);
  }

  const profiles: Record<string, ProfileData> = {};
  for (const lint of lints) {
    console.log(`[a11y-sync] probing ${lint.name}@${lint.version} ...`);
    Object.assign(
      profiles,
      probe({
        cwd: lab,
        lints: [lint],
        roles,
        keys,
        samples,
        nameRule,
        runners: {
          eslint: runEslint,
          oxlint: runOxlint,
          biome: runBiome,
          bun: runBun,
        },
        exec: nodeExec,
        fs,
        keep,
      }),
    );
  }

  // 先把全部内容序列化完再落盘：任何一步失败都不会留下半写状态。
  const generated: Array<{ rel: string; content: string }> = [
    { rel: 'src/a11y/aria.generated.ts', content: generateAriaTypes(source) },
    {
      rel: 'src/a11y/probe/samples.generated.ts',
      content: generateSamples(source),
    },
  ];
  for (const lint of lints) {
    const profile = profiles[lint.name];
    // probe 一定为每个探测的 lint 产出 profile；缺失说明探针自身有 bug。
    if (profile === undefined) {
      throw new Error(`probe returned no profile for ${lint.name}`);
    }
    generated.push({
      rel: `src/a11y/lints/_${lint.name}.ts`,
      content: serializeProfile(profile),
    });
  }
  // lint 表之后写运行时快照；进 generated 列表即同时进 biome format 的路径列表。
  // 以现有快照为基底合并本轮结果：--lint 只点名部分 lint 时，未同步的表
  // 保留原快照，不能整文件重写成只剩本轮的子集。
  generated.push({
    rel: 'src/a11y/probe/profiles.generated.ts',
    content: generateProfiles(mergeProfilesSnapshot(PROFILES, profiles)),
  });

  console.log('[a11y-sync] writing generated files');
  for (const { rel, content } of generated) {
    writeFileSync(join(root, rel), content);
  }

  console.log('[a11y-sync] formatting generated files');
  runCmd(
    [
      process.execPath,
      'x',
      'biome',
      'format',
      '--write',
      ...generated.map((g) => g.rel),
    ],
    root,
  );
} finally {
  if (!keep) {
    console.log('[a11y-sync] removing lab');
    rmSync(labDirOf(root), { recursive: true, force: true });
  }
}
console.log('[a11y-sync] done');
