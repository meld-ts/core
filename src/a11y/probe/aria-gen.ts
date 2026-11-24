/**
 * aria-query 形状的源数据 → `aria.generated.ts` 与
 * `samples.generated.ts` 的源码文本。纯函数、无 IO；探针专用，
 * 不进 a11y 入口与 browser 产物。
 */

/** aria-query 的输入形状（只取生成需要的最小字段） */
export interface AriaPropertySource {
  readonly name: string;
  readonly type: string;
  readonly values?: ReadonlyArray<string | boolean>;
}

export interface RoleSource {
  readonly name: string;
  readonly abstract: boolean;
  readonly requiredProps: Readonly<Record<string, string | null>>;
  readonly nameFrom?: ReadonlyArray<string>;
  readonly accessibleNameRequired?: boolean;
}

export interface AriaQuerySource {
  readonly aria: ReadonlyArray<AriaPropertySource>;
  readonly roles: ReadonlyArray<RoleSource>;
}

const keyOf = (ariaName: string): string => ariaName.replace(/^aria-/, '');

// doc-* / graphics-* 这类带连字符的 role 名不是合法标识符，作对象键必须加引号
const objectKeyOf = (name: string): string =>
  /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : `'${name}'`;

const byKey = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const sortedProps = (src: AriaQuerySource): readonly AriaPropertySource[] =>
  [...src.aria].sort((a, b) => byKey(a.name, b.name));

const sortedRoles = (src: AriaQuerySource): readonly RoleSource[] =>
  [...src.roles].sort((a, b) => byKey(a.name, b.name));

// 输出必须确定：token 成员排序后输出；字面量 true/false 成员合并为 boolean。
const unionOf = (values: ReadonlyArray<string | boolean>): string => {
  const parts = values
    .filter((v) => v !== 'undefined')
    .map((v) => (typeof v === 'string' ? `'${v}'` : String(v)));
  const rest = parts.filter((p) => p !== 'true' && p !== 'false').sort(byKey);
  const head =
    parts.includes('true') && parts.includes('false') ? ['boolean'] : [];
  const all = head.concat(rest);
  return all.length > 0 ? all.join(' | ') : 'string';
};

const valueTypeOf = (prop: AriaPropertySource): string => {
  switch (prop.type) {
    case 'boolean':
      return 'boolean';
    case 'tristate':
      return "boolean | 'mixed'";
    case 'integer':
    case 'number':
      return 'number';
    case 'id':
    case 'string':
      return 'string';
    case 'idlist':
      return 'string | readonly string[]';
    // tokenlist 是空格分隔的组合值（aria-relevant="additions text"）：
    // 单 token 并集表达不了组合，映射成 string（§12.14）。
    case 'tokenlist':
      return 'string';
    case 'token':
      return unionOf(prop.values ?? []);
    default:
      return 'string';
  }
};

const sampleOf = (prop: AriaPropertySource): string => {
  switch (prop.type) {
    case 'boolean':
      return 'true';
    case 'tristate':
      return "'mixed'";
    case 'integer':
    case 'number':
      return '1';
    case 'id':
    case 'idlist':
      return "'x'";
    case 'token':
    case 'tokenlist': {
      // 样例取排序后的首个字符串成员，与 unionOf 的顺序一致。
      const first = (prop.values ?? [])
        .filter((v): v is string => typeof v === 'string' && v !== 'undefined')
        .sort(byKey)
        .at(0);
      return first === undefined ? 'true' : `'${first}'`;
    }
    default:
      return "'x'";
  }
};

const nameRuleOf = (
  role: RoleSource,
): 'required' | 'optional' | 'prohibited' => {
  const from = role.nameFrom ?? [];
  if (from.includes('prohibited')) return 'prohibited';
  if (role.accessibleNameRequired === true && !from.includes('contents')) {
    return 'required';
  }
  return 'optional';
};

/** 全部 AriaKey（输出形态、排序）；probe 的 keys 与生成文件共用一个事实源。 */
export const ariaKeys = (src: AriaQuerySource): string[] =>
  sortedProps(src).map((p) => keyOf(p.name));

/** 非抽象 role 的名字规则；键按 role 名排序插入，Object.keys 即排序后的 role 表。 */
export const nameRules = (
  src: AriaQuerySource,
): Record<string, 'required' | 'optional' | 'prohibited'> => {
  const out: Record<string, 'required' | 'optional' | 'prohibited'> = {};
  for (const role of sortedRoles(src)) {
    if (role.abstract) continue;
    out[role.name] = nameRuleOf(role);
  }
  return out;
};

/** 每个 key 的样例值：TS 表达式文本，求值结果满足 AriaValue<K>。 */
export const samplesOf = (src: AriaQuerySource): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const prop of sortedProps(src)) {
    out[keyOf(prop.name)] = sampleOf(prop);
  }
  return out;
};

export const generateAriaTypes = (src: AriaQuerySource): string => {
  const props = sortedProps(src);
  const roles = sortedRoles(src).filter((r) => !r.abstract);

  const keyUnion = props.map((p) => `  | '${keyOf(p.name)}'`).join('\n');
  const valueRows = props
    .map((p) => `  K extends '${keyOf(p.name)}' ? ${valueTypeOf(p)} :`)
    .join('\n');
  const roleUnion = roles.map((r) => `  | '${r.name}'`).join('\n');
  const nameRows = roles
    .map((r) => `  readonly ${objectKeyOf(r.name)}: '${nameRuleOf(r)}';`)
    .join('\n');
  const idListKeys = props
    .filter((p) => p.type === 'idlist')
    .map((p) => `'${keyOf(p.name)}'`)
    .join(' | ');
  const idKeys = props
    .filter((p) => p.type === 'id')
    .map((p) => `'${keyOf(p.name)}'`)
    .join(' | ');

  return `/**
 * ARIA 基础数据。
 *
 * 生成文件，勿手改。由 scripts/a11y-sync.ts 从 aria-query 生成。
 */

/** ARIA 属性名（输出形态去掉 aria- 前缀）。 */
export type AriaKey =
${keyUnion};

/** 引用多个 id 的属性（aria-query 类型 idlist）。 */
export type AriaIdListKey = ${idListKeys || 'never'};

/** 引用单个 id 的属性（aria-query 类型 id）。 */
export type AriaIdKey = ${idKeys || 'never'};

/** 每个属性的合法取值（aria-query 生成）。 */
export type AriaValue<K extends AriaKey> =
${valueRows}
  string;

/** 可用的 role（aria-query 非抽象 role）。 */
export type A11yRole =
${roleUnion};

/** 每个 role 的名字规则。 */
export type A11yNameRule = {
${nameRows}
};
`;
};

export const generateSamples = (src: AriaQuerySource): string => {
  const sampleRows = Object.entries(samplesOf(src))
    .sort(([a], [b]) => byKey(a, b))
    .map(([key, value]) => `  '${key}': ${value},`)
    .join('\n');
  const keyRows = ariaKeys(src)
    .map((key) => `  '${key}',`)
    .join('\n');
  const ruleRows = Object.entries(nameRules(src))
    .sort(([a], [b]) => byKey(a, b))
    .map(([role, rule]) => `  ${objectKeyOf(role)}: '${rule}',`)
    .join('\n');
  return `/**
 * 每个 AriaKey 的合法样例值与运行时元数据。
 *
 * 生成文件，勿手改。探针、维护者脚本与用户模式共用；不进入 a11y 入口。
 */
export const SAMPLES = {
${sampleRows}
} as const;

export const ARIA_KEYS = [
${keyRows}
] as const;

export const NAME_RULES = {
${ruleRows}
} as const;
`;
};
