export type Resource<T extends JSONable> = {
  readonly uri: string;
  readonly value: T | PromiseLike<T>;
};

export type JS<T> = _JS<T, []>;

type _JS<T, Depth extends unknown[]> =
  & JSable<T>
  & (T extends NonNullable<JSPrimitive>
    ? { [K in keyof PrimitivePrototype<T>]: JS<PrimitivePrototype<T>[K]> }
    : JSOverride<T> extends never ? (
        & (T extends (...args: infer Args) => infer Ret ? (
            <R = Ret>(...args: { [I in keyof Args]: JSArg<Args[I]> }) => JS<R>
          )
          : T extends unknown[] ? Depth["length"] extends 8 ? unknown // Prevent TS from infinitely recursing
            : { [I in keyof T]: _JS<T[I], [0, ...Depth]> }
          : unknown)
        & (Depth["length"] extends 8 ? unknown // Prevent TS from infinitely recursing
          : T extends Record<any, any> ? (
              // Only map actual objects to avoid polluting debugging
              Record<any, never> extends T ? unknown
                : {
                  [K in keyof T]: K extends "then" ? JSable<T[K]>
                    : _JS<T[K], [0, ...Depth]>;
                }
            )
          : unknown)
      )
    : JSOverride<T>);

export type JSArg<Arg> = _JSArg<Arg, []>;

type _JSArg<Arg, Depth extends unknown[]> =
  | JSable<Arg>
  | (OnlyJSArg<Arg, JSPrimitive> extends infer P extends JSPrimitive ? P
    : never)
  | (Depth["length"] extends 8 ? never // Prevent TS from infinitely recursing
    : OnlyJSArg<Arg, JSMapped> extends infer Filtered extends JSMapped
      ? { [I in keyof Filtered]: _JSArg<Filtered[I], [0, ...Depth]> }
    : never)
  | (OnlyJSArg<Arg, JSFunction> extends ((...args: infer AArgs) => infer AR)
    ? JSFn<AArgs, AR>
    : Arg extends JSONable ? Arg
    : never);

type PrimitivePrototype<T extends NonNullable<JSPrimitive>> = T extends string
  ? typeof String["prototype"]
  : T extends number ? typeof Number["prototype"]
  : T extends bigint ? typeof BigInt["prototype"]
  : T extends boolean ? typeof Boolean["prototype"]
  : never;

type JSArgUnion = JSMapped | JSFunction | JSPrimitive;
type JSPrimitive = string | number | bigint | boolean | null | undefined;
type JSMapped = readonly unknown[] | Record<any, any>;
type JSFunction = Function | Record<any, any>;
type OnlyJSArg<T, Filter> = Exclude<T, Exclude<JSArgUnion, Filter>>;

declare global {
  namespace JSOverrides {
    interface JS<T> {
      // Promise: T extends Promise<infer G> ? JSPromise<G> : never;
    }
  }
}

type JSOverride<T> = JSOverrides.JS<T>[keyof JSOverrides.JS<any>];

export enum JSReplacementKind {
  Argument,
  Ref,
  Module,
  Resource,
}

export type JSReplacement = {
  readonly kind: JSReplacementKind.Argument;
  readonly value: {
    readonly expr: JSable<unknown>;
    name?: string;
  };
} | {
  readonly kind: JSReplacementKind.Ref;
  readonly value: { readonly expr: JSable<EventTarget> };
} | {
  readonly kind: JSReplacementKind.Module;
  readonly value: { readonly url: string };
} | {
  readonly kind: JSReplacementKind.Resource;
  readonly value: Resource<JSONable>;
};

export type JSMeta<T> = {
  readonly [typeSymbol]: T;
  readonly [returnSymbol]: false;
  readonly rawJS: readonly string[];
  readonly replacements: readonly JSReplacement[];
  readonly args?: readonly JSable<unknown>[];
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
    [jsSymbol]: Omit<JSMeta<(...args: Args) => T>, "args" | "body"> & {
      readonly args: { [I in keyof Args]: JSable<Args[I]> };
      readonly body: JSFnBody<T>;
    };
  };

export type JSStatements<T> = [
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
  | JSable<T>
  | JSFn<any, any>
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
