import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'bun:test';

// 只有 index.ts 能转发，入口只做全量转发——这条不变量的执法分两层：
// grit 插件（lint/no-cross-file-reexport.grit）+ biome 内置 style/noExportedImports。
// 夹具是 lint/fixtures/ 下的有意违规文件，走独立的嵌套配置（preset:none 只留
// noExportedImports），不在根 biome.json 的 files.includes 里，日常 lint 打不到它们。
// 插件一旦退化（比如漏掉 export let 或多声明符），只有这里会红——当前树本来就干净，
// lint 全绿说明不了插件还活着。
//
// fixture 相对 tsconfig 排除（isolatedDeclarations 不适用于夹具的自然写法），
// 断言只看诊断数：plugin 类 = grit 插件，lint/style/noExportedImports = biome 层。

const root = fileURLToPath(new URL('..', import.meta.url));

/**
 * 子进程跑 biome：经当前 Bun 可执行文件的 x 子命令调 biome，不依赖 PATH 上的
 * 全局 biome，cwd 在仓库根才能找到本地安装（override.test.ts 同一机制）。
 */
const lint = (fixture: string): { exitCode: number; stdout: string; stderr: string } => {
  const proc = Bun.spawnSync(
    [
      process.execPath,
      'x',
      'biome',
      'lint',
      '--reporter=json',
      `lint/fixtures/${fixture}`,
    ],
    { cwd: root },
  );
  return {
    exitCode: proc.exitCode,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
  };
};

type Counts = { plugin: number; noExportedImports: number };

const countDiagnostics = (fixture: string): Counts => {
  const r = lint(fixture);
  // exit 非零且无 JSON 输出 = 命令被拒（插件编译失败 / 配置被拒）：
  // 交给 JSON.parse 只会得到没法排查的 EOF。
  if (r.exitCode !== 0 && r.stdout.trim() === '') {
    throw new Error(`biome lint exited ${r.exitCode}: ${r.stderr || r.stdout}`);
  }
  const out = JSON.parse(r.stdout) as {
    diagnostics?: Array<{ category?: string | null }>;
  } | null;
  // 信封漂移（缺 diagnostics / 非数组）报可读错误，不让 for...of 抛裸 TypeError
  if (!Array.isArray(out?.diagnostics)) {
    throw new Error(`biome lint output for ${fixture} is missing diagnostics`);
  }
  const counts: Counts = { plugin: 0, noExportedImports: 0 };
  for (const d of out.diagnostics) {
    if (d.category === 'plugin') counts.plugin += 1;
    else if (d.category === 'lint/style/noExportedImports')
      counts.noExportedImports += 1;
  }
  return counts;
};

describe('no-cross-file-reexport', () => {
  test('source fixture stays clean', () => {
    expect(countDiagnostics('source.ts')).toEqual({ plugin: 0, noExportedImports: 0 });
  });

  test('alias re-exports are all reported, one diagnostic per declarator', () => {
    // const / let / var、类型标注、as 断言（含双层）、同一语句多声明符、
    // namespace 导入、别名导入、默认导入、括号 / 双层括号 / non-null / 括号包 as /
    // satisfies 包装、三层括号 / 三层 as / 括号包非空包括号包 as 的四层混合、
    // 先声明再 export { T }（含 as 换名）：23 个声明符逐个命中
    expect(countDiagnostics('alias-reexport.ts')).toEqual({
      plugin: 23,
      noExportedImports: 0,
    });
  });

  test('empty or local initializer then assignment re-exports are reported', () => {
    // 空声明 + 后置赋值再 export：let / var、as 换名、export { z as default }、
    // 赋值右值括号包 as 包装：3 条逐个命中；本地 initializer 再覆盖赋值为
    // import（undefined / null / 0 覆盖）：3 条逐个命中；负例（右值本地、
    // 未导出的别名赋值、initializer 与赋值都是本地值）：0 条
    expect(countDiagnostics('assign.ts')).toEqual({
      plugin: 6,
      noExportedImports: 0,
    });
  });

  test('forward clauses are all reported outside index.ts', () => {
    // export { a } from / export type { a } from / export * from /
    // export * as ns from / export type * from：5 个子句逐个命中
    expect(countDiagnostics('forward-reexport.ts')).toEqual({
      plugin: 5,
      noExportedImports: 0,
    });
  });

  test('type alias re-export is reported outside index.ts', () => {
    // 裸引用、括号包装（括号不改类型，仍算转发，一至三层）、先声明再
    // export type { Split }（含 as 换名）：6 条逐个命中
    expect(countDiagnostics('type-reexport.ts')).toEqual({
      plugin: 6,
      noExportedImports: 0,
    });
  });

  test('imported-then-reexported named clause is caught by biome, not the plugin', () => {
    expect(countDiagnostics('import-reexport.ts')).toEqual({
      plugin: 0,
      noExportedImports: 1,
    });
  });

  test('local values and type compositions are not reported', () => {
    // 本地值别名、[x] / () => x 构造、Omit<...>、泛型实参（Wrapper<string>）、
    // 类型解构导入值 / 本地对象 / namespace 解构取成员（取字段不是转发）、
    // 未导出的 import 别名、右值本地的后置 export（值与类型）、函数 / 块内
    // 与后置导出同名的声明：全部 0 条
    expect(countDiagnostics('local-values.ts')).toEqual({
      plugin: 0,
      noExportedImports: 0,
    });
  });

  test('export default of a wrapped import is reported by the plugin', () => {
    // 一个文件一条 default，形态分文件：括号 / 双层括号 / as / 三层 as 链 /
    // non-null / satisfies / 裸标识符各 1 条 plugin；裸标识符再被 biome
    // noExportedImports 报 1 条；两步 default（先声明再 export default，裸 /
    // 右值括号包装 / 空声明后赋值）各 1 条；本地对象 / 箭头函数 / 本地值两步
    // default 三条负例 0 条
    expect(countDiagnostics('default')).toEqual({
      plugin: 10,
      noExportedImports: 1,
    });
  });

  test('entry: forwarding forms are reported, star forwarding is exempt', () => {
    // 入口里的转发形态（非 src/ 路径，入口纪律分支不作用）：星号三形态豁免
    // （0 条），其余转发一律报：逐个列举（export { a } from /
    // export type { a } from，2 条）、换名再导出与类型别名（2 条）、
    // export default 转发（1 条），共 5 条。src/ 路径下的入口纪律
    // （本地类型 / 实现 / 绑定另报）由下面 src/ 夹具钉住
    expect(countDiagnostics('entry/index.ts')).toEqual({
      plugin: 5,
      noExportedImports: 0,
    });
  });

  test('src/ index.ts: only imports and star forwarding are allowed at the top level', () => {
    // 入口纪律（round06 F-01 选项 1）：src/ 下的 index.ts 顶层只允许星号转发
    // 与 import，其余顶层语句一律报，每条一条——含五类转发形态的语句（五类
    // 分支对 src/ 入口让位，不双报）、本地类型声明 / 实现、导出本地绑定，
    // 以及不再按「换名支会报」的形状排除后补齐的两类（round07 F-02）：
    // 未导出的本地别名（const hidden = isString）与组合类型别名
    // （Wrapper<string>、Omit<...>）。18 条顶层语句 - import 2 - 星号 3 = 13 条
    expect(countDiagnostics('src/index.ts')).toEqual({
      plugin: 13,
      noExportedImports: 0,
    });
    // default 声明（round07 F-01）：export default 的本地 class / function
    // 声明各报 1 条（一个文件只能有一条 default，形态分文件钉）
    expect(countDiagnostics('src/def-class/index.ts')).toEqual({
      plugin: 1,
      noExportedImports: 0,
    });
    expect(countDiagnostics('src/def-fn/index.ts')).toEqual({
      plugin: 1,
      noExportedImports: 0,
    });
    // declare 族（round07 F-01）：export declare 的 function / class / const
    // 三形态各 1 条，无 export 的 declare 语句 1 条
    expect(countDiagnostics('src/decl/index.ts')).toEqual({
      plugin: 4,
      noExportedImports: 0,
    });
    // 例外文件（AGENTS.md 已列）：入口纪律分支豁免（本地类型 / 实现不报），
    // 五类分支对例外文件照报——events 的逐个列举 1 条、types 的两步换名 1 条
    expect(countDiagnostics('src/events/index.ts')).toEqual({
      plugin: 1,
      noExportedImports: 0,
    });
    expect(countDiagnostics('src/types/index.ts')).toEqual({
      plugin: 1,
      noExportedImports: 0,
    });
  });

  test('src/ index.ts under a /test/ path segment is enforced identically', () => {
    // 检出路径任意段叫 test 时入口执法不静默（round08 F-01）：test/src/index.ts
    // 与 src/index.ts 同内容，路径多一段 /test/。旧的入口支 test/ 整段排除曾让
    // 这里变成双端全灭——入口分支被排除（0 条）、五类让位照让（0 条）；删掉
    // 排除后入口分支接管、五类让位，与无 /test/ 对照同条数（13 条）
    expect(countDiagnostics('test/src/index.ts')).toEqual({
      plugin: 13,
      noExportedImports: 0,
    });
  });

  test('root biome.json still loads the plugin', () => {
    // 夹具走 fixtures 自己的嵌套配置，插件坏不坏靠上面几条钉；这条钉的是执法入口：
    // 日常 `bun run lint` 用根 biome.json 的 plugins 加载插件，那一行被删掉或改错
    // 路径时，夹具测试与日常 lint 双绿（当前树本来就干净），只有这条会红。
    // plugins 整个字段被删时 config.plugins 是 undefined，toContain 同样红。
    const config = JSON.parse(
      readFileSync(`${root}/biome.json`, 'utf8'),
    ) as { plugins?: string[] };
    expect(config.plugins).toContain('./lint/no-cross-file-reexport.grit');
  });
});
