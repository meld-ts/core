/**
 * probe 编排：supported 优先发现，required 靠「逐个去掉一个属性再跑」
 * 发现（biome 的消息不列缺失属性，算法不依赖消息里的属性名），
 * focusable 差集、自检与不变量全部通过后才产出 ProfileData。
 */

import type { DetectedLint } from './detect';
import type { ExecFn } from './exec';
import {
  buildRemovalFixtures,
  buildSelfCheckFixture,
  buildSupportedFixtures,
} from './fixtures';
import type { Fixture } from './fixtures';
import type { LintReport, RunnerOptions } from './runners/eslint';
import type { ProfileData, RoleRuleData } from './serialize';

/** 单个 lint 的执行入口，与 runners 的 RunnerOptions 对齐（bin 含 bun 的模式标志）。 */
export type ProbeRunner = (
  fixtures: readonly Fixture[],
  opts: RunnerOptions,
) => LintReport;

/** 自检用的 role：各 lint 都实现、必有必填属性的稳定样本。 */
export type SelfCheckRole = 'checkbox' | 'slider' | 'switch';

export interface ProbeFs {
  /** 写文件，父目录不存在时一并创建。 */
  readonly write: (path: string, content: string) => void;
  /** 递归删除；路径不存在不是错误。 */
  readonly rm: (path: string) => void;
}

export interface ProbeInput {
  readonly cwd: string;
  /** 要探测的 lint；bun 不在 node_modules 里，由 detectLints 探活当前运行时。 */
  readonly lints: ReadonlyArray<DetectedLint>;
  /** 全部要探测的 role（aria-query 非抽象 role，排序）。 */
  readonly roles: readonly string[];
  /** 全部 AriaKey（输入形态，排序）。 */
  readonly keys: readonly string[];
  /** 每个 key 的合法样例值（probe/samples.generated 的 SAMPLES）。 */
  readonly samples: Readonly<Record<string, string>>;
  /** aria-query 名字规则；prohibited role 会从 supported 里减掉 label/labelledby。 */
  readonly nameRule: Readonly<
    Record<string, 'required' | 'optional' | 'prohibited'>
  >;
  readonly runners: Readonly<Record<DetectedLint['name'], ProbeRunner>>;
  readonly exec: ExecFn;
  readonly fs: ProbeFs;
  /** 保留工作目录（排查用）。 */
  readonly keep?: boolean;
}

const SORT = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const SELF_CHECK_ROLES: readonly SelfCheckRole[] = [
  'checkbox',
  'slider',
  'switch',
];

const NAME_PROPS: readonly string[] = ['aria-label', 'aria-labelledby'];

const ariaOf = (key: string): string => `aria-${key}`;

export const probe = (input: ProbeInput): Record<string, ProfileData> => {
  const workDir = `${input.cwd}/.meld-a11y-probe`;
  const out: Record<string, ProfileData> = {};
  try {
    input.fs.rm(workDir);
    for (const lint of input.lints) {
      out[lint.name] = probeLint(input, lint, workDir);
    }
    return out;
  } finally {
    if (!input.keep) input.fs.rm(workDir);
  }
};

export const selfCheck = (report: LintReport, known: SelfCheckRole): void => {
  if (!report.missing.some((m) => m.role === known)) {
    throw new Error(
      `self-check failed: ${known} with one required prop removed did not report missing`,
    );
  }
};

export const assertInvariants = (
  profile: ProfileData,
  nameRule: Readonly<Record<string, 'required' | 'optional' | 'prohibited'>>,
): void => {
  for (const [role, data] of Object.entries(profile.roles)) {
    const supported = new Set(data.supported);
    for (const prop of data.required) {
      if (!supported.has(prop)) {
        throw new Error(
          `${profile.lint}: role ${role} requires ${prop} outside its supported set`,
        );
      }
    }
    for (const prop of data.requiredWhenFocusable) {
      if (!supported.has(prop)) {
        throw new Error(
          `${profile.lint}: role ${role} requires ${prop} when focusable outside its supported set`,
        );
      }
    }
    if (nameRule[role] === 'required') {
      for (const prop of NAME_PROPS) {
        if (!supported.has(prop)) {
          throw new Error(
            `${profile.lint}: role ${role} requires a name but ${prop} is not in its supported set`,
          );
        }
      }
    }
  }
};

const probeLint = (
  input: ProbeInput,
  lint: DetectedLint,
  workDir: string,
): ProfileData => {
  const fixturesDir = `${workDir}/fixtures`;
  const run = (fixtures: readonly Fixture[]): LintReport => {
    // 报错的归属靠「哪一轮跑出来的」：先清空 fixture 目录，
    // 上一轮文件的报错会污染这一轮的归因。
    input.fs.rm(fixturesDir);
    return input.runners[lint.name](fixtures, {
      bin: lint.bin,
      cwd: input.cwd,
      workDir,
      writeFile: input.fs.write,
      exec: input.exec,
    });
  };

  const supported = discoverSupported(input, run);
  assertBaseline(
    lint.name,
    'baseline',
    run(buildRemovalFixtures(input.roles, supported, input.samples)),
  );
  assertBaseline(
    lint.name,
    'focusable baseline',
    run(
      buildRemovalFixtures(input.roles, supported, input.samples, {
        focusable: true,
      }),
    ),
  );
  const required = discoverRequired(input, supported, run, false);
  const requiredFocusable = discoverRequired(input, supported, run, true);
  const profile = buildProfile(
    input,
    lint,
    supported,
    required,
    requiredFocusable,
  );
  selfCheckLint(input, supported, required, run, lint.name);
  assertInvariants(profile, input.nameRule);
  return profile;
};

/** supported 判定用「没报不支持」而不是「报支持」：全集减掉报了不支持的。 */
const discoverSupported = (
  input: ProbeInput,
  run: (fixtures: readonly Fixture[]) => LintReport,
): Record<string, readonly string[]> => {
  const report = run(
    buildSupportedFixtures(input.roles, input.keys, input.samples),
  );
  const unsupported = new Map<string, Set<string>>();
  for (const u of report.unsupported) {
    const set = unsupported.get(u.role) ?? new Set<string>();
    set.add(u.prop);
    unsupported.set(u.role, set);
  }
  const supported: Record<string, readonly string[]> = {};
  for (const role of input.roles) {
    const banned = unsupported.get(role);
    supported[role] = input.keys.filter((key) => {
      const prop = ariaOf(key);
      if (banned?.has(prop)) return false;
      return (
        input.nameRule[role] !== 'prohibited' || !NAME_PROPS.includes(prop)
      );
    });
  }
  return supported;
};

/** 基线：全 supported 属性齐上仍报缺失 ⇒ supported 发现不完整。 */
const assertBaseline = (
  lint: string,
  phase: string,
  report: LintReport,
): void => {
  const role = report.missing[0]?.role;
  if (role !== undefined) {
    throw new Error(
      `${lint}: ${phase} reports role ${role} missing required props with its full supported set`,
    );
  }
};

/**
 * required 靠去掉一个属性再跑来发现：某轮去掉 key 后 role 仍报缺失，
 * key 就进它的 required。消息里带不带属性名都成立。
 */
const discoverRequired = (
  input: ProbeInput,
  supported: Readonly<Record<string, readonly string[]>>,
  run: (fixtures: readonly Fixture[]) => LintReport,
  focusable: boolean,
): Record<string, string[]> => {
  const required: Record<string, string[]> = {};
  const candidates = [
    ...new Set(input.roles.flatMap((role) => supported[role] ?? [])),
  ].sort(SORT);
  for (const key of candidates) {
    // 只带 supported 里有这个 key 的 role；其余 role 全属性在身，
    // 基线已证明它们不缺。
    const affected = input.roles.filter((role) =>
      (supported[role] ?? []).includes(key),
    );
    const report = run(
      buildRemovalFixtures(affected, supported, input.samples, {
        remove: key,
        focusable,
      }),
    );
    for (const m of report.missing) {
      const list = required[m.role] ?? [];
      list.push(key);
      required[m.role] = list;
    }
  }
  return required;
};

const buildProfile = (
  input: ProbeInput,
  lint: DetectedLint,
  supported: Readonly<Record<string, readonly string[]>>,
  required: Readonly<Record<string, string[]>>,
  requiredFocusable: Readonly<Record<string, string[]>>,
): ProfileData => {
  const roles: Record<string, RoleRuleData> = {};
  for (const role of input.roles) {
    const req = required[role] ?? [];
    roles[role] = {
      required: [...new Set(req)].map(ariaOf).sort(SORT),
      supported: (supported[role] ?? []).map(ariaOf).sort(SORT),
      requiredWhenFocusable: (requiredFocusable[role] ?? [])
        .filter((key) => !req.includes(key))
        .map(ariaOf)
        .sort(SORT),
    };
  }
  return { lint: lint.name, version: lint.version, roles };
};

/** 自检：已知 role 故意少写一个必填属性，runner 必须报错。 */
const selfCheckLint = (
  input: ProbeInput,
  supported: Readonly<Record<string, readonly string[]>>,
  required: Readonly<Record<string, string[]>>,
  run: (fixtures: readonly Fixture[]) => LintReport,
  lint: string,
): void => {
  const fixtures: Fixture[] = [];
  for (const role of SELF_CHECK_ROLES) {
    if (!input.roles.includes(role)) {
      throw new Error(`${lint}: self-check role ${role} is not probed`);
    }
    const missing = (required[role] ?? [])[0];
    if (missing === undefined) {
      throw new Error(`${lint}: self-check role ${role} has no required props`);
    }
    fixtures.push(
      buildSelfCheckFixture(
        role,
        supported[role] ?? [],
        missing,
        input.samples,
      ),
    );
  }
  const report = run(fixtures);
  for (const role of SELF_CHECK_ROLES) {
    selfCheck(report, role);
  }
};
