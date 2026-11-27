// 负例：两步 default 的右值是本地值（箭头函数构造新绑定），不是转发导入名。
import { isString } from "../source";

const local = () => 1;
export default local;
