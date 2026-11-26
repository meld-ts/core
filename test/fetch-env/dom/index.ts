import { allowNil, createFetcher } from '../../../src/fetch/index';

const api = createFetcher({ baseUrl: '/api' });

export const plain: Promise<unknown> = api.request({ path: '/users/1' });
export const nullable: Promise<{ id: string } | null> = api.request<{
  id: string;
}>({
  path: '/users/1',
  validate: allowNil,
});
export const raw: Promise<Response> = api.raw({ path: '/export' });
export const withInit: Promise<unknown> = api.request({
  path: '/me',
  init: { credentials: 'include' },
});
