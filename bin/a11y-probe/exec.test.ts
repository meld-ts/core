import { describe, expect, test } from 'bun:test';
import { nodeExec } from './exec';

describe('nodeExec', () => {
  test('captures exit code and stdout', () => {
    const r = nodeExec(['bun', '-e', 'console.log("hi")'], {
      cwd: process.cwd(),
    });
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe('hi');
  });

  test('captures non-zero exit and stderr', () => {
    const r = nodeExec(['bun', '-e', 'process.exit(3)'], {
      cwd: process.cwd(),
    });
    expect(r.code).toBe(3);
  });

  test('maps signal kills to exit code 1', () => {
    const r = nodeExec(['bun', '-e', 'process.kill(process.pid, "SIGKILL")'], {
      cwd: process.cwd(),
    });
    expect(r.code).toBe(1);
  });
});
