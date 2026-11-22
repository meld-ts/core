// shebang 由 bunup.bin.ts 的 banner 注入；源文件再写一份会打包出两行 #!
export interface ProbeArgs {
  readonly lint?: readonly string[];
  readonly out?: string;
  readonly keep: boolean;
}

// 与 probe/detect 的 DetectedLint['name'] 对齐；bin 独立打包，不 import probe 模块
const LINT_NAMES: readonly string[] = ['eslint', 'bun', 'oxlint', 'biome'];

export const parseProbeArgs = (argv: readonly string[]): ProbeArgs => {
  let lint: string[] | undefined;
  let out: string | undefined;
  let keep = false;
  for (const arg of argv) {
    if (arg === '--keep') {
      keep = true;
      continue;
    }
    if (arg.startsWith('--lint=')) {
      const raw = arg.slice('--lint='.length);
      if (!raw) throw new Error('empty --lint');
      lint = raw.split(',');
      for (const name of lint) {
        if (!LINT_NAMES.includes(name)) {
          throw new Error(`unknown lint '${name}'`);
        }
      }
      continue;
    }
    if (arg.startsWith('--out=')) {
      out = arg.slice('--out='.length);
      continue;
    }
    // 严格解析：拼错或空格形式的参数宁可失败，也不静默忽略
    throw new Error(`unknown argument: ${arg}`);
  }
  return { lint, out, keep };
};

const usage = `Usage:
  meld a11y probe [--lint=biome,oxlint] [--out=./a11y-lints.generated.d.ts] [--keep]`;

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const main = async (argv: readonly string[]): Promise<number> => {
  const [group, command, ...rest] = argv;
  if (group !== 'a11y' || command !== 'probe') {
    console.error(usage);
    return 1;
  }
  try {
    const args = parseProbeArgs(rest);
    // user-mode implementation lands in Task 3
    console.error(
      `probe args ok: ${JSON.stringify(args)} (user mode not wired yet)`,
    );
    return 0;
  } catch (error) {
    console.error(messageOf(error));
    console.error(usage);
    return 1;
  }
};

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
