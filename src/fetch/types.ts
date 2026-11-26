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
 */
export type RequireFor<Res> = [Res] extends [never]
  ? { fetch: unknown; decode: unknown }
  : [Res] extends [ResponseLike]
    ? [DefaultRes] extends [never]
      ? { fetch: unknown }
      : unknown
    : { fetch: unknown; decode: unknown };

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
  request<T = unknown, R = T | null>(
    opts: SendOptions<Init> & AllowNilOptions<T, R, Res>,
  ): Promise<NoInfer<R>>;
  request<T = unknown, R = T>(
    opts: SendOptions<Init> & ParseOptions<T, R, Res>,
  ): Promise<NoInfer<R>>;
  raw(opts: SendOptions<Init>): Promise<Res>;
  isFetchError(err: unknown): err is FetchErrorOf<Failure>;
}

// biome-ignore lint/suspicious/noExplicitAny: only Init is read
export type InitOf<F> = F extends Fetcher<any, infer Init, any> ? Init : never;
// biome-ignore lint/suspicious/noExplicitAny: only Res is read
export type ResOf<F> = F extends Fetcher<infer Res, any, any> ? Res : never;
