import type { ExecFn } from './exec';

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

const firstLine = (s: string): string => s.trim().split('\n')[0] ?? '';

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
      version: firstLine(r.stdout),
      bin: bin('biome'),
    });
  }
  if (want('oxlint') && deps.oxlint && exists(`${root}/.bin/oxlint`)) {
    const r = exec([...bin('oxlint'), '--version'], { cwd });
    out.push({
      name: 'oxlint',
      version: firstLine(r.stdout),
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
