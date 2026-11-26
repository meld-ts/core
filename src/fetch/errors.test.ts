import { describe, expect, test } from 'bun:test';
import { FetchError, type FetchErrorOf } from './errors';

describe('FetchError', () => {
  test('carries kind, url, method, status, failure, body and cause', () => {
    const cause = new Error('boom');
    const err = new FetchError('failed', {
      kind: 'status',
      url: 'https://x/api/users?page=1',
      method: 'GET',
      status: 500,
      body: { message: 'down' },
      cause,
    });

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(FetchError);
    expect(err.name).toBe('FetchError');
    expect(err.kind).toBe('status');
    expect(err.url).toBe('https://x/api/users?page=1');
    expect(err.method).toBe('GET');
    expect(err.status).toBe(500);
    expect(err.body).toEqual({ message: 'down' });
    expect(err.cause).toBe(cause);
  });

  test('leaves optional fields undefined', () => {
    const err = new FetchError('network', {
      kind: 'network',
      url: '/x',
      method: 'POST',
    });
    expect(err.status).toBeUndefined();
    expect(err.failure).toBeUndefined();
    expect(err.body).toBeUndefined();
    expect(err.cause).toBeUndefined();
  });

  test('narrows by kind through FetchErrorOf', () => {
    const err = new FetchError('bad', {
      kind: 'failure',
      url: '/x',
      method: 'GET',
      status: 200,
      failure: { code: 42 },
    }) as FetchErrorOf<{ code: number }>;
    if (err.kind === 'failure') {
      const code: number = err.failure.code;
      expect(code).toBe(42);
    }
  });

  test('accepts a foreign instance that carries the shared brand', () => {
    const foreign = {};
    Object.defineProperty(
      foreign,
      Symbol.for('@meld-ts/core/fetch:FetchError'),
      { value: true },
    );
    expect(foreign).toBeInstanceOf(FetchError);
  });

  test('rejects an object without the shared brand', () => {
    expect({}).not.toBeInstanceOf(FetchError);
  });
});
