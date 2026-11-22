import type { ExecFn, ExecResult } from './exec';

export interface DetectedLint {
  readonly name: 'eslint' | 'oxlint' | 'biome' | 'bun';
  readonly version: string;
  readonly bin: readonly string[];
}

export interface DetectOptions {
  readonly cwd: string;
  readonly exec: ExecFn;
  readonly readJson: (path: string) => unknown;
  readonly exists: (path: string) => boolean;
  readonly wanted?: ReadonlyArray<DetectedLint['name']>;
}

const SEMVER = /\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/;

/**
 * 从 `--version` 输出取第一个 semver 形状的 token（biome 打印
 * `Version: 2.5.0`，oxlint 打印裸版本号）。版本是生成表的身份，
 * 取不出真实版本宁可失败，也不把噪声写进表里。
 */
export const versionOf = (name: string, r: ExecResult): string => {
  if (r.code !== 0) {
    throw new Error(
      `${name} --version exited with code ${r.code}: ${r.stderr || r.stdout}`,
    );
  }
  const version = r.stdout.match(SEMVER)?.[0];
  if (version === undefined) {
    throw new Error(`${name} --version output has no semver: ${r.stdout}`);
  }
  return version;
};

export const detectLints = ({
  cwd,
  exec,
  readJson,
  exists,
  wanted,
}: DetectOptions): DetectedLint[] => {
  const root = `${cwd}/node_modules`;
  const bin = (name: string): readonly string[] => [`${root}/.bin/${name}`];
  const out: DetectedLint[] = [];
  const want = (n: DetectedLint['name']): boolean =>
    !wanted || wanted.includes(n);

  const pkg = readJson(`${cwd}/package.json`) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  if (want('biome') && deps['@biomejs/biome'] && exists(`${root}/.bin/biome`)) {
    const r = exec([...bin('biome'), '--version'], { cwd });
    out.push({
      name: 'biome',
      version: versionOf('biome', r),
      bin: bin('biome'),
    });
  }
  if (want('oxlint') && deps.oxlint && exists(`${root}/.bin/oxlint`)) {
    const r = exec([...bin('oxlint'), '--version'], { cwd });
    out.push({
      name: 'oxlint',
      version: versionOf('oxlint', r),
      bin: bin('oxlint'),
    });
  }
  if (
    want('eslint') &&
    deps.eslint &&
    deps['eslint-plugin-jsx-a11y'] &&
    exists(`${root}/.bin/eslint`)
  ) {
    // eslint 表版本取 jsx-a11y 插件版本，不是 eslint 自身版本。
    const plugin = readJson(`${root}/eslint-plugin-jsx-a11y/package.json`) as {
      version: string;
    };
    out.push({
      name: 'eslint',
      version: plugin.version,
      bin: bin('eslint'),
    });
  }
  return out;
};
