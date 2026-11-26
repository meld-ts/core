import {
  type DefaultInit,
  type DefaultRes,
  type Fetcher,
  type ResOf,
  createFetcher,
} from '../../../src/fetch/index';

// Annotated because isolatedDeclarations cannot name the global fetch types
// that come from another package's declarations.
const api: Fetcher<DefaultRes, DefaultInit, never> = createFetcher({
  baseUrl: '/api',
});

export const raw: Promise<ResOf<typeof api>> = api.raw({ path: '/export' });
export const req: Promise<unknown> = api.request({ path: '/users/1' });
