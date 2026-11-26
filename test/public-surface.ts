import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 公开面快照的共享读取器，只给 *.test.ts 用，不进 src 产物。
 *
 * 两个入口（a11y / fetch）的测试会并发跑 `bun test`，而两份测试都需要
 * 新鲜的 dist；`build:dist` 默认 clean，两个进程同时构建会互相删产物。
 * 这里用 `.cache/public-surface.lock` 目录做进程间锁（mkdirSync 非递归
 * 本身就是原子的），保证同一时刻只有一个构建者。
 */

const root = fileURLToPath(new URL('..', import.meta.url));
const distRoot = join(root, 'dist');
const cacheRoot = join(root, '.cache');
const lockDir = join(cacheRoot, 'public-surface.lock');

const lockPollMs = 50;
const lockTimeoutMs = 120_000;

const isEexist = (err: unknown): boolean =>
  err instanceof Error && 'code' in err && err.code === 'EEXIST';

const sleepSync = (ms: number): void => {
  Bun.sleepSync(ms);
};

const acquireLock = (): void => {
  mkdirSync(cacheRoot, { recursive: true });
  const deadline = Date.now() + lockTimeoutMs;
  for (;;) {
    try {
      // 非 recursive：目录已存在会抛 EEXIST，抢锁失败；抢到即独占。
      mkdirSync(lockDir);
      return;
    } catch (err) {
      if (!isEexist(err)) throw err;
      if (Date.now() > deadline) {
        throw new Error(
          `public-surface: timed out after ${lockTimeoutMs}ms waiting for ${lockDir}. If no build is running, delete that directory and retry.`,
        );
      }
      sleepSync(lockPollMs);
    }
  }
};

const distIsFresh = (): boolean =>
  existsSync(join(distRoot, 'index.d.ts')) &&
  existsSync(join(distRoot, 'index.d.cts'));

/**
 * 缺 dist 时构建一次。`build:dist` 是全量 clean + 全量产出，所以主入口的
 * 产物新鲜就代表所有入口都在。
 *
 * 先抢锁再判断，不先在锁外走快路径：构建中途 dist/index.d.ts 可能已经
 * 落盘而某个入口还没写，锁外的判断会读到半成品。
 */
export const ensureDist = (): void => {
  acquireLock();
  try {
    // 抢到锁后再看一眼：等锁期间别的进程可能已经构建完。
    if (distIsFresh()) return;
    const proc = Bun.spawnSync([process.execPath, 'run', 'build:dist'], {
      cwd: root,
    });
    if (proc.exitCode !== 0) {
      throw new Error(
        `build:dist exited ${proc.exitCode}:\n${proc.stdout.toString()}${proc.stderr.toString()}`,
      );
    }
    if (!distIsFresh()) {
      throw new Error('build:dist did not produce dist/index.d.ts');
    }
  } finally {
    rmSync(lockDir, { recursive: true, force: true });
  }
};

/**
 * 抽取入口的全部导出名。产物当前只有一条 `export { ... };`；出现
 * `export declare ...` / `export type ...` 等多条 export 行时直接抛错，
 * 而不是只读到其中一条、静默漏名字。
 */
const readNames = (file: string): string[] => {
  const exportLines = readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.startsWith('export'));
  if (exportLines.length !== 1) {
    throw new Error(
      `${file}: expected exactly one line starting with "export", found ${exportLines.length}:\n${exportLines.join('\n')}`,
    );
  }
  const line = exportLines[0];
  if (line === undefined) {
    throw new Error(`${file}: no export line`);
  }
  const match = /^export \{ ([^}]*) \};$/.exec(line);
  if (match === null || match[1] === undefined) {
    throw new Error(`${file}: unrecognized export line:\n${line}`);
  }
  return match[1]
    .split(',')
    .map((name) => name.trim())
    .sort();
};

const mustExist = (file: string): string => {
  if (!existsSync(file)) {
    throw new Error(
      `${file} is missing after ensureDist(); run \`bun run build:dist\` and retry.`,
    );
  }
  return file;
};

/** 读 `dist/<entry>/index.d.ts` 与 `index.d.cts` 的导出名，各自排序。 */
export const getPublicSurface = (
  entry: string,
): { dts: string[]; dcts: string[] } => {
  ensureDist();
  const entryDir = join(distRoot, entry);
  return {
    dts: readNames(mustExist(join(entryDir, 'index.d.ts'))),
    dcts: readNames(mustExist(join(entryDir, 'index.d.cts'))),
  };
};
