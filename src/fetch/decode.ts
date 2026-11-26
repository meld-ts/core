import { isJsonContentType, isRecord } from './_internal';

/** Minimal shape shared by browser, Node and Bun responses; no DOM types. */
export type ResponseLike = {
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  text(): Promise<string>;
};

export type DecodeContext = {
  readonly url: string;
  readonly method: string;
  readonly signal?: unknown;
};

export type Decoded<Failure> =
  | { kind: 'success'; data: unknown }
  | { kind: 'failure'; status: number; failure: Failure; message?: string }
  | { kind: 'unrecognized'; status: number; body: unknown };

export type Decode<Res, Failure> = (
  res: Res,
  ctx: DecodeContext,
) => Decoded<Failure> | Promise<Decoded<Failure>>;

export type BodyRead = {
  /**
   * null when there is no body (HEAD / 204 / 205 / 304, or text that is empty
   * or all whitespace); the parsed value when the content type is JSON; the
   * raw text otherwise, including declared JSON that failed to parse.
   */
  body: unknown;
  /** The content type declared JSON but the body did not parse. */
  malformedJson: boolean;
};

export type SuccessEnvelopeFailure = {
  code: number | string | null;
  message: string | null;
};

/**
 * Reads a standard response once, applying the body rules the library relies
 * on: no body for HEAD / 204 / 205 / 304 or blank text, parsed JSON when the
 * content type says JSON, raw text otherwise. A parse failure comes back as
 * text plus `malformedJson` instead of throwing, so a gateway's error page can
 * still reach the status error's `body`.
 *
 * @example
 * ```ts
 * const decode = async (res: ResponseLike, ctx: DecodeContext) => {
 *   const { body, malformedJson } = await readBody(res, ctx);
 *   if (malformedJson) return { kind: 'unrecognized', status: res.status, body };
 *   return { kind: 'success', data: body };
 * };
 * ```
 */
export const readBody: (
  res: ResponseLike,
  ctx: DecodeContext,
) => Promise<BodyRead> = async (res, ctx) => {
  if (
    ctx.method === 'HEAD' ||
    res.status === 204 ||
    res.status === 205 ||
    res.status === 304
  ) {
    return { body: null, malformedJson: false };
  }
  const text = await res.text();
  if (text.trim() === '') return { body: null, malformedJson: false };
  if (!isJsonContentType(res.headers.get('content-type'))) {
    return { body: text, malformedJson: false };
  }
  try {
    const parsed: unknown = JSON.parse(text);
    return { body: parsed, malformedJson: false };
  } catch {
    return { body: text, malformedJson: true };
  }
};

/**
 * Builds a decode for the common `{ success, data, code, message }` envelope;
 * key names are configurable because every backend renames them. Returning a
 * decode keeps the failure shape (`SuccessEnvelopeFailure`) inferred into
 * `onError` and `isFetchError`, so callers never re-check the envelope.
 *
 * @example
 * ```ts
 * const api = createFetcher({
 *   decode: successEnvelope({ code: 'errorCode', message: 'errorMessage' }),
 * });
 * ```
 */
export const successEnvelope: (keys?: {
  success?: string;
  data?: string;
  code?: string;
  message?: string;
}) => Decode<ResponseLike, SuccessEnvelopeFailure> = (keys = {}) => {
  const successKey = keys.success ?? 'success';
  const dataKey = keys.data ?? 'data';
  const codeKey = keys.code ?? 'code';
  const messageKey = keys.message ?? 'message';

  return async (res, ctx) => {
    const { body, malformedJson } = await readBody(res, ctx);
    const ok = res.status >= 200 && res.status <= 299;

    if (malformedJson) {
      return { kind: 'unrecognized', status: res.status, body };
    }
    // A 2xx without a body is a success: DELETE endpoints rely on allowNil.
    if (body === null && ok) return { kind: 'success', data: null };
    if (!isRecord(body)) {
      return { kind: 'unrecognized', status: res.status, body };
    }

    const success = body[successKey];
    if (success === true && ok) {
      return { kind: 'success', data: body[dataKey] };
    }
    if (success === false) {
      const code = body[codeKey];
      const rawMessage = body[messageKey];
      const message =
        typeof rawMessage === 'string' && rawMessage !== '' ? rawMessage : null;
      return {
        kind: 'failure',
        status: res.status,
        failure: {
          code:
            typeof code === 'number' || typeof code === 'string' ? code : null,
          message,
        },
        ...(message === null ? {} : { message }),
      };
    }
    return { kind: 'unrecognized', status: res.status, body };
  };
};
