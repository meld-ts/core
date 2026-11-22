import { describe, expect, test } from 'bun:test';

import { main, parseProbeArgs } from './meld';

describe('parseProbeArgs', () => {
  test('defaults', () => {
    expect(parseProbeArgs([])).toEqual({ keep: false });
  });

  test('parses lint list, out and keep', () => {
    expect(
      parseProbeArgs(['--lint=biome,oxlint', '--out=./x.d.ts', '--keep']),
    ).toEqual({ lint: ['biome', 'oxlint'], out: './x.d.ts', keep: true });
  });

  test('rejects unknown arguments', () => {
    expect(() => parseProbeArgs(['--lint', 'biome'])).toThrow(
      'unknown argument: --lint',
    );
  });

  test('rejects empty or unknown lint names', () => {
    expect(() => parseProbeArgs(['--lint='])).toThrow('empty --lint');
    expect(() => parseProbeArgs(['--lint=biom'])).toThrow(
      "unknown lint 'biom'",
    );
  });
});

describe('main', () => {
  test('non-probe routes print usage and return 1', async () => {
    expect(await main([])).toBe(1);
    expect(await main(['probe'])).toBe(1);
    expect(await main(['a11y'])).toBe(1);
    expect(await main(['a11y', 'sync'])).toBe(1);
  });

  test('valid probe args parse; user mode lands in Task 3', async () => {
    expect(await main(['a11y', 'probe'])).toBe(0);
    expect(
      await main([
        'a11y',
        'probe',
        '--lint=biome,oxlint',
        '--out=./x',
        '--keep',
      ]),
    ).toBe(0);
  });

  test('invalid probe args print message and usage, return 1', async () => {
    expect(await main(['a11y', 'probe', '--keep=1'])).toBe(1);
    expect(await main(['a11y', 'probe', '--lint=biom'])).toBe(1);
  });
});
