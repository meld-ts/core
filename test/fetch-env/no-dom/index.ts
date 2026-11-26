import {
  type FetchInit,
  type ResponseLike,
  allowNil,
  createFetcher,
} from '../../../src/fetch/index';

type MyRes = ResponseLike & { readonly marker: true };

const myFetch = async (_url: string, _init: FetchInit): Promise<MyRes> => ({
  status: 200,
  headers: { get: () => null },
  text: async () => '',
  marker: true,
});

const api = createFetcher({
  fetch: myFetch,
  decode: async (res) => ({ kind: 'success', data: res.marker }),
});

export const req: Promise<MyRes | null> = api.request<MyRes>({
  path: '/x',
  validate: allowNil,
});

// @ts-expect-error 没有全局 fetch，createFetcher 必须给参数
createFetcher();

// @ts-expect-error 没有全局 fetch，显式写 Res 也要给 fetch
createFetcher<MyRes>({});

createFetcher<MyRes>({ fetch: myFetch });

// @ts-expect-error 没有全局 fetch，init 只有库的字段
api.request({ path: '/x', init: { credentials: 'include' } });
