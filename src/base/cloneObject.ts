/**
 * 深拷贝一个对象
 *
 * 优先使用 `structuredClone`，不可用时降级为 `JSON.parse(JSON.stringify(...))`，
 * 若序列化失败（如含循环引用）则退化为浅拷贝 `Object.assign`。
 *
 * @param obj 要拷贝的对象
 * @returns 深拷贝后的新对象
 *
 * @example
 * ```ts
 * const src = { a: { b: 1 } };
 * const copy = cloneObj(src);
 * copy.a.b = 99;
 * console.log(src.a.b); // 1
 * ```
 */
export const cloneObject = <T extends object>(obj: T): T => {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(obj);
  }
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch {
    return Object.assign({}, obj);
  }
};

export const cloneObjectByJson = () => {};

export const cloneObjectByAssign = () => {};
