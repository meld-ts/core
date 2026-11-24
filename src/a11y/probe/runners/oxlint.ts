import type { Fixture } from '../fixtures';
import type { LintReport, RunnerOptions } from './eslint';

const REQ = /`([^`]+)` role is missing required aria props (.+)$/;
const SUP =
  /The attribute `(aria-[a-z]+)` is not supported by the role `([^`]+)`/;

export const parseOxlint = (raw: string): LintReport => {
  const missing: Array<{ role: string; props: string[] }> = [];
  const unsupported: Array<{ role: string; prop: string }> = [];
  const out = JSON.parse(raw) as {
    diagnostics?: Array<{ code: string | null; message?: string }>;
  } | null;
  // 信封漂移（缺 diagnostics / 非数组）报可读错误，
  // 不让 for...of 抛 `not iterable` 的裸 TypeError
  if (!Array.isArray(out?.diagnostics)) {
    throw new Error('oxlint lint output is missing diagnostics');
  }
  for (const d of out.diagnostics) {
    if (
      d.code !== 'jsx-a11y(role-has-required-aria-props)' &&
      d.code !== 'jsx-a11y(role-supports-aria-props)'
    ) {
      continue;
    }
    // 信封漂移（缺 message）报可读错误，不让 .match 抛裸 TypeError
    if (typeof d.message !== 'string') {
      throw new Error('oxlint diagnostic is missing message');
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
    throw new Error(`oxlint ${d.code}: unrecognized message: ${d.message}`);
  }
  return { missing, unsupported };
};

const CONFIG = `{
  "plugins": ["jsx-a11y"],
  "rules": {
    "jsx-a11y/role-has-required-aria-props": "error",
    "jsx-a11y/role-supports-aria-props": "error"
  }
}
`;

export const runOxlint = (
  fixtures: readonly Fixture[],
  { bin, cwd, workDir, writeFile, exec }: RunnerOptions,
): LintReport => {
  writeFile(`${workDir}/config/oxlint/.oxlintrc.json`, CONFIG);
  for (const f of fixtures) {
    writeFile(`${workDir}/fixtures/${f.name}.jsx`, f.code);
  }
  // 显式传文件而不是 fixtures 目录：oxlint 遍历目录会应用沿途的
  // .gitignore（lab 在仓库 .cache 下，被根 .gitignore 整体忽略），
  // 显式文件参数不受 ignore 影响。
  const r = exec(
    [
      ...bin,
      '-c',
      `${workDir}/config/oxlint/.oxlintrc.json`,
      '-f',
      'json',
      ...fixtures.map((f) => `${workDir}/fixtures/${f.name}.jsx`),
    ],
    { cwd },
  );
  // stdout 为空且非零退出 = 命令本身被拒（配置被拒 / lint 崩溃）：
  // 交给 JSON.parse 只会得到没法排查的 EOF。
  if (r.code !== 0 && r.stdout.trim() === '') {
    throw new Error(`oxlint lint exited ${r.code}: ${r.stderr || r.stdout}`);
  }
  return parseOxlint(r.stdout);
};
