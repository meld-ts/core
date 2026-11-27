// 有意违规夹具：import 进来再 export { X }（无 from）。这条归 biome 内置
// style/noExportedImports 管（夹具配置里开启），grit 插件不管这个形态。
// 由 lint/no-cross-file-reexport.test.ts 断言诊断数，不要「修复」本文件。
import { isString } from "./source";

export { isString };
