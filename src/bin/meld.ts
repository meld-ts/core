// shebang 由 bunup.bin.ts 的 banner 注入；源文件再写一份会打包出两行 #!
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';

import { probe } from '../a11y/probe';
import type { ProbeRunner } from '../a11y/probe';
import { detectLints } from '../a11y/probe/detect';
import type { DetectedLint } from '../a11y/probe/detect';
import { nodeExec } from '../a11y/probe/exec';
import type { ExecFn } from '../a11y/probe/exec';
import { serializeOverride } from '../a11y/probe/emit-override';
import { fixtureSamples } from '../a11y/probe/fixtures';
import { runBiome } from '../a11y/probe/runners/biome';
import { runBun } from '../a11y/probe/runners/bun';
import { runEslint } from '../a11y/probe/runners/eslint';
import { runOxlint } from '../a11y/probe/runners/oxlint';
import {
  ARIA_KEYS,
  NAME_RULES,
  SAMPLES,
} from '../a11y/probe/samples.generated';
import { checkTsconfigIncludes } from '../a11y/probe/tsconfig-check';
import type { TsconfigCheckResult } from '../a11y/probe/tsconfig-check';

export interface ProbeArgs {
  readonly lint?: readonly DetectedLint['name'][];
  readonly out?: string;
  readonly keep: boolean;
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

// LINT_NAMES 的类型取自 DetectedLint['name']：type-only import 编译期擦除，
// 名单与 detect 的名字联合始终对齐，不往这份名单单独引一份字符串类型。
const LINT_NAMES: readonly DetectedLint['name'][] = [
  'eslint',
  'bun',
  'oxlint',
  'biome',
];

const isLintName = (name: string): name is DetectedLint['name'] =>
  (LINT_NAMES as readonly string[]).includes(name);

export const parseProbeArgs = (argv: readonly string[]): ProbeArgs => {
  let lint: DetectedLint['name'][] | undefined;
  let out: string | undefined;
  let keep = false;
  for (const arg of argv) {
    if (arg === '--keep') {
      keep = true;
      continue;
    }
    if (arg.startsWith('--lint=')) {
      const raw = arg.slice('--lint='.length);
      if (!raw) throw new Error('empty --lint');
      lint = raw.split(',').map((name) => {
        if (!isLintName(name)) throw new Error(`unknown lint '${name}'`);
        return name;
      });
      continue;
    }
    if (arg.startsWith('--out=')) {
      out = arg.slice('--out='.length);
      if (!out) throw new Error('empty --out');
      continue;
    }
    // 严格解析：拼错或空格形式的参数宁可失败，也不静默忽略
    throw new Error(`unknown argument: ${arg}`);
  }
  return { lint, out, keep };
};

/** runProbe 的外部世界适配层：node 实现是默认值，测试注入假实现。 */
export interface ProbeDeps {
  readonly exec: ExecFn;
  readonly readJson: (path: string) => unknown;
  readonly exists: (path: string) => boolean;
  /** 写文件（含自建父目录）；探针写 fixture 与最终写生成文件共用。 */
  readonly write: (path: string, content: string) => void;
  readonly rm: (path: string) => void;
  readonly warn: (message: string) => void;
  readonly runners: Readonly<Record<DetectedLint['name'], ProbeRunner>>;
}

/** node 实现：fs 落盘、同步子进程探测、四个 lint runner 全量接上。 */
export const nodeDeps: ProbeDeps = {
  exec: nodeExec,
  readJson: (path) => JSON.parse(readFileSync(path, 'utf8')),
  exists: existsSync,
  write: (path, content) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  },
  rm: (path) => rmSync(path, { recursive: true, force: true }),
  warn: (message) => console.warn(message),
  runners: {
    eslint: runEslint,
    oxlint: runOxlint,
    biome: runBiome,
    bun: runBun,
  },
};

// SAMPLES 存运行时值，fixtures 要的是 TS 表达式文本（aria-label={'x'}）：
// 转换在 probe/fixtures 的 fixtureSamples，与 a11y:sync 产出逐字节一致。

export interface RunProbeInput {
  readonly cwd: string;
  readonly lint?: readonly DetectedLint['name'][];
  readonly out?: string;
  readonly keep: boolean;
  readonly deps?: ProbeDeps;
}

const warnUnlessIncluded = (
  deps: ProbeDeps,
  cwd: string,
  target: string,
): void => {
  let check: TsconfigCheckResult;
  try {
    check = checkTsconfigIncludes({
      cwd,
      outPath: target,
      readJson: deps.readJson,
    });
  } catch (error) {
    // tsconfig.json 缺失或不可解析只降级为警告：探测已成功，收尾检查不能作废整轮
    deps.warn(
      `warning: cannot read tsconfig.json (${messageOf(error)}); the override may not take effect`,
    );
    return;
  }
  if (!check.included) {
    deps.warn(
      `warning: ${target} is not in tsconfig include (${check.reason}); the override will not take effect`,
    );
  }
};

/**
 * 用户模式：在项目 cwd 跑探针，写 lint 重载声明文件，返回写出路径。
 * 生成文件在全部探测成功后才写——probe 任一步失败都会先抛出。
 */
export const runProbe = ({
  cwd,
  lint,
  out,
  keep,
  deps = nodeDeps,
}: RunProbeInput): string => {
  const detected = detectLints({
    cwd,
    exec: deps.exec,
    readJson: deps.readJson,
    exists: deps.exists,
    wanted: lint,
  });
  if (lint !== undefined) {
    const missing = lint.filter(
      (name) => !detected.some((d) => d.name === name),
    );
    if (missing.length > 0) {
      throw new Error(`lint not installed: ${missing.join(', ')}`);
    }
  }
  if (detected.length === 0) {
    throw new Error(
      'no supported lint found; install @biomejs/biome, oxlint or eslint with eslint-plugin-jsx-a11y, or run under a bun with built-in lint',
    );
  }
  const profiles = probe({
    cwd,
    lints: detected,
    roles: Object.keys(NAME_RULES),
    keys: ARIA_KEYS,
    samples: fixtureSamples(SAMPLES),
    nameRule: NAME_RULES,
    runners: deps.runners,
    exec: deps.exec,
    fs: { write: deps.write, rm: deps.rm },
    keep,
  });
  const target = resolve(cwd, out ?? 'a11y-lints.generated.d.ts');
  deps.write(target, serializeOverride(profiles));
  warnUnlessIncluded(deps, cwd, target);
  return target;
};

const usage = `Usage:
  meld a11y probe [--lint=biome,oxlint] [--out=./a11y-lints.generated.d.ts] [--keep]`;

export interface MainDeps extends ProbeDeps {
  readonly cwd: string;
}

export const main = async (
  argv: readonly string[],
  { cwd, ...deps }: MainDeps = { cwd: process.cwd(), ...nodeDeps },
): Promise<number> => {
  const [group, command, ...rest] = argv;
  // --help / -h 在任意位置都算求助（含 a11y probe 的参数位），main 统一识别；
  // parseProbeArgs 仍严格拒绝，不认识求助
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(usage);
    return 0;
  }
  if (group !== 'a11y' || command !== 'probe') {
    console.error(usage);
    return 1;
  }
  try {
    const target = runProbe({ cwd, ...parseProbeArgs(rest), deps });
    console.log(`wrote ${target}`);
    return 0;
  } catch (error) {
    console.error(messageOf(error));
    console.error(usage);
    return 1;
  }
};

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
