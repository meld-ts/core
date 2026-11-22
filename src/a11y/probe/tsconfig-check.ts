/**
 * tsconfig include/exclude 的最小 glob：`**` 整段匹配零或多段路径、
 * 段内 `*` 不跨段；目录名（含 `a/**`）按「目录下全部文件」处理。
 * include 与 files 并存取并集（tsc 语义：列进 files 的文件也算编译进去）。
 * 只作告警依据，不追求与 tsc 的完整方言一致；已知局限：
 * - 不跟随 extends——extends 链上游收窄过 include 时，这里按本文件报
 *   default/已包含，重载实际不生效，这个方向拦不住；
 * - `./` 前缀的模式匹配不上（误报未包含）；`?` 通配不支持（按字面量）；
 * - exclude 先于显式 files 条目判定——tsc 里显式列进 files 的文件不受
 *   exclude 影响，这里更保守（宁可误告警）。
 */

export interface TsconfigCheckInput {
  readonly cwd: string;
  readonly outPath: string;
  readonly readJson: (path: string) => unknown;
}

export type TsconfigCheckReason =
  | 'include'
  | 'exclude'
  | 'not-include'
  | 'default'
  | 'files'
  | 'not-files'
  | 'outside';

export interface TsconfigCheckResult {
  readonly included: boolean;
  readonly reason: TsconfigCheckReason;
}

// 段内 `*` 先按分隔符切开，剩余字符全部按字面量转义后再接回通配
const segOf = (part: string): string =>
  part
    .split('*')
    .map((chunk) => chunk.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^/]*');

const reSource = (pattern: string): string => {
  let out = '';
  let prevStarStar = false;
  for (const part of pattern.split('/')) {
    if (part === '**') {
      // '**' 前的分隔符（首段除外）由这段补；它自身连同其后随的分隔符
      // 一起消耗：匹配零段（`**/*.ts` 匹配根下文件）或多段
      if (!prevStarStar && out !== '') out += '/';
      out += '(?:[^/]+/)*';
      prevStarStar = true;
      continue;
    }
    // 前一段是 '**' 时分隔符已被吞掉，非 '**' 段之间才补 '/'
    if (!prevStarStar && out !== '') out += '/';
    prevStarStar = false;
    out += segOf(part);
  }
  return out;
};

const matches = (pattern: string, file: string): boolean => {
  if (pattern === '**') return true;
  if (!/[*?]/.test(pattern)) {
    return file === pattern || file.startsWith(`${pattern}/`);
  }
  // 尾部 `/**` = 该目录下任意深度的文件（`**` 段自带的分隔符消耗
  // 不含末段文件名，补一个不跨段的文件名通配）
  const tail = pattern.endsWith('/**') ? '[^/]*' : '';
  return new RegExp(`^${reSource(pattern)}${tail}$`).test(file);
};

export const checkTsconfigIncludes = ({
  cwd,
  outPath,
  readJson,
}: TsconfigCheckInput): TsconfigCheckResult => {
  // include/exclude 模式相对 tsconfig 所在目录解析；cwd 外的文件对不上模式
  if (!outPath.startsWith(`${cwd}/`)) {
    return { included: false, reason: 'outside' };
  }
  const file = outPath.slice(cwd.length + 1);
  // tsconfig.json 是用户文件，只取这三个可选字段作告警依据
  const tsconfig = readJson(`${cwd}/tsconfig.json`) as {
    include?: readonly string[];
    exclude?: readonly string[];
    files?: readonly string[];
  };
  if ((tsconfig.exclude ?? []).some((p) => matches(p, file))) {
    return { included: false, reason: 'exclude' };
  }
  if (tsconfig.include === undefined) {
    // tsc 语义：include 缺省编译全部（默认排除除外）；files 存在时只编 files
    if (tsconfig.files === undefined) {
      return { included: true, reason: 'default' };
    }
    return tsconfig.files.includes(file)
      ? { included: true, reason: 'files' }
      : { included: false, reason: 'not-files' };
  }
  if (tsconfig.include.some((p) => matches(p, file))) {
    return { included: true, reason: 'include' };
  }
  // include 与 files 并存取并集：列进 files 的文件也算编译进去
  return tsconfig.files?.includes(file)
    ? { included: true, reason: 'files' }
    : { included: false, reason: 'not-include' };
};
