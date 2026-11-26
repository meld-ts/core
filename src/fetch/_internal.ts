/**
 * Runtime check for a plain object (arrays and null excluded).
 *
 * Self-island: keep this copy, do not move it to `guards`. The fetch subpath
 * must not import any other module, so it cannot depend on that entry.
 */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** application/json or application/*+json; parameters such as charset are ignored. */
export const isJsonContentType = (value: string | null): boolean => {
  if (value === null) return false;
  const type = (value.split(';', 1)[0] ?? '').trim().toLowerCase();
  return type === 'application/json' || type.endsWith('+json');
};

/** A single query value; null and undefined keys are skipped. */
export type QueryValue = string | number | boolean | null | undefined;

/** Rejects promise results at the type level: transform must stay synchronous. */
export type SyncResult<T> = T extends PromiseLike<unknown> ? never : T;

export const joinUrl = (baseUrl: string | undefined, path: string): string => {
  if (!baseUrl) return path;
  if (/^(?:https?:)?\/\//i.test(path)) return path;
  const left = baseUrl.replace(/\/+$/, '');
  const right = path.replace(/^\/+/, '');
  if (right === '') return left === '' ? '/' : left;
  return left === '' ? `/${right}` : `${left}/${right}`;
};

const encodeQueryKey = (key: string): string =>
  encodeURIComponent(key).replace(/%5B/gi, '[').replace(/%5D/gi, ']');

export const appendQuery = (
  url: string,
  query: Record<string, QueryValue | readonly QueryValue[]> | undefined,
): string => {
  if (!query) return url;
  const parts: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    const encodedKey = encodeQueryKey(key);
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (item === null || item === undefined) continue;
      parts.push(`${encodedKey}=${encodeURIComponent(String(item))}`);
    }
  }
  if (parts.length === 0) return url;
  // A `?` inside the fragment is not the query; keep the fragment last.
  const hashIndex = url.indexOf('#');
  const base = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const hash = hashIndex === -1 ? '' : url.slice(hashIndex);
  const joined = parts.join('&');
  if (!base.includes('?')) return `${base}?${joined}${hash}`;
  if (base.endsWith('?') || base.endsWith('&'))
    return `${base}${joined}${hash}`;
  return `${base}&${joined}${hash}`;
};

/**
 * Lowercases keys into the target map. undefined skips; null deletes the
 * existing key only when deleteNull is set (per-request headers).
 */
export const collectHeaders = (
  target: Map<string, string>,
  values: Readonly<Record<string, string | null | undefined>> | undefined,
  deleteNull: boolean,
): void => {
  if (!values) return;
  for (const [key, value] of Object.entries(values)) {
    const normalized = key.toLowerCase();
    if (value === undefined) continue;
    if (value === null) {
      if (deleteNull) target.delete(normalized);
      continue;
    }
    target.set(normalized, value);
  }
};

/** Structural check: a signal only needs a boolean aborted flag set to true. */
export const isAborted = (signal: unknown): boolean =>
  typeof signal === 'object' &&
  signal !== null &&
  'aborted' in signal &&
  signal.aborted === true;

export const abortReason = (signal: unknown): unknown =>
  typeof signal === 'object' && signal !== null && 'reason' in signal
    ? signal.reason
    : undefined;

export const throwIfAborted = (signal: unknown): void => {
  if (!isAborted(signal)) return;
  const reason = abortReason(signal);
  if (reason !== undefined) throw reason;
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  throw error;
};

export const MSG_REQUEST_FAILED = 'Request failed.';
export const MSG_INVALID_DATA = 'Invalid response data.';
export const MSG_INVALID_RESPONSE = 'Invalid response.';
export const MSG_NETWORK = 'Network request failed.';
export const MSG_NO_FETCH =
  'No fetch implementation available: pass options.fetch.';
export const MSG_DECODE_REQUIRED =
  'decode is required when Res is not a standard response.';
export const MSG_BODY_NOT_ALLOWED = 'GET and HEAD requests cannot have a body.';
export const MSG_JSON_NOT_SERIALIZABLE = 'json must be JSON-serializable.';
export const MSG_VALIDATE_INVALID =
  'validate must be a type guard or allowNil.';
