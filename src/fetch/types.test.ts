import { describe, expect, test } from 'bun:test';
import { allowNil } from './allowNil';
import { FetchError, type FetchErrorOf } from './errors';
import {
  type AllowNilOptions,
  type Decode,
  type FetchInit,
  type FetchLike,
  type FetchRequest,
  type Fetcher,
  type InitOf,
  type ParseOptions,
  type ResOf,
  type ResponseLike,
  type SendOptions,
  createFetcher,
} from './index';

/** 类型相等断言：Eq<A, B> 为 true 当且仅当 A、B 互相可赋值 */
type Eq<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
/** 断言辅助：T 不为 true 时此处即编译错误 */
type Assert<T extends true> = T;
/** 消费类型断言行产生的值，避开 biome noUnusedExpressions */
const check = (..._args: unknown[]): void => {};

const guard = (v: unknown): v is { id: string } =>
  typeof v === 'object' && v !== null;

const api = createFetcher({ baseUrl: '/api' });

const resDefault: Assert<Eq<ResOf<typeof api>, Response>> = true;
const initDefault: Assert<Eq<InitOf<typeof api>, RequestInit>> = true;
check(resDefault, initDefault);

const typeChecks = async (): Promise<void> => {
  const request1: Promise<unknown> = api.request({ path: '/x' });
  const request2: Promise<{ id: string }> = api.request({
    path: '/x',
    validate: guard,
  });
  const request3: Promise<{ id: string } | null> = api.request<{
    id: string;
  }>({ path: '/x', validate: allowNil });
  const request4: Promise<string> = api.request<{ id: string }, string>({
    path: '/x',
    transform: (u) => u.id,
  });
  const raw1: Promise<Response> = api.raw({ path: '/x' });
  const init1: Promise<unknown> = api.request({
    path: '/x',
    init: { credentials: 'include' },
  });

  // @ts-expect-error 标准 fetch 没有 timeout
  api.request({ path: '/x', init: { timeout: 1 } });
  // @ts-expect-error 只写 <User> 时 transform 必须返回 User
  api.request<{ id: string }>({ path: '/x', transform: (u) => u.id });
  // @ts-expect-error json 与 body 互斥
  api.request({ path: '/x', json: {}, body: 'x' });
  // @ts-expect-error transform 不能 async
  api.request({ path: '/x', transform: async (u: unknown) => u });
  // @ts-expect-error onError 不能 async
  createFetcher({ onError: async () => {} });
  // @ts-expect-error 结果类型不从变量注解反推
  const forced: string = await api.request({ path: '/x', validate: guard });

  // §4.5 实测：先写 decode、再写行内 fetch 不会报错，Res 停在 decode 注解的
  // ResponseLike 上，没有优先取 fetch 的 Response。设计稿说的推断顺序报错不成立。
  const lateFetch = createFetcher({
    decode: async (res: ResponseLike) => ({
      kind: 'success' as const,
      data: res,
    }),
    fetch: async (_url: string, _init: RequestInit) => new Response(),
  });
  const lateRes: Assert<Eq<ResOf<typeof lateFetch>, ResponseLike>> = true;

  check(request1, request2, request3, request4, raw1, init1, forced, lateRes);
};

check(typeChecks);

type MyRes = ResponseLike & { readonly marker: true };
const myFetch = async (
  _url: string,
  _init: FetchInit & { timeout?: number },
): Promise<MyRes> => ({
  status: 200,
  headers: { get: () => null },
  text: async () => '',
  marker: true,
});

const custom = createFetcher({
  fetch: myFetch,
  decode: (res) => ({
    kind: 'failure' as const,
    status: res.status,
    failure: { code: 1 },
    message: 'x',
  }),
  onError: (err) => {
    if (err.kind === 'failure') {
      const code: number = err.failure.code;
      return new Error(String(code));
    }
  },
});

const customChecks = (): void => {
  const req: Promise<unknown> = custom.request({
    path: '/x',
    init: { timeout: 1000 },
  });
  // MyRes 是 ResponseLike 的结构，decode 可省；fetch 必须给（DOM 里可省，No-dom 另测）
  const explicit = createFetcher<MyRes>({ fetch: myFetch });

  // @ts-expect-error 非标准响应结构：fetch 和 decode 都必须给
  createFetcher<{ nope: true }>({});

  // RequireFor 的必填键是 `{}` 而不是 `unknown`：显式传 undefined 也拦得住
  const maybeFetch: FetchLike<{ nope: true }, RequestInit> | undefined =
    undefined;
  const maybeDecode: Decode<{ nope: true }, never> | undefined = undefined;
  createFetcher<{ nope: true }>({
    // @ts-expect-error fetch 可能为 undefined，不能当成已提供
    fetch: maybeFetch,
    decode: async () => ({ kind: 'success', data: 1 }),
  });
  createFetcher<{ nope: true }>({
    fetch: async () => ({}) as { nope: true },
    // @ts-expect-error decode 可能为 undefined，不能当成已提供
    decode: maybeDecode,
  });
  check(maybeFetch, maybeDecode);

  const resArg: Promise<unknown> = custom.request({
    path: '/x',
    transform: (u, res) => {
      const typed: MyRes = res;
      check(typed);
      return u;
    },
  });

  check(req, explicit, resArg);
};

check(customChecks);

const customNarrow = (value: unknown): void => {
  if (custom.isFetchError(value) && value.kind === 'failure') {
    const code: number = value.failure.code;
    check(code);
  }
  if (value instanceof FetchError) {
    const failure: unknown = value.failure;
    const status: number | undefined = value.status;
    check(failure, status);
  }
};

check(customNarrow);

const defaultNarrow = (value: unknown): void => {
  if (api.isFetchError(value) && value.kind === 'failure') {
    const absent: never = value.failure;
    check(absent);
  }
};

check(defaultNarrow);

const errorFields = (err: FetchErrorOf<{ code: number }>): void => {
  if (err.kind === 'network') {
    const status: undefined = err.status;
    check(status);
  }
  if (err.kind === 'status') {
    const status: number = err.status;
    check(status);
  }
  if (err.kind === 'invalid') {
    const status: number | undefined = err.status;
    check(status);
  }
  if (err.kind === 'failure') {
    const code: number = err.failure.code;
    check(code);
  }
  const status: number | undefined = err.status;
  check(status, err.status === 401);
};

check(errorFields);

const headerFunctions = createFetcher({
  baseUrl: '/api',
  headers: async (req) => {
    const request: FetchRequest = req;
    return { authorization: request.url };
  },
});

const staticHeaders = createFetcher({ headers: { 'x-token': 't' } });

check(headerFunctions, staticHeaders);

type Order = { total: number };
type SendOpts = Omit<
  SendOptions<InitOf<typeof api>>,
  'method' | 'path' | 'json' | 'body'
>;

const get = <T = unknown, R = T>(
  path: string,
  opts?: SendOpts & ParseOptions<T, R>,
) => api.request<T, R>({ ...opts, path });

function post<T = unknown, R = T | null>(
  path: string,
  json: unknown,
  opts: SendOpts & AllowNilOptions<T, R>,
): Promise<R>;
function post<T = unknown, R = T>(
  path: string,
  json?: unknown,
  opts?: SendOpts & ParseOptions<T, R>,
): Promise<R>;
function post(
  path: string,
  json?: unknown,
  opts?: SendOpts &
    (AllowNilOptions<unknown, unknown> | ParseOptions<unknown, unknown>),
): Promise<unknown> {
  // 两个分支一模一样，是为了让 TS 分别按两个签名检查。
  if (opts?.validate === allowNil) {
    return api.request({ ...opts, method: 'POST', path, json });
  }
  return api.request({ ...opts, method: 'POST', path, json });
}

const wrapperChecks = (): void => {
  const a: Promise<unknown> = get('/users/1');
  const b: Promise<{ id: string }> = get<{ id: string }>('/users/1', {
    validate: guard,
  });
  const c: Promise<string> = get<{ id: string }, string>('/users/1', {
    transform: (u) => u.id,
  });
  const d: Promise<Order | null> = post<Order>(
    '/orders',
    {},
    {
      validate: allowNil,
    },
  );
  const e: Promise<number> = post<Order, number>(
    '/orders',
    {},
    {
      transform: (o) => o.total,
    },
  );

  check(a, b, c, d, e);
};

check(wrapperChecks);

class UserService {}
// biome-ignore lint/correctness/noUnusedVariables: trait type extension via implTraits
interface UserService
  extends Fetcher<ResOf<typeof api>, InitOf<typeof api>, never> {}

const traitChecks = async (): Promise<void> => {
  // A dynamic import keeps `bun test src/fetch --coverage` at 100%: loading
  // ../traits eagerly would drag its other modules into the coverage report.
  const { implTraits } = await import('../traits');
  implTraits(UserService, api);

  const service = new UserService();
  const req: Promise<unknown> = service.request({ path: '/x' });
  check(req);
};

check(traitChecks);

describe('fetch types', () => {
  test('type assertions compile', () => {
    expect(true).toBe(true);
  });
});
