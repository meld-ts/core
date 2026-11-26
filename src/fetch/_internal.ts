/** Runtime check for a plain object (arrays and null excluded). */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** application/json or application/*+json; parameters such as charset are ignored. */
export const isJsonContentType = (value: string | null): boolean => {
  if (value === null) return false;
  const type = (value.split(';', 1)[0] ?? '').trim().toLowerCase();
  return type === 'application/json' || type.endsWith('+json');
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
