import { describe, expect, test } from 'bun:test';
import type { ResponseLike } from './decode';
import { FetchError } from './errors';
import { createFetcher } from './fetcher';
import type { FetchInit, FetcherOptions } from './types';

/** Extra keys stay visible to assertions without casts. */
type TestInit = FetchInit & Record<string, unknown>;

const makeRes = (status = 200, body = ''): ResponseLike => ({
  status,
  headers: { get: () => null },
  text: async () => body,
});

const makeFetch = () => {
  const calls: Array<{ url: string; init: TestInit }> = [];
  const fetchImpl = async (
    url: string,
    init: TestInit,
  ): Promise<ResponseLike> => {
    calls.push({ url, init });
    return makeRes();
  };
  return { calls, fetchImpl };
};

const onlyCall = (
  calls: Array<{ url: string; init: TestInit }>,
): { url: string; init: TestInit } => {
  expect(calls).toHaveLength(1);
  const call = calls[0];
  if (!call) throw new Error('expected exactly one fetch call');
  return call;
};

const makeApi = (
  fetchImpl: (url: string, init: TestInit) => Promise<ResponseLike>,
  options: Omit<FetcherOptions<ResponseLike, TestInit, never>, 'fetch'> = {},
) => createFetcher<ResponseLike, TestInit>({ ...options, fetch: fetchImpl });

const reject = async (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => {
      throw new Error('expected the request to reject');
    },
    (err: unknown) => err,
  );

const asError = (err: unknown): Error => {
  if (!(err instanceof Error)) throw new Error('expected an Error');
  return err;
};

const restoreFetch = (saved: typeof globalThis.fetch): void => {
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    writable: true,
    value: saved,
  });
};

describe('url and query', () => {
  test('joins baseUrl and path without a slash', async () => {
    const { calls, fetchImpl } = makeFetch();
    const api = makeApi(fetchImpl, { baseUrl: '/api' });
    await api.raw({ path: 'users' });
    expect(onlyCall(calls).url).toBe('/api/users');
  });

  test('collapses the slash on both sides', async () => {
    const { calls, fetchImpl } = makeFetch();
    const api = makeApi(fetchImpl, { baseUrl: '/api/' });
    await api.raw({ path: '/users' });
    expect(onlyCall(calls).url).toBe('/api/users');
  });

  test('keeps absolute urls untouched', async () => {
    const { calls, fetchImpl } = makeFetch();
    const api = makeApi(fetchImpl, { baseUrl: '/api' });
    await api.raw({ path: 'https://x/y' });
    expect(onlyCall(calls).url).toBe('https://x/y');
  });

  test('keeps protocol-relative urls untouched', async () => {
    const { calls, fetchImpl } = makeFetch();
    const api = makeApi(fetchImpl, { baseUrl: '/api' });
    await api.raw({ path: '//cdn/x' });
    expect(onlyCall(calls).url).toBe('//cdn/x');
  });

  test('an empty path is the baseUrl without its trailing slash', async () => {
    const { calls, fetchImpl } = makeFetch();
    const api = makeApi(fetchImpl, { baseUrl: '/api/' });
    await api.raw({ path: '' });
    expect(onlyCall(calls).url).toBe('/api');
  });

  test('drops null query values and stringifies the rest', async () => {
    const { calls, fetchImpl } = makeFetch();
    const api = makeApi(fetchImpl);
    await api.raw({ path: '/x', query: { page: 1, ok: true, skip: null } });
    expect(onlyCall(calls).url).toBe('/x?page=1&ok=true');
  });

  test('repeats array keys and skips null items', async () => {
    const { calls, fetchImpl } = makeFetch();
    const api = makeApi(fetchImpl);
    await api.raw({ path: '/x', query: { a: [1, 2, null] } });
    expect(onlyCall(calls).url).toBe('/x?a=1&a=2');
  });

  test('encodes keys and values', async () => {
    const { calls, fetchImpl } = makeFetch();
    const api = makeApi(fetchImpl);
    await api.raw({ path: '/x', query: { 'a b': 'x&y' } });
    expect(onlyCall(calls).url).toBe('/x?a%20b=x%26y');
  });

  test('restores bracket literals in keys', async () => {
    const { calls, fetchImpl } = makeFetch();
    const api = makeApi(fetchImpl);
    await api.raw({ path: '/x', query: { 'a[]': [1, 2] } });
    expect(onlyCall(calls).url).toBe('/x?a[]=1&a[]=2');
  });

  test('appends to a query already in the path', async () => {
    const { calls, fetchImpl } = makeFetch();
    const api = makeApi(fetchImpl);
    await api.raw({ path: '/x?z=1', query: { a: 1 } });
    expect(onlyCall(calls).url).toBe('/x?z=1&a=1');
  });

  test('does not add a separator after a trailing question mark', async () => {
    const { calls, fetchImpl } = makeFetch();
    const api = makeApi(fetchImpl);
    await api.raw({ path: '/x?', query: { a: 1 } });
    expect(onlyCall(calls).url).toBe('/x?a=1');
  });

  test('inserts the query before a fragment', async () => {
    const { calls, fetchImpl } = makeFetch();
    const api = makeApi(fetchImpl);
    await api.raw({ path: '/x#frag', query: { a: 1 } });
    expect(onlyCall(calls).url).toBe('/x?a=1#frag');
  });

  test('keeps an existing query and the fragment in order', async () => {
    const { calls, fetchImpl } = makeFetch();
    const api = makeApi(fetchImpl);
    await api.raw({ path: '/x?z=1#frag', query: { a: 1 } });
    expect(onlyCall(calls).url).toBe('/x?z=1&a=1#frag');
  });
});

describe('headers', () => {
  test('serializes json and adds its content type', async () => {
    const { calls, fetchImpl } = makeFetch();
    const api = makeApi(fetchImpl);
    await api.raw({ method: 'post', path: '/x', json: { a: 1 } });
    const { init } = onlyCall(calls);
    expect(init.method).toBe('POST');
    expect(init.headers['content-type']).toBe('application/json');
    expect(init.body).toBe('{"a":1}');
  });

  test('keeps a static instance content type', async () => {
    const { calls, fetchImpl } = makeFetch();
    const api = makeApi(fetchImpl, {
      headers: { 'Content-Type': 'application/vnd.api+json' },
    });
    await api.raw({ method: 'post', path: '/x', json: { a: 1 } });
    expect(onlyCall(calls).init.headers['content-type']).toBe(
      'application/vnd.api+json',
    );
  });

  test('keeps the content type returned by a headers function', async () => {
    const { calls, fetchImpl } = makeFetch();
    const api = makeApi(fetchImpl, {
      headers: () => ({ 'content-type': 'text/custom' }),
    });
    await api.raw({ method: 'post', path: '/x', json: { a: 1 } });
    expect(onlyCall(calls).init.headers['content-type']).toBe('text/custom');
  });

  test('lets a request content type win over the instance one', async () => {
    const { calls, fetchImpl } = makeFetch();
    const api = makeApi(fetchImpl, {
      headers: { 'content-type': 'application/a' },
    });
    await api.raw({
      method: 'post',
      path: '/x',
      json: { a: 1 },
      headers: { 'Content-Type': 'x/y' },
    });
    expect(onlyCall(calls).init.headers['content-type']).toBe('x/y');
  });

  test('skips null and undefined instance headers', async () => {
    const { calls, fetchImpl } = makeFetch();
    const api = makeApi(fetchImpl, {
      headers: { 'x-null': null, 'x-undefined': undefined, 'x-keep': 'k' },
    });
    await api.raw({ path: '/x' });
    expect(onlyCall(calls).init.headers).toEqual({ 'x-keep': 'k' });
  });

  test('a null request header deletes the instance one', async () => {
    const { calls, fetchImpl } = makeFetch();
    const api = makeApi(fetchImpl, { headers: { authorization: 'secret' } });
    await api.raw({ path: '/x', headers: { Authorization: null } });
    const { headers } = onlyCall(calls).init;
    expect('authorization' in headers).toBe(false);
  });

  test('an undefined request header keeps the instance one', async () => {
    const { calls, fetchImpl } = makeFetch();
    const api = makeApi(fetchImpl, { headers: { authorization: 'secret' } });
    await api.raw({ path: '/x', headers: { authorization: undefined } });
    expect(onlyCall(calls).init.headers.authorization).toBe('secret');
  });

  test('later keys win when the case differs', async () => {
    const { calls, fetchImpl } = makeFetch();
    const api = makeApi(fetchImpl);
    await api.raw({
      path: '/x',
      headers: { Authorization: 'a', authorization: 'b' },
    });
    expect(onlyCall(calls).init.headers.authorization).toBe('b');
  });

  test('a headers function previews the json content type and body', async () => {
    const seen: Array<{
      url: string;
      method: string;
      headers: Record<string, string>;
      body: unknown;
    }> = [];
    const { fetchImpl } = makeFetch();
    const api = makeApi(fetchImpl, {
      baseUrl: '/api',
      headers: (req) => {
        seen.push({
          url: req.url,
          method: req.method,
          headers: { ...req.headers },
          body: req.body,
        });
        return {};
      },
    });
    await api.raw({ method: 'post', path: '/x', json: { a: 1 } });
    expect(seen).toHaveLength(1);
    const preview = seen[0];
    if (!preview) throw new Error('expected the headers function to run');
    expect(preview.url).toBe('/api/x');
    expect(preview.method).toBe('POST');
    expect(preview.headers['content-type']).toBe('application/json');
    expect(preview.body).toBe('{"a":1}');
  });

  test('a headers function runs once per request', async () => {
    let calls = 0;
    const { fetchImpl } = makeFetch();
    const api = makeApi(fetchImpl, {
      headers: () => {
        calls += 1;
        return {};
      },
    });
    await api.raw({ path: '/a' });
    await api.raw({ path: '/b' });
    expect(calls).toBe(2);
  });

  test('a throwing headers function rejects with its own error', async () => {
    const boom = new Error('headers failed');
    const onError = () => {
      throw new Error('onError must not run');
    };
    const { fetchImpl } = makeFetch();
    const api = makeApi(fetchImpl, {
      headers: () => {
        throw boom;
      },
      onError,
    });
    const err = await reject(api.raw({ path: '/x' }));
    expect(err).toBe(boom);
  });
});

describe('body checks', () => {
  test('rejects json on GET before calling fetch', async () => {
    const { calls, fetchImpl } = makeFetch();
    const api = makeApi(fetchImpl);
    const err = await reject(api.raw({ method: 'GET', path: '/x', json: 1 }));
    expect(err).toBeInstanceOf(TypeError);
    expect(calls).toHaveLength(0);
  });

  test('rejects a body on HEAD before calling fetch', async () => {
    const { calls, fetchImpl } = makeFetch();
    const api = makeApi(fetchImpl);
    const err = await reject(
      api.raw({ method: 'HEAD', path: '/x', body: 'x' }),
    );
    expect(err).toBeInstanceOf(TypeError);
    expect(calls).toHaveLength(0);
  });

  test('lets a circular json error through without onError', async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const fetched: string[] = [];
    const api = makeApi(
      async (url) => {
        fetched.push(url);
        return makeRes();
      },
      {
        onError: () => {
          throw new Error('onError must not run');
        },
      },
    );
    const err = await reject(
      api.raw({ method: 'post', path: '/x', json: circular }),
    );
    expect(err).toBeInstanceOf(TypeError);
    expect(fetched).toHaveLength(0);
  });

  test('rejects a json value that serializes to undefined', async () => {
    const { fetchImpl } = makeFetch();
    const api = makeApi(fetchImpl, {
      onError: () => {
        throw new Error('onError must not run');
      },
    });
    const err = await reject(
      api.raw({ method: 'post', path: '/x', json: () => 1 }),
    );
    expect(err).toBeInstanceOf(TypeError);
    expect(asError(err).message).toBe('json must be JSON-serializable.');
  });
});

describe('init', () => {
  test('passes init through while keeping the library fields', async () => {
    const { calls, fetchImpl } = makeFetch();
    const api = makeApi(fetchImpl);
    await api.raw({
      method: 'post',
      path: '/x',
      json: { a: 1 },
      init: { credentials: 'include' },
    });
    const { init } = onlyCall(calls);
    expect(init.credentials).toBe('include');
    expect(init.method).toBe('POST');
    expect(init.headers['content-type']).toBe('application/json');
  });

  test('overwrites method and headers coming from init', async () => {
    const { calls, fetchImpl } = makeFetch();
    const api = makeApi(fetchImpl);
    await api.raw({
      method: 'post',
      path: '/x',
      init: { method: 'PUT', headers: { 'x-bad': 'yes' } },
    });
    const { init } = onlyCall(calls);
    expect(init.method).toBe('POST');
    expect('x-bad' in init.headers).toBe(false);
  });
});

describe('raw', () => {
  test('returns non-2xx responses untouched', async () => {
    const api = makeApi(async () => makeRes(500, 'down'));
    const res = await api.raw({ path: '/x' });
    expect(res.status).toBe(500);
  });

  test('wraps a fetch rejection as a network FetchError', async () => {
    const down = new Error('down');
    const seen: unknown[] = [];
    const api = makeApi(
      async () => {
        throw down;
      },
      {
        onError: (err) => {
          seen.push(err);
        },
      },
    );
    const err = await reject(api.raw({ path: '/x' }));
    expect(err).toBeInstanceOf(FetchError);
    const fetchError = err as FetchError;
    expect(fetchError.kind).toBe('network');
    expect(fetchError.cause).toBe(down);
    expect(seen).toEqual([fetchError]);
  });

  test('reads the default fetch on every request', async () => {
    const saved = globalThis.fetch;
    const fetched: string[] = [];
    const api = createFetcher({ baseUrl: '/api' });
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: async (url: string) => {
        fetched.push(url);
        return makeRes();
      },
    });
    try {
      await api.raw({ path: 'users' });
      expect(fetched).toEqual(['/api/users']);
    } finally {
      restoreFetch(saved);
    }
  });

  test('calls an injected fetch without a this binding', async () => {
    let received: unknown = 'unset';
    const client = {
      async fetch(
        this: void,
        _url: string,
        _init: TestInit,
      ): Promise<ResponseLike> {
        received = this;
        return makeRes();
      },
    };
    // Passing the bare method is the point: the library must not bind it.
    const api = makeApi(client.fetch);
    await api.raw({ path: '/x' });
    expect(received).toBeUndefined();
  });

  test('rejects with TypeError when there is no fetch at all', async () => {
    const saved = globalThis.fetch;
    Reflect.deleteProperty(globalThis, 'fetch');
    try {
      const api = createFetcher({ baseUrl: '/api' });
      const err = await reject(api.raw({ path: '/x' }));
      expect(err).toBeInstanceOf(TypeError);
      expect(asError(err).message).toContain('options.fetch');
    } finally {
      restoreFetch(saved);
    }
  });
});
