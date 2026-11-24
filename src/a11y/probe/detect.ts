import type { ExecFn, ExecResult } from './exec';

export interface DetectedLint {
  readonly name: 'eslint' | 'oxlint' | 'biome' | 'bun';
  readonly version: string;
  /** lint 的调用命令前缀；bun 带模式标志（见 bunLintOf）。 */
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
 * bun 的 lint 调用前缀。bun lint 有两种模式，可用标志不同：
 * 项目带 oxlint 标记（依赖或 .oxlintrc.json）时走内嵌 oxlint 的插件体系，
 * `--rule` 开不了未启用插件的规则，要 `--jsx-a11y-plugin` 先开插件；
 * 无标记时走 bun 自己的默认规则集，jsx_a11y 插件默认开，传该标志直接报错。
 * 用一个不存在的路径探「这个 cwd 是否接受 --jsx-a11y-plugin」，
 * 不复刻 bun 的模式判定标记——探活跟着 bun 的实际行为走。
 */
const bunLintOf = (exec: ExecFn, cwd: string): readonly string[] => {
  const probe = exec(
    [
      process.execPath,
      'lint',
      // --no-script 与 runBun 的调用前缀一致：不带它时，package.json
      // 定义了 lint 脚本的项目里 bun 会转去执行脚本（exit 0、无拒绝语），
      // 插件标志探不出真实模式。
      '--no-script',
      '--jsx-a11y-plugin',
      '-f',
      'json',
      `${cwd}/.meld-a11y-probe/noop`,
    ],
    { cwd },
  );
  const oxlintMode = !probe.stderr.includes('is an oxlint flag');
  return oxlintMode
    ? [process.execPath, 'lint', '--no-script', '--jsx-a11y-plugin']
    : [process.execPath, 'lint', '--no-script'];
};

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
  // 默认（wanted 未传）只按 package.json 判 biome/oxlint/eslint（设计 §6：
  // 装了哪些 lint 就探哪些）。bun 不是依赖、是当前运行时，机器上有 bun
  // 不等于项目用 bun——只有 --lint=bun 点名时才探它。
  const want = (n: DetectedLint['name']): boolean =>
    n === 'bun' ? wanted?.includes(n) === true : !wanted || wanted.includes(n);

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
  if (want('bun')) {
    // 只有点名 --lint=bun 才走到这里（见 want）：bun 不在 node_modules 里
    // （就是当前运行时），可用性靠探活：`bun lint --help` 退出 0 =
    // 这个 bun 带内置 lint（1.4.4+）。lint 命令一律带 --no-script（见
    // bunLintOf）：探活与模式探针都不能让带 lint 脚本的项目把命令劫持成脚本执行。
    const help = exec([process.execPath, 'lint', '--no-script', '--help'], {
      cwd,
    });
    if (help.code === 0) {
      out.push({
        name: 'bun',
        version: versionOf(
          'bun',
          exec([process.execPath, '--version'], { cwd }),
        ),
        bin: bunLintOf(exec, cwd),
      });
    } else {
      // 走到这里一定点名要 bun 却探活失败：明说，而不是静默跳过
      // 让生成文件悄悄少一张表
      throw new Error(
        'bun lint is not available in this bun; upgrade bun or omit bun',
      );
    }
  }
  return out;
};
