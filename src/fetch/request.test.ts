import { describe, expect, test } from 'bun:test';
import { allowNil } from './allowNil';
import type { Decode, DecodeContext, ResponseLike } from './decode';
import { FetchError } from './errors';
import { createFetcher } from './fetcher';
import type { FetchInit, FetcherOptions } from './types';

/** Extra keys stay visible to assertions without casts. */
type TestInit = FetchInit & Record<string, unknown>;

const makeRes = (
  init: { status?: number; contentType?: string | null; text?: string } = {},
): ResponseLike => ({
  status: init.status ?? 200,
  headers: {
    get: (name) =>
      name.toLowerCase() === 'content-type' ? (init.contentType ?? null) : null,
  },
  text: async () => init.text ?? '',
});

/** Runtime-invalid decode results: the public type rejects these shapes. */
const rawDecode = (value: unknown): Decode<ResponseLike, never> =>
  (() => value) as Decode<ResponseLike, never>;

const makeApi = <Failure = never>(
  options: Omit<FetcherOptions<ResponseLike, TestInit, Failure>, 'fetch'>,
  fetchImpl: (
    url: string,
    init: TestInit,
  ) => Promise<ResponseLike> = async () => makeRes(),
) =>
  createFetcher<ResponseLike, TestInit, Failure>({
    ...options,
    fetch: fetchImpl,
  });

const reject = async (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => {
      throw new Error('expected the request to reject');
    },
    (err: unknown) => err,
  );

const asFetchError = (err: unknown): FetchError => {
  if (!(err instanceof FetchError)) throw new Error('expected a FetchError');
  return err;
};

const asError = (err: unknown): Error => {
  if (!(err instanceof Error)) throw new Error('expected an Error');
  return err;
};

describe('default decode', () => {
  test('parses a json 2xx body', async () => {
    const api = makeApi({}, async () =>
      makeRes({ contentType: 'application/json', text: '{"id":1}' }),
    );
    expect(await api.request({ path: '/x' })).toEqual({ id: 1 });
  });

  test('passes the built request to decode', async () => {
    const seen: DecodeContext[] = [];
    const signal = { aborted: false };
    const api = makeApi({
      decode: (_res, ctx) => {
        seen.push(ctx);
        return { kind: 'success', data: 1 };
      },
    });
    await api.request({ path: '/users', method: 'post', signal });
    const ctx = seen[0];
    if (!ctx) throw new Error('decode did not run');
    expect(ctx.url).toBe('/users');
    expect(ctx.method).toBe('POST');
    expect(ctx.signal).toBe(signal);
  });

  test('turns a non-2xx response into a status error', async () => {
    const api = makeApi({}, async () =>
      makeRes({ status: 404, contentType: 'text/plain', text: 'missing' }),
    );
    const err = asFetchError(await reject(api.request({ path: '/x' })));
    expect(err.kind).toBe('status');
    expect(err.status).toBe(404);
    expect(err.body).toBe('missing');
    expect(err.message).toBe('HTTP 404');
  });

  test('treats declared json that fails to parse as invalid', async () => {
    const api = makeApi({}, async () =>
      makeRes({ contentType: 'application/json', text: '<html>' }),
    );
    const err = asFetchError(await reject(api.request({ path: '/x' })));
    expect(err.kind).toBe('invalid');
    expect(err.status).toBe(200);
    expect(err.body).toBe('<html>');
  });
});

describe('decode results', () => {
  test('wraps a throwing decode as invalid with a cause', async () => {
    const bad = new Error('bad');
    const api = makeApi({
      decode: () => {
        throw bad;
      },
    });
    const err = asFetchError(await reject(api.request({ path: '/x' })));
    expect(err.kind).toBe('invalid');
    expect(err.cause).toBe(bad);
    expect(err.status).toBeUndefined();
    expect(err.body).toBeUndefined();
  });

  test('rejects a decode result that is not one of the three kinds', async () => {
    const api = makeApi({ decode: rawDecode({}) });
    const err = asFetchError(await reject(api.request({ path: '/x' })));
    expect(err.kind).toBe('invalid');
    expect(err.cause).toBeUndefined();
  });

  test('rejects a decode result with missing fields', async () => {
    const api = makeApi({ decode: rawDecode({ kind: 'failure' }) });
    const err = asFetchError(await reject(api.request({ path: '/x' })));
    expect(err.kind).toBe('invalid');
    expect(err.cause).toBeUndefined();
  });

  test('surfaces a failure envelope with status and failure', async () => {
    const api = makeApi<{ code: number }>({
      decode: () => ({
        kind: 'failure',
        status: 401,
        failure: { code: 1 },
        message: 'no',
      }),
    });
    const err = asFetchError(await reject(api.request({ path: '/x' })));
    expect(err.kind).toBe('failure');
    expect(err.status).toBe(401);
    expect(err.failure).toEqual({ code: 1 });
    expect(err.message).toBe('no');
  });

  test('turns an unrecognized non-2xx into a status error', async () => {
    const api = makeApi({
      decode: rawDecode({ kind: 'unrecognized', status: 500, body: 'x' }),
    });
    const err = asFetchError(await reject(api.request({ path: '/x' })));
    expect(err.kind).toBe('status');
    expect(err.body).toBe('x');
  });

  test('turns an unrecognized 2xx into invalid with status and body', async () => {
    const api = makeApi({
      decode: rawDecode({ kind: 'unrecognized', status: 200, body: 'x' }),
    });
    const err = asFetchError(await reject(api.request({ path: '/x' })));
    expect(err.kind).toBe('invalid');
    expect(err.status).toBe(200);
    expect(err.body).toBe('x');
  });

  test('maps an undefined success body to null before validate', async () => {
    const api = makeApi({
      decode: rawDecode({ kind: 'success', data: undefined }),
    });
    const err = asFetchError(await reject(api.request({ path: '/x' })));
    expect(err.kind).toBe('invalid');
    expect(err.body).toBeNull();
  });
});

describe('validate', () => {
  test('rejects a null body by default and mentions allowNil', async () => {
    const api = makeApi({}, async () => makeRes({ status: 200, text: '' }));
    const err = asFetchError(await reject(api.request({ path: '/x' })));
    expect(err.kind).toBe('invalid');
    expect(err.message).toContain('validate: allowNil');
    expect(err.body).toBeNull();
  });

  test('accepts a null body with allowNil', async () => {
    const api = makeApi({}, async () => makeRes({ status: 204 }));
    expect(await api.request({ path: '/x', validate: allowNil })).toBeNull();
  });

  test('returns the data when a custom guard passes', async () => {
    const isUser = (value: unknown): value is { id: string } =>
      typeof value === 'object' &&
      value !== null &&
      'id' in value &&
      typeof value.id === 'string';
    const api = makeApi({}, async () =>
      makeRes({ contentType: 'application/json', text: '{"id":"u1"}' }),
    );
    expect(await api.request({ path: '/x', validate: isUser })).toEqual({
      id: 'u1',
    });
  });

  test('rejects with the data when a custom guard fails', async () => {
    const isUser = (value: unknown): value is { id: string } =>
      typeof value === 'object' &&
      value !== null &&
      'id' in value &&
      typeof value.id === 'string';
    const api = makeApi({}, async () =>
      makeRes({ contentType: 'application/json', text: '{"name":"x"}' }),
    );
    const err = asFetchError(
      await reject(api.request({ path: '/x', validate: isUser })),
    );
    expect(err.kind).toBe('invalid');
    expect(err.body).toEqual({ name: 'x' });
  });

  test('lets a throwing guard through without onError', async () => {
    const boom = new Error('guard failed');
    const api = makeApi(
      {
        onError: () => {
          throw new Error('onError must not run');
        },
      },
      async () =>
        makeRes({ contentType: 'application/json', text: '{"id":1}' }),
    );
    const err = await reject(
      api.request({
        path: '/x',
        validate: (_value: unknown): _value is { id: string } => {
          throw boom;
        },
      }),
    );
    expect(err).toBe(boom);
  });

  test('rejects a validate that is neither allowNil nor a function', async () => {
    const api = makeApi({
      onError: () => {
        throw new Error('onError must not run');
      },
    });
    // Runtime-only misuse: the public type only accepts a guard or allowNil.
    const err = await reject(
      api.request({ path: '/x', validate: 123 as never }),
    );
    expect(err).toBeInstanceOf(TypeError);
    expect(asError(err).message).toContain('type guard or allowNil');
  });
});

describe('transform', () => {
  test('returns the transformed value and passes the response', async () => {
    const seen: ResponseLike[] = [];
    const api = makeApi({}, async () =>
      makeRes({ contentType: 'application/json', text: '{"name":"n1"}' }),
    );
    const value = await api.request<{ name: string }, string>({
      path: '/x',
      transform: (user, res) => {
        seen.push(res);
        return user.name;
      },
    });
    expect(value).toBe('n1');
    expect(seen[0]?.status).toBe(200);
  });

  test('lets a throwing transform through without onError', async () => {
    const boom = new Error('transform failed');
    const api = makeApi(
      {
        onError: () => {
          throw new Error('onError must not run');
        },
      },
      async () => makeRes({ contentType: 'application/json', text: '{"a":1}' }),
    );
    const err = await reject(
      api.request({
        path: '/x',
        transform: () => {
          throw boom;
        },
      }),
    );
    expect(err).toBe(boom);
  });
});

describe('onError', () => {
  test('throws the replacement Error and hides it from isFetchError', async () => {
    const replacement = new Error('replaced');
    const api = makeApi({ onError: () => replacement }, async () =>
      makeRes({ status: 404, text: 'missing' }),
    );
    const err = await reject(api.request({ path: '/x' }));
    expect(err).toBe(replacement);
    expect(api.isFetchError(err)).toBe(false);
  });

  test('throws the original FetchError when onError returns nothing', async () => {
    const api = makeApi({ onError: () => {} }, async () =>
      makeRes({ status: 404, text: 'missing' }),
    );
    const err = asFetchError(await reject(api.request({ path: '/x' })));
    expect(err.kind).toBe('status');
  });

  test('ignores a non-Error return value', async () => {
    const api = makeApi({ onError: () => 'x' as never }, async () =>
      makeRes({ status: 404, text: 'missing' }),
    );
    const err = asFetchError(await reject(api.request({ path: '/x' })));
    expect(err.kind).toBe('status');
  });

  test('lets an onError throw replace the original error', async () => {
    const boom = new Error('onError blew up');
    const api = makeApi(
      {
        onError: () => {
          throw boom;
        },
      },
      async () => makeRes({ status: 404, text: 'missing' }),
    );
    expect(await reject(api.request({ path: '/x' }))).toBe(boom);
  });
});

describe('isFetchError', () => {
  test('recognizes an error thrown by its own instance', async () => {
    const api = makeApi({}, async () => makeRes({ status: 404 }));
    const err = await reject(api.request({ path: '/x' }));
    expect(api.isFetchError(err)).toBe(true);
  });

  test('rejects an error thrown by another instance', async () => {
    const first = makeApi({}, async () => makeRes({ status: 404 }));
    const second = makeApi({}, async () => makeRes({ status: 404 }));
    const err = await reject(first.request({ path: '/x' }));
    expect(second.isFetchError(err)).toBe(false);
  });

  test('instanceof reaches across instances', async () => {
    const api = makeApi({}, async () => makeRes({ status: 404 }));
    const err = await reject(api.request({ path: '/x' }));
    expect(err).toBeInstanceOf(FetchError);
  });
});

describe('cancellation', () => {
  test('aborts before the request is built', async () => {
    const reason = new Error('stop');
    const fetched: string[] = [];
    const api = makeApi({}, async (url) => {
      fetched.push(url);
      return makeRes();
    });
    const err = await reject(
      api.request({ path: '/x', signal: { aborted: true, reason } }),
    );
    expect(err).toBe(reason);
    expect(fetched).toHaveLength(0);
  });

  test('throws an AbortError when the reason is undefined', async () => {
    const api = makeApi({});
    const err = asError(
      await reject(api.request({ path: '/x', signal: { aborted: true } })),
    );
    expect(err.name).toBe('AbortError');
  });

  test('keeps the reason when fetch rejects after an abort', async () => {
    const controller = new AbortController();
    const reason = new Error('nope');
    const api = makeApi({}, async () => {
      controller.abort(reason);
      throw new Error('network down');
    });
    const err = await reject(
      api.request({ path: '/x', signal: controller.signal }),
    );
    expect(err).toBe(reason);
  });

  test('drops the decoded result when the signal aborts during decode', async () => {
    const controller = new AbortController();
    const reason = new Error('late');
    const api = makeApi({
      decode: async () => {
        controller.abort(reason);
        return { kind: 'success', data: 1 };
      },
    });
    const err = await reject(
      api.request({ path: '/x', signal: controller.signal }),
    );
    expect(err).toBe(reason);
  });

  test('never routes cancellation through onError', async () => {
    let calls = 0;
    const api = makeApi({
      onError: () => {
        calls += 1;
      },
    });
    await reject(api.request({ path: '/x', signal: { aborted: true } }));
    expect(calls).toBe(0);
  });

  test('treats a signal without aborted as active', async () => {
    const api = makeApi({
      decode: () => ({ kind: 'success', data: 1 }),
    });
    expect(
      await api.request({ path: '/x', signal: { reason: 'not aborted' } }),
    ).toBe(1);
  });
});

describe('missing decode', () => {
  test('rejects a custom Res without decode before calling onError', async () => {
    const api = createFetcher<{ nope: true }>({
      // Runtime-only path: RequireFor demands decode here, the guard is the point.
      decode: undefined as never,
      fetch: async () => ({}) as { nope: true },
      onError: () => {
        throw new Error('onError must not run');
      },
    });
    const err = await reject(api.request({ path: '/x' }));
    expect(err).toBeInstanceOf(TypeError);
    expect(asError(err).message).toContain('decode is required');
  });
});
