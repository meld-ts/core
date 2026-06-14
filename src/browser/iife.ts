import * as MeldTSCore from './index';

/**
 * 实际项目，可以在项目的 global.d.ts 为 global 注入类型：
 *
 * ```ts
 * declare global {
 *   var MeldTS: typeof import('@meld-ts/core/browser');
 * }
 * ```
 */
declare global {
  var MeldTS: typeof MeldTSCore;
}

globalThis.MeldTS = MeldTSCore;
