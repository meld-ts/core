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
import { detectLints, versionOf } from '../src/a11y/probe/detect';
import { nodeExec } from '../src/a11y/probe/exec';
import { runBiome } from '../src/a11y/probe/runners/biome';
import { runBun } from '../src/a11y/probe/runners/bun';
import { runEslint } from '../src/a11y/probe/runners/eslint';
import { runOxlint } from '../src/a11y/probe/runners/oxlint';
import type { ProfileData } from '../src/a11y/probe/serialize';
import { serializeProfile } from '../src/a11y/probe/serialize';

const root = resolve(import.meta.dir, '..');
const lab = join(root, '.cache/a11y-lab');

const LINTS = ['eslint', 'oxlint', 'biome', 'bun'] as const;
type LintName = (typeof LINTS)[number];

const isLintName = (name: string): name is LintName =>
  (LINTS as readonly string[]).includes(name);

const args = process.argv.slice(2);
const keep = args.includes('--keep');
const lintArg = args.find((a) => a.startsWith('--lint='));

const wanted = (
  lintArg === undefined
    ? [...LINTS]
    : lintArg.slice('--lint='.length).split(',')
).map((name) => {
  if (!isLintName(name)) {
    throw new Error(
      `unknown lint '${name}'; expected one of: ${LINTS.join(', ')}`,
    );
  }
  return name;
});

const run = (cmd: readonly string[], cwd: string): void => {
  const r = nodeExec(cmd, { cwd });
  if (r.code !== 0) {
    throw new Error(
      `${cmd.join(' ')} failed (exit ${r.code}): ${r.stderr || r.stdout}`,
    );
  }
};

console.log(`[a11y-sync] preparing lab at ${lab}`);
rmSync(lab, { recursive: true, force: true });
mkdirSync(lab, { recursive: true });
run([process.execPath, 'init', '-y'], lab);
run(
  [
    process.execPath,
    'add',
    '-d',
    'eslint',
    'eslint-plugin-jsx-a11y',
    '@biomejs/biome',
    'oxlint',
    'aria-query',
  ],
  lab,
);

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
const detected = detectLints({
  cwd: lab,
  exec: nodeExec,
  readJson: (path) => JSON.parse(readFileSync(path, 'utf8')),
  exists: existsSync,
  wanted: wanted.filter((name) => name !== 'bun'),
});

const lints: DetectedLint[] = [];
for (const name of wanted) {
  if (name === 'bun') {
    // bun 装在 lab 外（就是当前运行时），版本与 bin 都指向它自己。
    lints.push({
      name,
      version: versionOf(
        'bun',
        nodeExec([process.execPath, '--version'], { cwd: root }),
      ),
      bin: [process.execPath],
    });
    continue;
  }
  const lint = detected.find((d) => d.name === name);
  // 装了却探测不到（安装失败/探测失败）不能静默跳过：
  // 漏写一张表会让漂移检查形同虚设。
  if (lint === undefined) {
    throw new Error(`${name} was requested but not detected in the lab`);
  }
  lints.push(lint);
}

// ProbeFs 的 node:fs 适配：write 要自建父目录，rm 递归且不因不存在报错。
const fs: ProbeFs = {
  write: (path, content) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  },
  rm: (path) => rmSync(path, { recursive: true, force: true }),
};

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

console.log('[a11y-sync] writing generated files');
const formatted: string[] = [
  'src/a11y/aria.generated.ts',
  'src/a11y/probe/samples.generated.ts',
];
writeFileSync(
  join(root, 'src/a11y/aria.generated.ts'),
  generateAriaTypes(source),
);
writeFileSync(
  join(root, 'src/a11y/probe/samples.generated.ts'),
  generateSamples(source),
);
for (const lint of lints) {
  const profile = profiles[lint.name];
  // probe 一定为每个探测的 lint 产出 profile；缺失说明探针自身有 bug。
  if (profile === undefined) {
    throw new Error(`probe returned no profile for ${lint.name}`);
  }
  const rel = `src/a11y/lints/${lint.name}.ts`;
  writeFileSync(join(root, rel), serializeProfile(profile));
  formatted.push(rel);
}

console.log('[a11y-sync] formatting generated files');
run([process.execPath, 'x', 'biome', 'format', '--write', ...formatted], root);

if (!keep) {
  console.log('[a11y-sync] removing lab');
  rmSync(lab, { recursive: true, force: true });
}
console.log('[a11y-sync] done');
