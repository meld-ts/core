import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 构建产物对外契约（README「浏览器构建」「构建说明」）：`browser/index.js`
 * （ESM）、`browser/index.d.ts`、`browser/iife.global.js`（iife，全局变量
 * `MeldTS`）按文件名被引用方直接使用；`package.json` 的 `exports` 键集合
 * 与各目标（含同名邻近声明 `.d.ts`/`.d.cts`）、顶层 `types` 字段、`bin`
 * 各目标与 `files` 目录清单同样钉在这里。iife 文件名只钉在 tsdown.browser.ts
 * 的 entryFileNames 一行上，改名或入口漏配时构建仍 exit 0——契约只在这里红。
 *
 * 与 public-surface.test.ts 同一策略：pr-check 先 build 后 test，产物新鲜；
 * version-bump 在 build 之前跑 test，产物缺失时这里自己构建再读，不
 * fail-open。本机改了 src 没重建时这条读到的是旧产物——以 CI 为准。
 */

const root = fileURLToPath(new URL('../..', import.meta.url));

const runBuild = (script: string): void => {
  const proc = Bun.spawnSync([process.execPath, 'run', script], {
    cwd: root,
  });
  if (proc.exitCode !== 0) {
    throw new Error(
      `${script} exited ${proc.exitCode}:\n${proc.stdout.toString()}${proc.stderr.toString()}`,
    );
  }
};

const browserFiles = [
  'browser/index.js',
  'browser/index.d.ts',
  'browser/iife.global.js',
];

if (!browserFiles.every((file) => existsSync(join(root, file)))) {
  runBuild('build:browser');
}
// exports 目标都在 dist/ 下，用主入口代理「dist 没构建过」；构建过但缺某个
// 目标说明配置漂了，让下面的断言红，不在测试里悄悄重建掩盖
if (!existsSync(join(root, 'dist/index.js'))) {
  runBuild('build:dist');
}

// package.json 由本仓库维护；build:dist 只重新生成 exports / main / types，
// bin / files 是手维护字段（README「构建说明」，tsdown 不生成）。形状漂移
// 时下面的收集直接抛错，不做运行时校验
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  bin: Record<string, string>;
  exports: Record<string, string | Record<string, string>>;
  files: string[];
  types: string;
};
const exportTargets: string[] = [];
for (const target of Object.values(pkg.exports)) {
  if (typeof target === 'string') {
    exportTargets.push(target);
    continue;
  }
  exportTargets.push(...Object.values(target));
}
const binTargets = Object.values(pkg.bin);

// bin 自愈排在 dist 自愈之后：build:dist 的 clean 会连带清掉 dist/bin。
// 字段 typo 时自愈只重建正确产物、修不了错路径，让下面的断言红
if (!binTargets.every((target) => existsSync(join(root, target)))) {
  runBuild('build:bin');
}

// AGENTS「构建产物说明」承诺的子路径键集合（README「模块」同列）：少一个键
// 是发布物少一个入口（breaking change），多一个键（./bin、browser 产物）
// 同样在这里红；新增子路径要同步改这份快照——入口集合是公开契约，变更
// 要保持显式
const expectedSubpaths = [
  '.',
  './a11y',
  './async',
  './events',
  './package.json',
  './path',
  './singleton',
  './timer',
  './traits',
];

// files 圈定 tarball 内容（手维护，无生成方对账）：少一个目录就是发布物少
// 一块（丢 ./browser，网页 <script> 引用方拿不到 iife）。新增产物目录要
// 同步改这份快照，变更保持显式
const expectedFiles = ['./dist', './browser'];

describe('browser build output', () => {
  test('browser products keep the documented file names', () => {
    for (const file of browserFiles) {
      expect(existsSync(join(root, file)), file).toBe(true);
    }
  });

  test('every package.json exports target and its adjacent declaration exists', () => {
    // exports 整段丢失时上面的收集循环静默空转，先在这里红
    expect(exportTargets.length).toBeGreaterThan(0);
    for (const target of exportTargets) {
      expect(existsSync(join(root, target)), target).toBe(true);
      // types 不写显式条件，靠同名邻近声明解析（AGENTS「构建产物说明」）：
      // x.js → x.d.ts、x.cjs → x.d.cts。声明缺失是消费方编译期才炸的漂移，
      // 跟目标一起在这里红。./package.json 这类不以 js/cjs 结尾的目标没有
      // 邻近声明，replace 不命中时原样返回、只重复上面那条断言
      const decl = target.replace(
        /\.(js|cjs)$/,
        target.endsWith('.cjs') ? '.d.cts' : '.d.ts',
      );
      expect(existsSync(join(root, decl)), decl).toBe(true);
    }
  });

  test('exports keeps the documented subpaths', () => {
    expect(Object.keys(pkg.exports).sort()).toEqual(expectedSubpaths);
  });

  test('top-level types field points to an existing file', () => {
    expect(existsSync(join(root, pkg.types)), pkg.types).toBe(true);
  });

  test('every package.json bin target exists', () => {
    // bin: {} 时上面的收集静默空转，先在这里红
    expect(binTargets.length).toBeGreaterThan(0);
    for (const target of binTargets) {
      expect(existsSync(join(root, target)), target).toBe(true);
    }
  });

  test('files field keeps the published directories', () => {
    expect(pkg.files).toEqual(expectedFiles);
  });
});
