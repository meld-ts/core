import { describe, expect, test } from 'bun:test';
import type { DetectedLint } from './detect';
import type { Fixture } from './fixtures';
import type { ProbeFs, ProbeRunner } from './index';
import { assertInvariants, probe, selfCheck } from './index';
import type { LintReport } from './runners/eslint';
import type { ProfileData, RoleRuleData } from './serialize';

interface RoleModel {
  readonly required: readonly string[];
  readonly supported: readonly string[];
  readonly focusableRequired?: readonly string[];
}

type RoleModels = Record<string, RoleModel>;

interface RunnerCall {
  readonly bin: readonly string[];
  readonly workDir: string;
  readonly fixtures: readonly Fixture[];
}

/**
 * 假 lint：从 fixture 源码反推报错（元素缺必填 → missing；
 * 属性不在 supported → unsupported）。roleOnly 模拟 biome 只报
 * role、不列缺失属性的消息形状。
 */
const fakeRunner = (
  models: RoleModels,
  opts: { roleOnly?: boolean } = {},
): ProbeRunner & { calls: RunnerCall[] } => {
  const calls: RunnerCall[] = [];
  const run: ProbeRunner = (fixtures, runnerOpts) => {
    calls.push({
      bin: runnerOpts.bin,
      workDir: runnerOpts.workDir,
      fixtures,
    });
    const missing: Array<{ role: string; props: string[] }> = [];
    const unsupported: Array<{ role: string; prop: string }> = [];
    for (const f of fixtures) {
      for (const line of f.code.split('\n')) {
        const role = line.match(/role="([^"]+)"/)?.[1];
        if (role === undefined) continue;
        const model = models[role];
        if (model === undefined) {
          throw new Error(`fake lint has no model for role: ${role}`);
        }
        const props = [...line.matchAll(/(aria-[a-z]+)=/g)].map((m) => m[1]!);
        const required = line.includes('tabIndex')
          ? [...model.required, ...(model.focusableRequired ?? [])]
          : model.required;
        const miss = required.filter((p) => !props.includes(p));
        if (miss.length > 0) {
          missing.push({
            role,
            props: opts.roleOnly === true ? [] : miss,
          });
        }
        for (const prop of props) {
          if (!model.supported.includes(prop)) {
            unsupported.push({ role, prop });
          }
        }
      }
    }
    return { missing, unsupported };
  };
  return Object.assign(run, { calls });
};

const ROLES = ['checkbox', 'generic', 'img', 'separator', 'slider', 'switch'];
const KEYS = ['checked', 'expanded', 'label', 'labelledby', 'valuenow'];
const SAMPLES: Record<string, string> = {
  checked: 'true',
  expanded: 'true',
  label: "'x'",
  labelledby: "'x'",
  valuenow: '1',
};
const NAME_RULE: Record<string, 'required' | 'optional' | 'prohibited'> = {
  checkbox: 'required',
  generic: 'prohibited',
  img: 'required',
  separator: 'optional',
  slider: 'required',
  switch: 'required',
};
const MODELS: RoleModels = {
  checkbox: {
    required: ['aria-checked'],
    supported: [
      'aria-checked',
      'aria-expanded',
      'aria-label',
      'aria-labelledby',
    ],
  },
  generic: {
    required: [],
    supported: ['aria-expanded', 'aria-label', 'aria-labelledby'],
  },
  img: {
    required: [],
    supported: ['aria-label', 'aria-labelledby'],
  },
  separator: {
    required: [],
    supported: [
      'aria-expanded',
      'aria-label',
      'aria-labelledby',
      'aria-valuenow',
    ],
    focusableRequired: ['aria-valuenow'],
  },
  slider: {
    required: ['aria-valuenow'],
    supported: ['aria-label', 'aria-labelledby', 'aria-valuenow'],
  },
  switch: {
    required: ['aria-checked'],
    supported: [
      'aria-checked',
      'aria-expanded',
      'aria-label',
      'aria-labelledby',
      'aria-valuenow',
    ],
  },
};
// generic 的模型支持 label/labelledby（未报不支持），但名字规则是
// prohibited——supported 表只能靠名字规则减掉它们。
const EXPECTED_ROLES: Record<string, RoleRuleData> = {
  checkbox: {
    required: ['aria-checked'],
    supported: [
      'aria-checked',
      'aria-expanded',
      'aria-label',
      'aria-labelledby',
    ],
    requiredWhenFocusable: [],
  },
  generic: {
    required: [],
    supported: ['aria-expanded'],
    requiredWhenFocusable: [],
  },
  img: {
    required: [],
    supported: ['aria-label', 'aria-labelledby'],
    requiredWhenFocusable: [],
  },
  separator: {
    required: [],
    supported: [
      'aria-expanded',
      'aria-label',
      'aria-labelledby',
      'aria-valuenow',
    ],
    requiredWhenFocusable: ['aria-valuenow'],
  },
  slider: {
    required: ['aria-valuenow'],
    supported: ['aria-label', 'aria-labelledby', 'aria-valuenow'],
    requiredWhenFocusable: [],
  },
  switch: {
    required: ['aria-checked'],
    supported: [
      'aria-checked',
      'aria-expanded',
      'aria-label',
      'aria-labelledby',
      'aria-valuenow',
    ],
    requiredWhenFocusable: [],
  },
};

const WORK_DIR = '/lab/.meld-a11y-probe';
const FIXTURES_DIR = `${WORK_DIR}/fixtures`;

const lintOf = (name: DetectedLint['name']): DetectedLint => ({
  name,
  version: `${name}-1.0.0`,
  bin: [`${name}-bin`],
});

const fakeFs = (): { rmCalls: string[]; fs: ProbeFs } => {
  const rmCalls: string[] = [];
  return {
    rmCalls,
    fs: {
      rm: (path: string): void => {
        rmCalls.push(path);
      },
      write: (): void => {},
    },
  };
};

const allRunners = (
  runner: ProbeRunner,
): Record<DetectedLint['name'], ProbeRunner> => ({
  eslint: runner,
  oxlint: runner,
  biome: runner,
  bun: runner,
});

interface RunProbeOpts {
  readonly keep?: boolean;
  readonly lints?: ReadonlyArray<DetectedLint>;
  readonly roles?: readonly string[];
  readonly runners?: Record<DetectedLint['name'], ProbeRunner>;
}

const runProbe = (
  runner: ProbeRunner,
  opts: RunProbeOpts = {},
): { profiles: Record<string, ProfileData>; rmCalls: string[] } => {
  const { rmCalls, fs } = fakeFs();
  const profiles = probe({
    cwd: '/lab',
    lints: opts.lints ?? [lintOf('eslint')],
    roles: opts.roles ?? ROLES,
    keys: KEYS,
    samples: SAMPLES,
    nameRule: NAME_RULE,
    runners: opts.runners ?? allRunners(runner),
    exec: () => ({ code: 0, stdout: '', stderr: '' }),
    fs,
    keep: opts.keep,
  });
  return { profiles, rmCalls };
};

describe('probe', () => {
  test('derives the three tables from named-props reports', () => {
    const { profiles } = runProbe(fakeRunner(MODELS));
    expect(profiles.eslint).toEqual({
      lint: 'eslint',
      version: 'eslint-1.0.0',
      roles: EXPECTED_ROLES,
    });
  });

  test('derives the same tables from role-only reports (biome shape)', () => {
    const { profiles } = runProbe(fakeRunner(MODELS, { roleOnly: true }));
    expect(profiles.eslint).toEqual({
      lint: 'eslint',
      version: 'eslint-1.0.0',
      roles: EXPECTED_ROLES,
    });
  });

  test('runs the lint in a fixed per-key sequence', () => {
    const runner = fakeRunner(MODELS);
    runProbe(runner);
    expect(runner.calls[0]?.workDir).toBe(WORK_DIR);
    expect(
      runner.calls.map((c) => c.fixtures.map((f) => f.name).join(',')),
    ).toEqual([
      'supported-0',
      'removal-baseline-0',
      'focusable-removal-baseline-0',
      'removal-checked-0',
      'removal-expanded-0',
      'removal-label-0',
      'removal-labelledby-0',
      'removal-valuenow-0',
      'focusable-removal-checked-0',
      'focusable-removal-expanded-0',
      'focusable-removal-label-0',
      'focusable-removal-labelledby-0',
      'focusable-removal-valuenow-0',
      'self-check-checkbox-aria-checked,self-check-slider-aria-valuenow,self-check-switch-aria-checked',
    ]);
  });

  test('removes exactly one supported prop per element in removal runs', () => {
    const runner = fakeRunner(MODELS);
    runProbe(runner);
    const checked = runner.calls
      .flatMap((c) => c.fixtures)
      .find((f) => f.name === 'removal-checked-0');
    expect(checked?.code).toBe(
      [
        `export const F0 = () => <div role="checkbox" aria-expanded={true} aria-label={'x'} aria-labelledby={'x'} />;`,
        `export const F1 = () => <div role="switch" aria-expanded={true} aria-label={'x'} aria-labelledby={'x'} aria-valuenow={1} />;`,
      ].join('\n'),
    );
  });

  test('probes multiple lints independently with their own tables', () => {
    const eslint = fakeRunner(MODELS);
    const biome = fakeRunner(MODELS, { roleOnly: true });
    const { profiles } = runProbe(eslint, {
      lints: [lintOf('eslint'), lintOf('biome')],
      runners: { eslint, oxlint: eslint, biome, bun: biome },
    });
    expect(profiles.eslint).toEqual({
      lint: 'eslint',
      version: 'eslint-1.0.0',
      roles: EXPECTED_ROLES,
    });
    expect(profiles.biome).toEqual({
      lint: 'biome',
      version: 'biome-1.0.0',
      roles: EXPECTED_ROLES,
    });
    for (const call of eslint.calls) {
      expect(call.bin).toEqual(['eslint-bin']);
    }
    for (const call of biome.calls) {
      expect(call.bin).toEqual(['biome-bin']);
    }
  });

  test('clears the fixtures dir before every run and removes the workdir', () => {
    const { rmCalls } = runProbe(fakeRunner(MODELS));
    expect(rmCalls[0]).toBe(WORK_DIR);
    expect(rmCalls.filter((p) => p === FIXTURES_DIR)).toHaveLength(14);
    expect(rmCalls.at(-1)).toBe(WORK_DIR);
  });

  test('keeps the workdir when keep is true', () => {
    const { rmCalls } = runProbe(fakeRunner(MODELS), { keep: true });
    expect(rmCalls.filter((p) => p === WORK_DIR)).toHaveLength(1);
    expect(rmCalls.at(-1)).toBe(FIXTURES_DIR);
  });

  test('fails when the baseline still reports a role missing', () => {
    const models: RoleModels = {
      ...MODELS,
      switch: {
        required: ['aria-checked'],
        supported: [
          'aria-expanded',
          'aria-label',
          'aria-labelledby',
          'aria-valuenow',
        ],
      },
    };
    expect(() => runProbe(fakeRunner(models))).toThrow(
      'eslint: baseline reports role switch missing required props with its full supported set',
    );
  });

  test('fails when the focusable baseline still reports a role missing', () => {
    const models: RoleModels = {
      ...MODELS,
      separator: {
        required: [],
        supported: ['aria-expanded', 'aria-label', 'aria-labelledby'],
        focusableRequired: ['aria-valuenow'],
      },
    };
    expect(() => runProbe(fakeRunner(models))).toThrow(
      'eslint: focusable baseline reports role separator missing required props with its full supported set',
    );
  });

  test('fails when a self-check role has no required props', () => {
    const models: RoleModels = {
      ...MODELS,
      switch: {
        required: [],
        supported: [
          'aria-checked',
          'aria-expanded',
          'aria-label',
          'aria-labelledby',
          'aria-valuenow',
        ],
      },
    };
    expect(() => runProbe(fakeRunner(models))).toThrow(
      'eslint: self-check role switch has no required props',
    );
  });

  test('fails when a self-check role was not probed', () => {
    expect(() =>
      runProbe(fakeRunner(MODELS), {
        roles: ['checkbox', 'generic', 'img', 'separator', 'slider'],
      }),
    ).toThrow('eslint: self-check role switch is not probed');
  });

  test('fails when a name-required role loses its naming props', () => {
    const models: RoleModels = {
      ...MODELS,
      checkbox: {
        required: ['aria-checked'],
        supported: ['aria-checked', 'aria-expanded', 'aria-labelledby'],
      },
    };
    expect(() => runProbe(fakeRunner(models))).toThrow(
      'eslint: role checkbox requires a name but aria-label is not in its supported set',
    );
  });
});

describe('selfCheck', () => {
  test('passes when the report names the role', () => {
    const report: LintReport = {
      missing: [{ role: 'switch', props: [] }],
      unsupported: [],
    };
    expect(() => selfCheck(report, 'switch')).not.toThrow();
  });

  test('fails when the role is absent from the report', () => {
    expect(() => selfCheck({ missing: [], unsupported: [] }, 'switch')).toThrow(
      'self-check failed: switch with one required prop removed did not report missing',
    );
  });
});

describe('assertInvariants', () => {
  const profile = (roles: Record<string, RoleRuleData>): ProfileData => ({
    lint: 'test',
    version: '0.0.0',
    roles,
  });

  test('accepts a consistent profile', () => {
    expect(() =>
      assertInvariants(
        profile({
          switch: {
            required: ['aria-checked'],
            supported: ['aria-checked', 'aria-label', 'aria-labelledby'],
            requiredWhenFocusable: [],
          },
        }),
        { switch: 'required' },
      ),
    ).not.toThrow();
  });

  test('fails when required falls outside supported', () => {
    expect(() =>
      assertInvariants(
        profile({
          switch: {
            required: ['aria-checked'],
            supported: ['aria-label', 'aria-labelledby'],
            requiredWhenFocusable: [],
          },
        }),
        { switch: 'optional' },
      ),
    ).toThrow(
      'test: role switch requires aria-checked outside its supported set',
    );
  });

  test('fails when requiredWhenFocusable falls outside supported', () => {
    expect(() =>
      assertInvariants(
        profile({
          separator: {
            required: [],
            supported: ['aria-expanded'],
            requiredWhenFocusable: ['aria-valuenow'],
          },
        }),
        { separator: 'optional' },
      ),
    ).toThrow(
      'test: role separator requires aria-valuenow when focusable outside its supported set',
    );
  });

  test('fails when a name-required role lacks a naming prop', () => {
    expect(() =>
      assertInvariants(
        profile({
          switch: {
            required: [],
            supported: ['aria-checked', 'aria-label'],
            requiredWhenFocusable: [],
          },
        }),
        { switch: 'required' },
      ),
    ).toThrow(
      'test: role switch requires a name but aria-labelledby is not in its supported set',
    );
  });
});
