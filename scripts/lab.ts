/**
 * lab：.cache/a11y-lab 的重建（bun init + 按需安装 lint）。
 *
 * a11y-sync 装最新版探漂移；a11y-lint-test 按表头版本精确安装，
 * 测的就是提交进仓库的那几个版本。bun 不装进 lab：lab 用的就是当前
 * 运行时，版本与表不符时直接失败，而不是测一张别的表。
 */

import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { nodeExec } from '../src/a11y/probe/exec';

export interface LabLint {
  readonly name: 'eslint' | 'oxlint' | 'biome' | 'bun';
  /** 省略 = 装最新（a11y-sync）；给定 = 精确安装该版本（a11y-lint-test）。 */
  readonly version?: string;
}

export interface CreateLabOptions {
  readonly root: string;
  readonly lints: readonly LabLint[];
  /** lint 之外要装的包（a11y-sync 的 aria-query）。 */
  readonly extraDeps?: readonly string[];
}

export interface Lab {
  readonly cwd: string;
  /** 实际装出来的版本；eslint 记 jsx-a11y 插件版本（表的身份），bun 记运行时版本。 */
  readonly versions: Readonly<Record<string, string>>;
}

export const labDirOf = (root: string): string => join(root, '.cache/a11y-lab');

/** 子进程失败即停：lab 装坏了继续跑只会产出错数据。 */
export const runCmd = (cmd: readonly string[], cwd: string): void => {
  const r = nodeExec(cmd, { cwd });
  if (r.code !== 0) {
    throw new Error(
      `${cmd.join(' ')} failed (exit ${r.code}): ${r.stderr || r.stdout}`,
    );
  }
};

// eslint 表的身份是 eslint-plugin-jsx-a11y 的版本；eslint 本体装最新
const LINT_PKGS: Readonly<
  Record<
    'eslint' | 'oxlint' | 'biome',
    {
      /** 版本钉住的包；versions 记它的版本 */
      readonly identity: string;
      /** 一起安装但不钉版本的包（eslint 本体） */
      readonly alsoInstall: readonly string[];
    }
  >
> = {
  eslint: { identity: 'eslint-plugin-jsx-a11y', alsoInstall: ['eslint'] },
  oxlint: { identity: 'oxlint', alsoInstall: [] },
  biome: { identity: '@biomejs/biome', alsoInstall: [] },
};

const readVersion = (cwd: string, pkg: string): string => {
  const json = JSON.parse(
    readFileSync(join(cwd, 'node_modules', pkg, 'package.json'), 'utf8'),
  ) as { version?: unknown };
  if (typeof json.version !== 'string') {
    throw new Error(`${pkg} in the lab has no version`);
  }
  return json.version;
};

const bunVersion = (cwd: string): string =>
  nodeExec([process.execPath, '--version'], { cwd }).stdout.trim();

export const createLab = ({
  root,
  lints,
  extraDeps = [],
}: CreateLabOptions): Lab => {
  const bunSpec = lints.find((lint) => lint.name === 'bun');
  if (bunSpec?.version !== undefined) {
    // bun 装不进 lab，运行时不匹配就没有别的办法：先于安装失败，别白装一场
    const actual = bunVersion(root);
    if (actual !== bunSpec.version) {
      throw new Error(
        `bun table records ${bunSpec.version} but this runtime is ${actual}; ` +
          `run the test with bun ${bunSpec.version} or re-run a11y:sync`,
      );
    }
  }
  const cwd = labDirOf(root);
  rmSync(cwd, { recursive: true, force: true });
  mkdirSync(cwd, { recursive: true });
  runCmd([process.execPath, 'init', '-y'], cwd);
  const deps = [...extraDeps];
  for (const lint of lints) {
    if (lint.name === 'bun') continue;
    const pkgs = LINT_PKGS[lint.name];
    deps.push(...pkgs.alsoInstall);
    deps.push(
      lint.version === undefined ? pkgs.identity : `${pkgs.identity}@${lint.version}`,
    );
  }
  if (deps.length > 0) {
    // -E 让 package.json 记精确范围；显式 x.y.z 本就解析精确，这里双保险
    const exact = lints.some((lint) => lint.version !== undefined)
      ? ['-E']
      : [];
    runCmd([process.execPath, 'add', '-d', ...exact, ...deps], cwd);
  }
  const versions: Record<string, string> = {};
  for (const lint of lints) {
    if (lint.name === 'bun') {
      versions.bun = bunVersion(cwd);
      continue;
    }
    versions[lint.name] = readVersion(cwd, LINT_PKGS[lint.name].identity);
    if (lint.version !== undefined && versions[lint.name] !== lint.version) {
      throw new Error(
        `${lint.name} resolved to ${versions[lint.name]} but ${lint.version} was requested`,
      );
    }
  }
  return { cwd, versions };
};
