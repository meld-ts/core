/** biome-ignore-all lint/complexity/noBannedTypes: RequireFor marks required options with `{}`; `unknown` would keep `undefined` */
import type { QueryValue, SyncResult } from './_internal';
import type { AllowNil } from './allowNil';
import type { Decode, ResponseLike } from './decode';
import type { FetchErrorOf } from './errors';

/** The fields the library always writes into the init object. */
export type FetchInit = {
  method: string;
  headers: Record<string, string>;
  body?: unknown;
  signal?: unknown;
};

/** `Init` holds whatever the injected fetch accepts beyond `FetchInit`. */
export type FetchLike<Res, Init> = (
  url: string,
  init: Init & FetchInit,
) => Promise<Res>;

type GlobalFetch = typeof globalThis extends { fetch: infer F } ? F : never;

export type DefaultRes = [GlobalFetch] extends [never]
  ? never
  : GlobalFetch extends (...args: never[]) => Promise<infer R>
    ? R
    : never;

export type DefaultInit = [GlobalFetch] extends [never]
  ? Record<never, never>
  : GlobalFetch extends (input: never, init?: infer I) => unknown
    ? NonNullable<I>
    : Record<never, never>;

/** What a headers function receives: everything the library already built. */
export type FetchRequest = {
  readonly url: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
};

/** Instance level: null and undefined skip. Per request: undefined skips, null deletes. */
export type HeaderValues = Record<string, string | null | undefined>;

export type FetcherOptions<Res, Init, Failure> = {
  baseUrl?: string;
  headers?:
    | HeaderValues
    | ((req: FetchRequest) => HeaderValues | Promise<HeaderValues>);
  fetch?: FetchLike<Res, Init>;
  decode?: Decode<Res, Failure>;
  // biome-ignore lint/suspicious/noConfusingVoidType: callbacks may return nothing
  onError?: (err: FetchErrorOf<Failure>) => Error | void;
};

/**
 * fetch and decode are mandatory when Res cannot be inferred or is not a
 * standard response; fetch alone when there is no global fetch.
 *
 * The required keys are typed `{}`, not `unknown`: `unknown & (T | undefined)`
 * collapses to `T | undefined`, so `fetch: undefined` would pass the check and
 * only blow up as a TypeError on the first request. `{}` removes undefined and
 * null from the intersection.
 */
export type RequireFor<Res> = [Res] extends [never]
  ? { fetch: {}; decode: {} }
  : [Res] extends [ResponseLike]
    ? [DefaultRes] extends [never]
      ? { fetch: {} }
      : unknown
    : { fetch: {}; decode: {} };

type CleanInit<Init> = NonNullable<Init>;
type InitField<Init, K extends PropertyKey> = K extends keyof CleanInit<Init>
  ? NonNullable<CleanInit<Init>[K]>
  : never;
type InitExtras<Init> = Omit<
  CleanInit<Init>,
  'method' | 'headers' | 'body' | 'signal'
>;
/** No extra fields: a never index forbids every key (TS skips excess checks on `{}`). */
type ExactInit<Init> = keyof InitExtras<Init> extends never
  ? { [key: string]: never }
  : InitExtras<Init>;

export type SendOptions<Init> = {
  method?: string;
  path: string;
  query?: Record<string, QueryValue | readonly QueryValue[]>;
  headers?: HeaderValues;
  signal?: InitField<Init, 'signal'>;
  init?: ExactInit<Init>;
} & (
  | { json?: unknown; body?: never }
  | { body?: InitField<Init, 'body'>; json?: never }
);

export type ParseOptions<T, R, Res = unknown> = {
  validate?: (val: unknown, res: Res) => val is T;
  transform?: (input: T, res: Res) => SyncResult<R>;
};

export type AllowNilOptions<T, R, Res = unknown> = {
  validate: AllowNil;
  transform?: (input: T | null, res: Res) => SyncResult<R>;
};

export interface Fetcher<Res, Init, Failure> {
  /**
   * Sends the request, decodes it and classifies every failure into
   * `FetchError`. This is the single entry point on purpose: callers describe
   * the data they want (`validate`) and what to do with it (`transform`), and
   * the library owns the decision of what counts as success.
   *
   * `validate: allowNil` widens the result to `T | null`; without it a null
   * body is rejected so a typed `T` never hides a missing payload.
   *
   * @example
   * ```ts
   * const user = await api.request({ path: '/users/1', validate: isUser });
   * const maybe = await api.request<User>({
   *   path: '/users/me',
   *   validate: allowNil,
   * });
   * ```
   */
  request<T = unknown, R = T | null>(
    opts: SendOptions<Init> & AllowNilOptions<T, R, Res>,
  ): Promise<NoInfer<R>>;
  /**
   * Same request without the nil branch: the guard (or the implicit non-null
   * check) narrows the decoded body to `T`.
   *
   * @example
   * ```ts
   * const user = await api.request({ path: '/users/1', validate: isUser });
   * ```
   */
  request<T = unknown, R = T>(
    opts: SendOptions<Init> & ParseOptions<T, R, Res>,
  ): Promise<NoInfer<R>>;
  /**
   * Sends the request and hands back the raw `Res`, skipping decode and
   * classification. Use it for streams, downloads and responses that never fit
   * a JSON envelope: a non-2xx status is not an error here, while a real fetch
   * failure still goes through `onError` as `network`.
   *
   * @example
   * ```ts
   * const res = await api.raw({ path: '/export' });
   * const total = res.headers.get('x-total-count');
   * ```
   */
  raw(opts: SendOptions<Init>): Promise<Res>;
  /**
   * Narrows a caught value to the errors this instance threw, keeping the
   * `failure` type inferred from `decode`. An error swapped in by `onError`, or
   * a `FetchError` from another instance, is deliberately not recognized.
   *
   * @example
   * ```ts
   * try {
   *   await api.request({ path: '/orders', method: 'POST', json: input });
   * } catch (err) {
   *   if (api.isFetchError(err) && err.kind === 'status') {
   *     console.warn(err.status);
   *   }
   * }
   * ```
   */
  isFetchError(err: unknown): err is FetchErrorOf<Failure>;
}

// biome-ignore lint/suspicious/noExplicitAny: only Init is read
export type InitOf<F> = F extends Fetcher<any, infer Init, any> ? Init : never;
// biome-ignore lint/suspicious/noExplicitAny: only Res is read
export type ResOf<F> = F extends Fetcher<infer Res, any, any> ? Res : never;
