import { describe, expect, test } from 'bun:test';
import {
  type DecodeContext,
  type Decoded,
  type ResponseLike,
  type SuccessEnvelopeFailure,
  readBody,
  successEnvelope,
} from './decode';

const ctx: DecodeContext = { url: '/x', method: 'GET' };

const makeRes = (init: {
  status?: number;
  contentType?: string | null;
  text?: string;
  headers?: Record<string, string>;
}): ResponseLike => {
  const headers = init.headers ?? {};
  return {
    status: init.status ?? 200,
    headers: {
      get: (name) => {
        const key = name.toLowerCase();
        if (key === 'content-type' && init.contentType !== undefined) {
          return init.contentType;
        }
        return headers[key] ?? null;
      },
    },
    text: async () => init.text ?? '',
  };
};

const expectSuccess = (decoded: Decoded<SuccessEnvelopeFailure>) => {
  if (decoded.kind !== 'success') {
    throw new Error(`expected success, got ${decoded.kind}`);
  }
  return decoded;
};

const expectFailure = (decoded: Decoded<SuccessEnvelopeFailure>) => {
  if (decoded.kind !== 'failure') {
    throw new Error(`expected failure, got ${decoded.kind}`);
  }
  return decoded;
};

const expectUnrecognized = (decoded: Decoded<SuccessEnvelopeFailure>) => {
  if (decoded.kind !== 'unrecognized') {
    throw new Error(`expected unrecognized, got ${decoded.kind}`);
  }
  return decoded;
};

describe('readBody', () => {
  test('HEAD has no body even with a JSON payload', async () => {
    const res = makeRes({
      contentType: 'application/json',
      text: '{"a":1}',
    });
    expect(await readBody(res, { url: '/x', method: 'HEAD' })).toEqual({
      body: null,
      malformedJson: false,
    });
  });

  test('204 has no body', async () => {
    const res = makeRes({ status: 204, text: '{"a":1}' });
    expect(await readBody(res, ctx)).toEqual({
      body: null,
      malformedJson: false,
    });
  });

  test('205 has no body', async () => {
    const res = makeRes({ status: 205, text: '{"a":1}' });
    expect(await readBody(res, ctx)).toEqual({
      body: null,
      malformedJson: false,
    });
  });

  test('304 has no body', async () => {
    const res = makeRes({ status: 304, text: '{"a":1}' });
    expect(await readBody(res, ctx)).toEqual({
      body: null,
      malformedJson: false,
    });
  });

  test('200 with an empty string has no body', async () => {
    const res = makeRes({
      status: 200,
      contentType: 'application/json',
      text: '',
    });
    expect(await readBody(res, ctx)).toEqual({
      body: null,
      malformedJson: false,
    });
  });

  test('200 with only whitespace has no body', async () => {
    const res = makeRes({
      status: 200,
      contentType: 'application/json',
      text: '  \n',
    });
    expect(await readBody(res, ctx)).toEqual({
      body: null,
      malformedJson: false,
    });
  });

  test('parses JSON with a charset parameter', async () => {
    const res = makeRes({
      contentType: 'application/json; charset=utf-8',
      text: '{"a":1}',
    });
    expect(await readBody(res, ctx)).toEqual({
      body: { a: 1 },
      malformedJson: false,
    });
  });

  test('parses +json media types', async () => {
    const res = makeRes({
      contentType: 'application/problem+json',
      text: '{"a":1}',
    });
    expect(await readBody(res, ctx)).toEqual({
      body: { a: 1 },
      malformedJson: false,
    });
  });

  test('matches the media type case-insensitively', async () => {
    const res = makeRes({
      contentType: 'Application/JSON',
      text: '{"a":1}',
    });
    expect(await readBody(res, ctx)).toEqual({
      body: { a: 1 },
      malformedJson: false,
    });
  });

  test('falls back to text when declared JSON is malformed', async () => {
    const res = makeRes({
      contentType: 'application/json',
      text: '<html>',
    });
    expect(await readBody(res, ctx)).toEqual({
      body: '<html>',
      malformedJson: true,
    });
  });

  test('keeps non-JSON text as-is', async () => {
    const res = makeRes({ contentType: 'text/plain', text: 'ok' });
    expect(await readBody(res, ctx)).toEqual({
      body: 'ok',
      malformedJson: false,
    });
  });

  test('keeps text when the content type is missing', async () => {
    const res = makeRes({ contentType: null, text: 'ok' });
    expect(await readBody(res, ctx)).toEqual({
      body: 'ok',
      malformedJson: false,
    });
  });

  test('parses a JSON scalar', async () => {
    const res = makeRes({ contentType: 'application/json', text: '42' });
    expect(await readBody(res, ctx)).toEqual({
      body: 42,
      malformedJson: false,
    });
  });
});

describe('successEnvelope', () => {
  test('2xx with success true returns the data field', async () => {
    const decode = successEnvelope();
    const res = makeRes({
      status: 200,
      contentType: 'application/json',
      text: '{"success":true,"data":{"id":1}}',
    });
    expect(expectSuccess(await decode(res, ctx))).toEqual({
      kind: 'success',
      data: { id: 1 },
    });
  });

  test('2xx with success true and no data yields undefined data', async () => {
    const decode = successEnvelope();
    const res = makeRes({
      status: 200,
      contentType: 'application/json',
      text: '{"success":true}',
    });
    const decoded = expectSuccess(await decode(res, ctx));
    expect(decoded.kind).toBe('success');
    expect(decoded.data).toBeUndefined();
  });

  test('204 is a success with null data', async () => {
    const decode = successEnvelope();
    expect(await decode(makeRes({ status: 204 }), ctx)).toEqual({
      kind: 'success',
      data: null,
    });
  });

  test('200 with an empty body is a success with null data', async () => {
    const decode = successEnvelope();
    expect(await decode(makeRes({ status: 200, text: '' }), ctx)).toEqual({
      kind: 'success',
      data: null,
    });
  });

  test('2xx with success false is a failure', async () => {
    const decode = successEnvelope();
    const res = makeRes({
      status: 200,
      contentType: 'application/json',
      text: '{"success":false,"code":"E1","message":"no"}',
    });
    expect(expectFailure(await decode(res, ctx))).toEqual({
      kind: 'failure',
      status: 200,
      failure: { code: 'E1', message: 'no' },
      message: 'no',
    });
  });

  test('4xx with success false keeps the status', async () => {
    const decode = successEnvelope();
    const res = makeRes({
      status: 401,
      contentType: 'application/json',
      text: '{"success":false,"code":"E1","message":"no"}',
    });
    expect(expectFailure(await decode(res, ctx))).toEqual({
      kind: 'failure',
      status: 401,
      failure: { code: 'E1', message: 'no' },
      message: 'no',
    });
  });

  test('non-string, non-number codes become null', async () => {
    const decode = successEnvelope();
    const res = makeRes({
      status: 200,
      contentType: 'application/json',
      text: '{"success":false,"code":{}}',
    });
    const decoded = expectFailure(await decode(res, ctx));
    expect(decoded.failure.code).toBeNull();
    expect(decoded.message).toBeUndefined();
  });

  test('keeps a numeric code', async () => {
    const decode = successEnvelope();
    const res = makeRes({
      status: 200,
      contentType: 'application/json',
      text: '{"success":false,"code":40401}',
    });
    const decoded = expectFailure(await decode(res, ctx));
    expect(decoded.failure.code).toBe(40401);
  });

  test('an empty message becomes null and is not passed along', async () => {
    const decode = successEnvelope();
    const res = makeRes({
      status: 200,
      contentType: 'application/json',
      text: '{"success":false,"code":"E1","message":""}',
    });
    const decoded = expectFailure(await decode(res, ctx));
    expect(decoded.failure.message).toBeNull();
    expect(decoded.message).toBeUndefined();
  });

  test('a non-string message becomes null', async () => {
    const decode = successEnvelope();
    const res = makeRes({
      status: 200,
      contentType: 'application/json',
      text: '{"success":false,"message":123}',
    });
    const decoded = expectFailure(await decode(res, ctx));
    expect(decoded.failure.message).toBeNull();
  });

  test('a non-object body is unrecognized', async () => {
    const decode = successEnvelope();
    const res = makeRes({ status: 200, contentType: 'text/plain', text: 'ok' });
    expect(expectUnrecognized(await decode(res, ctx))).toEqual({
      kind: 'unrecognized',
      status: 200,
      body: 'ok',
    });
  });

  test('a non-boolean success flag is unrecognized', async () => {
    const decode = successEnvelope();
    const res = makeRes({
      status: 200,
      contentType: 'application/json',
      text: '{"success":1}',
    });
    expect(expectUnrecognized(await decode(res, ctx))).toEqual({
      kind: 'unrecognized',
      status: 200,
      body: { success: 1 },
    });
  });

  test('malformed JSON is unrecognized', async () => {
    const decode = successEnvelope();
    const res = makeRes({
      status: 200,
      contentType: 'application/json',
      text: '<html>',
    });
    expect(expectUnrecognized(await decode(res, ctx))).toEqual({
      kind: 'unrecognized',
      status: 200,
      body: '<html>',
    });
  });

  test('a non-2xx response claiming success is unrecognized', async () => {
    const decode = successEnvelope();
    const res = makeRes({
      status: 500,
      contentType: 'application/json',
      text: '{"success":true}',
    });
    expect(expectUnrecognized(await decode(res, ctx))).toEqual({
      kind: 'unrecognized',
      status: 500,
      body: { success: true },
    });
  });

  test('a non-2xx response with an empty body is unrecognized', async () => {
    const decode = successEnvelope();
    const res = makeRes({ status: 500, text: '' });
    expect(expectUnrecognized(await decode(res, ctx))).toEqual({
      kind: 'unrecognized',
      status: 500,
      body: null,
    });
  });

  test('custom keys are used for both success and failure', async () => {
    const decode = successEnvelope({
      success: 'ok',
      data: 'payload',
      code: 'errCode',
      message: 'errMsg',
    });
    const okRes = makeRes({
      status: 200,
      contentType: 'application/json',
      text: '{"ok":true,"payload":[1]}',
    });
    expect(expectSuccess(await decode(okRes, ctx)).data).toEqual([1]);

    const failedRes = makeRes({
      status: 200,
      contentType: 'application/json',
      text: '{"ok":false,"errCode":"E7","errMsg":"bad"}',
    });
    expect(expectFailure(await decode(failedRes, ctx))).toEqual({
      kind: 'failure',
      status: 200,
      failure: { code: 'E7', message: 'bad' },
      message: 'bad',
    });
  });

  test('partial custom keys keep the other defaults', async () => {
    const decode = successEnvelope({ code: 'errCode' });
    const okRes = makeRes({
      status: 200,
      contentType: 'application/json',
      text: '{"success":true,"data":5}',
    });
    expect(expectSuccess(await decode(okRes, ctx)).data).toBe(5);

    const failedRes = makeRes({
      status: 200,
      contentType: 'application/json',
      text: '{"success":false,"errCode":"E9","code":"ignored"}',
    });
    const decoded = expectFailure(await decode(failedRes, ctx));
    expect(decoded.failure).toEqual({ code: 'E9', message: null });
  });
});
