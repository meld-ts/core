/**
 * ARIA 基础数据。
 *
 * 从 aria-query 生成。Plan A 阶段为手写缩小版（4 role、部分属性），
 * Plan B（bun run a11y:sync）整文件覆盖为全量生成版。
 */

/** camelCase 的 ARIA 属性名（a11y() 的输入属性名）。 */
export type AriaKey =
  | 'checked'
  | 'expanded'
  | 'controls'
  | 'label'
  | 'labelledBy'
  | 'valueNow'
  | 'selected'
  | 'details'
  | 'hidden';

/**
 * 引用多个 id 的属性（aria-query 类型 idlist）：
 * 接受 string 或 readonly string[]，输出时空格拼接。
 */
export type AriaIdListKey = 'controls' | 'labelledBy';

/** 引用单个 id 的属性（aria-query 类型 id）：只接受单个 string。 */
export type AriaIdKey = 'details';

/** 每个属性的合法取值（aria-query 生成）。 */
export type AriaValue<K extends AriaKey> = K extends 'checked'
  ? boolean | 'mixed'
  : K extends 'expanded' | 'selected' | 'hidden'
    ? boolean
    : K extends 'valueNow'
      ? number
      : K extends AriaIdListKey
        ? string | readonly string[]
        : K extends AriaIdKey
          ? string
          : string;

/** 可用的 role（aria-query 非抽象 role 的缩小集）。 */
export type A11yRole = 'switch' | 'img' | 'separator' | 'combobox';

/**
 * 每个 role 的名字规则（由 aria-query 的 accessibleNameRequired /
 * nameFrom 归出三类）：
 * - required：作者必须给名
 * - optional：名字可由子元素内容提供
 * - prohibited：不允许给名
 */
export type A11yNameRule = {
  readonly switch: 'required';
  readonly img: 'required';
  readonly separator: 'optional';
  readonly combobox: 'required';
};
