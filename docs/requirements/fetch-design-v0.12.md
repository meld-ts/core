# `@meld-ts/core/fetch` 设计稿 v0.12

> 状态：定稿（2026-11-23）。只写类型签名、错误模型和行为约定，不写实现。
> 来源：2023 年的 `fetch.ts`（initFetch）、后来的 `parse-response.ts` / `unwrap-request.ts`（axios + IResponse 版本）。
> 上一稿：`fetch-design-v0.11.md`。审查意见见 `fetch-design-v0.7-review.md`、`fetch-design-v0.10-review.md`、`fetch-design-v0.11-review.md`。
> 类型原型：`fetch-prototype/`，全文见附录 A。浏览器、只装 @types/node、Bun、DOM + @types/node、DOM + Bun、没有 DOM 六种环境都在 TS 5.9.3 和 7.0.2 下跑过（只有声明，没有实现）。

## v0.12 落地审查修订（2026-11-26）

实现前把附录 A 按本仓库的 `tsconfig`（`isolatedDeclarations`、DOM + Bun types）连同消费端用例实跑了一遍。类型面成立，下面是必须写死的规则；不新增功能。

1. **headers 函数的 content-type 预览不参与合并**（§4.6、§4.7）。原稿把预览用的 `application/json` 放进「本次请求 headers」，再按「实例级 → 本次请求」合并，会盖掉 headers 函数自己返回的 content-type，和「函数返回了就用它的」矛盾。改为：预览只给函数看；合并顺序仍是实例级 → 本次请求（不含预览）；最后才补库的 content-type。
2. **URL 拼接补一个分隔符**（§4.7）。原稿只说「把两头的 `/` 合成一个」；`baseUrl = '/api'`、`path = 'users'` 会拼成 `/apiusers`。改为两侧都没有 `/` 时插入一个。
3. **query 键里的 `[` `]` 不编码**（§4.7）。原稿要求键名写 `'a[]'` 得到 `a[]=1`，但 `encodeURIComponent` 会产出 `a%5B%5D=1`。改为键只保留方括号不编码，其余照常；值仍全编码。
4. **空正文归一成 `null`**（§6.3）。`text.trim() === ''`（含 204/205/304/HEAD）统一返回 `{ body: null, malformedJson: false }`。否则 `successEnvelope` 遇到 204 或 200 空正文永远抛 invalid，`validate: allowNil` 也救不回来。
5. **`successEnvelope` 补默认键与无正文规则**（§6.3）。默认 `success` / `data` / `code` / `message`；2xx 且 `body === null` 返回 `success`、`data: null`。
6. **运行时 `Decoded` 校验要验字段**（§6.1）。只认三个 kind 不够：`failure` / `unrecognized` 的 `status` 必须是有限数字、必需键要在，否则按「不是三种之一」处理成 invalid，没有 cause。
7. **`FetchError` 的构造签名与跨包 `instanceof`**（§5）。补 `FetchErrorOptions`；用 `Symbol.for` 品牌 + `Symbol.hasInstance`，包被装两份时 `instanceof FetchError` 仍成立（和 `allowNil` 同一理由）。
8. **transform 禁止 async**（§4.6、§7.2）。原类型接受 `transform: async (...) => ...`，会推成 `Promise<Promise<R>>`，运行时被拉平，类型撒谎。用 `SyncResult<R>` 在类型层拒绝。
9. **取消的第一处检查提前**（§4.8）。从「调 fetch 之前」改为「收到请求时（拼 URL、调 headers 函数之前）」，避免已取消还产生 headers 函数副作用。
10. **`JSON.stringify` 返回 `undefined` 算用法错误**（§4.7、§6.2）。顶层是函数 / symbol 时 `JSON.stringify` 返回 `undefined`，不能当成「有 json 但没 body」；抛 TypeError，不经过 onError。

配套：`TypeGuard` 不重复导出（用主入口的）；文件布局补 `types.ts` / `allowNil.ts` / `_internal.ts`；文档同步清单补 `typedoc.json` 和 `AGENTS.md`；环境矩阵从一次性原型变成仓库里的常驻 fixture。

## 本版改动

按 `fetch-design-v0.11-review.md` 改了两处措辞，规则没变。

- §5 的来路表：「decode 抛错」和「decode 返回的不是三种之一」拆成两行。后者没有抛错，所以没有 cause。§6.2 的表也有同样的问题，审查没提到，一起改了。
- 下面 v0.11 的改动说明，把「改了四处」更正为「改了五处」。

v0.11 的改动（按 `fetch-design-v0.10-review.md`）：改了五处，都是把没写清的规则写清，没有新功能。

- §5：kind 为 invalid 时，`status` 可能没有。v0.10 的类型写成一定有，是错的：decode 出错、validate 没过时，库拿不到状态码。现在类型是 `number | undefined`。
- §5、§6.1：validate 没过时，`body` 放没过的 data，方便排查。
- §4.7：库补的 content-type 排在最后。实例级和这次请求合并完还没有 content-type，才补。
- §4.4：没有全局 fetch 的环境里，显式写 `createFetcher<MyRes>({})` 也要求给 fetch。原来这样写能绕过检查。
- §6.2：onError 自己抛错，就抛它，顶掉原来要抛的错。

## 1. 目标

把「发请求、读响应、判断成败、校验数据」收进 core，让调用方（尤其是 AI）只做两件事：说清楚要什么数据，处理分好类的错误。

三件事必须写死在库里，不留给调用方现想：

1. **错误分类**：库只抛一种错误 `FetchError`，用 kind 分清网络、HTTP 状态、业务失败、数据不合格四种；取消原样抛出，不混进来（§5）。
2. **信任边界**：响应数据默认是 `unknown`，要变成 `T` 必须经过一个看得见的校验或断言。
3. **取消**：fetch 支持取消的，每个请求都能传 `signal`，取消原样往上抛（§4.8）。

## 2. 分层

```
createFetcher({ fetch, decode, headers })   创建时注入，类型从注入的函数推断

api.request<User>({ path, validate, transform, ... })
  1. 拼 URL、headers、body             库；headers 函数在这一步调用
  2. fetch(url, init) → Res            调用方注入，默认全局 fetch
  3. decode(res) → Decoded             调用方注入，默认没有信封
  4. 分类 → validate → transform        库：唯一判断成败、分类错误的地方
  → 数据，或分好类的错误
```

依赖反转落在两个接口上：`FetchLike`（§4.2）和 `Decoded`（§6）由库定，调用方照着写实现。库不知道请求是谁发的、信封长什么样；分类规则一直在库里，`fetch` 和 `decode` 只管翻译，不判断成败。注入的就是几个函数参数，没有容器，也没有注册表，和 README 的「不过度抽象」不冲突。

`fetch` 不在非 2xx 时 reject，原因和 v0.1 一样：很多后端在 4xx 里也返回信封，业务错误信息在正文里，必须交给 `decode` 和库统一判断。这条写在 `fetch` 的契约里（§4.2）。

## 3. 文件布局

```
src/fetch/
  index.ts             只做星号转发
  errors.ts            FetchError、FetchErrorOptions、FetchErrorOf
  decode.ts            Decoded、Decode、DecodeContext、ResponseLike、BodyRead、readBody、successEnvelope
  types.ts             公开类型：Fetcher、FetcherOptions、SendOptions、ParseOptions、AllowNilOptions、FetchLike……
  allowNil.ts          allowNil（Symbol.for）
  fetcher.ts           createFetcher：拼请求、调 fetch、调 decode、分类、validate、transform
  _internal.ts         内部类型与运行时 helper（不转发，不 import 本模块的普通文件）
  *.test.ts
```

v0.1 的 `parse-response.ts`、`unwrap-request.ts` 不再需要（§7）。`TypeGuard` 不重复导出，用主入口 `@meld-ts/core` 的。

子路径 `@meld-ts/core/fetch`。同步改：`bunup.config.ts` entry、`typedoc.json` entryPoints、`src/browser/index.ts`、`bun run build:exports`、`AGENTS.md`（目录结构 / 分层 / 子路径 / 常用命令）、`README.md` 模块表、`skills/meld-ts-core/SKILL.md`。

## 4. `createFetcher`

### 4.1 签名和泛型

```ts
declare function createFetcher<Res = DefaultRes, Init = DefaultInit, Failure = never>(
  ...args: [DefaultRes] extends [never]
    ? [opts: FetcherOptions<Res, Init, Failure> & RequireFor<Res>]  // 环境里没有全局 fetch：必须传
    : [opts?: FetcherOptions<Res, Init, Failure> & RequireFor<Res>]
): Fetcher<Res, Init, Failure>;
```

三个泛型都靠推断，调用方不用手写：

- `Res`：`fetch` 返回什么。从 `fetch` 推断。
- `Init`：`fetch` 的第二个参数里，除了库放进去的字段，还收哪些参数。比如标准 fetch 的 `credentials`、小程序的 `timeout`。从 `fetch` 推断，决定每次请求的 `body`、`signal`、`init` 能写什么（§4.2）。
- `Failure`：后端说「失败」时带回来的信息，比如错误码、traceId。从 `decode` 的失败分支推断；没有失败分支就是 `never`。

不传 `fetch` 时，`Res`、`Init` 的默认值从使用方环境里的全局 `fetch` 推出来：

```ts
type GlobalFetch = typeof globalThis extends { fetch: infer F } ? F : never;

// 浏览器里是 Response
type DefaultRes = [GlobalFetch] extends [never]
  ? never
  : GlobalFetch extends (...args: never[]) => Promise<infer R> ? R : never;

// 浏览器里是 RequestInit
type DefaultInit = [GlobalFetch] extends [never]
  ? Record<never, never>
  : GlobalFetch extends (input: never, init?: infer I) => unknown ? NonNullable<I> : Record<never, never>;
```

浏览器里推出来的是 DOM 的 `Response` / `RequestInit`；只装了 @types/node，是 undici 的那一套；环境里没有全局 fetch，`Res` 的默认值是 `never`，这时 `fetch` 必须自己给（§4.4）。库自己的声明里一个 DOM 类型都不出现，没有 DOM 的项目也能编译（原型的 `no-dom/` 用 `lib: ["ES2022"]`、`skipLibCheck: false` 验过）。

v0.2 把 `Fetch` 并进 `Res`，理由是「入口统一成标准 RequestInit 以后，fetch 唯一会变的是返回值」，当时说「哪天要吃 RequestInit 以外的参数，再加一个 Init 泛型」。现在库不依赖标准 RequestInit 了，这一天就到了。alova 也是这么做的：每个请求能传的额外参数，类型从 requestAdapter 推断。

### 4.2 `fetch`：发请求

```ts
/** 库会放进 init 的字段：method、headers 一定有；body、signal 可能有，具体类型由 fetch 自己声明。 */
type FetchInit = {
  method: string;
  headers: Record<string, string>;
  body?: unknown;
  signal?: unknown;
};

/** Init：fetch 自己声明的其余参数，从 fetch 的第二个参数推断。 */
type FetchLike<Res, Init> = (url: string, init: Init & FetchInit) => Promise<Res>;
```

- 库自己只定这四个字段：method 是大写；headers 是普通对象，键全小写；body 是 json 序列化后的字符串，或调用方原样传的 body；signal 原样转交。
- 其余字段的类型都从 `fetch` 来。用标准 fetch，`body` 是 `BodyInit`，`signal` 是 `AbortSignal`，`init` 能写 `credentials`、`cache`；用小程序的 fetch，就是它自己声明的那些。fetch 没声明的字段不能传。一种边界要专门处理：fetch 只声明了库的四个字段时，`init` 的额外字段类型是空的；TS 对 `{}` 不做 excess property check，`credentials` 会漏进来。所以没有额外字段时用 `never` 索引（`ExactInit`）把所有键禁掉。
- 还有一个编译器限制：**有全局 fetch**、注入的 fetch 又只声明库的四个字段时，TS 推不出「空的 Init」，会退回全局 fetch 的 `Init`（浏览器里 `init` 仍能写 `credentials`，传进去被自定义 fetch 忽略）。要严格禁止这些键，给 fetch 声明至少一个额外字段（比如 `timeout?: number`），或在没有全局 fetch 的环境使用——后者 `Init` 默认是空，`ExactInit` 生效。
- 自己写 fetch 时，给第二个参数标上类型，比如 `(url: string, init: FetchInit & { timeout?: number; signal?: AbortSignal }) => ...`。要支持取消，signal 也得声明，没声明就传不进去（§4.8）。行内箭头函数不标类型时，额外参数按全局 fetch 的算；没有全局 fetch，就只有库的四个字段。
- 参数还是 `(url, init)` 两个：全局 fetch、node-fetch 这类实现不用包一层就能注入。
- 不用 `Request` 对象：它的 body 是流，axios、小程序这类实现还得先读出来；Node 和 Bun 里 `new Request()` 也不收相对地址。

自定义 `fetch` 要守的契约，和标准 `fetch` 一致：

1. 拿到响应就 resolve，4xx、5xx 也算拿到。axios 默认 4xx 就 reject，要配 `validateStatus: () => true`，不然 HTTP 错误会被当成网络错误。
2. 没拿到响应（断网、DNS、CORS）才 reject。
3. 认 `init.signal`，取消时 reject。

库这边：`fetch` reject 时，如果 signal 已经取消，原样抛 `signal.reason`，和标准 `fetch` 的行为一样，不管注入的是哪个实现（怎么判断取消见 §4.8）；其他情况包成 kind 为 `network` 的 `FetchError`，原错误放 `cause`。库怎么调 fetch、什么时候取默认的 fetch，见 §4.7。

### 4.3 `decode`：翻译响应

```ts
type DecodeContext = {
  readonly url: string;
  readonly method: string;
  readonly signal?: unknown; // 这次请求的 signal，原样转交；类型来自 fetch 的声明，这里只能是 unknown
};

type Decode<Res, Failure> = (
  res: Res,
  ctx: DecodeContext,
) => Decoded<Failure> | Promise<Decoded<Failure>>;
```

`Decoded` 的三种结果、库拿到以后怎么处理，见 §6。这里只说定位：

- 库不认识自定义的 `Res`。读状态码、读正文、认信封，都在 `decode` 里做。
- `decode` 只翻译，不决定抛哪种错，也不校验 `data`。分类在库里（§6），校验是 `validate` 的事（§7）。
- 读标准 `Response` 的正文用 `readBody`（§6），写成 `const { body } = await readBody(res, ctx)`，别直接用 `res.json()`。它返回 `any`，从里面取字段拼 failure，`Failure` 就会推成 `{ code: any }`，等于没约定。

命名用 `decode`，不叫 `envelope`：它干的不只是认信封，还要先从 `Res` 里读出状态码和正文。它和 `fetch`、`validate`、`transform` 一样是动词，连起来读就是一条流水线。以后请求侧要扩展（比如换序列化方式），有 `encode` 对称。

### 4.4 什么时候 `fetch`、`decode` 必须给

```ts
/**
 * Res 推不出来（没有全局 fetch，也没给 fetch）、或者 Res 不是标准响应的结构时，fetch 和 decode 都必须给。
 * 环境里没有全局 fetch 时，显式写了 Res 也要给 fetch。
 */
type RequireFor<Res> = [Res] extends [never]
  ? { fetch: unknown; decode: unknown }
  : [Res] extends [ResponseLike]
    ? [DefaultRes] extends [never]
      ? { fetch: unknown }
      : unknown
    : { fetch: unknown; decode: unknown };
```

- `Res` 不是标准响应的结构（`ResponseLike`，见 §6）：库读不了它，没有默认的 `decode` 可用。node-fetch 这类返回标准响应的实现不算，`decode` 照样可省。
- 环境里没有全局 fetch：没有默认的 `fetch` 可用。这时 `createFetcher` 的参数是必填的，一个参数都不给也会类型报错（§4.1 的签名）。显式写了 `Res`，比如 `createFetcher<MyRes>({})`，也一样要给 `fetch`；`MyRes` 是标准响应的结构时，`decode` 可以不给。

少给哪个，类型直接报 `Property 'decode' is missing`（或 `'fetch'`）。这条也挡住了另一种错：不给 `fetch`，却把 `decode` 的 `res` 标成自定义类型，这时运行时拿到的其实是标准 `Response`。

`createFetcher` 用一个签名加条件类型，不用重载。重载两种顺序都试过：

- 「标准 Response」的重载在前：`fetch` 和 `decode` 都写成行内箭头函数时，`res` 的类型停在第一个重载给的 `Response`，换到第二个重载也改不回来，直接报错。
- 「自定义 Res」的重载在前：能用，但 TS 7 报错只显示最后一个重载，提示变成「AxiosResponse 缺 Response 的字段」，看不出是少了 `decode`。

### 4.5 推断顺序

按 `fetch` → `decode` → `onError` 的顺序写。

`fetch` 是变量，或者参数标了类型，顺序无所谓。行内 `fetch` 放在 `decode` 后面也能编译：`Res` 会停在 `decode` 的 `res` 注解上（比如 `ResponseLike`），不会优先取 `fetch` 的 `Response`，`raw()` 的类型也跟着变宽；如果 `decode` 的 `res` 没标类型，才会因为隐式 `any` 报错。`onError` 同理：用到 `err` 时，`Failure` 必须已经由 `decode` 定下来。推荐顺序仍是 `fetch` → `decode` → `onError`，这样 `Res` 取最具体的 `fetch` 返回类型。

### 4.6 选项和实例

类型以附录 A 的原型为准，这里摘出和用法有关的部分。

```ts
type FetcherOptions<Res, Init, Failure> = {
  /** 绝对地址或相对地址，怎么和 path 拼见 §4.7。 */
  baseUrl?: string;
  /** 静态对象，或每次请求现算的函数（可以 async）。合并规则见 §4.7。 */
  headers?: HeaderValues | ((req: FetchRequest) => HeaderValues | Promise<HeaderValues>);
  fetch?: FetchLike<Res, Init>;     // 默认全局 fetch
  decode?: Decode<Res, Failure>;    // 默认没有信封（§6）
  /** 只管 FetchError（§6.2 的表），参数按 kind 收窄。返回 Error 就改抛它；不返回就抛原错误。 */
  onError?: (err: FetchErrorOf<Failure>) => Error | void;
};

/** 实例级：null / undefined 的键跳过。单次请求：undefined 跳过，null 删掉实例级的同名头。 */
type HeaderValues = Record<string, string | null | undefined>;

/** headers 函数拿到的请求：库已经拼好的部分。 */
type FetchRequest = {
  readonly url: string;                                // 拼好 baseUrl 和 query
  readonly method: string;                             // 大写
  readonly headers: Readonly<Record<string, string>>;  // 本次请求自己的 headers：键已转小写，null / undefined 已去掉；给了 json、本次请求又没写 content-type 时，额外放一个预览用的 content-type: application/json（只给函数看，不参与最终合并）
  readonly body: unknown;                              // json 序列化后的字符串，或原样的 body
};

interface Fetcher<Res, Init, Failure> {
  /** 唯一的请求入口。两个签名按 validate 选，见 §7。 */
  request<T = unknown, R = T | null>(opts: SendOptions<Init> & AllowNilOptions<T, R, Res>): Promise<NoInfer<R>>;
  request<T = unknown, R = T>(opts: SendOptions<Init> & ParseOptions<T, R, Res>): Promise<NoInfer<R>>;
  /** 只发请求、不 decode，拿原始 Res：流式、下载用。 */
  raw(opts: SendOptions<Init>): Promise<Res>;
  /** catch 到的错误用它收窄：按 kind 分，failure 带着推断出来的类型。只认这个实例抛的错。 */
  isFetchError(err: unknown): err is FetchErrorOf<Failure>;
}

type QueryValue = string | number | boolean | null | undefined;

/** request 和 raw 共用：怎么发这个请求。 */
type SendOptions<Init> = {
  method?: string;                     // 默认 GET，不区分大小写
  path: string;
  query?: Record<string, QueryValue | readonly QueryValue[]>;
  headers?: HeaderValues;
  signal?: InitField<Init, 'signal'>;  // 类型从 fetch 来
  init?: ExactInit<Init>;              // fetch 自己的其余参数，类型从 fetch 来；没声明的键不能传
} & (
  | { json?: unknown; body?: never }                     // json 用 `!== undefined` 判断有无；false / 0 / null 都会原样发送
  | { body?: InitField<Init, 'body'>; json?: never }     // body 的类型从 fetch 来；和 json 同时给，类型报错
);

/** Init 里某个字段的类型；fetch 没声明这个字段就是 never，不能传。 */
type InitField<Init, K extends PropertyKey> = K extends keyof NonNullable<Init>
  ? NonNullable<NonNullable<Init>[K]>
  : never;
type InitExtras<Init> = Omit<NonNullable<Init>, 'method' | 'headers' | 'body' | 'signal'>;
/** 没有任何额外字段时用 never 索引禁掉所有键：TS 对 `{}` 不做 excess property check。 */
type ExactInit<Init> = keyof InitExtras<Init> extends never
  ? { [key: string]: never }
  : InitExtras<Init>;
type InitOf<F> = F extends Fetcher<any, infer Init, any> ? Init : never;
type ResOf<F> = F extends Fetcher<infer Res, any, any> ? Res : never;

/** res：这次的原始响应。直接调 request 时是实例的 Res；包装函数里不写第三个泛型就是 unknown。 */
type ParseOptions<T, R, Res = unknown> = {
  validate?: (val: unknown, res: Res) => val is T;  // 只收一个参数的守卫照样能用
  transform?: (input: T, res: Res) => SyncResult<R>; // 必须同步；async 在类型层被拒（§7.2）
};
type AllowNilOptions<T, R, Res = unknown> = {
  validate: AllowNil;
  transform?: (input: T | null, res: Res) => SyncResult<R>;
};
/** 禁止 transform 返回 Promise / thenable：运行时会被 await 拉平，类型却是 Promise<Promise<R>>。 */
type SyncResult<T> = T extends PromiseLike<unknown> ? never : T;
declare const allowNil: unique symbol; // 实现是 Symbol.for('@meld-ts/core/fetch:allowNil')，见 §7
type AllowNil = typeof allowNil;
```

- 只有一个请求入口。`get(path)`、`post(path, json)` 这类写法是项目的习惯，各项目不一样，库不替项目定；§7.3 是范例。
- 一个对象收下所有参数：没有位置参数要记，AI 调用也不会把 transform 和 validate 的位置弄反。
- `request` 的两个签名里，T、R 都有默认值，都接受 1 到 2 个类型参数，所以只写 `<User>` 也能按 validate 选中签名（§7）。
- `extend()` 去掉了：headers 能按请求现算以后，派生实例的用处不大；要换 baseUrl，再建一个实例。

`raw()`：

- 拼请求、headers 函数、GET 带 body 的检查、调用前的取消检查，都和 `request` 一样。
- 拿到响应就原样返回，不管状态码，不 decode，也不分类。
- fetch reject：取消原样抛；其余包成 kind 为 `network` 的 `FetchError`，经过 onError。

`isFetchError`：

- 每个实例用一个 WeakSet 记下自己抛出过的 `FetchError`。onError 换掉了错误，换上来的不在里面，返回 false；onError 原样返回这个错误，照样认。
- `instanceof FetchError` 跨实例都认，但 failure 的类型只能是 unknown。两者不等价（§5）。

不做成 class，原因：

- 扩展点已经有了：怎么发请求换 `fetch`，信封换 `decode`，headers 换函数。再开放继承，就多了一种改行为的办法，子类还会依赖内部实现。
- 继承时泛型得手写，比如 `class MyApi extends Fetcher<Response, RequestInit, MyFailure>`，推断就没了。
- README 写的是「三行能解决的事不封装成类」。

返回的对象可以当 trait 用：方法都是闭包、不用 `this`，可以解构（`const { request } = api`），想要 class 也能 `implTraits(UserService, api)` 混进去。原型里验过类型，bun 跑过运行时。

### 4.7 请求怎么拼

URL：

- path 以 `http://`、`https://` 或 `//` 开头时，不用 baseUrl。
- 否则把 baseUrl 末尾和 path 开头的 `/` 合成一个；两边都没有 `/` 时插入一个（`/api` + `users` → `/api/users`）。没有 baseUrl 就是 path 本身。
- path 里已经带了 `?`，query 用 `&` 接在后面；path 以 `?` / `&` 结尾时不再补分隔符。

query：

- 值是 null / undefined 的键跳过；数组写成重复的键，`a=1&a=2`，数组里的 null / undefined 也跳过。
- number、boolean 用 `String()` 转；按对象里键的顺序拼。不用 `URLSearchParams`：没有 DOM 的环境里没有它。
- 键：`encodeURIComponent` 之后把 `[` `]` 还原成字面（`a%5B%5D` → `a[]`），其余照常。值：完整 `encodeURIComponent`。
- 后端要 `a[]=1`，把键名写成 `'a[]'`；要 `a=1,2`，自己 `join(',')`。不另加序列化选项。

json 和 body：

- 给了 json，就用 `JSON.stringify(json)` 当 body。实例级和这次请求都没给 content-type（不分大小写）时，库补上 `content-type: application/json`，不补 accept。
- `JSON.stringify` 抛错（循环引用、BigInt），原样 reject，不经过 onError。`JSON.stringify` 返回 `undefined`（顶层是函数 / symbol）算用法错误，reject 一个 TypeError，同样不经过 onError。
- GET / HEAD 带了 json 或 body：reject 一个 TypeError，不调 fetch。不同步抛，因为 `request` 返回的是 Promise。
- headers 函数拿到的 `FetchRequest` 里，body 是序列化后的字符串；本次请求没写 content-type 时，headers 里放一个**预览用**的 `content-type: application/json`。这个预览只给函数看，不参与最终合并；函数自己返回 content-type 就用它的。

headers 合并：

- 每一层先把键转小写；同一个对象里大小写重复的键，以后写的为准。
- 先实例级（静态对象，或 headers 函数的结果），再这次请求的 headers（不含上面的预览），后面的覆盖前面的。
- 合并完还没有 content-type，并且这次给了 json，才补 `content-type: application/json`。库补的永远排最后，不会盖掉实例级写的 `application/vnd.api+json`，也不会盖掉 headers 函数返回的 content-type。
- 实例级的值是 null / undefined：跳过。单次请求的值是 undefined：跳过；是 null：删掉实例级的同名头。比如公开接口不带 token，写 `headers: { authorization: null }`。
- headers 函数在拼好 URL、body 之后调用，每次请求调一次。它抛错就原样 reject，不经过 onError。

调 fetch：

- 默认的 fetch 每次请求时才取 `globalThis.fetch`，不在创建时取。测试里 import 之后才 stub 全局 fetch，照样生效。
- 注入的 fetch 按普通函数调用，不带 `this`：注入 `window.fetch` 不会报 Illegal invocation。
- method 转成大写。

### 4.8 取消

- fetch 支持取消的，每个请求都能传 signal。signal 的类型来自 fetch 第二个参数的声明，自己写 fetch 时没声明 signal，就传不进去（§4.2）。
- 库按结构判断取消：signal 上有 boolean 类型的 `aborted`，而且是 true，就算取消。signal 不一定是 AbortSignal，小程序里可能是自己的实现。
- 取消时原样抛 `signal.reason`；reason 是 undefined，就抛一个 `name` 为 `'AbortError'` 的 Error。取消不经过 onError。
- 库在三个地方检查：收到请求时（拼 URL、调 headers 函数之前，已经取消就不继续）、fetch reject 时、decode 结束以后（取消了就丢掉结果）。
- decode 能从 `ctx.signal` 拿到 signal，读正文时可以自己响应取消。
- `AbortSignal.timeout()` 触发时，reason 是 TimeoutError，也按取消原样抛出，不经过 onError。调用处想按超时处理，就认 `err.name === 'TimeoutError'`。

### 4.9 用法

```ts
// 1. 什么都不传：全局 fetch，没有信封
const api = createFetcher({ baseUrl: '/api' });

await api.request({ path: '/users/1' });                                        // unknown
await api.request({ path: '/users/1', validate: isUser });                      // User
await api.request({ path: '/users/1', validate: isUser, transform: (u) => u.name }); // string
await api.request({ method: 'POST', path: '/orders', json: input, validate: isOrder }); // Order
await api.request({ path: '/users/me', validate: or(isUser, isNull) });         // User | null
await api.request({ method: 'DELETE', path: '/users/1', validate: allowNil });   // 204 没正文也不抛
await api.request({ path: '/me', init: { credentials: 'include' } });           // init 的类型来自全局 fetch
await api.raw({ path: '/export' });                                             // Response

// 2. 公司的 IResponse，token 每次请求现取
const api = createFetcher({
  baseUrl: '/api',
  headers: async () => ({ authorization: await getToken() }), // null 就不带
  decode: successEnvelope(),
  onError: (err) => {
    // 带信封的 401（kind 是 failure）和网关直接回的 401（kind 是 status）一起处理。
    // 公司后端要是把未登录放在 200 + errorCode 里，就改成 err.kind === 'failure' && err.failure.code === …
    if (err.status === 401) emitter.emit('unauthorized', err);
  },
});

// 3. 小程序：自己的 fetch，init 和响应都是自己的类型
type MpInit = FetchInit & { body?: string | ArrayBuffer | object; timeout?: number; signal?: AbortSignal }; // AbortSignal 来自项目里的 polyfill

const api = createFetcher({
  fetch: (url: string, init: MpInit) =>
    new Promise<MpResponse>((resolve, reject) => {
      const task = wx.request({
        url,
        method: init.method,
        header: init.headers,
        data: init.body,
        timeout: init.timeout,
        success: resolve, // 4xx / 5xx 也走 success：拿到响应就 resolve
        fail: reject,     // 没拿到响应才 reject
      });
      init.signal?.addEventListener('abort', () => task.abort()); // 认 signal
    }),
  decode: decodeMp, // (res: MpResponse) => Decoded<…>：从 res.statusCode、res.data 读
});
await api.request({ path: '/a', init: { timeout: 5000 } }); // timeout 的类型来自 MpInit

// 4. request<T, R = T>：T 是接口给的结果，R 是 transform 之后的结果
await api.request<User>({ path: '/users/1' });                                   // User（默认查非 null）
await api.request<User, string>({ path: '/users/1', transform: (u) => u.name }); // string
await api.request<User>({ path: '/users/me', validate: allowNil });              // User | null
```

### 4.10 和旧版的差别

和 2023 版比：

- 不可变。去掉 `setBaseUrl` / `setBasicHeaders`；配置在创建时定，要换就再建一个实例。
- 不碰 `document`，没有 401 事件；全局处理放到 `onError`。
- `delete` 不再默认带 `{}` 正文。

和 v0.1 比：

- `FetchResult` 去掉了。正文读取规则挪到 §6 的 `readBody`；要原始响应用 `raw()`。
- 信封从 `createResponseParser` 挪到 `createFetcher`，改名 `decode`；输入从「正文」变成整个 `Res`。

和 v0.2 比：

- 实例只剩 `request`、`raw`、`isManagedResponseError`；`get` / `post` / `put` / `patch` / `delete` / `extend` / `baseUrl` 去掉了。
- `validate` / `transform` 从调用参数变成 request 选项里的字段。
- 实例级 `headers` 可以是函数。
- 类型不再引用 DOM，多了 `Init` 泛型。

和 v0.3 比：

- 不传 `validate` 时运行时查非 null；新增 `allowNil`。

和 v0.4 比：

- 新增 `define`；`allowNil` 改成开关；项目的 get / post 改成包 `define`。

和 v0.5 比：

- 撤掉 `define`；`request` 改成两个重载；`allowNil` 改成写在 validate 上的标记常量，结果是 `T | null`。

和 v0.6 比：

- 签名不变；transform 的参数改叫 `input`；`allowNil` 改成 unique symbol；包装范例改成转发 `<T, R = T>`。

和 v0.7 比：

- `request` 返回 `Promise<NoInfer<R>>`；`onError` 返回 `Error | void`；`readBody` 返回 `{ body, malformedJson }`；`DecodeContext` 带上 `signal`；没有全局 fetch 时 `createFetcher()` 必须传参数。
- `allowNil` 用 `Symbol.for` 创建。
- 补上请求怎么拼（§4.7）、取消（§4.8）、错误经不经过 onError（§6）。

和 v0.8 比：

- validate、transform 多了第二个参数 `res`；新增 `ResOf<F>`。

和 v0.9 比：

- 错误收成一种 `FetchError`，用 kind 区分；`isManagedResponseError` 换成 `isFetchError`。

和 v0.10 比：

- kind 为 invalid 时 `status` 可能没有；没有全局 fetch 时显式写 `Res` 也要给 fetch；content-type 只在实例级和这次请求都没写时补。

和 v0.11 比：没有改规则，只改了 §5、§6.2 两张表的措辞。

## 5. 错误模型

库只抛一种错误 `FetchError`，用 `kind` 区分四种情况。取消、用法错误、validate 和 transform 自己抛的错不归它管，原样抛出（§6.2）。

```ts
type FetchErrorKind = 'network' | 'status' | 'failure' | 'invalid';

/** 构造参数：库内部用；用户做测试替身 / mock 时也能构造。 */
type FetchErrorOptions = {
  kind: FetchErrorKind;
  url: string;
  method: string;
  status?: number;
  failure?: unknown;
  body?: unknown;
  cause?: unknown;
};

class FetchError extends Error {
  readonly name: 'FetchError';
  readonly kind: FetchErrorKind;
  readonly url: string;
  readonly method: string;
  readonly status: number | undefined; // status、failure 一定有；network 没有；invalid 只有「2xx 但认不出」时有
  readonly failure: unknown;           // 只有 failure 有
  readonly body: unknown;              // status：正文。invalid：认不出的正文，或者 validate 没过的 data
  // cause：network 时是 fetch 抛的原错误；decode 抛错时是它抛的错
  constructor(message: string, options: FetchErrorOptions);
}

/** 按 kind 收窄的 FetchError：onError 的参数、api.isFetchError 收窄出来的，都是它。 */
type FetchErrorOf<Failure> = FetchError & (
  | { kind: 'network'; status: undefined }
  | { kind: 'status'; status: number }
  | { kind: 'failure'; status: number; failure: Failure }
  | { kind: 'invalid'; status: number | undefined }
);
```

`FetchError` 带一个 `Symbol.for('@meld-ts/core/fetch:FetchError')` 品牌，并实现 `static [Symbol.hasInstance]`：包被装了两份（比如某个 renderer 自己打包了一份 core）时，`instanceof FetchError` 仍然成立。理由和 `allowNil` 一样——`Symbol.for` 跨副本共享。品牌用构造函数里的 `Object.defineProperty` 装：`isolatedDeclarations` 下自定义 symbol 的类字段无法 emit（TS9038），`in` 判断和 `instanceof` 不受影响。

| kind | 什么时候 | 带什么 |
|---|---|---|
| `network` | 没拿到响应：断网、DNS、CORS | cause |
| `status` | 非 2xx，又不是失败信封 | status、body |
| `failure` | 后端明确说失败（decode 返回 failure），不管状态码 | status、failure；message 来自信封 |
| `invalid` | 2xx 但认不出（不是信封、坏 JSON）、decode 出错、validate 没过 | 看来路，见下 |

invalid 有四种来路，带的东西不一样：

| 来路 | status | body | cause |
|---|---|---|---|
| 2xx 但认不出（decode 返回 unrecognized） | 有 | 认不出的正文 | 无 |
| decode 抛错 | 无 | 无 | decode 抛的错 |
| decode 返回的不是三种之一 | 无 | 无 | 无 |
| validate 没过（含默认的非 null 检查） | 无 | 没过的 data | 无 |

后三种没有状态码，是因为库不认识 `Res`，状态码只能从 decode 的结果里拿：decode 抛错或返回的东西不对，就没有能用的结果；success 分支本来就不带 status。不给 success 补 status：validate 没过时状态码基本都是 200，帮不上排查；真要看，validate 的第二个参数 `res` 就有。为这个让每个 decode 多写一个字段，不值。

```ts
// 全局处理：不收窄也能看状态码
onError: (err) => {
  if (err.status === 401) emitter.emit('unauthorized', err);
},

// 调用处：按 kind 收窄，failure 带着推断出来的类型
try {
  await api.request<Order>({ method: 'POST', path: '/orders', json: input });
} catch (e) {
  // 用 successEnvelope 时 failure 是 { code, message }
  if (api.isFetchError(e) && e.kind === 'failure') toast(e.failure.message ?? e.message);
}
```

为什么收成一种：

- 库自己用不上细分的错误类。分类规则在库里（§6），抛出去以后怎么处理是应用的事；错误类多了，库要维护继承关系，用的人要记一堆名字。
- 应用要的信息都在字段上：kind 分情况，status、failure、body、cause 带细节。按 kind 收窄就能拿到对应字段，不用拿 instanceof 一个个试。
- invalid 不再细分原因（not-envelope、decode-failed、invalid-data）：区别写在 message 里，decode 抛错时还有 cause。应用很少按这个分支处理。
- 也不拆成两种（比如传输错误和响应错误）：kind 已经分开了，多一个类只多一层 instanceof。

跨实例：同一个包副本里的不同 fetcher 实例，`instanceof FetchError` 都认（品牌跨副本也认），kind、status 照样能用，failure 是 unknown。`api.isFetchError` 只认本实例抛的，failure 带着这个实例推断出来的类型（§4.6）。

和旧代码的对应，迁移时用：

| 旧 | 新 |
|---|---|
| `FetchNetworkError` | `kind === 'network'` |
| `HttpResponseError` | `kind === 'status'` |
| `ManagedResponseError`，看 `code` | `kind === 'failure'`，看 `failure.code`（用 successEnvelope 时） |
| `InvalidResponseError`、`ParseResponseError` | `kind === 'invalid'`；要认「库抛的错」就用 `instanceof FetchError` |
| `isManagedResponseError(e)` | `api.isFetchError(e) && e.kind === 'failure'` |
| `isParseResponseError(e)` | `e instanceof FetchError` |
| 错误消息常量 `ERR_*` | 不导出：按 kind 判断，不按消息文本 |

迁移时会断的两处：

- 旧代码对 204 抛 `ManagedResponseError(-1)`（§7.1）。靠 `code === -1` 认 204 的地方要改：新代码默认是 kind 为 invalid（非 null 检查没过），写 `validate: allowNil` 就不抛。
- 按错误消息文本判断的地方：消息不再是 API，改成看 kind。

## 6. `decode` 的结果（原「信封」）

```ts
type Decoded<Failure> =
  | { kind: 'success'; data: unknown }
  | { kind: 'failure'; status: number; failure: Failure; message?: string }
  | { kind: 'unrecognized'; status: number; body: unknown };
```

- `success`：认出是成功。`data` 还没校验。
- `failure`：认出是后端明确说失败，比如信封里 `success: false`。HTTP 状态是 2xx 还是 4xx 都算。`message` 给 `Error.message` 用。
- `unrecognized`：认不出。库按 `status` 分：非 2xx 是 HTTP 错误，2xx 是格式不对。

### 6.1 判断顺序

箭头后面是抛出的 `FetchError` 的 kind。

1. 收到请求时（拼 URL、调 headers 函数之前）、fetch reject 时、decode 结束以后，都先看是不是取消了（§4.8）。
2. `decode` 抛错：已经取消的按取消处理；其余 → `invalid`，原错误放 `cause`。
3. `decode` 返回的不是这三种之一，或者字段不完整 → `invalid`，没有 cause。字段完整指：`success` 有 `data` 键；`failure` / `unrecognized` 的 `status` 是有限数字，`failure` 有 `failure` 键、`unrecognized` 有 `body` 键。比如直接 `return res.json()`，类型是 `any`，编译期查不出来，只能运行时拦；`{ kind: 'failure' }` 少 status 也同样拦。
4. `failure` → `failure`，不管 HTTP 状态。
5. `unrecognized`，非 2xx → `status`。
6. `unrecognized`，2xx → `invalid`。
7. `success`：data 是 undefined 的先换成 null。`validate(data, res)` 不通过 → `invalid`，data 放进 body。不传 validate 时查非 null，这时的错误消息直接提示「这类接口写 `validate: allowNil`」，204 迁移时会常碰到。
8. `transform(data, res)`。

v0.1 修的那个归类错误照样成立：2xx 但正文不是信封（比如代理回的 HTML），`successEnvelope` 认不出，返回 `unrecognized`，走第 6 步。

### 6.2 哪些错误经过 onError

只有 `FetchError` 经过 onError，其余原样 reject。onError 返回 Error 就改抛它，不返回就抛原错误；返回类型是 `Error | void`，null 和 Promise 在类型上进不来。onError 自己抛错，就抛它，顶掉原来要抛的错，库不再包一层。运行时 onError 返回的不是 Error（比如绕过类型返回字符串）就忽略，抛原错误。

| 错误来源 | 抛什么 | 经过 onError |
|---|---|---|
| 取消 | `signal.reason`；没有就抛 name 为 `AbortError` 的 Error | 否 |
| 用法错误：GET / HEAD 带 json 或 body；`JSON.stringify` 抛错；`JSON.stringify` 返回 undefined | TypeError 或原错误 | 否 |
| 没有可用的 fetch（没注入，全局也没有） | TypeError | 否 |
| 需要 decode 却没给（自定义 Res） | TypeError | 否 |
| headers 函数抛错 | 原错误 | 否 |
| fetch reject（没拿到响应），`request` 和 `raw` 都算 | `FetchError`，kind `network`，原错误在 cause | 是 |
| decode 抛错 | `FetchError`，kind `invalid`，原错误在 cause | 是 |
| decode 返回的不是三种之一，或字段不完整 | `FetchError`，kind `invalid`，没有 cause | 是 |
| `failure` | `FetchError`，kind `failure` | 是 |
| `unrecognized`，非 2xx | `FetchError`，kind `status` | 是 |
| `unrecognized`，2xx | `FetchError`，kind `invalid` | 是 |
| validate 不通过，含默认的非 null 检查 | `FetchError`，kind `invalid` | 是 |
| validate 既不是函数也不是 allowNil | TypeError | 否 |
| validate 守卫自己抛错 | 原错误 | 否 |
| transform 抛错 | 原错误 | 否 |

### 6.3 库自带的 decode

库自带的部分，只认标准响应的结构。库不引用 DOM 的 `Response`，用一个最小的结构类型代替，浏览器、Node、Bun 的 `Response` 都满足：

```ts
type ResponseLike = {
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  text(): Promise<string>;
};

type BodyRead = {
  /** 没正文是 null（HEAD / 204 / 205 / 304，或正文空串 / 全是空白）；JSON 解析成功是解析结果；其余是文本，包括声明了 JSON 却解析失败的。 */
  body: unknown;
  /** 声明了 JSON content-type，正文却解析不了。 */
  malformedJson: boolean;
};

/** 读正文：HEAD / 204 / 205 / 304 / 空正文 → null；JSON content-type → 解析结果，解析失败退回文本并标上 malformedJson；其他 → 文本。 */
declare const readBody: (res: ResponseLike, ctx: DecodeContext) => Promise<BodyRead>;

/** { success, data, errorCode, errorMessage } 这一类。字段名可配，默认 success / data / code / message。 */
declare const successEnvelope: (keys?: {
  success?: string; data?: string; code?: string; message?: string;
}) => Decode<ResponseLike, { code: number | string | null; message: string | null }>;
```

JSON content-type：去掉 `charset` 这类参数、转小写以后，是 `application/json`，或者以 `+json` 结尾（比如 `application/problem+json`）。正文是空串或只有空白时，按没有正文处理（`body: null`、`malformedJson: false`），不尝试 `JSON.parse`。

解析失败时退回文本，是为了出错的响应也能看到网关回的 HTML（放在 kind 为 status 的 `FetchError` 的 body 里）。但成功的响应不能这么放过，所以两个 decode 都会看 `malformedJson`。

默认 decode（不传 `decode` 时用）：没有信封。

- 2xx 指 200 到 299。2xx 并且没有 `malformedJson`，返回 `success`，正文就是数据。
- 2xx 但 `malformedJson`：返回 `unrecognized`，抛 kind 为 invalid 的 `FetchError`。不然 `request<User>({ path })` 会拿到一个字符串，类型却是 User。
- 其他状态码，返回 `unrecognized`。

`successEnvelope`：

- 默认键是 `success` / `data` / `code` / `message`；`keys` 只覆盖给出的键。
- 2xx 并且 `body === null`（无正文）：返回 `success`，`data: null`。这样 204 / 200 空正文的 DELETE 接口写 `validate: allowNil` 就能过。
- `body[success] === true` 并且是 2xx：返回 `success`，data 取 `body[data]`（缺这个字段就是 undefined，进 validate 前换成 null）。
- `body[success] === false`，不管状态码：返回 `failure`。code 取 `body[code]`，不是 number 或 string 就是 null；message 取 `body[message]`，不是非空字符串就是 null，`Error.message` 兜底用 `'Request failed.'`。
- 其余都返回 `unrecognized`：正文不是对象、success 不是 boolean、`malformedJson`、非 2xx 却写着 `success: true`。最后这种不返回 success，因为 `Decoded` 的 success 分支不带 status，库拿到以后就没法再按状态码兜底了。

自定义 `Res` 没有现成的 helper，`decode` 自己写：先从 `Res` 里拿出状态码和正文，后面的判断照 `successEnvelope` 写。要不要出一个和传输无关的信封 helper，等真有第二个用自定义 `Res` 的项目再说。

## 7. `validate` / `transform`（原「解析层」）

`request<T, R = T>`：T 是接口给的结果，R 是最终结果。不给 transform 就是 T；给了 `transform: (input: T) => R`，就是 R。这就是 initFetch 早期的做法。

validate 决定 T 怎么验、要不要放行 null，所以预设两个签名，按实际声明的顺序：

```ts
/** validate: allowNil：放行 null，T 变成 T | null，R 默认也跟着变。 */
request<T = unknown, R = T | null>(opts: SendOptions<Init> & {
  validate: AllowNil;
  transform?: (input: T | null, res: Res) => R;
}): Promise<NoInfer<R>>;

/** validate 是守卫，或者不传（默认查非 null）。 */
request<T = unknown, R = T>(opts: SendOptions<Init> & {
  validate?: (val: unknown, res: Res) => val is T;
  transform?: (input: T, res: Res) => R;
}): Promise<NoInfer<R>>;
```

- 两个签名靠 validate 区分，不会同时匹配。allowNil 那个写在前面：TS 7 报错只显示最后一个重载，通用的放最后，写错时看到的是它的报错，更好懂。
- 第二个参数 `res` 是这次的原始响应，类型是实例的 Res（见 §7.4）。
- 返回类型包了 `NoInfer`：结果类型只从泛型、validate、transform 来，不会从变量注解反推。不包的话，`const s: string = await api.request({ path, validate: isUser })` 能编译通过，守卫验成了 User，类型却是 string。`NoInfer` 要 TS 5.4 以上。

### 7.1 validate

| 写法 | 运行时 | 结果类型 |
|---|---|---|
| `request<User>({ path })` | 查非 null | `User` |
| `request({ path })` | 查非 null | `unknown` |
| `request({ path, validate: isUser })` | `isUser` | `User` |
| `request<User>({ path, validate: allowNil })` | 不查 | `User \| null` |
| `request({ path, validate: or(isUser, isNull) })` | 守卫，null 也能过 | `User \| null` |

- 进 validate 之前，data 是 undefined 的一律换成 null。validate 只会看到值或 null，所以 allowNil 的结果是 `T | null`。出错的响应在 decode 那一步就分好类抛了，进不了 validate（§6）。
- 会出现 undefined 的地方：没正文的响应（`readBody` 直接给 null）、信封里缺 `data` 字段、自己写的 decode 返回了 undefined。
- 要校验又允许 null，用 core 的 `or(isUser, isNull)`。

204 默认会抛，这类接口写 `validate: allowNil`。迁移时要留意，老代码对 204 的行为和你可能以为的不一样：axios 给的是空字符串，`resp.data` 不等于 null，接着走到 `!''.success`，抛 `ManagedResponseError('Request failed.', -1)`，根本到不了 notNil。这是 §5 说的那个归类错误。新代码抛 kind 为 invalid 的 `FetchError`，消息里提示写 `validate: allowNil`。

allowNil 用 symbol，不用旧 parseResponse 那样的品牌函数。这是你在 v0.7 补充里提的取舍，按分量排：

1. 收窄：symbol 是单值类型，项目的包装函数里 `opts.validate === allowNil` 就能收窄（§7.3）。品牌函数做不到，`===` 只对单值类型收窄，库得再导出一个 `isAllowNilOptions` 守卫。
2. 品牌函数的好处是和 validate 同形状，库里可以不分情况直接调。新设计里 validate 只是 `TypeGuard`，库里多一个 `=== allowNil` 分支而已；旧代码迁过来，调用处反正都要改（第三个位置参数变成 validate 字段）。两种都不会被当成普通守卫误用。
3. symbol 要补两处：用 `Symbol.for('@meld-ts/core/fetch:allowNil')` 创建，包被装了两份（比如某个 renderer 自己打包了一份 core）也认得出来；库里先判断 `=== allowNil`，再判断是不是函数，两样都不是就 reject 一个 TypeError，写清楚 validate 只收守卫或 allowNil。`Symbol.for` 加 `unique symbol` 注解，在 isolatedDeclarations 下能通过，d.ts 里还是 `unique symbol`（TS 5.9.3、7.0.2 实测）。

### 7.2 transform

```ts
api.request<User>({ path });                                                    // User
api.request<User, string>({ path, transform: (u) => u.name });                  // string
api.request<User, UserVM>({ path, transform: toUserVM });                       // UserVM
api.request<User>({ path, validate: allowNil });                                // User | null
api.request<User, string>({ path, validate: allowNil, transform: (u) => u?.name ?? '' }); // string

// 要读 header：transform 的第二个参数就是 res
api.request<User[], { list: User[]; total: number }>({
  path: '/users',
  transform: (list, res) => ({ list, total: Number(res.headers.get('x-total-count')) }),
});
```

规则：R 默认等于 T；allowNil 时默认是 `T | null`。只写 `<User>` 时，transform 的返回值也得是 User（allowNil 时是 `User | null`）；要转成别的类型，把 R 写出来。

transform 必须同步。返回类型经过 `SyncResult<R>`（`R extends PromiseLike<unknown> ? never : R`）：`transform: async (...) => ...` 在类型层报错。运行时库不 await transform 的返回值，async 会被 Promise 拉平，类型却成了 `Promise<Promise<R>>`，所以直接拒掉。

不写泛型时，T、R 都能推出来：

| 写法 | 结果类型 |
|---|---|
| `validate: isUser, transform: (u) => u.name` | `string` |
| `transform: toUserVM`，`toUserVM` 是 `(u: User) => UserVM` | `UserVM` |
| `validate: allowNil, transform: toUserVMOrNull` | `UserVM \| null` |
| `transform: (u: User) => u.name` | `string` |
| `transform: (x) => Number(x)` | `number`，`x` 是 `unknown` |

transform 自己抛的错不包装，原样上抛，不经过 onError（§6.2）。

### 7.3 项目自己的 get / post

照 `request<T, R = T>` 转发两个泛型，initFetch 早期就是这么包的：

```ts
type SendOpts = Omit<SendOptions<InitOf<typeof api>>, 'method' | 'path' | 'json' | 'body'>;

export const get = <T = unknown, R = T>(path: string, opts?: SendOpts & ParseOptions<T, R>) =>
  api.request<T, R>({ ...opts, path });

await get<User>('/users/1');                                       // User
await get<User, string>('/users/1', { transform: (u) => u.name }); // string
```

这样包出来的 get 也继承了 `NoInfer`，变量注解一样反推不了结果类型。

包装函数里 `ParseOptions<T, R>` 不写第三个泛型，transform 拿到的 res 是 unknown。要具体类型，写 `ParseOptions<T, R, ResOf<typeof api>>`。

也要 allowNil，就照抄两个签名。实现里靠 `opts.validate === allowNil` 收窄，不用写 `as`：

```ts
export function post<T = unknown, R = T | null>(path: string, json: unknown, opts: SendOpts & AllowNilOptions<T, R>): Promise<R>;
export function post<T = unknown, R = T>(path: string, json?: unknown, opts?: SendOpts & ParseOptions<T, R>): Promise<R>;
export function post(
  path: string,
  json?: unknown,
  opts?: SendOpts & (AllowNilOptions<unknown, unknown> | ParseOptions<unknown, unknown>),
): Promise<unknown> {
  // 两个分支一模一样，是为了让 TS 分别按两个签名检查。合并成一行会编译不过。
  if (opts?.validate === allowNil) return api.request({ ...opts, method: 'POST', path, json });
  return api.request({ ...opts, method: 'POST', path, json });
}

await post<Order>('/orders', input, { validate: allowNil });                  // Order | null
await post<Order, number>('/orders', input, { transform: (o) => o.total });   // number
```

### 7.4 其余

- v0.1 的 `parseResponse` / `unwrapRequest` / `createResponseParser` 都去掉了：`request` 自己就能按 validate 选结果。
- v0.1 那几个重载对应过来：identity 和 trusted 是 `request<User>()`；transform 是 `request<User, R>({ transform })`，第二个参数 resp 对应 `res`；守卫是 `validate: isUser`；allowNil 是 `validate: allowNil`。
- 不导出 `notNil`：不传 validate 就是 notNil。
- validate、transform 的第二个参数 `res`：和旧 API 的 resp 一样，是这次的原始响应。
  - 类型是实例的 Res：默认 fetch 是 `Response`，自定义 fetch 就是它自己的响应类型。
  - res 的正文已经被 decode 读过了，只能读状态码、headers 这些。
  - 这个参数是可选的，只收一个参数的守卫和 transform 照样能用。
  - 有了它，分页总数这类放在 header 里的信息，transform 里就能读。`raw()` 替代不了这个用法，因为它跳过了 decode 和错误分类。

## 8. 已定：显式写 `request<User>()` 放行

不传 `validate` 时，运行时只查非 null；写了 `<User>`，结果就是 `User`，等于断言，调用处看得见。要放行 null，写 `validate: allowNil`（§7.1）。

返回类型包了 `NoInfer` 以后（§7），断言只能写在 `request<…>` 上，不能写在变量注解上：`const u: User = await api.request({ path })` 会报错，因为 unknown 赋不给 User。

拦住显式泛型的方案原型里试过：只拦得住直接调 `request`，项目自己包的 `post<User>()` 不传第三个参数时照样拦不住，类型还更绕，所以不做。

显式写了 R 又没给 transform，比如 `request<User, string>({ path })`，运行时返回的是 User，类型却是 string。不处理：不会这样用。

## 9. 不做的事

- 不做 `get` / `post` 这类快捷方法：写法是项目的习惯，项目自己包（§7.3）。
- 不内置重试、超时、缓存、去重：用 `retry` / `timeout` 包 `() => api.request(...)`。用 `AbortSignal.timeout()` 也行，它按取消处理（§4.8）。
- 不内置拦截器体系：需要时注入自己的 `fetch`；要现算的 headers 用函数。
- 不做 SSE / 流式：用 `raw()` 拿原始 `Res`，调用方自己读。

## 10. 验证

- 每个文件一个测试文件，`fetch` 通过 `FetcherOptions.fetch` 注入假实现。
- 保持仓库现有的 100% 覆盖率。
- 行为测试，按 §4.7、§4.8、§6 逐条写：
  - URL 和 query 的拼法（含 `/api` + `users`、`a[]=1`、已有 `?`）；json 补 content-type；headers 的合并顺序，单次请求写 null 删掉实例级的头；headers 函数返回 content-type 时不被预览盖掉；
  - 默认 fetch 每次请求时才取，测试里后 stub 的全局 fetch 生效；注入的 fetch 不带 this 调用；
  - 取消的三个检查点；reason 是 undefined 时抛 AbortError；
  - §6.2 表里的每一行：抛的是什么、kind 对不对，onError 有没有被调到；`isFetchError` 只认本实例；onError 自己抛错时抛的是它；onError 返回非 Error 时忽略；
  - §5 invalid 四种来路各自的 status、body、cause；decode 返回字段不完整时按 invalid 处理；
  - 实例级写了 content-type（静态对象和 headers 函数两种）时，发 json 不补；
  - `readBody` 的空正文（204 / 200 空串 / 纯空白）与 `malformedJson`；默认 decode 和 `successEnvelope` 在 2xx 坏 JSON、非 2xx 写着 success: true 时返回 `unrecognized`；`successEnvelope` 的 204 / 200 空正文返回 success null；默认键与自定义键；
  - `allowNil` 用 `Symbol.for` 创建，validate 既不是 allowNil 也不是函数时 reject TypeError。
- 类型测试，用仓库现有的 `Eq` / `Assert` / `@ts-expect-error` 写法（与 `src/a11y/types.test.ts` 一致）：
  - `createFetcher` 的推断：v0.2 那些照旧；没有全局 fetch 时 `createFetcher()` 报错，浏览器里不报；没有全局 fetch 时 `createFetcher<MyRes>({})` 也报错，给了 fetch 就不报。
  - `Init`：用标准 fetch 时 `init` 能写 `credentials`、不能写 `timeout`；自定义 fetch 的 `init` 跟着它声明的额外字段，没声明额外字段时在没有全局 fetch 的环境里任何键都不能传（有全局 fetch 时受 §4.2 最后一条编译器限制影响，会退回全局 Init）；行内 fetch 不标类型时，`init` 至少有 method、headers、body。
  - `request` 的两个签名：§7.1、§7.2 里的每一种写法；只写 `<User>` 时 transform 返回别的类型会报错；`json` 和 `body` 互斥；async transform 报错。
  - 结果类型不从变量注解反推：§7 那种写法报错，项目照 §7.3 包的 get 也一样。
  - `res`：默认 fetch 时是 Response，自定义 fetch 时是它的响应类型；只收一个参数的守卫照样能用；包装函数写 `ResOf<typeof api>` 能拿到具体类型。
  - onError 写成 async 函数会报错。
  - `FetchErrorOf`：按 kind 收窄后 status、failure 的类型对，invalid 的 status 是 `number | undefined`；`err.status === 401` 不收窄也能写；`api.isFetchError` 收窄出来的 failure 带推断类型，`instanceof FetchError` 的是 unknown。
  - 项目自己包的 `get`（转发 `<T, R>`）和 `post`（照抄两个签名、实现不用 `as`），推断不丢。
  - headers 函数，含 async。
  - `implTraits` 混进 class 以后类型照旧。
- 环境矩阵放进仓库，成为常驻 fixture：`test/fetch-env/{dom,node,bun,dom-node,dom-bun,no-dom}/`；每个目录一份 `tsconfig.json` + `index.ts`，由 `scripts/fetch-env-check.ts` 逐个跑 `tsc -p`。CI 的 `ts-matrix` 三档各自跑一遍。`no-dom` 用 `lib: ["ES2022"]`、`types: []`、`skipLibCheck: false`，并断言 `createFetcher()`、`createFetcher<MyRes>({})` 报错、给了 fetch 不报。
- 公开面快照：`src/fetch/public-surface.test.ts` 读 `dist/fetch/index.d.ts`，钉住名字集合（做法同 `src/a11y/public-surface.test.ts`）。
- `bun run lint`、`bun run ts-check`、`bun run test`、`bun run build`、`bun run test:fetch-env` 全过。

## 附录 A：类型原型（已实测）

`fetch-prototype/fetch.ts` 全文。正文里的类型以它为准；实测用例见同目录的 `use.ts`、`request.ts`、`review.ts`、`res.ts`、`zero-dom.ts`、`no-dom/`。

```ts
// @meld-ts/core/fetch 设计稿 v0.12 的类型签名：只有声明，没有实现。
// 平台无关：这个文件不引用任何 DOM 类型（RequestInit、Response、AbortSignal……），
// 默认值从使用方环境里的全局 fetch 推出来。跑法见 use.ts、no-dom/use.ts 开头。
// TypeGuard 不在这里导出：用主入口 @meld-ts/core 的。

type MaybePromise<T> = T | Promise<T>;
type SyncResult<T> = T extends PromiseLike<unknown> ? never : T;

// ---- §4.2 fetch ----

/** 库会放进 init 的字段：method、headers 一定有；body、signal 可能有，具体类型由 fetch 自己声明。 */
export type FetchInit = {
  method: string;
  headers: Record<string, string>;
  body?: unknown;
  signal?: unknown;
};

/** Init：fetch 自己声明的其余参数（body 的类型、signal、credentials、timeout……），从 fetch 的第二个参数推断。 */
export type FetchLike<Res, Init> = (url: string, init: Init & FetchInit) => Promise<Res>;

/** 使用方环境里的全局 fetch（浏览器、Node、Bun 各自声明）；没有就是 never。只用来算默认值。 */
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

// ---- §4.3 / §6 decode ----

/** 读标准响应用到的最小结构：浏览器、Node、Bun 的 Response 都满足。 */
export type ResponseLike = {
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  text(): Promise<string>;
};

export type DecodeContext = {
  readonly url: string;
  readonly method: string;
  /** 这次请求的 signal，原样转交；类型来自 fetch 的声明，这里只能是 unknown。 */
  readonly signal?: unknown;
};

export type Decoded<Failure> =
  | { kind: 'success'; data: unknown }
  | { kind: 'failure'; status: number; failure: Failure; message?: string }
  | { kind: 'unrecognized'; status: number; body: unknown };

export type Decode<Res, Failure> = (
  res: Res,
  ctx: DecodeContext,
) => MaybePromise<Decoded<Failure>>;

/** readBody 的结果。 */
export type BodyRead = {
  /** 没正文是 null；JSON 解析成功是解析结果；其余是文本，包括声明了 JSON 却解析失败的。 */
  body: unknown;
  /** 声明了 JSON content-type，正文却解析不了。 */
  malformedJson: boolean;
};

export declare const readBody: (res: ResponseLike, ctx: DecodeContext) => Promise<BodyRead>;

export type SuccessEnvelopeFailure = { code: number | string | null; message: string | null };

export declare const successEnvelope: (keys?: {
  success?: string;
  data?: string;
  code?: string;
  message?: string;
}) => Decode<ResponseLike, SuccessEnvelopeFailure>;

// ---- §5 错误：库只抛一种错误，kind 区分 ----

export type FetchErrorKind = 'network' | 'status' | 'failure' | 'invalid';

/** 构造参数：库内部用；用户做测试替身 / mock 时也能构造。 */
export type FetchErrorOptions = {
  kind: FetchErrorKind;
  url: string;
  method: string;
  status?: number;
  failure?: unknown;
  body?: unknown;
  cause?: unknown;
};

/** 库抛的唯一一种错误。字段按 kind 收窄要用 FetchErrorOf（onError、api.isFetchError 给的就是它）。 */
export declare class FetchError extends Error {
  readonly name: 'FetchError';
  readonly kind: FetchErrorKind;
  readonly url: string;
  readonly method: string;
  /** status、failure 一定有；network 没有；invalid 只有「2xx 但认不出」时有（库不认识 Res，状态码只能从 decode 的结果里拿）。 */
  readonly status: number | undefined;
  /** 只有 failure 有：decode 推断出来的 Failure。 */
  readonly failure: unknown;
  /** status：正文。invalid：认不出的正文，或者 validate 没过的 data。其余没有。 */
  readonly body: unknown;
  constructor(message: string, options: FetchErrorOptions);
}

/** 按 kind 收窄的 FetchError。 */
export type FetchErrorOf<Failure> = FetchError &
  (
    | { readonly kind: 'network'; readonly status: undefined }
    | { readonly kind: 'status'; readonly status: number }
    | { readonly kind: 'failure'; readonly status: number; readonly failure: Failure }
    | { readonly kind: 'invalid'; readonly status: number | undefined }
  );

// ---- §4.6 选项 ----

/** headers 函数拿到的请求：库已经拼好的部分。 */
export type FetchRequest = {
  /** 拼好 baseUrl 和 query。 */
  readonly url: string;
  /** 大写。 */
  readonly method: string;
  /** 本次请求自己的 headers：键已转小写，null / undefined 已去掉；给了 json、本次请求又没写 content-type 时，额外放一个预览用的 content-type: application/json（只给函数看，不参与最终合并）。 */
  readonly headers: Readonly<Record<string, string>>;
  /** json 序列化后的字符串，或原样的 body；没有就是 undefined。 */
  readonly body: unknown;
};

/** 实例级：null / undefined 的键跳过。单次请求：undefined 跳过，null 删掉实例级的同名头。 */
export type HeaderValues = Record<string, string | null | undefined>;

export type FetcherOptions<Res, Init, Failure> = {
  baseUrl?: string;
  headers?: HeaderValues | ((req: FetchRequest) => MaybePromise<HeaderValues>);
  fetch?: FetchLike<Res, Init>;
  decode?: Decode<Res, Failure>;
  /** 只管 FetchError。返回 Error 就改抛它；不返回就抛原错误。async 函数类型上不收。 */
  onError?: (err: FetchErrorOf<Failure>) => Error | void;
};

/**
 * Res 推不出来（没有全局 fetch，也没给 fetch）、或者 Res 不是标准响应的结构时，fetch 和 decode 都必须给。
 * 环境里没有全局 fetch 时，显式写了 Res 也要给 fetch。
 */
export type RequireFor<Res> = [Res] extends [never]
  ? { fetch: unknown; decode: unknown }
  : [Res] extends [ResponseLike]
    ? [DefaultRes] extends [never]
      ? { fetch: unknown }
      : unknown
    : { fetch: unknown; decode: unknown };

// ---- §4.6 实例 ----

type QueryValue = string | number | boolean | null | undefined;
type CleanInit<Init> = NonNullable<Init>;
/** Init 里某个字段的类型；fetch 没声明这个字段就是 never（不能传）。 */
type InitField<Init, K extends PropertyKey> = K extends keyof CleanInit<Init>
  ? NonNullable<CleanInit<Init>[K]>
  : never;
type InitExtras<Init> = Omit<CleanInit<Init>, 'method' | 'headers' | 'body' | 'signal'>;
/** 没有任何额外字段时用 never 索引禁掉所有键：TS 对 `{}` 不做 excess property check。 */
type ExactInit<Init> = keyof InitExtras<Init> extends never
  ? { [key: string]: never }
  : InitExtras<Init>;

/** request 和 raw 共用：怎么发这个请求。 */
export type SendOptions<Init> = {
  /** 默认 GET，不区分大小写。 */
  method?: string;
  path: string;
  query?: Record<string, QueryValue | readonly QueryValue[]>;
  headers?: HeaderValues;
  signal?: InitField<Init, 'signal'>;
  /** fetch 自己的其余参数，类型从 fetch 推断；没声明的键不能传。 */
  init?: ExactInit<Init>;
} & ({ json?: unknown; body?: never } | { body?: InitField<Init, 'body'>; json?: never });

/**
 * request<T, R = T>：T 是接口给的结果，R 是最终结果。
 * 不给 transform 就是 T；给了 transform: (input: T) => R，就是 R。
 * 第二个参数 res 是这次的原始响应（Res）：正文已经被 decode 读过，只能读状态码、headers 这些。
 * 直接调 request 时 Res 就是实例的 Res；项目包装函数里不写第三个泛型，res 是 unknown。
 */
export type ParseOptions<T, R, Res = unknown> = {
  /** 守卫。不传时运行时只查非 null（沿用 parseResponse 的 notNil），结果按 T 走。只收一个参数的守卫照样能用。 */
  validate?: (val: unknown, res: Res) => val is T;
  /** 必须同步；async 在类型层被拒（SyncResult）。 */
  transform?: (input: T, res: Res) => SyncResult<R>;
};

/**
 * 放行 null 的标记。实现是 Symbol.for('@meld-ts/core/fetch:allowNil')：包被装了两份也认得出来。
 * 用 symbol，包装函数里 `opts.validate === allowNil` 就能收窄。
 */
export declare const allowNil: unique symbol;
export type AllowNil = typeof allowNil;

/** validate: allowNil：放行 null，T 变成 T | null，R 默认也是 T | null。 */
export type AllowNilOptions<T, R, Res = unknown> = {
  validate: AllowNil;
  transform?: (input: T | null, res: Res) => SyncResult<R>;
};

export interface Fetcher<Res, Init, Failure> {
  /** validate: allowNil：放行 null，结果是 T | null。NoInfer：结果类型不从变量注解反推。 */
  request<T = unknown, R = T | null>(opts: SendOptions<Init> & AllowNilOptions<T, R, Res>): Promise<NoInfer<R>>;
  /** validate 是守卫，或者不传（默认查非 null）：结果是 T。 */
  request<T = unknown, R = T>(opts: SendOptions<Init> & ParseOptions<T, R, Res>): Promise<NoInfer<R>>;
  /** 只发请求、不 decode，拿原始 Res：流式、下载用。 */
  raw(opts: SendOptions<Init>): Promise<Res>;
  /** catch 到的错误用它收窄：按 kind 分，failure 带着推断出来的类型。只认这个实例抛的错。 */
  isFetchError(err: unknown): err is FetchErrorOf<Failure>;
}

// biome-ignore lint/suspicious/noExplicitAny: 只取 Init，其余位置不关心
export type InitOf<F> = F extends Fetcher<any, infer Init, any> ? Init : never;
// biome-ignore lint/suspicious/noExplicitAny: 只取 Res，其余位置不关心
export type ResOf<F> = F extends Fetcher<infer Res, any, any> ? Res : never;

/** 环境里没有全局 fetch 时，参数必填（不传参数类型就报错）。 */
export declare function createFetcher<Res = DefaultRes, Init = DefaultInit, Failure = never>(
  ...args: [DefaultRes] extends [never]
    ? [opts: FetcherOptions<Res, Init, Failure> & RequireFor<Res>]
    : [opts?: FetcherOptions<Res, Init, Failure> & RequireFor<Res>]
): Fetcher<Res, Init, Failure>;
```

## 附录 B：旧 parseResponse（只用来对照迁移）

这是你补的经过改造后的 parseResponse，仅做参考。**旧实现，只用来对照迁移。里面有 §5 修掉的归类错误，别照抄。** createFetcher 仍以这份设计稿为准。

照抄会踩的坑：

1. `if (!body.success)`：正文不是信封时（比如代理回的 HTML），`body.success` 是 undefined，会抛 `ManagedResponseError('Request failed.', -1)`。这就是 §5 说要修的错误。
2. `resp.data == null` 算 non-response：新设计里没有这个状态了，204 的数据是 null，走的是 validate。
3. `throw overrideErr ?? error`：onError 返回 null 时保留原错误。新设计 onError 的返回类型是 `Error | void`，null 在类型上进不来。
4. `isManagedResponseError = (err) => err instanceof …` 返回 boolean，不是类型谓词，也不分实例。新设计是 `api.isFetchError(err)`，按 kind 收窄，只认本实例（§4.6、§5）。
5. `validateFn(body.data, resp)` 直接调用：新设计里 validate 可能是 symbol，要先判断 `=== allowNil`（§7.1）。

```ts 
/**
 * Keep `parseResponse` overloads in lockstep with `unwrap-request.ts`.
 * `unwrapRequest` is the same argument list after awaiting the request.
 */
import type { AxiosResponse } from 'axios';
import type { IResponse } from '../types';

/** Fallback when the API error envelope has no `errorCode`. */
export const ERR_CODE_NOT_SPECIFIED = -1 as const;
/** Thrown when the Axios response or its `IResponse` envelope is missing. */
export const ERR_NON_RESPONSE = 'Empty response from server.' as const;
/** Thrown when `validate` rejects `body.data`. */
export const ERR_INVALID_RESPONSE_DATA = 'Invalid response data' as const;
/** Fallback message when `success: false` and `errorMessage` is empty. */
export const ERR_EMPTY_ERR_MESSAGE = 'Request failed.' as const;

/**
 * Fail-closed parse failure. `onError` may replace what is thrown.
 */
export class ParseResponseError extends Error {
  constructor(
    message: string,
    public readonly response?: AxiosResponse<IResponse<unknown>> | undefined | null,
  ) {
    super(message);
    this.name = 'ParseResponseError';
  }
}

/**
 * `IResponse.success === false`. `code` is `errorCode`, or {@link ERR_CODE_NOT_SPECIFIED}.
 */
export class ManagedResponseError extends ParseResponseError {
  public code: number | string;

  constructor(
    message: string | undefined | null,
    code: number | string | null | undefined,
    response?: AxiosResponse<IResponse<unknown>>,
  ) {
    super(message || ERR_EMPTY_ERR_MESSAGE, response);
    this.name = 'ManagedResponseError';
    this.code = code ?? ERR_CODE_NOT_SPECIFIED;
  }
}

/**
 * Branded validate that widens the parse result to `T | null`.
 * Runtime still returns boolean only; `__allowNil` is for the type parameter.
 */
export type AllowNilResponseValidate = ((data: unknown, response: AxiosResponse<IResponse<unknown>>) => boolean) & {
  readonly __allowNil: true;
};

/**
 * Narrows envelope `data` (still `unknown` at runtime) to `T`.
 * `T` comes from `AxiosResponse<IResponse<T>>`, not from this callback.
 */
export type ResponseDataValidate<T> = (data: unknown, resp: AxiosResponse<IResponse<T>>) => data is T;

/** Maps accepted `data` to the value `parseResponse` returns. */
export type ResponseDataTransform<T, R> = (data: T, resp: AxiosResponse<IResponse<T>>) => R;

/**
 * Called before a parse error is thrown. Return a value to throw that instead;
 * return nothing / `undefined` to keep the original error.
 */
export type ParseResponseOnError = (error: ParseResponseError) => MaybeError;

type MaybeError = Error | unknown;

export type ParseResponseExtras = {
  onError?: ParseResponseOnError;
};

export type ResponseDataValidate_All<T> = ResponseDataValidate<T> | AllowNilResponseValidate;

/**
 * Internal to `parseResponse` / `unwrapRequest` overloads. Do not import elsewhere.
 *
 * `[V]` wraps the check so it is not distributive. `V extends AllowNilResponseValidate`
 * would split a union `V` (including omitted `validate`, which infers
 * `ResponseDataValidate_All<T>`) and pick `T | null` from the `AllowNilResponseValidate`
 * member. `[V] extends [AllowNilResponseValidate]` is true only when `V` itself is
 * the branded `allowNilResponse`.
 */
export type __ParsedOf<T, V> = [V] extends [AllowNilResponseValidate] ? T | null : T;

/**
 * Opt-in nil: result type becomes `T | null`. Pass as the third argument
 * (`transform` may be `null` / `undefined`).
 */
export const allowNilResponse: AllowNilResponseValidate = Object.assign((_data: unknown) => true, {
  __allowNil: true as const,
});

/** Default validate: reject `null` / `undefined`. */
export const notNilResponse = <T>(data: unknown): data is T => data != null;

const resolveExtras = (extras?: ParseResponseOnError | ParseResponseExtras): ParseResponseExtras =>
  extras == null ? {} : typeof extras === 'function' ? { onError: extras } : extras;

/**
 * Unwrap an {@link IResponse} envelope from Axios.
 *
 * Arguments, in order: `response`, `transform?`, `validate?`, `extras?`.
 * `T` is inferred from `AxiosResponse<IResponse<T>>`. Default `validate` is
 * {@link notNilResponse}. Failures throw {@link ParseResponseError} or
 * {@link ManagedResponseError} (`success: false`).
 *
 * `extras` is only the fourth argument: an `onError` callback, or
 * {@link ParseResponseExtras} (`onError`). Do not pass extras as the second
 * argument.
 *
 * @example Identity — `T` from the response type
 * ```ts
 * const user = parseResponse(resp); // { id: string }
 * ```
 *
 * @example Transform envelope data
 * ```ts
 * const ids = parseResponse(resp, (data) => data.items.map((it) => it.id));
 * ```
 *
 * @example Allow `data: null` (`transform` skipped with `null`)
 * ```ts
 * const user = parseResponse(resp, null, allowNilResponse); // { id: string } | null
 * ```
 *
 * @example Transform after allowing nil
 * ```ts
 * const ids = parseResponse(
 *   resp,
 *   (data) => data?.items ?? [],
 *   allowNilResponse,
 * );
 * ```
 *
 * @example Custom type guard
 * ```ts
 * const isUser = (data: unknown): data is User =>
 *   typeof data === 'object' && data !== null && 'id' in data;
 * const user = parseResponse(resp, null, isUser);
 * ```
 *
 * @example `onError` as the fourth argument (bare function)
 * ```ts
 * parseResponse(resp, mapItems, notNilResponse, (err) => {
 *   log.warn(err);
 *   return err;
 * });
 * ```
 */
export function parseResponse<T>(response: AxiosResponse<IResponse<T>> | undefined | null): T;
export function parseResponse<T, R>(
  response: AxiosResponse<IResponse<T>> | undefined | null,
  transform: ResponseDataTransform<T, R>,
): R;
export function parseResponse<T, V extends ResponseDataValidate_All<T>>(
  response: AxiosResponse<IResponse<T>> | undefined | null,
  transform: undefined | null,
  validate?: V | null,
  extras?: ParseResponseOnError | ParseResponseExtras,
): __ParsedOf<T, V>;
export function parseResponse<T, R, V extends ResponseDataValidate_All<T>>(
  response: AxiosResponse<IResponse<T>> | undefined | null,
  transform: ResponseDataTransform<__ParsedOf<T, V>, R>,
  validate?: V | null,
  extras?: ParseResponseOnError | ParseResponseExtras,
): R;
export function parseResponse<T, R>(
  resp: AxiosResponse<IResponse<T>> | undefined | null,
  transform?: ResponseDataTransform<T, R> | null,
  validate?: ResponseDataValidate_All<T>,
  extras?: ParseResponseOnError | ParseResponseExtras,
): T | R {
  const { onError } = resolveExtras(extras);
  const validateFn = validate ?? notNilResponse;

  const failed = (errOrMsg: ParseResponseError | string) => {
    const error = typeof errOrMsg === 'string' ? new ParseResponseError(errOrMsg, resp) : errOrMsg;
    const overrideErr = onError?.(error);
    throw overrideErr ?? error;
  };

  const succeed = (result: T, _resp: AxiosResponse<IResponse<T>>) => {
    if (transform != null) return transform(result, _resp);
    return result;
  };

  if (resp == null || resp.data == null) return failed(ERR_NON_RESPONSE);

  const body = resp.data;
  if (!body.success) return failed(new ManagedResponseError(body.errorMessage, body.errorCode, resp));

  if (validateFn(body.data, resp)) return succeed(body.data, resp);
  return failed(ERR_INVALID_RESPONSE_DATA);
}

export const isParseResponseError = (err: unknown) => err instanceof ParseResponseError;

export const isManagedResponseError = (err: unknown) => err instanceof ManagedResponseError;

```
