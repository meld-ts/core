// 负例：export default 一个箭头函数，构造新值，不是转发导入名。
import { isString } from '../source';
export default () => isString;
