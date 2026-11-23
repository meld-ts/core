import type { Fixture } from '../fixtures';
import type { LintReport, RunnerOptions } from './eslint';

const REQ = /`([^`]+)` role is missing required aria props (.+)$/;
const SUP =
  /The attribute `(aria-[a-z]+)` is not supported by the role `([^`]+)`/;

/**
 * bun 1.4.4 起 `bun lint` 内嵌 oxlint，但 JSON 信封随模式不同：
 * - 项目带 oxlint 标记：内嵌 oxlint 的 `{ diagnostics: [{ code, message }] }`；
 * - 无标记的默认规则集：eslint 兼容数组 `[{ messages: [{ ruleId, message }] }]`。
 * 两种模式对同两条规则的报错文本同源（同一个内嵌引擎），消息正则共用；
 * 数组信封的 ruleId（`jsx-a11y/x`）先归一成 code 形式（`jsx-a11y(x)`）。
 * 与 parseOxlint 平铺两份是刻意的：bun 内嵌的 oxlint 与 lab 装的 oxlint
 * 各自漂移，改一边不应连带另一边的解析与录制输出一起改。
 */
export const parseBun = (raw: string): LintReport => {
  const missing: Array<{ role: string; props: string[] }> = [];
  const unsupported: Array<{ role: string; prop: string }> = [];
  const parsed: unknown = JSON.parse(raw);
  const entries: Array<{ code: string | null; message: string }> | undefined =
    Array.isArray(parsed)
      ? (
          parsed as Array<{
            messages?: Array<{ ruleId: string | null; message: string }>;
          }>
        )
          .flatMap((f) => {
            // 信封漂移（缺 messages）报可读错误，不抛 flatMap 的裸 TypeError
            if (!Array.isArray(f.messages)) {
              throw new Error('bun lint output is missing messages');
            }
            return f.messages;
          })
          .map((m) => ({
            code:
              m.ruleId === null
                ? null
                : m.ruleId.replace(/^jsx-a11y\/(.+)$/, 'jsx-a11y($1)'),
            message: m.message,
          }))
      : // 对象信封（oxlint 模式）的 diagnostics 缺失或非数组说明信封漂了，
        // 报可读错误，不让 for...of 抛 `not iterable` 的裸 TypeError
        (
          parsed as {
            diagnostics?: Array<{ code: string | null; message: string }>;
          } | null
        )?.diagnostics;
  if (!Array.isArray(entries)) {
    throw new Error('bun lint output is missing diagnostics');
  }
  for (const d of entries) {
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
      continue;
    }
    // 白名单内的规则却匹配不出已知形状：静默跳过会让表悄悄缺数据，
    // 直接失败交给上层排查。
    throw new Error(`bun ${d.code}: unrecognized message: ${d.message}`);
  }
  return { missing, unsupported };
};

export const runBun = (
  fixtures: readonly Fixture[],
  { bin, cwd, workDir, writeFile, exec }: RunnerOptions,
): LintReport => {
  for (const f of fixtures) {
    writeFile(`${workDir}/fixtures/${f.name}.jsx`, f.code);
  }
  const r = exec(
    [
      // bin 由 detect 决定（bun 两种 lint 模式的可用标志不同，含不含
      // --jsx-a11y-plugin）；规则走 CLI --rule，不写配置文件。
      // --no-script 防止 bun lint 转去执行项目自己的 lint 脚本。
      ...bin,
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
  // stdout 为空且非零退出 = 命令本身被拒（模式标志漂移 / lint 崩溃）：
  // 交给 JSON.parse 只会得到没法排查的 EOF。
  if (r.code !== 0 && r.stdout.trim() === '') {
    throw new Error(`bun lint exited ${r.code}: ${r.stderr || r.stdout}`);
  }
  return parseBun(r.stdout);
};
