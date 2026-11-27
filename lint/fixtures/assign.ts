// 有意违规夹具：空声明或本地 initializer + 后置赋值为 import 再 export 的换名
// （round05 F-02 赋值关联、round06 F-02 本地 initializer 覆盖赋值）。
// let/var 空声明后置赋值、带 dummy initializer 再覆盖赋值，本地名只是别名，
// 与「先声明再 export」的 const 两步同语义。
// 含负例：赋值右值是本地值、别名赋值未导出、initializer 与赋值都是本地值，都不报。
// 由 lint/no-cross-file-reexport.test.ts 断言诊断数，不要「修复」本文件。
import { isString } from "./source";

let x;
x = isString;

export { x };

var w;
w = isString;

export { w as w2 };

let z;
z = isString as typeof isString;

export { z as default };

// 负例：赋值右值是本地值，import 关联不到就不报
const localValue = 1;
let l;
l = localValue;

export { l };

// 负例：别名赋值未送出模块，不报
let hidden;
hidden = isString;

// 带 dummy initializer 的声明再覆盖赋值为 import（round06 F-02）：initializer 被
// 后置赋值覆盖丢掉，模块求值后送出的仍是 import 名，与空声明同语义
let a = undefined as any;
a = isString;

export { a };

var b = null as any;
b = isString;

export { b };

export let c = 0 as any;
c = isString;

// 负例：initializer 与后置赋值都是本地值，import 关联不上，不报
let n = localValue;
n = localValue;

export { n };
