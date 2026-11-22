/** 单个 role 的规则源数据：属性名是 `aria-*` 输入形态。 */
export interface RoleRuleData {
  readonly required: readonly string[];
  readonly supported: readonly string[];
  readonly requiredWhenFocusable: readonly string[];
}

export interface ProfileData {
  readonly lint: string;
  readonly version: string;
  readonly aliasOf?: string;
  readonly roles: Readonly<Record<string, RoleRuleData>>;
}

const SORT = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const keyOf = (ariaName: string): string => ariaName.replace(/^aria-/, '');

// doc-* / graphics-* 这类带连字符的 role 名不是合法标识符，作对象键必须加引号
const objectKeyOf = (name: string): string =>
  /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : `'${name}'`;

const union = (names: readonly string[]): string =>
  names.length ? names.map((n) => `'${keyOf(n)}'`).join(' | ') : 'never';

const sorted = (names: readonly string[]): string[] =>
  [...new Set(names)].sort(SORT);

const typeName = (lint: string): string =>
  `${lint.charAt(0).toUpperCase()}${lint.slice(1)}A11yProfile`;

// eslint 表的版本取的是 eslint-plugin-jsx-a11y 插件的版本（detect.ts），
// 头部按插件署名，避免读成 eslint 自身的版本。
const versionLabel = (lint: string, version: string): string =>
  lint === 'eslint'
    ? `eslint-plugin-jsx-a11y ${version}`
    : `${lint} ${version}`;

/**
 * 单张表的内联类型字面量（无 export、无文件头）：内置表与用户模式重载
 * 共用同一段序列化，同一 lint 版本两种模式产出逐字节一致。
 */
export const serializeProfileLiteral = (
  profile: ProfileData,
  source: 'builtin' | 'probe',
): string => {
  const alias = profile.aliasOf ? `; aliasOf: '${profile.aliasOf}'` : '';
  const roles = Object.entries(profile.roles)
    .sort(([a], [b]) => SORT(a, b))
    .map(
      ([role, r]) =>
        `    ${objectKeyOf(role)}: { required: ${union(sorted(r.required))}; supported: ${union(sorted(r.supported))}; requiredWhenFocusable: ${union(sorted(r.requiredWhenFocusable))} };`,
    )
    .join('\n');
  return `{
  meta: { lint: '${profile.lint}'; version: '${profile.version}'; source: '${source}'${alias} };
  roles: {
${roles}
  };
}`;
};

export const serializeProfile = (profile: ProfileData): string =>
  `/**
 * ${profile.lint} 内置规则表。
 *
 * 生成文件，勿手改。${versionLabel(profile.lint, profile.version)}。
 */
export type ${typeName(profile.lint)} = ${serializeProfileLiteral(
    profile,
    'builtin',
  )};
`;
