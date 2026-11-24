/**
 * §7 第 2/3 层的一致性/反向 fixture 与运行时表合并。
 *
 * 属性一律展开成字面 JSX 属性——lint 看不到 spread，字面属性是第 2 层
 * 唯一可信的输入形态。合并语义与类型侧的 MergeProfiles 对齐：
 * required 并集、supported 交集、requiredWhenFocusable 并集。
 */

import type { Fixture } from './fixtures';
import { attrsOf, batchFiles, elementOf } from './fixtures';
import type { ProfileData, RoleRuleData } from './serialize';

const SORT = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** 去重 + 排序：输出不依赖输入顺序，重跑逐字节一致。 */
const sorted = (props: readonly string[]): string[] =>
  [...new Set(props)].sort(SORT);

const entriesOf = (
  profile: ProfileData,
): ReadonlyArray<[string, RoleRuleData]> =>
  Object.entries(profile.roles).sort(([a], [b]) => SORT(a, b));

/** aria- 形态属性展开成字面 JSX 属性；样例值缺失由 attrsOf 报错。 */
const attrsOfProps = (
  props: readonly string[],
  samples: Readonly<Record<string, string>>,
): string =>
  attrsOf(
    props.map((prop) => prop.replace(/^aria-/, '')),
    samples,
  );

const unionOf = (
  data: ReadonlyArray<RoleRuleData>,
  pick: (d: RoleRuleData) => readonly string[],
): readonly string[] => [...new Set(data.flatMap(pick))].sort(SORT);

export const mergeProfiles = (
  profiles: readonly ProfileData[],
): ProfileData => {
  const [first] = profiles;
  if (first === undefined) {
    throw new Error('mergeProfiles needs at least one profile');
  }
  // 合并按 role 对齐；任一表缺 role 直接点名失败——静默按空集合并
  // 会得到一张悄悄变弱的表（required 少了、supported 空了）。
  const roleNames = [
    ...new Set(profiles.flatMap((p) => Object.keys(p.roles))),
  ].sort(SORT);
  const roles: Record<string, RoleRuleData> = {};
  for (const role of roleNames) {
    const data = profiles.map((p) => {
      const d = p.roles[role];
      if (d === undefined) {
        throw new Error(
          `mergeProfiles: ${p.lint} has no data for role ${role}`,
        );
      }
      return d;
    });
    roles[role] = {
      required: unionOf(data, (d) => d.required),
      // 交集从并集候选里筛：不依赖任何一张表做种子，也不需要索引访问
      supported: unionOf(data, (d) => d.supported).filter((prop) =>
        data.every((d) => d.supported.includes(prop)),
      ),
      requiredWhenFocusable: unionOf(data, (d) => d.requiredWhenFocusable),
    };
  }
  return {
    lint: profiles.map((p) => p.lint).join('+'),
    version: profiles.map((p) => p.version).join('+'),
    roles,
  };
};

export interface ConsistencyFixtures {
  /** 只带 required 属性（required ⊆ supported，第 2 层的反向面）。 */
  readonly requiredOnly: readonly Fixture[];
  /** 带全部 supported 属性。 */
  readonly allSupported: readonly Fixture[];
  /** tabIndex + 全部 supported；只覆盖 requiredWhenFocusable 非空的 role。 */
  readonly focusableAll: readonly Fixture[];
}

export const buildConsistencyFixtures = (
  profile: ProfileData,
  samples: Readonly<Record<string, string>>,
  batchSize = 200,
): ConsistencyFixtures => {
  const entries = entriesOf(profile);
  const requiredOnly = entries.map(([role, data]) =>
    elementOf(role, attrsOfProps(sorted(data.required), samples)),
  );
  const allSupported = entries.map(([role, data]) =>
    elementOf(role, attrsOfProps(sorted(data.supported), samples)),
  );
  const focusableAll = entries
    .filter(([, data]) => data.requiredWhenFocusable.length > 0)
    .map(([role, data]) =>
      elementOf(
        role,
        ` tabIndex={0}${attrsOfProps(sorted(data.supported), samples)}`,
      ),
    );
  return {
    requiredOnly: batchFiles(requiredOnly, 'required-only', batchSize),
    allSupported: batchFiles(allSupported, 'all-supported', batchSize),
    focusableAll: batchFiles(focusableAll, 'focusable-all', batchSize),
  };
};

export interface ReverseSpec {
  readonly role: string;
  readonly prop: string;
  readonly focusable: boolean;
}

export interface ReverseFixtures {
  /** 每个 role 删掉一个 required 属性（排序取第一个）。 */
  readonly required: readonly Fixture[];
  /** 每个 role 带 tabIndex 删掉一个 requiredWhenFocusable 属性。 */
  readonly focusable: readonly Fixture[];
  /** 与元素一一对应的期望：哪个 role、删了哪个属性、哪个变体。 */
  readonly specs: readonly ReverseSpec[];
}

export const buildReverseFixtures = (
  profile: ProfileData,
  samples: Readonly<Record<string, string>>,
  batchSize = 200,
): ReverseFixtures => {
  const requiredSpecs: ReverseSpec[] = [];
  const focusableSpecs: ReverseSpec[] = [];
  const requiredElements: string[] = [];
  const focusableElements: string[] = [];
  for (const [role, data] of entriesOf(profile)) {
    const dropRequired = sorted(data.required).at(0);
    if (dropRequired !== undefined) {
      requiredSpecs.push({ role, prop: dropRequired, focusable: false });
      requiredElements.push(
        elementOf(
          role,
          attrsOfProps(
            sorted(data.supported).filter((prop) => prop !== dropRequired),
            samples,
          ),
        ),
      );
    }
    const dropFocusable = sorted(data.requiredWhenFocusable).at(0);
    if (dropFocusable !== undefined) {
      focusableSpecs.push({ role, prop: dropFocusable, focusable: true });
      focusableElements.push(
        elementOf(
          role,
          ` tabIndex={0}${attrsOfProps(
            sorted(data.supported).filter((prop) => prop !== dropFocusable),
            samples,
          )}`,
        ),
      );
    }
  }
  return {
    required: batchFiles(requiredElements, 'reverse-required', batchSize),
    focusable: batchFiles(focusableElements, 'reverse-focusable', batchSize),
    specs: [...requiredSpecs, ...focusableSpecs],
  };
};
