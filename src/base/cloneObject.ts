import { _assertObject } from '../_internal';

/**
 * JSON 序列化深拷贝
 *
 * 通过 `JSON.parse(JSON.stringify(...))` 实现深拷贝。
 * 无法处理循环引用、`BigInt`、`undefined`、函数、`Symbol` 等值。
 * 若 `JSON.stringify` 抛异常（如循环引用），自动降级调用
 * {@link cloneObjectByAssign} 做浅拷贝兜底。
 *
 * @param obj — 要拷贝的对象
 * @returns 深拷贝后的新对象，或降级后的浅拷贝
 * @throws {TypeError} 当 obj 为 null 或非 object 类型时
 *
 * @example
 * ```ts
 * const copy = cloneObjectByJson({ a: { b: 1 } });
 * copy.a.b = 99;
 * // 原对象不受影响
 * ```
 */
export const cloneObjectByJson = <T extends object>(obj: T): T => {
  _assertObject(obj);
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch {
    console.warn(
      'cloneObjectByJson: JSON.stringify failed, falling back to shallow copy (Object.assign)',
    );
    return cloneObjectByAssign(obj);
  }
};

/**
 * 浅拷贝（Object.assign）
 *
 * 使用 `Object.assign({}, obj)` 创建原对象的浅拷贝。
 * 嵌套对象和数组仍然共享引用。
 *
 * @param obj — 要拷贝的对象
 * @returns 浅拷贝后的新对象
 * @throws {TypeError} 当 obj 为 null 或非 object 类型时
 *
 * @example
 * ```ts
 * const copy = cloneObjectByAssign({ a: { b: 1 } });
 * copy.a.b = 99;
 * // ⚠️ 嵌套对象共享引用——原对象也会被修改
 * ```
 */
export const cloneObjectByAssign = <T extends object>(obj: T): T => {
  _assertObject(obj);
  return Object.assign({}, obj);
};

/**
 * 深拷贝一个对象（三级降级）
 *
 * 1. 优先 `structuredClone`（现代运行时均支持）
 * 2. 不可用时降级为 {@link cloneObjectByJson}（JSON 序列化，失败再降级为 assign）
 *
 * @param obj — 要拷贝的对象
 * @returns 深拷贝后的新对象
 * @throws {TypeError} 当 obj 为 null 或非 object 类型时
 *
 * @example
 * ```ts
 * const src = { a: { b: 1 } };
 * const copy = cloneObject(src);
 * copy.a.b = 99;
 * console.log(src.a.b); // 1
 * ```
 */
export const cloneObject = <T extends object>(obj: T): T => {
  _assertObject(obj);
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(obj);
  }
  return cloneObjectByJson(obj);
};
