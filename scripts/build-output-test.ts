/**
 * 构建产物契约检查（pr-check.yml / version-bump.yml 在 build 之后显式跑）。
 *
 * 为什么是 script 而不是 .test.ts：bun test 自动加载 src/ 下全部测试，
 * .test.ts 里的自愈构建会让没构建过的本机静默触发完整构建（clean 清空
 * dist/），还与读 dist/ 的并行命令竞态。产物契约检查必须显式调用，
 * 不许再写成 .test.ts。
 *
 * 契约（README「浏览器构建」「构建说明」）：browser/index.js（ESM）、
 * browser/index.d.ts、browser/iife.global.js（iife，全局变量 MeldTS）按
 * 文件名被引用方直接使用；package.json 的 exports 键集合与各目标（含
 * 同名邻近声明 .d.ts/.d.cts）、顶层 types 字段、bin 各目标与 files 目录
 * 清单同样钉在这里。iife 文件名只钉在 tsdown.browser.ts 的
 * entryFileNames 一行上，改名或入口漏配时构建仍 exit 0——契约只在这里红。
 *
 * 每次跑都完整重建（clean + browser + dist + bin），只断言新鲜产物：
 * 本机改了 src 忘了 build 也不会读到旧文件。
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { nodeExec } from '../bin/a11y-probe/exec';

const root = resolve(import.meta.dir, '..');

const log = (msg: string): void => {
  console.log(`[build-output-test] ${msg}`);
};

const failures: string[] = [];

const expect = (
  ok: boolean,
  label: string,
  okNote: string,
  detail: string,
): void => {
  if (ok) {
    log(`PASS ${label} (${okNote})`);
  } else {
    failures.push(label);
    console.error(`[build-output-test] FAIL ${label}: ${detail}`);
  }
};

const started = Date.now();

log('building clean (browser + dist + bin)');
// 本机偶发 EINVAL（a11y-build-test 同一观察）：直接重试，3 次都失败才
// 报错退出，构建输出带进错误信息
let buildCode = 0;
let buildOutput = '';
for (let attempt = 1; attempt <= 3; attempt++) {
  const r = nodeExec([process.execPath, 'run', 'build'], { cwd: root });
  buildCode = r.code;
  buildOutput = `${r.stdout}${r.stderr}`;
  if (r.code === 0) break;
  if (attempt < 3) log(`build attempt ${attempt}/3 failed, retrying`);
}
if (buildCode !== 0) {
  throw new Error(
    `build failed after 3 attempts (exit ${buildCode}):\n${buildOutput}`,
  );
}

// package.json 由本仓库维护；build 只重新生成 exports / main / types，
// bin / files 是手维护字段（README「构建说明」，tsdown 不生成）。形状漂移
// 时下面的收集直接抛错，不做运行时校验
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  bin: Record<string, string>;
  exports: Record<string, string | Record<string, string>>;
  files: string[];
  types: string;
};

const browserFiles = [
  'browser/index.js',
  'browser/index.d.ts',
  'browser/iife.global.js',
];
for (const file of browserFiles) {
  expect(
    existsSync(join(root, file)),
    `browser file ${file}`,
    'exists',
    'missing',
  );
}

const exportTargets: string[] = [];
for (const target of Object.values(pkg.exports)) {
  if (typeof target === 'string') {
    exportTargets.push(target);
    continue;
  }
  exportTargets.push(...Object.values(target));
}
// exports 整段丢失时上面的收集循环静默空转，先在这里红
expect(
  exportTargets.length > 0,
  'exports targets collected',
  `${exportTargets.length} targets`,
  'package.json exports is empty or missing',
);
for (const target of exportTargets) {
  expect(
    existsSync(join(root, target)),
    `exports target ${target}`,
    'exists',
    'missing',
  );
  // types 不写显式条件，靠同名邻近声明解析（AGENTS「构建产物说明」）：
  // x.js → x.d.ts、x.cjs → x.d.cts。声明缺失是消费方编译期才炸的漂移，
  // 跟目标一起在这里红。./package.json 这类不以 js/cjs 结尾的目标没有
  // 邻近声明，replace 不命中时原样返回、只重复上面那条断言
  const decl = target.replace(
    /\.(js|cjs)$/,
    target.endsWith('.cjs') ? '.d.cts' : '.d.ts',
  );
  expect(
    existsSync(join(root, decl)),
    `adjacent declaration ${decl}`,
    'exists',
    'missing',
  );
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
expect(
  JSON.stringify(Object.keys(pkg.exports).sort()) ===
    JSON.stringify(expectedSubpaths),
  'exports keeps the documented subpaths',
  'key set matches',
  `got ${JSON.stringify(Object.keys(pkg.exports).sort())}`,
);

expect(
  existsSync(join(root, pkg.types)),
  `top-level types ${pkg.types}`,
  'exists',
  'missing',
);

const binTargets = Object.values(pkg.bin);
// bin: {} 时上面的收集静默空转，先在这里红
expect(
  binTargets.length > 0,
  'bin targets collected',
  `${binTargets.length} targets`,
  'package.json bin is empty or missing',
);
for (const target of binTargets) {
  expect(
    existsSync(join(root, target)),
    `bin target ${target}`,
    'exists',
    'missing',
  );
}

// files 圈定 tarball 内容（手维护，无生成方对账）：少一个目录就是发布物少
// 一块（丢 ./browser，网页 <script> 引用方拿不到 iife）。新增产物目录要
// 同步改这份快照，变更保持显式
const expectedFiles = ['./dist', './browser'];
expect(
  JSON.stringify(pkg.files) === JSON.stringify(expectedFiles),
  'files keeps the published directories',
  'matches',
  `got ${JSON.stringify(pkg.files)}`,
);

const secs = ((Date.now() - started) / 1000).toFixed(1);
if (failures.length > 0) {
  console.error(
    `[build-output-test] ${failures.length} failure(s): ${failures.join(', ')}`,
  );
  console.error(`[build-output-test] FAILED (${secs}s)`);
  process.exitCode = 1;
} else {
  log(`all green (${secs}s)`);
}
