/**
 * §7 第 4 层构建产物重载测试（发版前检查，不进 CI，见 roadmap）。
 *
 * build:dist 后在系统临时目录建一个最小项目，node_modules/@meld-ts/core
 * 用符号链接指向仓库根（不走 bun add，无网络与锁文件副作用），tsc 按
 * 包名解析到 dist/ 产物。重载文件用探针的同款序列化器生成：内置
 * biome 表把 switch.required 置空。两次 tsc 断言（设计 §4）：
 * 1. 首行 export {}; 在场：重载对打包后的 d.ts 生效，switch 缺必填
 *    checked 仍编译过（内置表下同样的调用必须报错）；
 * 2. 删掉首行：文件变脚本，declare module 盖掉子路径，use.ts 编译失败。
 * bunup 拆 chunk、改接口转出形状后，这条链路可能悄悄断掉，这里是兜底。
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { serializeOverride } from '../src/a11y/probe/emit-override';
import { nodeExec } from '../src/a11y/probe/exec';
import { PROFILES } from '../src/a11y/probe/profiles.generated';
import type { ProfileData } from '../src/a11y/probe/serialize';
import { runCmd } from './lab';

const root = resolve(import.meta.dir, '..');

const log = (msg: string): void => {
  console.log(`[a11y-build-test] ${msg}`);
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
    console.error(`[a11y-build-test] FAIL ${label}: ${detail}`);
  }
};

/**
 * tsc 经当前 Bun 可执行文件的 x 子命令调用，解析到仓库锁定的
 * typescript，不依赖 PATH 上的全局 tsc；cwd 在仓库根，bun x 才找得到
 * 本地安装（override.test.ts 同一机制）。
 */
const tsc = (project: string): { code: number; output: string } => {
  const r = nodeExec([process.execPath, 'x', 'tsc', '-p', project], {
    cwd: root,
  });
  return { code: r.code, output: `${r.stdout}${r.stderr}` };
};

const TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "types": [],
    "allowImportingTsExtensions": false
  }
}
`;

const USE_TS = `import { createA11y } from '@meld-ts/core/a11y';

const options = { lint: 'biome' } as const;

// 编译证据：重载把 switch.required 置空，缺 checked 不报错。
export const attrs = createA11y(options)('switch', { label: 'x' });
`;

const EXPORT_LINE = 'export {};';

const started = Date.now();

// case 1 的前提：内置 biome 表对 switch 有必填。表重生成后 required 变空
// 时用例会静默空转（没重载也编译过），先在这里失败。as const 下当前长度
// 是字面量类型，先放宽成 number，比较在表重生成前后都编译得过。
const switchRequired: readonly string[] = PROFILES.biome.roles.switch.required;
if (switchRequired.length === 0) {
  throw new Error(
    'builtin biome table requires nothing on switch; pick another role to override',
  );
}

log('building dist');
runCmd([process.execPath, 'run', 'build:dist'], root);
// 入口漏配或打包改名时先报可读错误，不让后面的 tsc 炸出难懂的解析错误
if (!existsSync(join(root, 'dist/a11y/index.d.ts'))) {
  throw new Error('build:dist did not produce dist/a11y/index.d.ts');
}

log('creating temp project');
const project = mkdtempSync(join(tmpdir(), 'meld-a11y-build-'));

try {
  mkdirSync(join(project, 'node_modules', '@meld-ts'), { recursive: true });
  symlinkSync(root, join(project, 'node_modules', '@meld-ts', 'core'));
  writeFileSync(
    join(project, 'package.json'),
    '{"name":"a11y-build-check","private":true}\n',
  );
  writeFileSync(join(project, 'tsconfig.json'), TSCONFIG);
  writeFileSync(join(project, 'use.ts'), USE_TS);

  // 与 meld a11y probe 同一段序列化代码：测的就是用户项目里拿到的形状
  const overrideBiome: ProfileData = {
    ...PROFILES.biome,
    roles: {
      ...PROFILES.biome.roles,
      switch: { ...PROFILES.biome.roles.switch, required: [] },
    },
  };
  const overrideDts = serializeOverride({ biome: overrideBiome });
  // case 2 删首行的前提是首行恰好是 export {};，生成器改形状时先失败
  const firstLine = overrideDts.split('\n')[0];
  if (firstLine !== EXPORT_LINE) {
    throw new Error(
      `override file must start with '${EXPORT_LINE}', got '${firstLine}'`,
    );
  }
  const overridePath = join(project, 'a11y-lints.generated.d.ts');
  writeFileSync(overridePath, overrideDts);

  log('case 1: override with export {}; compiles');
  const withExport = tsc(project);
  expect(
    withExport.code === 0,
    'override takes effect on the built d.ts',
    `tsc exit ${withExport.code}`,
    `tsc exited ${withExport.code}: ${withExport.output}`,
  );

  log('case 2: export {}; removed must break the subpath');
  writeFileSync(overridePath, overrideDts.split('\n').slice(1).join('\n'));
  const withoutExport = tsc(project);
  expect(
    withoutExport.code !== 0 && withoutExport.output.includes('createA11y'),
    'script file replaces the subpath',
    `tsc exit ${withoutExport.code}, createA11y gone`,
    `tsc exited ${withoutExport.code}: ${withoutExport.output}`,
  );
} finally {
  log('removing temp project');
  rmSync(project, { recursive: true, force: true });
}

const secs = ((Date.now() - started) / 1000).toFixed(1);
if (failures.length > 0) {
  console.error(
    `[a11y-build-test] ${failures.length} failure(s): ${failures.join(', ')}`,
  );
  console.error(`[a11y-build-test] FAILED (${secs}s)`);
  process.exitCode = 1;
} else {
  log(`all green (${secs}s)`);
}
