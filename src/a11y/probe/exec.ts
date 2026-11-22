/** 同步执行结果；`code` 归一为数字（signal 杀死时为 1）。 */
export interface ExecResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export type ExecFn = (
  cmd: readonly string[],
  opts: { readonly cwd: string },
) => ExecResult;

export const nodeExec: ExecFn = (cmd, { cwd }) => {
  // spawnSync 要求可变 string[]，但不会修改数组，放宽 readonly。
  const proc = Bun.spawnSync(cmd as string[], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    // 被 signal 杀死时运行时 exitCode 为 null（types 声明 number），归一为 1。
    code: proc.exitCode ?? 1,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
  };
};
