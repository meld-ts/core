import { _typeSymbol } from '../_internal';

/**
 * 检查值是否为 Symbol 原始类型（含类型收窄）
 *
 * Symbol 没有包装对象（`new Symbol()` 会抛 TypeError），
 * 因此仅需 `typeof val === 'symbol'` 即可完全判定。
 *
 * @param val — 待检查的任意值
 * @returns `true` 当且仅当 val 是 symbol，同时收窄为 `symbol`
 *
 * @example
 * ```ts
 * if (isSymbol(val)) {
 *   console.log(val.description); // val: symbol
 * }
 * isSymbol(Symbol('test'));   // true
 * isSymbol(Symbol.iterator);  // true
 * isSymbol('symbol');         // false
 * ```
 */
export const isSymbol = (val: unknown): val is symbol =>
  typeof val === _typeSymbol;
