// 有意违规夹具：export default 把导入标识符送出模块。一个文件只能有一条
// export default，形态分文件放在本目录。由 lint/no-cross-file-reexport.test.ts
// 聚合断言诊断数，不要「修复」本目录。
import { isString } from "./source";
export default isString;
