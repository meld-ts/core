import { describe, expect, test } from 'bun:test';
import { RpcAbortError, TimeoutError } from './errors';

describe('TimeoutError', () => {
  test('message includes ms', () => {
    const err = new TimeoutError(3000);
    expect(err.message).toBe('Operation timed out after 3000ms');
  });

  test('name is TimeoutError', () => {
    expect(new TimeoutError(1000).name).toBe('TimeoutError');
  });

  test('ms property is set', () => {
    const err = new TimeoutError(500);
    expect(err.ms).toBe(500);
  });

  test('data property defaults to undefined', () => {
    expect(new TimeoutError(1000).data).toBeUndefined();
  });

  test('data property is set when provided', () => {
    const err = new TimeoutError(1000, { task: 'fetch' });
    expect(err.data).toEqual({ task: 'fetch' });
  });

  test('instanceof Error and TimeoutError', () => {
    const err = new TimeoutError(1000);
    expect(err instanceof Error).toBe(true);
    expect(err instanceof TimeoutError).toBe(true);
  });
});

describe('RpcAbortError', () => {
  test('message is "RPC aborted" with no reason', () => {
    expect(new RpcAbortError().message).toBe('RPC aborted');
  });

  test('name is RpcAbortError', () => {
    expect(new RpcAbortError().name).toBe('RpcAbortError');
  });

  test('reason is undefined when not provided', () => {
    expect(new RpcAbortError().reason).toBeUndefined();
  });

  test('message includes string reason', () => {
    const err = new RpcAbortError('user cancelled');
    expect(err.message).toBe('RPC aborted: user cancelled');
    expect(err.reason).toBe('user cancelled');
  });

  test('message includes Error reason message', () => {
    const cause = new Error('network failure');
    const err = new RpcAbortError(cause);
    expect(err.message).toBe('RPC aborted: network failure');
    expect(err.reason).toBe(cause);
  });

  test('message includes stringified non-Error reason', () => {
    const err = new RpcAbortError(42);
    expect(err.message).toBe('RPC aborted: 42');
  });

  test('instanceof Error and RpcAbortError', () => {
    const err = new RpcAbortError();
    expect(err instanceof Error).toBe(true);
    expect(err instanceof RpcAbortError).toBe(true);
  });
});
