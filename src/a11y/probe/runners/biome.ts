import type { Fixture } from '../fixtures';
import type { LintReport, RunnerOptions } from './eslint';

const REQ =
  /The element with the (\S+) ARIA role does not have the required ARIA attributes/;
const SUP =
  /The ARIA attribute '(aria-[a-z]+)' is not supported by this element/;

/**
 * biome 的 JSON 报告（2.5.0 / 2.6.8 实测）有两个缺口，解析方式由此决定：
 * - required 消息只含 role，缺失属性清单在 footer 里，JSON 不输出
 *   （advices 恒为空数组），所以 missing.props 恒为空；required 靠上层
 *   「逐个去掉一个 supported 属性再跑」发现（probe/index.ts），不读消息清单；
 * - unsupported 消息不含 role，靠诊断的文件与行号回查 fixture 那一行的 role。
 */
export const parseBiome = (
  raw: string,
  fixtures: readonly Fixture[],
): LintReport => {
  const missing: Array<{ role: string; props: string[] }> = [];
  const unsupported: Array<{ role: string; prop: string }> = [];
  const out = JSON.parse(raw) as {
    diagnostics: Array<{
      category: string | null;
      message: string;
      location: { path: string; start: { line: number } };
    }>;
  };
  const linesOf = new Map(
    fixtures.map((f) => [f.name, f.code.split('\n')] as const),
  );
  for (const d of out.diagnostics) {
    if (
      d.category !== 'lint/a11y/useAriaPropsForRole' &&
      d.category !== 'lint/a11y/useAriaPropsSupportedByRole'
    ) {
      continue;
    }
    const req = d.message.match(REQ);
    const role = req?.[1];
    if (role !== undefined) {
      missing.push({ role, props: [] });
      continue;
    }
    const sup = d.message.match(SUP);
    const prop = sup?.[1];
    if (prop !== undefined) {
      unsupported.push({ role: roleAt(linesOf, d.location), prop });
      continue;
    }
    // 白名单内的规则却匹配不出已知形状：静默跳过会让表悄悄缺数据，
    // 直接失败交给上层排查。
    throw new Error(`biome ${d.category}: unrecognized message: ${d.message}`);
  }
  return { missing, unsupported };
};

const roleAt = (
  linesOf: ReadonlyMap<string, readonly string[]>,
  location: { path: string; start: { line: number } },
): string => {
  const file = location.path.split('/').at(-1)?.slice(0, -4) ?? '';
  const row = linesOf.get(file)?.at(location.start.line - 1);
  const role = row?.match(/role="([^"]+)"/)?.[1];
  // 诊断定位对不上写出的 fixture 说明行号约定漂了，直接失败而不是静默丢数据。
  if (role === undefined) {
    throw new Error(
      `cannot resolve role at ${location.path}:${location.start.line}`,
    );
  }
  return role;
};

// preset:"none" 关掉全部默认规则只留两条 a11y 规则，
// 2.5.0 与 2.6.8 实测可用；旧写法 rules.recommended:false 在 2.6.8 已标废弃。
const CONFIG = `{
  "linter": {
    "enabled": true,
    "rules": {
      "preset": "none",
      "a11y": {
        "useAriaPropsForRole": "error",
        "useAriaPropsSupportedByRole": "error"
      }
    }
  }
}
`;

export const runBiome = (
  fixtures: readonly Fixture[],
  { bin, cwd, workDir, writeFile, exec }: RunnerOptions,
): LintReport => {
  writeFile(`${workDir}/config/biome/biome.json`, CONFIG);
  for (const f of fixtures) {
    writeFile(`${workDir}/fixtures/${f.name}.jsx`, f.code);
  }
  const r = exec(
    [
      ...bin,
      'lint',
      `--config-path=${workDir}/config/biome`,
      '--reporter=json',
      `${workDir}/fixtures`,
    ],
    { cwd },
  );
  return parseBiome(r.stdout, fixtures);
};
