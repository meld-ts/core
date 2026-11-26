/**
 * Pass as `validate` to accept null: the result type becomes `T | null`.
 * Symbol.for keeps it recognizable across duplicated package copies.
 */
export const allowNil: unique symbol = Symbol.for(
  '@meld-ts/core/fetch:allowNil',
);

export type AllowNil = typeof allowNil;
