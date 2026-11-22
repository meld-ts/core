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

const fileOf = (elements: readonly string[]): string =>
  elements.map((el, i) => `export const F${i} = () => ${el};`).join('\n');

const elementOf = (role: string, attrs: string): string =>
  `<div role="${role}"${attrs} />`;

export const buildRequiredFixtures = (roles: readonly string[]): Fixture[] => [
  { name: 'required', code: fileOf(roles.map((role) => elementOf(role, ''))) },
];

export const buildSupportedFixtures = (
  roles: readonly string[],
  keys: readonly string[],
  samples: Readonly<Record<string, string>>,
  batchSize = 200,
): Fixture[] => {
  const elements = roles.flatMap((role) =>
    keys.map((key) => {
      const value = samples[key];
      // 属性值拼成 undefined 时 eslint/oxlint 会静默忽略该属性，
      // supported 表会悄无声息地错掉，所以直接失败。
      if (value === undefined) {
        throw new Error(`no sample value for aria key: ${key}`);
      }
      return elementOf(role, ` aria-${key}={${value}}`);
    }),
  );
  const files = Math.ceil(elements.length / batchSize);
  const width = String(files).length;
  return Array.from({ length: files }, (_, i) => ({
    name: `supported-${String(i).padStart(width, '0')}`,
    code: fileOf(elements.slice(i * batchSize, (i + 1) * batchSize)),
  }));
};

export const buildFocusableFixtures = (roles: readonly string[]): Fixture[] => [
  {
    name: 'focusable-plain',
    code: fileOf(roles.map((role) => elementOf(role, ''))),
  },
  {
    name: 'focusable-tab',
    code: fileOf(roles.map((role) => elementOf(role, ' tabIndex={0}'))),
  },
];

export const buildSelfCheckFixture = (
  role: string,
  missing: string,
): Fixture => ({
  // 文件名带上预期缺失属性：workDir 保留排查时一眼可见在验哪条。
  name: `self-check-${role}-${missing}`,
  code: fileOf([elementOf(role, '')]),
});
