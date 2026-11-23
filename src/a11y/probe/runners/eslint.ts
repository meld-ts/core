import type { ExecFn } from '../exec';
import type { Fixture } from '../fixtures';

export interface RunnerOptions {
  readonly bin: readonly string[];
  readonly cwd: string;
  readonly workDir: string;
  readonly writeFile: (path: string, content: string) => void;
  readonly exec: ExecFn;
}

export interface LintReport {
  readonly missing: ReadonlyArray<{ role: string; props: string[] }>;
  readonly unsupported: ReadonlyArray<{ role: string; prop: string }>;
}

const REQ = /role "([^"]+)" must have the following attributes defined: (.+)$/;
// role 捕获允许连字符：aria-query 有约 90 个 doc-* 与 3 个 graphics-* role；
// 未锚定，天然停在句点上。
const SUP =
  /The attribute (aria-[a-z]+) is not supported by the role ([a-z-]+)/;

export const parseEslint = (raw: string): LintReport => {
  const missing: Array<{ role: string; props: string[] }> = [];
  const unsupported: Array<{ role: string; prop: string }> = [];
  const parsed: unknown = JSON.parse(raw);
  // 信封漂移（对象信封一类）报可读错误，不让 for...of 抛裸 TypeError
  if (!Array.isArray(parsed)) {
    throw new Error('eslint lint output is not an array');
  }
  const files = parsed as Array<{
    messages: Array<{ ruleId: string | null; message: string }>;
  }>;
  for (const file of files) {
    // 信封漂移（缺 messages）报可读错误，不让 for...of 抛 `not iterable` 的裸 TypeError
    if (!Array.isArray(file.messages)) {
      throw new Error('eslint lint output is missing messages');
    }
    for (const m of file.messages) {
      if (
        m.ruleId !== 'jsx-a11y/role-has-required-aria-props' &&
        m.ruleId !== 'jsx-a11y/role-supports-aria-props'
      ) {
        continue;
      }
      const req = m.message.match(REQ);
      const role = req?.[1];
      const list = req?.[2];
      if (role !== undefined && list !== undefined) {
        missing.push({
          role,
          props: list.split(',').map((s) => s.trim()),
        });
        continue;
      }
      const sup = m.message.match(SUP);
      const prop = sup?.[1];
      const supRole = sup?.[2];
      if (prop !== undefined && supRole !== undefined) {
        unsupported.push({ role: supRole, prop });
        continue;
      }
      // 白名单内的规则却匹配不出已知形状：静默跳过会让表悄悄缺数据，
      // 直接失败交给上层排查。
      throw new Error(`eslint ${m.ruleId}: unrecognized message: ${m.message}`);
    }
  }
  return { missing, unsupported };
};

const CONFIG = `import jsxA11y from 'eslint-plugin-jsx-a11y';
export default [{
  files: ['**/*.jsx'],
  plugins: { 'jsx-a11y': jsxA11y },
  languageOptions: {
    parserOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      ecmaFeatures: { jsx: true },
    },
  },
  rules: {
    'jsx-a11y/role-has-required-aria-props': 'error',
    'jsx-a11y/role-supports-aria-props': 'error',
  },
}];
`;

export const runEslint = (
  fixtures: readonly Fixture[],
  { bin, cwd, workDir, writeFile, exec }: RunnerOptions,
): LintReport => {
  writeFile(`${workDir}/config/eslint/eslint.config.js`, CONFIG);
  for (const f of fixtures) {
    writeFile(`${workDir}/fixtures/${f.name}.jsx`, f.code);
  }
  const r = exec(
    [
      ...bin,
      '-c',
      `${workDir}/config/eslint/eslint.config.js`,
      '-f',
      'json',
      `${workDir}/fixtures`,
    ],
    { cwd },
  );
  // stdout 为空且非零退出 = 命令本身被拒（配置被拒 / lint 崩溃）：
  // 交给 JSON.parse 只会得到没法排查的 EOF。
  if (r.code !== 0 && r.stdout.trim() === '') {
    throw new Error(`eslint lint exited ${r.code}: ${r.stderr || r.stdout}`);
  }
  return parseEslint(r.stdout);
};
