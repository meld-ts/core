import { isRecord } from './_internal';

export type FetchErrorKind = 'network' | 'status' | 'failure' | 'invalid';

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
