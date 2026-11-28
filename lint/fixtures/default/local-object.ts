// 负例：export default 一个本地对象字面量，不是转发导入名。
import { isString } from '../source';
export default { wrapped: isString };
