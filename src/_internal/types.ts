/**
 * 将联合类型转换为交叉类型：`A | B | C` → `A & B & C`。
 *
 * 经由函数参数位置的逆变把成员交叉：每个成员映射成 `(k: U) => void`，
 * 再从合并后的函数参数 `infer` 回来。
 */
export type UnionToIntersection<U> = (
  U extends unknown
    ? (k: U) => void
    : never
) extends (k: infer I) => void
  ? I
  : never;
