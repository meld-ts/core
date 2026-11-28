/**
 * 探针 fixture：让各 lint 的 a11y 规则产生可解析报错的 .jsx 源码。
 * 纯字符串构造，不落盘；runner 按 name 写到 `workDir/fixtures/` 下。
 * 每个元素独占一行——biome 的 unsupported 消息不含 role，
 * 要靠诊断的行号回查那一行元素。
 */

export interface Fixture {
  readonly name: string;
  readonly code: string;
}

/** 去属性变体：required 发现靠「去掉一个属性再跑」实现。 */
export interface RemovalSpec {
  /** 要去掉的属性 key（输入形态）；省略 = 全保留（基线）。 */
  readonly remove?: string;
  /** 每个元素带 tabIndex={0}（focusable 变体）。 */
  readonly focusable?: boolean;
}

const fileOf = (elements: readonly string[]): string =>
  elements.map((el, i) => `export const F${i} = () => ${el};`).join('\n');

/** 单个元素一行；biome 的 unsupported 归因靠行号回查 role。 */
export const elementOf = (role: string, attrs: string): string =>
  `<div role="${role}"${attrs} />`;

export const attrsOf = (
  keys: readonly string[],
  samples: Readonly<Record<string, string>>,
): string => {
  const parts = keys.map((key) => {
    const value = samples[key];
    // 属性值拼成 undefined 时 eslint/oxlint 会静默忽略该属性，
    // supported 表会悄无声息地错掉，所以直接失败。
    if (value === undefined) {
      throw new Error(`no sample value for aria key: ${key}`);
    }
    return ` aria-${key}={${value}}`;
  });
  return parts.join('');
};

/**
 * 运行时样例值 → JSX 表达式文本：字符串包回引号、布尔/数字原样，
 * 与 a11y:sync 里 samplesOf 的表达式文本一致，同一 lint 版本两种
 * 模式产出逐字节相同的 fixture。
 */
export const expressionOf = (value: string | boolean | number): string =>
  typeof value === 'string' ? `'${value}'` : String(value);

/** SAMPLES（运行时值）整体转成 fixture 要的表达式文本表。 */
export const fixtureSamples = (
  samples: Readonly<Record<string, string | boolean | number>>,
): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(samples)) {
    out[key] = expressionOf(value);
  }
  return out;
};

/** 按文件分批（默认 200 个元素/文件），文件名按文件数补零。 */
export const batchFiles = (
  elements: readonly string[],
  prefix: string,
  batchSize = 200,
): Fixture[] => {
  const files = Math.ceil(elements.length / batchSize);
  const width = String(files).length;
  return Array.from({ length: files }, (_, i) => ({
    name: `${prefix}-${String(i).padStart(width, '0')}`,
    code: fileOf(elements.slice(i * batchSize, (i + 1) * batchSize)),
  }));
};

export const buildSupportedFixtures = (
  roles: readonly string[],
  keys: readonly string[],
  samples: Readonly<Record<string, string>>,
  batchSize = 200,
): Fixture[] => {
  const elements = roles.flatMap((role) =>
    keys.map((key) => elementOf(role, attrsOf([key], samples))),
  );
  return batchFiles(elements, 'supported', batchSize);
};

export const buildRemovalFixtures = (
  roles: readonly string[],
  supported: Readonly<Record<string, readonly string[]>>,
  samples: Readonly<Record<string, string>>,
  spec: RemovalSpec = {},
  batchSize = 200,
): Fixture[] => {
  const variant = spec.focusable ? 'focusable-' : '';
  const removed = spec.remove ?? 'baseline';
  const tab = spec.focusable ? ' tabIndex={0}' : '';
  const elements = roles.map((role) => {
    const kept = (supported[role] ?? []).filter((key) => key !== spec.remove);
    return elementOf(role, `${tab}${attrsOf(kept, samples)}`);
  });
  return batchFiles(elements, `${variant}removal-${removed}`, batchSize);
};

export const buildSelfCheckFixture = (
  role: string,
  supported: readonly string[],
  missing: string,
  samples: Readonly<Record<string, string>>,
): Fixture => ({
  // 文件名带上预期缺失属性：workDir 保留排查时一眼可见在验哪条。
  name: `self-check-${role}-aria-${missing}`,
  code: fileOf([
    elementOf(
      role,
      attrsOf(
        supported.filter((key) => key !== missing),
        samples,
      ),
    ),
  ]),
});
