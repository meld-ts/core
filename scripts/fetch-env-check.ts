import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const fixtures = ['dom', 'node', 'bun', 'dom-node', 'dom-bun', 'no-dom'];

const usage = 'usage: bun scripts/fetch-env-check.ts [--ts <version>]';

// Fail closed: a mistyped --ts must not silently check the local compiler while
// printing a green line. `--ts=...` is rejected too, so the accepted form is one.
const parseArgs = (argv: readonly string[]): string | undefined => {
  let version: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    // Indexed read under noUncheckedIndexedAccess; the loop bound rules it out.
    if (arg === undefined) break;
    if (arg === '--ts') {
      const value = argv[i + 1];
      if (value === undefined || value === '' || value.startsWith('-')) {
        console.error(`fetch-env: --ts needs a version, e.g. --ts 7.0.2`);
        console.error(usage);
        process.exit(1);
      }
      version = value;
      i += 1;
      continue;
    }
    console.error(`fetch-env: unknown argument "${arg}"`);
    console.error(usage);
    process.exit(1);
  }
  return version;
};

const tsVersion = parseArgs(process.argv.slice(2));

const tsc = tsVersion
  ? ['bunx', '-p', `typescript@${tsVersion}`, 'tsc']
  : ['bunx', 'tsc'];

for (const fixture of fixtures) {
  const project = join(root, 'test/fetch-env', fixture, 'tsconfig.json');
  const proc = Bun.spawnSync([...tsc, '-p', project, '--noEmit'], {
    cwd: root,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (proc.exitCode !== 0) {
    console.error(`fetch-env ${fixture} failed`);
    console.error(proc.stdout.toString());
    console.error(proc.stderr.toString());
    process.exit(1);
  }
}

console.log(
  `fetch-env: ${fixtures.length} fixtures OK${
    tsVersion ? ` (TypeScript ${tsVersion})` : ''
  }`,
);
