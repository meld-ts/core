import { isConstructor } from '../guards';
import type { Constructor } from '../types';

/** 将联合类型转换为交叉类型：`A | B | C` → `A & B & C` */
type UnionToIntersection<U> = (
  U extends unknown
    ? (k: U) => void
    : never
) extends (k: infer I) => void
  ? I
  : never;

/**
 * 将一个或多个 trait 对象的属性描述符复制到 `ctor.prototype`，实现运行时扩展。
 *
 * ### this 类型绑定
 *
 * 所有 trait 类型通过 `UnionToIntersection` 合并为交叉类型后作为 `ThisType`
 * 绑定，因此每个 trait 内部的 `this` 都能感知：
 * - 宿主类的属性和方法
 * - 同一 trait 内的其他方法
 * - **其他 trait** 的方法（跨 trait 互调）
 *
 * ### 基本用法
 *
 * ```ts
 * class MyClass {
 *   name = 'test'
 * }
 *
 * type GreetTrait = { greet(): string }
 *
 * implTraits(MyClass, {
 *   greet() {
 *     return `hello, ${this.name}` // this.name ← MyClass ✓
 *   },
 * })
 *
 * interface MyClass extends GreetTrait {}
 * ```
 *
 * ### 多 trait 批量混入（支持跨 trait 互调）
 *
 * ```ts
 * type GreetTrait   = { greet(): string }
 * type DisplayTrait = { display(): string }
 *
 * implTraits(MyClass,
 *   {
 *     greet() {
 *       return `hi, ${this.display()}` // this.display ← DisplayTrait ✓
 *     },
 *   },
 *   {
 *     display() {
 *       return this.name              // this.name ← MyClass ✓
 *     },
 *   },
 * )
 *
 * interface MyClass extends GreetTrait, DisplayTrait {}
 * ```
 *
 * ### 工厂函数形式（带参数的 trait）
 *
 * 工厂函数内部定义对象时，编译器无法自动感知宿主类型，需通过显式 `this`
 * 参数或泛型约束来补充：
 *
 * ```ts
 * type PrefixTrait = { prefixed(): string }
 *
 * function createPrefixTrait<Host extends { name: string }>(prefix: string) {
 *   return {
 *     prefixed(this: Host) {
 *       return `${prefix}::${this.name}` // this.name ← Host 约束 ✓
 *     },
 *   }
 * }
 *
 * implTraits(MyClass, createPrefixTrait<MyClass>('app'))
 * interface MyClass extends PrefixTrait {}
 * ```
 *
 * ### 注意事项
 * - 跳过 `constructor` 属性，避免破坏原型链
 * - 使用 `defineProperty` 而非赋值，能正确处理 getter / setter
 * - 同时复制字符串键和 Symbol 键（`Object.getOwnPropertySymbols`），支持 `[Symbol.iterator]` 等 Well-Known Symbol
 * - 类型侧需配合 `interface MyClass extends TraitA, TraitB {}` 声明合并
 * - 使用 Biome 时需加两处 biome-ignore：class 声明前 suppress `noUnsafeDeclarationMerging`，
 *   interface 声明前 suppress `noUnusedVariables`：
 *   ```ts
 *   // biome-ignore lint/suspicious/noUnsafeDeclarationMerging: implTraits guarantees runtime implementation
 *   class MyClass { ... }
 *
 *   implTraits(MyClass, { ... })
 *
 *   // biome-ignore lint/correctness/noUnusedVariables: trait type extension via implTraits
 *   interface MyClass extends MyTrait {}
 *   ```
 *
 * @param ctor   目标类构造器
 * @param traits 一个或多个 trait 实现对象
 */
export function implTraits<T extends object, Traits extends object[]>(
  ctor: Constructor<T>,
  ...traits: {
    [K in keyof Traits]: Traits[K] &
      ThisType<T & UnionToIntersection<Traits[number]>>;
  }
): void {
  if (!isConstructor(ctor)) return;
  for (const trait of traits as object[]) {
    const keys: (string | symbol)[] = [
      ...Object.getOwnPropertyNames(trait),
      ...Object.getOwnPropertySymbols(trait),
    ];
    for (const name of keys) {
      if (name === 'constructor') continue;
      const descriptor = Object.getOwnPropertyDescriptor(trait, name);
      if (descriptor) {
        Object.defineProperty(ctor.prototype, name, descriptor);
      }
    }
  }
}
