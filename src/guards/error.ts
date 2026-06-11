import { _strEmpty } from '../_internal';
import type { ErrorLike } from '../types';
import { isInferObj } from './object';
import { notEmptyStr } from './string';

/**
 * 判断目标是否是 {@link ErrorLike}
 *
 * @param err
 */
export const isErrLike = (err: unknown): err is ErrorLike =>
  isInferObj<ErrorLike>(
    err,
    (it) => notEmptyStr(it.message) || notEmptyStr(it.error),
  );

/**
 * 提取错误消息文本
 *
 * ```ts
 * const maybeEmpty = '';
 * errMsg(maybeEmpty) || 'Default Error Message';
 * ```
 *
 * @param err
 */
export const errMsg = (err: unknown): string => {
  if (err == null) return _strEmpty;
  if (notEmptyStr(err)) return err;
  if (err instanceof Error) return err.message || _strEmpty;
  if (isErrLike(err)) return err.message || err.error || _strEmpty;
  return _strEmpty;
};
