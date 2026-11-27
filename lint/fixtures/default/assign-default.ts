// 有意违规夹具：空声明 + 后置赋值 + export default 的两步换名（round05 F-02）。
// 本地 let 只是别名，与带 initializer 的两步 default（bind.ts）同语义。
// 由 lint/no-cross-file-reexport.test.ts 聚合断言诊断数，不要「修复」本目录。
import { isString } from "../source";

let y;
y = isString;
export default y;
