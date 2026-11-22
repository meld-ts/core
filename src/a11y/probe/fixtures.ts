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

const elementOf = (role: string, attrs: string): string =>
  `<div role="${role}"${attrs} />`;

const attrsOf = (
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

const batchFiles = (
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
