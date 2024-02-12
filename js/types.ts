export type Resource<T extends JSONable> = {
  uri: string;
  value: T | Promise<T>;
};

export type JS<T> =
  & JSable<T>
  & (T extends (...args: infer Args) => infer Ret ? (
      <R = Ret>(
        ...args: {
          readonly [I in keyof Args]: Args[I] extends infer Arg ?
              | JSable<Arg>
              | (Arg extends null | undefined ? Arg : never)
              | { readonly [AI in keyof Arg]: JSable<Arg[AI]> }
              | (Arg extends
                ((...args: infer AArgs) => infer AR) | null | undefined
                ? JSFn<AArgs, AR>
                : Arg extends JSONable ? Arg
                : never)
            : never;
        }
      ) => JS<R>
    )
    : unknown)
  & (T extends readonly unknown[] ? { readonly [I in keyof T]: JS<T[I]> }
    : unknown)
  & (T extends string ? {
      readonly [K in keyof typeof String["prototype"]]: JS<
        typeof String["prototype"][K]
      >;
    }
    : T extends number ? {
        readonly [K in keyof typeof Number["prototype"]]: JS<
          typeof Number["prototype"][K]
        >;
      }
    : T extends bigint ? {
        readonly [K in keyof typeof BigInt["prototype"]]: JS<
          typeof BigInt["prototype"][K]
        >;
      }
    : T extends boolean ? {
        readonly [K in keyof typeof Boolean["prototype"]]: JS<
          typeof Boolean["prototype"][K]
        >;
      }
    : T extends JSGeneric<unknown> ? JSGenericTo<T>
    : T extends {} ? (
        // Only map actual objects to avoid polluting debugging
        {} extends T ? unknown
          : { readonly [K in keyof T]: JS<T[K]> }
      )
    : unknown);

export type JSMeta<T> = {
  readonly [typeSymbol]: T;
  readonly [returnSymbol]: false;
  readonly rawJS: string;
  readonly modules: readonly ModuleMeta[];
  readonly resources: readonly Resource<JSONable>[];
  readonly body?: JSFnBody<unknown>;
};
declare const typeSymbol: unique symbol;

export type ModuleMeta = { readonly local: string; readonly pub: string };

export type JSable<T> = { readonly [jsSymbol]: JSMeta<T> };

export type JSFn<Args extends readonly unknown[], T = void> = (
  ...args: { readonly [I in keyof Args]: JS<Args[I]> }
) => JSFnBody<T>;

export type JSFnBody<T> = JSable<T> | JSStatements<T>;

export type JSWithBody<Args extends readonly unknown[], T> =
  & Omit<JS<(...args: Args) => T>, typeof jsSymbol>
  & {
    readonly [jsSymbol]: Omit<JSMeta<(...args: Args) => T>, "body"> & {
      readonly body: JSFnBody<T>;
    };
  };

export type JSStatements<T> = readonly [
  JSable<unknown> | (JSable<T> & JSReturn),
  ...readonly (JSable<unknown> | (JSable<T> & JSReturn))[],
];

export type JSStatementsReturn<S extends JSStatements<unknown>> = S extends
  readonly JSNoReturn[] ? JS<void> & JSNoReturn
  : S extends JSStatements<infer T> ? JS<T> & JSReturn
  : never;

export type JSReturn = { readonly [returnSymbol]: true };
export type JSNoReturn = { readonly [returnSymbol]: false };
declare const returnSymbol: unique symbol;

export type ResourceGroup<
  T extends Readonly<Record<string, JSONable>>,
  U extends string,
> = ((v: { readonly [k in ParamKeys<U>]: string | number }) => JS<T>) & {
  pattern: U;
  each: (
    values: ReadonlyArray<{ readonly [k in ParamKeys<U>]: string | number }>,
  ) => Resources<T, U>;
};

export type Resources<
  T extends Readonly<Record<string, JSONable>>,
  U extends string,
> = {
  readonly group: ResourceGroup<T, U>;
  readonly values: readonly Resource<T>[];
};

export type JSONLiteral = string | number | boolean | null;

export type JSONRecord = {
  readonly [member: string]: JSONLiteral | JSONArray | JSONRecord | undefined; // In order to handle optional properties
  readonly [jsSymbol]?: never;
};

export type JSONArray = ReadonlyArray<JSONLiteral | JSONArray | JSONRecord>;

export type JSONable = JSONLiteral | JSONRecord | JSONArray;

export type ImplicitlyJSable<T = any> =
  | JSFn<any, any>
  | JSable<T>
  | JSONLiteral
  | undefined
  | readonly ImplicitlyJSable[]
  | { readonly [k: string]: ImplicitlyJSable; readonly [jsSymbol]?: undefined };

export type ExtractImplicitlyJSable<T extends ImplicitlyJSable> = T extends
  JSable<infer T> ? T
  : T extends JSFn<infer Args, infer R> ? (...args: Args) => R
  : T extends {} | readonly unknown[] ? {
      readonly [K in keyof T]: T[K] extends ImplicitlyJSable
        ? ExtractImplicitlyJSable<T[K]>
        : T[K];
    }
  : T;

export const jsSymbol = Symbol("js");

export const isJSable = <T>(v: unknown): v is JSable<T> =>
  v != null && (typeof v === "object" || typeof v === "function") &&
  jsSymbol in v;

export const isEvaluable = <T>(v: unknown): v is JSable<T> =>
  isJSable(v) && !(v[jsSymbol].body && Array.isArray(v[jsSymbol].body));

export const isPure = <T>(v: unknown): v is JSable<T> =>
  isEvaluable(v) && !v[jsSymbol].resources.length;

export const isReactive = <T>(v: unknown): v is JSable<T> =>
  isEvaluable(v) && v[jsSymbol].resources.length > 0;

type JSGeneric<T> = Promise<T>;
type JSGenericTo<T extends JSGeneric<unknown>> = T extends Promise<infer T>
  ? JSPromise<T>
  : never;

type JSPromise<T> = {
  readonly then: <R>(
    onFulfilled: (value: JS<T>) => JSable<R | PromiseLike<R>>,
    onRejected?: (reason: JS<unknown>) => JSable<R | PromiseLike<R>>,
  ) => JS<Promise<R>>;
  readonly catch: <R>(
    onRejected: (reason: JS<unknown>) => JSable<R | PromiseLike<R>>,
  ) => JS<Promise<R>>;
  readonly finally: <R>(
    onFinally: () => JSable<R | PromiseLike<R>>,
  ) => JS<Promise<R>>;
};

// From Hono
// https://github.com/honojs/hono/blob/db3387353f23e0914faf8169323c06e9d9658c20/src/types.ts#L560C1-L572C19
type ParamKeyName<NameWithPattern> = NameWithPattern extends
  `${infer Name}{${infer Rest}` ? Rest extends `${infer _Pattern}?` ? `${Name}?`
  : Name
  : NameWithPattern;

type ParamKey<Component> = Component extends `:${infer NameWithPattern}`
  ? ParamKeyName<NameWithPattern>
  : never;

export type ParamKeys<Path extends string> = Path extends
  `${infer Component}/${infer Rest}` ? ParamKey<Component> | ParamKeys<Rest>
  : ParamKey<Path>;
