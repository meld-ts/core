/**
 * §7 第 2/3 层一致性测试与反向测试，外加 bun 默认规则集门禁。
 *
 * 按四张表 meta 记录的版本在 lab 里精确重建 lint，对每个 role 用三种
 * 属性集（只必填 / 全 supported / tabIndex + 全 supported）展开成字面
 * JSX 属性，要求对应 lint 的白名单规则零报错；合并表对每个成员 lint
 * 都零报错。再对每个 role 删一个必填属性，要求对应 lint 报错——防止
 * 探针解析失败生成了空表而第 2 层照样全绿。任一失败退出 1。
 *
 * lab 恒装 oxlint（bun 表的录制条件），复现不了没有 oxlint 标记的裸
 * 项目：门禁在裸目录里以默认规则集模式重探一遍 bun，要求与提交的表
 * （插件模式下录制）逐项一致。
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { ProbeRunner } from '../src/a11y/probe';
import { probe } from '../src/a11y/probe';
import {
  buildConsistencyFixtures,
  buildReverseFixtures,
  mergeProfiles,
} from '../src/a11y/probe/consistency';
import type { DetectedLint } from '../src/a11y/probe/detect';
import { detectLints } from '../src/a11y/probe/detect';
import { nodeExec } from '../src/a11y/probe/exec';
import type { Fixture } from '../src/a11y/probe/fixtures';
import { fixtureSamples } from '../src/a11y/probe/fixtures';
import { PROFILES } from '../src/a11y/probe/profiles.generated';
import { runBiome } from '../src/a11y/probe/runners/biome';
import { runBun } from '../src/a11y/probe/runners/bun';
import type { LintReport } from '../src/a11y/probe/runners/eslint';
import { runEslint } from '../src/a11y/probe/runners/eslint';
import { runOxlint } from '../src/a11y/probe/runners/oxlint';
import {
  ARIA_KEYS,
  NAME_RULES,
  SAMPLES,
} from '../src/a11y/probe/samples.generated';
import type { ProfileData } from '../src/a11y/probe/serialize';
import { createLab, labDirOf } from './lab';

const USAGE = 'usage: bun run test:a11y-lint [--keep]';

const args = process.argv.slice(2);
const keep = args.includes('--keep');
for (const arg of args) {
  // 严格解析：拼错的参数宁可失败，也不能悄悄回落到默认行为
  if (arg !== '--keep') {
    throw new Error(`unknown argument: ${arg}\n${USAGE}`);
  }
}

const LINTS = ['eslint', 'oxlint', 'biome', 'bun'] as const;
type LintName = (typeof LINTS)[number];

const root = resolve(import.meta.dir, '..');

const RUNNERS: Readonly<Record<LintName, ProbeRunner>> = {
  eslint: runEslint,
  oxlint: runOxlint,
  biome: runBiome,
  bun: runBun,
};

// 四张表的两两组合（全 6 对）
const PAIRS: ReadonlyArray<readonly [LintName, LintName]> = [
  ['biome', 'bun'],
  ['biome', 'eslint'],
  ['biome', 'oxlint'],
  ['bun', 'eslint'],
  ['bun', 'oxlint'],
  ['eslint', 'oxlint'],
];

// SAMPLES 存运行时值，fixtures 要表达式文本（aria-label={'x'}）；
// 转换后与 a11y:sync 录表时的 fixture 文本一致。
const samples = fixtureSamples(SAMPLES);

interface Failure {
  readonly where: string;
  readonly detail: string;
}

const failures: Failure[] = [];
const started = Date.now();

const log = (msg: string): void => {
  console.log(`[a11y-lint-test] ${msg}`);
};

/** 一段一个摘要行：label + run 内产出的计数 + 新增失败数 + 耗时。 */
const phase = (label: string, run: () => string): void => {
  const t = Date.now();
  const before = failures.length;
  const counts = run();
  const secs = ((Date.now() - t) / 1000).toFixed(1);
  log(`${label}: ${counts}, ${failures.length - before} failure(s) (${secs}s)`);
};

try {
  log('creating lab with the table versions');
  const lab = createLab({
    root,
    lints: LINTS.map((name) => ({ name, version: PROFILES[name].version })),
  });
  log(
    `lab ready at ${lab.cwd} (${LINTS.map((n) => `${n} ${lab.versions[n]}`).join(', ')})`,
  );

  const detected = detectLints({
    cwd: lab.cwd,
    exec: nodeExec,
    readJson: (path) => JSON.parse(readFileSync(path, 'utf8')),
    exists: existsSync,
    // lab 要全部四家（含 bun）：detect 默认只按 package.json 探，
    // bun 得点名（--lint=bun 的同款语义）
    wanted: LINTS,
  });
  const byName = new Map(detected.map((d) => [d.name, d] as const));

  const lintOf = (name: LintName): DetectedLint => {
    const lint = byName.get(name);
    // 装了却探测不到（安装失败/探测失败）不能静默跳过：
    // 测一张没探测的表比不测更糟。
    if (lint === undefined) {
      throw new Error(`${name} was not detected in the lab`);
    }
    if (lint.version !== PROFILES[name].version) {
      throw new Error(
        `${name} resolved to ${lint.version} but the table records ${PROFILES[name].version}`,
      );
    }
    return lint;
  };

  for (const name of LINTS) {
    lintOf(name);
  }
  // bun 表录制时 lab 里装着 oxlint，bun lint 走内嵌 oxlint 的插件模式
  // （--jsx-a11y-plugin 才能让 --rule 生效）；lab 同样装了 oxlint，
  // 模式必须与录制条件一致。
  if (!lintOf('bun').bin.includes('--jsx-a11y-plugin')) {
    throw new Error(
      'bun lint is not in oxlint mode; the table was recorded with it',
    );
  }

  const workDir = `${lab.cwd}/.meld-a11y-consistency`;
  const fixturesDir = `${workDir}/fixtures`;

  const writeFile = (path: string, content: string): void => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  };

  const runLint = (
    lint: DetectedLint,
    fixtures: readonly Fixture[],
  ): LintReport => {
    // 报错归属靠「哪一轮跑出来的」：先清空 fixture 目录，
    // 上一轮文件的报错会污染这一轮的归因。
    rmSync(fixturesDir, { recursive: true, force: true });
    return RUNNERS[lint.name](fixtures, {
      bin: lint.bin,
      cwd: lab.cwd,
      workDir,
      writeFile,
      exec: nodeExec,
    });
  };

  // ---- bun 默认规则集门禁（第 2 层前置）----
  // lab 恒装 oxlint，bun 在 lab 里只会走 --jsx-a11y-plugin 的插件模式；多数
  // 用户项目没有 oxlint 标记，bun 走自己的默认规则集。提交的表在插件模式下
  // 录制，这里在裸目录里以默认模式重探一遍——两种模式必须产出同一张表，
  // 否则裸项目里 a11y() 约束的是一张错的表。

  /**
   * 两张 bun 表的结构比较（默认模式实测 vs 提交的插件模式表）：
   * 返回第一处分歧；完全一致返回 null。属性清单比对称差——两侧都按序
   * 生成，成员一致即视为一致。
   */
  const bunTableDiff = (
    defaults: ProfileData,
    recorded: ProfileData,
  ): string | null => {
    if (defaults.lint !== recorded.lint) {
      return `lint '${defaults.lint}' != '${recorded.lint}'`;
    }
    if (defaults.version !== recorded.version) {
      return `version '${defaults.version}' != '${recorded.version}'`;
    }
    const roles = new Set([
      ...Object.keys(defaults.roles),
      ...Object.keys(recorded.roles),
    ]);
    for (const role of roles) {
      const d = defaults.roles[role];
      const r = recorded.roles[role];
      // 一侧没有这个 role 就是一处分歧，不能跳过让表悄悄缺一张
      if (d === undefined || r === undefined) {
        const side = d === undefined ? 'defaults-mode' : 'recorded';
        return `role ${role}: missing on the ${side} side`;
      }
      for (const key of [
        'required',
        'supported',
        'requiredWhenFocusable',
      ] as const) {
        const onlyD = d[key].filter((v) => !r[key].includes(v));
        const onlyR = r[key].filter((v) => !d[key].includes(v));
        if (onlyD.length > 0 || onlyR.length > 0) {
          return (
            `${role}.${key}: defaults-only [${onlyD.join(', ')}], ` +
            `recorded-only [${onlyR.join(', ')}]`
          );
        }
      }
    }
    return null;
  };

  const checkBunDefaultsMode = (): void => {
    const dir = mkdtempSync(join(tmpdir(), 'meld-a11y-defaults-'));
    try {
      // 最小 package.json，无 node_modules、无 .oxlintrc.json——bun 在这里
      // 必须落到默认规则集模式。
      writeFileSync(
        join(dir, 'package.json'),
        '{"name":"a11y-bun-defaults","private":true}\n',
      );
      const detectedDefaults = detectLints({
        cwd: dir,
        exec: nodeExec,
        readJson: (path) => JSON.parse(readFileSync(path, 'utf8')),
        exists: existsSync,
        wanted: ['bun'],
      });
      const bunDefaults = detectedDefaults.find((d) => d.name === 'bun');
      if (bunDefaults === undefined) {
        throw new Error('bun was not detected in the bare dir');
      }
      // 默认模式的 bin 不带 --jsx-a11y-plugin：带上了说明裸目录仍被判成
      // 插件模式，模式判定漂移，后面探出的表不可信。
      if (bunDefaults.bin.includes('--jsx-a11y-plugin')) {
        throw new Error(
          'bun was detected in oxlint mode in the bare dir ' +
            '(no node_modules, no .oxlintrc.json); expected defaults mode',
        );
      }
      const { bun } = probe({
        cwd: dir,
        lints: [bunDefaults],
        roles: Object.keys(NAME_RULES),
        keys: ARIA_KEYS,
        samples,
        nameRule: NAME_RULES,
        runners: RUNNERS,
        exec: nodeExec,
        fs: {
          write: writeFile,
          rm: (path) => rmSync(path, { recursive: true, force: true }),
        },
        keep,
      });
      // probe 对每个探测的 lint 都产出 profile；缺失说明探针自身有 bug
      if (bun === undefined) {
        throw new Error('probe returned no bun profile in defaults mode');
      }
      const diff = bunTableDiff(bun, PROFILES.bun);
      if (diff !== null) {
        throw new Error(
          `bun defaults-mode drift (${diff}); the committed table was ` +
            'recorded in oxlint mode — rerun a11y:sync in a bare project ' +
            'or investigate',
        );
      }
    } finally {
      if (keep) {
        log(`keeping the bare dir at ${dir}`);
      } else {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  };

  phase('bun defaults mode', () => {
    checkBunDefaultsMode();
    return `${Object.keys(NAME_RULES).length} roles equal the committed table`;
  });

  // ---- 第 2 层：一致性（零报错）----

  const checkZero = (
    where: string,
    lint: DetectedLint,
    fixtures: readonly Fixture[],
  ): void => {
    const report = runLint(lint, fixtures);
    for (const m of report.missing) {
      failures.push({
        where,
        detail: `${lint.name}: role ${m.role} missing [${m.props.join(', ')}]`,
      });
    }
    for (const u of report.unsupported) {
      failures.push({
        where,
        detail: `${lint.name}: role ${u.role} unsupported ${u.prop}`,
      });
    }
  };

  const checkProfile = (
    where: string,
    lint: DetectedLint,
    variants: ReadonlyArray<readonly [string, readonly Fixture[]]>,
  ): void => {
    for (const [variant, fixtures] of variants) {
      // 空 fixture 集不跑：三张表没有 requiredWhenFocusable 的 role，
      // focusable-all 为空；对空集（或被清掉的目录）跑 lint 只会得到
      // 命令级报错，没有可验证的东西。
      if (fixtures.length === 0) continue;
      checkZero(`${where}/${variant}`, lint, fixtures);
    }
  };

  const consistencyVariants = (
    profile: ProfileData,
  ): ReadonlyArray<readonly [string, readonly Fixture[]]> => {
    const built = buildConsistencyFixtures(profile, samples);
    return [
      ['required-only', built.requiredOnly],
      ['all-supported', built.allSupported],
      ['focusable-all', built.focusableAll],
    ];
  };

  const roleCount = (profile: ProfileData): number =>
    Object.keys(profile.roles).length;

  const fileCount = (
    variants: ReadonlyArray<readonly [string, readonly Fixture[]]>,
  ): number => variants.reduce((n, [, files]) => n + files.length, 0);

  for (const name of LINTS) {
    phase(`layer2 single ${name}`, () => {
      const variants = consistencyVariants(PROFILES[name]);
      checkProfile(`layer2/single:${name}`, lintOf(name), variants);
      return `${roleCount(PROFILES[name])} roles, ${fileCount(variants)} fixture files`;
    });
  }

  for (const pair of PAIRS) {
    phase(`layer2 merge ${pair.join('+')}`, () => {
      const merged = mergeProfiles(pair.map((n) => PROFILES[n]));
      const variants = consistencyVariants(merged);
      for (const member of pair) {
        checkProfile(
          `layer2/merge:${pair.join('+')}`,
          lintOf(member),
          variants,
        );
      }
      return `${roleCount(merged)} roles, ${fileCount(variants)} fixture files x ${pair.length} lints`;
    });
  }

  phase('layer2 merge all4', () => {
    const merged = mergeProfiles(LINTS.map((n) => PROFILES[n]));
    const variants = consistencyVariants(merged);
    for (const name of LINTS) {
      checkProfile('layer2/merge:all4', lintOf(name), variants);
    }
    return `${roleCount(merged)} roles, ${fileCount(variants)} fixture files x ${LINTS.length} lints`;
  });

  // ---- 第 3 层：反向（删必填必须报错）----

  for (const name of LINTS) {
    phase(`layer3 reverse ${name}`, () => {
      const reverse = buildReverseFixtures(PROFILES[name], samples);
      let requiredSpecs = 0;
      for (const focusable of [false, true] as const) {
        const specs = reverse.specs.filter((s) => s.focusable === focusable);
        // 没有这类 role 的表（只有 biome 有 requiredWhenFocusable）跳过，
        // 对空 fixture 集跑 lint 只会得到命令级报错
        if (specs.length === 0) continue;
        const report = runLint(
          lintOf(name),
          focusable ? reverse.focusable : reverse.required,
        );
        if (!focusable) requiredSpecs = specs.length;
        for (const spec of specs) {
          if (!report.missing.some((m) => m.role === spec.role)) {
            failures.push({
              where: `layer3/reverse:${name}`,
              detail: `role ${spec.role}: removing ${spec.prop}${focusable ? ' (focusable)' : ''} produced no missing report`,
            });
          }
        }
      }
      return (
        `${requiredSpecs} required + ${reverse.specs.length - requiredSpecs} focusable specs, ` +
        `${reverse.required.length + reverse.focusable.length} fixture files`
      );
    });
  }
} finally {
  if (!keep) {
    log('removing lab');
    rmSync(labDirOf(root), { recursive: true, force: true });
  }
}

const secs = ((Date.now() - started) / 1000).toFixed(1);
if (failures.length > 0) {
  console.error(`[a11y-lint-test] ${failures.length} failure(s):`);
  for (const f of failures) {
    console.error(`  FAIL ${f.where}: ${f.detail}`);
  }
  console.error(`[a11y-lint-test] FAILED (${secs}s)`);
  process.exitCode = 1;
} else {
  log(`all green (${secs}s)`);
}
