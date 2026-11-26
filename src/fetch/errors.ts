import { isRecord } from './_internal';

/**
 * Why a request failed, as one of four cases. Callers branch on this instead
 * of matching message text or catching subclasses, so the fields that matter
 * (`status`, `failure`, `body`, `cause`) travel with the kind.
 *
 * @example
 * ```ts
 * const label = (kind: FetchErrorKind) => {
 *   if (kind === 'network') return 'offline';
 *   if (kind === 'status') return 'HTTP error';
 *   if (kind === 'failure') return 'rejected by the API';
 *   return 'unusable response';
 * };
 * ```
 */
export type FetchErrorKind = 'network' | 'status' | 'failure' | 'invalid';

/**
 * Constructor input for {@link FetchError}. Public so tests and mocks can build
 * the same error the library throws; only `kind`, `url` and `method` are
 * mandatory, the rest depends on where the failure came from.
 *
 * @example
 * ```ts
 * const err = new FetchError('HTTP 404', {
 *   kind: 'status',
 *   url: '/users/1',
 *   method: 'GET',
 *   status: 404,
 *   body: null,
 * });
 * ```
 */
export type FetchErrorOptions = {
  kind: FetchErrorKind;
  url: string;
  method: string;
  status?: number;
  failure?: unknown;
  body?: unknown;
  cause?: unknown;
};

/**
 * Brand shared across duplicated copies of this package, same rationale as
 * allowNil. `instanceof` must survive a renderer bundling its own copy of core.
 */
const FETCH_ERROR_BRAND: unique symbol = Symbol.for(
  '@meld-ts/core/fetch:FetchError',
);

/**
 * The only error the library throws; `kind` says which of the four cases it is.
 * Cancellation and usage errors stay raw, so a `catch` block only needs to
 * understand this type when it cares about request failures, and one type keeps
 * the classification rules in the library instead of in every caller.
 *
 * `instanceof` works across duplicated copies of the package thanks to the
 * branded symbol below.
 *
 * @example
 * ```ts
 * try {
 *   await api.request({ path: '/x' });
 * } catch (err) {
 *   if (err instanceof FetchError) console.warn(err.kind, err.status);
 * }
 * ```
 */
export class FetchError extends Error {
  readonly name: 'FetchError' = 'FetchError';
  readonly kind: FetchErrorKind;
  readonly url: string;
  readonly method: string;
  readonly status: number | undefined;
  readonly failure: unknown;
  readonly body: unknown;

  static [Symbol.hasInstance](value: unknown): boolean {
    return isRecord(value) && FETCH_ERROR_BRAND in value;
  }

  constructor(message: string, options: FetchErrorOptions) {
    super(
      message,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    // A class field keyed by a custom symbol cannot be emitted under
    // isolatedDeclarations, so the brand is installed on the instance here.
    Object.defineProperty(this, FETCH_ERROR_BRAND, { value: true });
    this.kind = options.kind;
    this.url = options.url;
    this.method = options.method;
    this.status = options.status;
    this.failure = options.failure;
    this.body = options.body;
  }
}

export type FetchErrorOf<Failure> = FetchError &
  (
    | { readonly kind: 'network'; readonly status: undefined }
    | { readonly kind: 'status'; readonly status: number }
    | {
        readonly kind: 'failure';
        readonly status: number;
        readonly failure: Failure;
      }
    | { readonly kind: 'invalid'; readonly status: number | undefined }
  );
