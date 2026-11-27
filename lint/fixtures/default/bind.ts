// 有意违规夹具：先声明再 export default 的两步 default（round04 F-01 组合出口）。
// 本地 const 只是别名，没有改绑定，与 export { x as default } 同等禁止。
// 由 lint/no-cross-file-reexport.test.ts 聚合断言诊断数，不要「修复」本目录。
import { isString } from "../source";

const x = isString;
export default x;
