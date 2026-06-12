export type DirectorySeparator = '/' | '\\';
export type PathInput = string | undefined | null;

export const UnixDS = '/' as const;
export const WinDS = '\\' as const;

export type PathReplacementCallback = (
  path: string,
  separator: string,
) => string;

export type PathUtilsOptions = {
  separator: string;
  /**
   * 危险内容替换回调（安全防线）
   *
   * 在 `purge` 阶段最先执行。默认不传则不做任何安全检查——
   * 这意味着 `join('/var/www', '../../../etc')` 会返回 `../etc`。
   *
   * **强烈建议**在此回调中实现路径遍历拦截，例如：
   * - 检测并移除 `..` 段
   * - 检测并拒绝绝对路径
   * - 将路径限制在某个根目录内
   *
   * @example
   * ```ts
   * dangerReplace: (path, sep) => {
   *   // 拒绝绝对路径
   *   if (path.startsWith(sep)) throw new Error('absolute path not allowed');
   *   // 移除所有 .. 段
   *   return path.split(sep).filter(s => s !== '..').join(sep);
   * }
   * ```
   */
  dangerReplace?: PathReplacementCallback;
  /**
   * 重复分隔符合并回调
   *
   * 在 `dangerReplace` 之后执行。默认不传则不做合并处理。
   * 典型用途：`//a//b` → `/a/b`。
   */
  duplicateReplace?: PathReplacementCallback;
};

/**
 * 创建路径处理工具
 *
 * 返回 `{ purge, join }` 两个方法。所有操作基于统一的 `separator`，
 * 支持回调注入安全策略（`dangerReplace`）和规范化策略（`duplicateReplace`）。
 *
 * **安全注意**：默认情况下 `dangerReplace` 为空，路径遍历攻击（`../`）
 * 不会被拦截。请根据使用场景实现自定义安全策略。
 *
 * @param options.separator — 路径分隔符。空字符串默认 `/`，多字符取首字符
 * @param options.dangerReplace — 可选，在 `purge` 最前面执行的安全替换
 * @param options.duplicateReplace — 可选，在 `dangerReplace` 后执行的规范替换
 *
 * @example
 * ```ts
 * const { join, purge } = createPathUtils({
 *   separator: '/',
 *   dangerReplace: (path, sep) => {
 *     // 拒绝绝对路径
 *     if (path.startsWith(sep)) throw new Error('absolute path not allowed');
 *     return path;
 *   },
 * });
 *
 * join('a', 'b', 'c');        // 'a/b/c'
 * join('a', '.', 'b');        // 'a/b'
 * join('a', '..', 'b');       // 'b'
 * purge('/a/b/');              // 'a/b'
 * ```
 */
export const createPathUtils = ({
  separator: inputSeparator,
  dangerReplace,
  duplicateReplace,
}: PathUtilsOptions) => {
  const separator = !inputSeparator
    ? UnixDS
    : inputSeparator.length > 1
      ? inputSeparator.slice(0, 1)
      : inputSeparator;

  /**
   * 清理单个路径段
   *
   * - `null` / `undefined` → `''`
   * - 去除首尾空白
   * - 按顺序执行 {@link dangerReplace} → {@link duplicateReplace}
   * - 去除首尾分隔符
   *
   * @returns 清理后的路径字符串；空输入返回 `''`
   */
  const purge = (path: PathInput): string => {
    let _path = path == null ? '' : path.trim();
    if (_path === '') return '';

    if (dangerReplace != null) {
      _path = dangerReplace(_path, separator);
    }

    if (duplicateReplace != null) {
      _path = duplicateReplace(_path, separator);
    }

    // remove leading and trailing separators
    if (_path.startsWith(separator)) {
      _path = _path.substring(1);
    }
    if (_path.endsWith(separator)) {
      _path = _path.substring(0, _path.length - 1);
    }

    return _path;
  };

  /**
   * 拼接多个路径段
   *
   * 每个段经 {@link purge} 清理后拼接。支持 `.`（跳过）和 `..`（消除前一段）。
   * `..` 不会穿越到结果为空以上——多余的 `..` 会原样保留。
   *
   * @returns 拼接后的路径字符串
   */
  const join = (...paths: PathInput[]): string => {
    let parts: string[] = [];

    const handlePart = (input: string) => {
      const part = purge(input);
      if (part === '' || part === '.') return;

      if (part.includes(separator)) {
        const _parts = part.split(separator);
        for (const _part of _parts) {
          handlePart(_part);
        }
        return;
      }

      if (part === '..') {
        if (parts.length > 0 && parts[parts.length - 1] !== '..') {
          parts = parts.slice(0, -1);
          return;
        }
      }

      parts.push(part);
    };

    for (const path of paths) {
      if (path == null || path === '') continue;
      handlePart(path);
    }

    return parts.join(separator);
  };

  return { purge, join };
};
