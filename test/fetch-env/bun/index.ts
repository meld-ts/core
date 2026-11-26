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
// DefaultRes must be the environment's own Response, not `never`.
export const response: Promise<Response> = api.raw({ path: '/export' });
export const req: Promise<unknown> = api.request({ path: '/users/1' });
// DefaultInit must come from the environment's RequestInit.
export const cached: Promise<unknown> = api.request({
  path: '/users/1',
  init: { cache: 'no-store' },
});
export const noTimeout: Promise<unknown> = api.request({
  path: '/users/1',
  init: {
    // @ts-expect-error undici RequestInit has no timeout
    timeout: 5000,
  },
});
