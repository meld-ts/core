// 两步 default，default 右值带包装：包装不改绑定，仍算转发。
import { isString } from '../source';
const x = isString;
export default (x);
