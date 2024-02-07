export type Resource<T extends JSONable> = {
  uri: string;
  value: T | Promise<T>;
};

export type JS<T> = T extends Promise<infer T> ? JS<SimplifiedPromise<T>>
  : (
    & (T extends (...args: infer Args) => infer R ? <Ret = R>(
        ...args: {
          [I in keyof Args]: Args[I] extends infer Arg ?
              | JSable<Arg>
              | (Arg extends null | undefined ? Arg : never)
              | { [AI in keyof Arg]: JSable<Arg[AI]> }
              | (Arg extends
                ((...args: infer AArgs) => infer AR) | null | undefined
                ? JSFn<AArgs, AR>
                : Arg extends JSONable ? Arg
                : never)
            : never;
        }
      ) => JS<Ret>
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
      : T extends JSONLiteral ? unknown
      : T extends Record<any, any> ? { readonly [K in keyof T]: JS<T[K]> }
      : unknown)
    & JSable<T>
  );

export type JSMeta<T> = {
  [typeSymbol]: T;
  [returnSymbol]: false;
  rawJS: string;
  modules: readonly ModuleMeta[];
  resources: readonly Resource<JSONable>[];
  body?: JSFnBody<unknown>;
};
declare const typeSymbol: unique symbol;

export type ModuleMeta = { local: string; pub: string };

export type JSable<T> = { [jsSymbol]: JSMeta<T> };

type SimplifiedGeneric<G> = G extends Promise<infer T> ? SimplifiedPromise<T>
  : never;

type JSableLike<T> =
  | JSable<T>
  | (T extends infer S extends SimplifiedGeneric<T> ? JSable<S> : never);

export type JSFn<Args extends unknown[], T = void> = (
  ...args: { [I in keyof Args]: JS<Args[I]> }
) => JSFnBody<T>;

export type JSFnBody<T> = JSableLike<T> | JSStatements<T>;

export type JSStatements<T> = [
  JSableLike<unknown> | (JSable<T> & JSReturn),
  ...(JSableLike<unknown> | (JSable<T> & JSReturn))[],
];

export type JSStatementsReturn<S extends JSStatements<unknown>> = S extends
  JSNoReturn[] ? JS<void> & JSNoReturn
  : S extends JSStatements<infer T> ? JS<T> & JSReturn
  : never;

export type JSReturn = { [returnSymbol]: true };
export type JSNoReturn = { [returnSymbol]: false };
declare const returnSymbol: unique symbol;

export type ResourceGroup<
  T extends Record<string, JSONable>,
  U extends string,
> = ((v: { [k in ParamKeys<U>]: string | number }) => JS<T>) & {
  pattern: U;
  each: (values: { [k in ParamKeys<U>]: string | number }[]) => Resources<T, U>;
};

export type Resources<T extends Record<string, JSONable>, U extends string> = {
  group: ResourceGroup<T, U>;
  values: Resource<T>[];
};

export type JSONLiteral = string | number | boolean | null;

export type JSONRecord = {
  [member: string]: JSONLiteral | JSONArray | JSONRecord | undefined; // In order to handle optional properties
  [jsSymbol]?: never;
};

export type JSONArray = ReadonlyArray<JSONLiteral | JSONArray | JSONRecord>;

export type JSONable = JSONLiteral | JSONRecord | JSONArray;

export type ImplicitlyJSable =
  | JSONLiteral
  | undefined
  | JSable<any>
  | ImplicitlyJSable[]
  | { [k: string]: ImplicitlyJSable; [jsSymbol]?: never };

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

type SimplifiedPromise<T> = {
  then<R>(
    onFulfilled: (value: T) => R | PromiseLike<R> | null | undefined,
    onRejected?: (reason: any) => R | PromiseLike<R> | null | undefined,
  ): SimplifiedPromise<R>;
  catch<R>(
    onRejected: (reason: any) => R | PromiseLike<R> | null | undefined,
  ): SimplifiedPromise<R>;
  finally<R>(
    onFinally: () => R | PromiseLike<R> | null | undefined,
  ): SimplifiedPromise<R>;
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
