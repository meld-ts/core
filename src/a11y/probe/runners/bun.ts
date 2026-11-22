import type { ExecFn } from '../exec';
import type { Fixture } from '../fixtures';
import type { LintReport } from './eslint';

export interface BunRunnerOptions {
  readonly cwd: string;
  readonly workDir: string;
  readonly writeFile: (path: string, content: string) => void;
  readonly exec: ExecFn;
}

const REQ = /`([^`]+)` role is missing required aria props (.+)$/;
const SUP =
  /The attribute `(aria-[a-z]+)` is not supported by the role `([^`]+)`/;

export const parseBun = (raw: string): LintReport => {
  const missing: Array<{ role: string; props: string[] }> = [];
  const unsupported: Array<{ role: string; prop: string }> = [];
  const files = JSON.parse(raw) as Array<{
    messages: Array<{ ruleId: string | null; message: string }>;
  }>;
  for (const file of files) {
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
        const props = list.match(/aria-[a-z]+/g);
        // 匹配到「缺必填」却提取不出属性名说明消息改版了；
        // 静默吞掉会让 required 表错掉，直接失败交给上层排查。
        if (props === null) {
          throw new Error(`unparseable required props: ${m.message}`);
        }
        missing.push({ role, props });
        continue;
      }
      const sup = m.message.match(SUP);
      const prop = sup?.[1];
      const supRole = sup?.[2];
      if (prop !== undefined && supRole !== undefined) {
        unsupported.push({ role: supRole, prop });
      }
    }
  }
  return { missing, unsupported };
};

export const runBun = (
  fixtures: readonly Fixture[],
  { cwd, workDir, writeFile, exec }: BunRunnerOptions,
): LintReport => {
  for (const f of fixtures) {
    writeFile(`${workDir}/fixtures/${f.name}.jsx`, f.code);
  }
  const r = exec(
    [
      // 规则走 CLI --rule，不写配置文件；bin 固定当前 bun。
      // --no-script 防止 bun lint 转去执行项目自己的 lint 脚本。
      process.execPath,
      'lint',
      '--no-script',
      '-f',
      'json',
      '--rule',
      'jsx_a11y/role-has-required-aria-props: error',
      '--rule',
      'jsx_a11y/role-supports-aria-props: error',
      `${workDir}/fixtures`,
    ],
    { cwd },
  );
  return parseBun(r.stdout);
};
