import {
  MSG_BODY_NOT_ALLOWED,
  MSG_DECODE_REQUIRED,
  MSG_INVALID_DATA,
  MSG_INVALID_RESPONSE,
  MSG_JSON_NOT_SERIALIZABLE,
  MSG_NETWORK,
  MSG_NO_FETCH,
  MSG_REQUEST_FAILED,
  MSG_VALIDATE_INVALID,
  appendQuery,
  collectHeaders,
  isRecord,
  joinUrl,
  throwIfAborted,
} from './_internal';
import { allowNil } from './allowNil';
import {
  type Decode,
  type Decoded,
  type ResponseLike,
  readBody,
} from './decode';
import { FetchError, type FetchErrorOf } from './errors';
import type {
  DefaultInit,
  DefaultRes,
  FetchInit,
  FetchLike,
  Fetcher,
  FetcherOptions,
  RequireFor,
  SendOptions,
} from './types';

type InternalRequestOptions<Init, Res> = SendOptions<Init> & {
  validate?: unknown;
  transform?: (input: unknown, res: Res) => unknown;
};

type BuiltRequest<Init> = {
  url: string;
  method: string;
  init: Init & FetchInit;
  signal: unknown;
};

const is2xx = (status: number): boolean => status >= 200 && status <= 299;

const isResponseLike = (value: unknown): value is ResponseLike =>
  isRecord(value) &&
  typeof value.status === 'number' &&
  isRecord(value.headers) &&
  typeof value.headers.get === 'function' &&
  typeof value.text === 'function';

const isDecoded = <Failure>(value: unknown): value is Decoded<Failure> => {
  if (!isRecord(value)) return false;
  switch (value.kind) {
    case 'success':
      return 'data' in value;
    case 'failure':
      return (
        typeof value.status === 'number' &&
        Number.isFinite(value.status) &&
        'failure' in value
      );
    case 'unrecognized':
      return (
        typeof value.status === 'number' &&
        Number.isFinite(value.status) &&
        'body' in value
      );
    default:
      return false;
  }
};

const defaultDecode: Decode<ResponseLike, never> = async (res, ctx) => {
  const { body, malformedJson } = await readBody(res, ctx);
  if (!is2xx(res.status) || malformedJson) {
    return { kind: 'unrecognized', status: res.status, body };
  }
  return { kind: 'success', data: body };
};

const makeInvalid = (
  message: string,
  url: string,
  method: string,
  extra?: { status?: number; body?: unknown; cause?: unknown },
): FetchError =>
  new FetchError(message, { kind: 'invalid', url, method, ...extra });

export function createFetcher<
  Res = DefaultRes,
  Init = DefaultInit,
  Failure = never,
>(
  ...args: [DefaultRes] extends [never]
    ? [opts: FetcherOptions<Res, Init, Failure> & RequireFor<Res>]
    : [opts?: FetcherOptions<Res, Init, Failure> & RequireFor<Res>]
): Fetcher<Res, Init, Failure> {
  // The conditional tuple is either [opts] or [opts?]; no args means defaults.
  const options = (args[0] ?? {}) as FetcherOptions<Res, Init, Failure>;
  const headersOption = options.headers;
  const staticHeaders = (() => {
    if (headersOption === undefined || typeof headersOption === 'function') {
      return undefined;
    }
    const map = new Map<string, string>();
    collectHeaders(map, headersOption, false);
    return map;
  })();
  const onError = options.onError;
  const decodeOption = options.decode;
  const thrown = new WeakSet<object>();

  const fail = (error: FetchError): never => {
    thrown.add(error);
    const replacement = onError?.(error as FetchErrorOf<Failure>);
    // `fail` only builds the kinds whose fields FetchErrorOf declares.
    if (replacement instanceof Error) throw replacement;
    throw error;
  };

  const resolveFetch = (): FetchLike<Res, Init> => {
    const candidate =
      options.fetch ?? (globalThis as { fetch?: unknown }).fetch;
    if (typeof candidate !== 'function') throw new TypeError(MSG_NO_FETCH);
    // Callability is checked above; the public signature constrains the shape.
    return candidate as FetchLike<Res, Init>;
  };

  const buildRequest = async (
    opts: SendOptions<Init>,
  ): Promise<BuiltRequest<Init>> => {
    const signal = opts.signal;
    throwIfAborted(signal);

    const method = (opts.method ?? 'GET').toUpperCase();
    const hasJson = opts.json !== undefined;
    const hasBody = hasJson || opts.body !== undefined;
    if ((method === 'GET' || method === 'HEAD') && hasBody) {
      throw new TypeError(MSG_BODY_NOT_ALLOWED);
    }

    const url = appendQuery(joinUrl(options.baseUrl, opts.path), opts.query);

    let body: unknown;
    if (hasJson) {
      body = JSON.stringify(opts.json);
      if (body === undefined) throw new TypeError(MSG_JSON_NOT_SERIALIZABLE);
    } else {
      body = opts.body;
    }

    const requestOnly = new Map<string, string>();
    collectHeaders(requestOnly, opts.headers, false);
    const preview = new Map(requestOnly);
    if (hasJson && !preview.has('content-type')) {
      preview.set('content-type', 'application/json');
    }

    let instanceHeaders: Map<string, string>;
    if (typeof headersOption === 'function') {
      const values = await headersOption({
        url,
        method,
        headers: Object.fromEntries(preview),
        body,
      });
      instanceHeaders = new Map();
      collectHeaders(instanceHeaders, values, false);
    } else {
      instanceHeaders = new Map(staticHeaders ?? []);
    }

    const merged = new Map(instanceHeaders);
    collectHeaders(merged, opts.headers, true);
    if (hasJson && !merged.has('content-type')) {
      merged.set('content-type', 'application/json');
    }

    // The library fields below always win over whatever init carries.
    const init = {
      ...(opts.init ?? {}),
      method,
      headers: Object.fromEntries(merged),
      ...(body === undefined ? {} : { body }),
      ...(signal === undefined ? {} : { signal }),
    } as Init & FetchInit;

    return { url, method, init, signal };
  };

  const callFetch = async (built: BuiltRequest<Init>): Promise<Res> => {
    const fetchImpl = resolveFetch();
    try {
      return await fetchImpl(built.url, built.init);
    } catch (cause) {
      throwIfAborted(built.signal);
      throw fail(
        new FetchError(MSG_NETWORK, {
          kind: 'network',
          url: built.url,
          method: built.method,
          cause,
        }),
      );
    }
  };

  const raw = async (opts: SendOptions<Init>): Promise<Res> =>
    callFetch(await buildRequest(opts));

  const request = async (
    opts: InternalRequestOptions<Init, Res>,
  ): Promise<unknown> => {
    const built = await buildRequest(opts);
    const res = await callFetch(built);

    if (decodeOption === undefined && !isResponseLike(res)) {
      throw new TypeError(MSG_DECODE_REQUIRED);
    }
    const decodeFn = (decodeOption ?? defaultDecode) as Decode<Res, Failure>;
    // When decode is omitted, RequireFor guarantees Res extends ResponseLike;
    // TS cannot express that correlation between the two generic parameters.

    let decoded: unknown;
    try {
      decoded = await decodeFn(res, {
        url: built.url,
        method: built.method,
        signal: built.signal,
      });
    } catch (cause) {
      throwIfAborted(built.signal);
      throw fail(
        makeInvalid(MSG_INVALID_RESPONSE, built.url, built.method, { cause }),
      );
    }
    throwIfAborted(built.signal);

    if (!isDecoded<Failure>(decoded)) {
      throw fail(makeInvalid(MSG_INVALID_RESPONSE, built.url, built.method));
    }

    if (decoded.kind === 'failure') {
      throw fail(
        new FetchError(decoded.message ?? MSG_REQUEST_FAILED, {
          kind: 'failure',
          url: built.url,
          method: built.method,
          status: decoded.status,
          failure: decoded.failure,
        }),
      );
    }

    if (decoded.kind === 'unrecognized') {
      if (is2xx(decoded.status)) {
        throw fail(
          makeInvalid(MSG_INVALID_RESPONSE, built.url, built.method, {
            status: decoded.status,
            body: decoded.body,
          }),
        );
      }
      throw fail(
        new FetchError(`HTTP ${decoded.status}`, {
          kind: 'status',
          url: built.url,
          method: built.method,
          status: decoded.status,
          body: decoded.body,
        }),
      );
    }

    const data = decoded.data === undefined ? null : decoded.data;
    const validate = opts.validate;

    if (validate === allowNil) {
      // accepted as-is
    } else if (validate === undefined) {
      if (data === null) {
        throw fail(
          makeInvalid(
            `${MSG_INVALID_DATA} Pass validate: allowNil for endpoints that return null.`,
            built.url,
            built.method,
            { body: data },
          ),
        );
      }
    } else if (typeof validate === 'function') {
      // Runtime callability is checked; the public type constrains the shape.
      const guard = validate as (value: unknown, res: Res) => boolean;
      if (!guard(data, res)) {
        throw fail(
          makeInvalid(MSG_INVALID_DATA, built.url, built.method, {
            body: data,
          }),
        );
      }
    } else {
      throw new TypeError(MSG_VALIDATE_INVALID);
    }

    return opts.transform === undefined ? data : opts.transform(data, res);
  };

  const isFetchError = (err: unknown): err is FetchErrorOf<Failure> =>
    typeof err === 'object' && err !== null && thrown.has(err);

  return {
    // The two overloads cannot share one expressible implementation signature;
    // the runtime shape handles both.
    request: request as Fetcher<Res, Init, Failure>['request'],
    raw,
    isFetchError,
  };
}
