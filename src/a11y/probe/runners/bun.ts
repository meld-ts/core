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

/**
 * bun 1.4.4 起 `bun lint` 内嵌 oxlint：JSON 与规则 code 都是 oxlint 形状
 * （`{ diagnostics: [{ code: 'jsx-a11y(...)', message }] }`），消息文本同源。
 * 与 parseOxlint 平铺两份是刻意的：bun 内嵌的 oxlint 与 lab 装的 oxlint
 * 各自漂移，改一边不应连带另一边的解析与录制输出一起改。
 */
export const parseBun = (raw: string): LintReport => {
  const missing: Array<{ role: string; props: string[] }> = [];
  const unsupported: Array<{ role: string; prop: string }> = [];
  const out = JSON.parse(raw) as {
    diagnostics: Array<{ code: string | null; message: string }>;
  };
  for (const d of out.diagnostics) {
    if (
      d.code !== 'jsx-a11y(role-has-required-aria-props)' &&
      d.code !== 'jsx-a11y(role-supports-aria-props)'
    ) {
      continue;
    }
    const req = d.message.match(REQ);
    const role = req?.[1];
    const list = req?.[2];
    if (role !== undefined && list !== undefined) {
      const props = list.match(/aria-[a-z]+/g);
      // 匹配到「缺必填」却提取不出属性名说明消息改版了；
      // 静默吞掉会让 required 表错掉，直接失败交给上层排查。
      if (props === null) {
        throw new Error(`unparseable required props: ${d.message}`);
      }
      missing.push({ role, props });
      continue;
    }
    const sup = d.message.match(SUP);
    const prop = sup?.[1];
    const supRole = sup?.[2];
    if (prop !== undefined && supRole !== undefined) {
      unsupported.push({ role: supRole, prop });
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
      // --jsx-a11y-plugin 打开插件：bun 1.4.4 起 --rule 开不了
      // 未启用插件里的规则。
      process.execPath,
      'lint',
      '--no-script',
      '--jsx-a11y-plugin',
      '-f',
      'json',
      '--rule',
      'jsx_a11y/role-has-required-aria-props: error',
      '--rule',
      'jsx_a11y/role-supports-aria-props: error',
      // 显式传文件而不是 fixtures 目录：bun 内嵌 oxlint 遍历目录会应用
      // 沿途 .gitignore（lab 在 .cache 下被整体忽略），显式文件不受影响。
      ...fixtures.map((f) => `${workDir}/fixtures/${f.name}.jsx`),
    ],
    { cwd },
  );
  return parseBun(r.stdout);
};
