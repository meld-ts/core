import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const fixtures = ['dom', 'node', 'bun', 'dom-node', 'dom-bun', 'no-dom'];

const argIndex = process.argv.indexOf('--ts');
const tsVersion =
  argIndex === -1 ? undefined : process.argv[argIndex + 1] || undefined;

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
