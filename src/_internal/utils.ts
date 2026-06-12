import { _typeObj } from './consts';

/**
 * 运行时校验：确保入参为非 null 的对象类型
 *
 * 类型签名 `<T extends object>` 只在编译期有效。运行时若有 `any` 绕过
 * 传入 `null` / 字符串 / 数字等，直接抛 `TypeError` 避免不可预料的后果。
 *
 * @throws {TypeError} 当 obj 为 null 或非 object 类型时
 */
export const _assertObject = (obj: unknown): void => {
  if (obj === null || typeof obj !== _typeObj) {
    throw new TypeError(
      `Expected an object, but received ${obj === null ? 'null' : typeof obj}`,
    );
  }
};
