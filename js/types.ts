export type Resource<T extends JSONable> = {
  uri: string;
  value: T | PromiseLike<T>;
};

export type JS<T> =
  & JSable<T>
  & (T extends string ? {
      [K in keyof typeof String["prototype"]]: JS<
        typeof String["prototype"][K]
      >;
    }
    : T extends number ? {
        [K in keyof typeof Number["prototype"]]: JS<
          typeof Number["prototype"][K]
        >;
      }
    : T extends bigint ? {
        [K in keyof typeof BigInt["prototype"]]: JS<
          typeof BigInt["prototype"][K]
        >;
      }
    : T extends boolean ? {
        [K in keyof typeof Boolean["prototype"]]: JS<
          typeof Boolean["prototype"][K]
        >;
      }
    : JSOverride<T> extends never ? (
        & (T extends (...args: infer Args) => infer Ret ? (
            <R = Ret>(
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
            ) => JS<R>
          )
          : T extends unknown[] ? { [I in keyof T]: JS<T[I]> }
          : unknown)
        & (T extends {} ? (
            // Only map actual objects to avoid polluting debugging
            {} extends T ? unknown
              : { [K in keyof T]: K extends "then" ? JSable<T[K]> : JS<T[K]> }
          )
          : unknown)
      )
    : JSOverride<T>);

declare global {
  namespace JSOverrides {
    interface JS<T> {
      // Promise: T extends Promise<infer G> ? JSPromise<G> : never;
    }
  }
}

type JSOverride<T> = JSOverrides.JS<T>[keyof JSOverrides.JS<any>];

export enum JSReplacementKind {
  Module,
  Resource,
}

export type JSReplacement =
  & { readonly position: number }
  & ({
    readonly kind: JSReplacementKind.Module;
    readonly value: { readonly url: string };
  } | {
    readonly kind: JSReplacementKind.Resource;
    readonly value: Resource<JSONable>;
  });

export type JSMeta<T> = {
  readonly [typeSymbol]: T;
  readonly [returnSymbol]: false;
  readonly rawJS: string;
  readonly replacements: JSReplacement[];
  readonly body?: JSFnBody<unknown>;
  readonly isOptional?: boolean;
  readonly isThenable?: boolean;
};
declare const typeSymbol: unique symbol;

export type JSable<T> = { readonly [jsSymbol]: JSMeta<T> };

export type JSFn<Args extends readonly unknown[], T = void> = (
  ...args: { [I in keyof Args]: JS<Args[I]> }
) => JSFnBody<T>;

export type JSFnBody<T> = JSable<T> | JSStatements<T>;

export type JSWithBody<Args extends readonly unknown[], T> =
  & Omit<JS<(...args: Args) => T>, typeof jsSymbol>
  & {
    [jsSymbol]: Omit<JSMeta<(...args: Args) => T>, "body"> & {
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

export type JSReturn = { [returnSymbol]: true };
export type JSNoReturn = { [returnSymbol]: false };
declare const returnSymbol: unique symbol;

export type ResourceGroup<
  T extends Readonly<Record<string, JSONable>>,
  U extends string,
> = ((v: { [k in ParamKeys<U>]: string | number }) => JS<T>) & {
  pattern: U;
  each: (
    values: ReadonlyArray<{ [k in ParamKeys<U>]: string | number }>,
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

export type ExtractImplicitlyJSable<T> = ExtractFlat<T> extends infer E
  ? E extends never ? T extends Record<any, any> | readonly unknown[] ? {
        [K in keyof T]: Exact<T[K], T> extends true ? ExtractFlat<T[K]>
          : ExtractImplicitlyJSable<T[K]>;
      }
    : T
  : E
  : never;

type ExtractFlat<T> = T extends JSable<infer T> ? T
  : T extends JSFn<infer Args, infer R> ? (...args: Args) => R
  : T;

type Exact<A, B> = A extends B ? B extends A ? true : false : false;

export const jsSymbol = Symbol("js");

export const isJSable = <T>(v: unknown): v is JSable<T> =>
  v != null && (typeof v === "object" || typeof v === "function") &&
  jsSymbol in v;

export type JSPromise<T> = {
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
