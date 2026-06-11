import { _strEmpty } from '../_internal';
import type { ErrorLike } from '../types';
import { isInferObject } from './object';
import { notEmptyString } from './string';

/**
 * 判断目标是否为 {@link ErrorLike}
 *
 * 检查对象是否至少包含一个非空的 `message` 或 `error` 字段。
 * 两者任一非空即通过（OR 语义）。通过后 val 收窄为 `ErrorLike`。
 *
 * @param err — 待检查的任意值
 * @returns `true` 当且仅当 err 是非 null 对象且 `message` 或 `error` 至少其一为非空字符串
 *
 * @example
 * ```ts
 * isErrorLike({ message: 'boom' });    // true
 * isErrorLike({ error: 'boom' });      // true
 * isErrorLike({ message: '', error: 'fallback' }); // true（error 非空）
 * isErrorLike({});                       // false
 * isErrorLike('boom');                   // false
 * ```
 */
export const isErrorLike = (err: unknown): err is ErrorLike =>
  isInferObject<ErrorLike>(
    err,
    (it) => notEmptyString(it.message) || notEmptyString(it.error),
  );

/**
 * 从各种类型的错误来源中提取错误消息文本
 *
 * 提取优先级（从高到低）：
 * 1. `null` / `undefined` → 返回 `''`
 * 2. 非空字符串类型 → 直接返回该字符串
 * 3. `Error` 实例 → 返回 `err.message`（可能为空串）
 * 4. `ErrorLike` 对象 → 返回 `err.message`（优先）或 `err.error`（fallback）
 * 5. 其他 → 返回 `''`
 *
 * @param err — 任意类型的错误来源
 * @returns 提取出的错误消息文本，无法提取时返回 `''`
 *
 * @example
 * ```ts
 * errorMessage(new Error('boom'));              // 'boom'
 * errorMessage({ message: 'boom' });            // 'boom'
 * errorMessage({ error: 'fallback' });          // 'fallback'
 * errorMessage({ message: '', error: 'fb' });   // 'fb'（message 空串 → fallback）
 * errorMessage('string error');                  // 'string error'
 * errorMessage(null);                            // ''
 *
 * // 典型用法：带 fallback
 * const msg = errorMessage(caught) || 'Unknown Error';
 * ```
 */
export const errorMessage = (err: unknown): string => {
  if (err == null) return _strEmpty;
  if (notEmptyString(err)) return err;
  if (err instanceof Error) return err.message || _strEmpty;
  if (isErrorLike(err)) return err.message || err.error || _strEmpty;
  return _strEmpty;
};
