import type {
  DirectlyStringifiable,
  JSPrimitive,
} from "./stringify/stringify.ts";

export type JS<T> = _JS<T, []>;

type _JS<T, Depth extends unknown[]> =
  & JSable<T>
  & (T extends string ? JS<typeof String["prototype"]>
    : T extends number ? JS<typeof Number["prototype"]>
    : T extends bigint ? JS<typeof BigInt["prototype"]>
    : T extends boolean ? JS<typeof Boolean["prototype"]>
    : T extends symbol ? JS<typeof Symbol["prototype"]>
    : T extends PromiseLike<infer T> ? PromiseLike<JS<Awaited<T>>>
    : JSOverride<T> extends never ? (
        & (T extends (...args: infer Args) => infer Ret ? (
            <R = Ret>(...args: { [I in keyof Args]: JSArg<Args[I]> }) => JS<R>
          )
          : T extends unknown[] ? Depth["length"] extends 8 ? unknown // Prevent TS from infinitely recursing
            : { [I in keyof T]: _JS<T[I], [1, ...Depth]> }
          : unknown)
        & (Depth["length"] extends 8 ? unknown // Prevent TS from infinitely recursing
          : T extends Record<any, any> ? (
              // Only map actual objects to avoid polluting debugging
              Record<any, never> extends T ? unknown
                : { [K in keyof T]: _JS<T[K], [1, ...Depth]> }
            )
          : unknown)
      )
    : JSOverride<T>);

export type JSArg<Arg> = _JSArg<Arg, []>;

type _JSArg<Arg, Depth extends unknown[]> =
  | JSable<Arg>
  | (OnlyJSArg<Arg, JSNative> extends infer P extends JSNative ? P
    : never)
  | (Depth["length"] extends 8 ? never // Prevent TS from infinitely recursing
    : OnlyJSArg<Arg, JSMapped> extends infer Filtered extends JSMapped
      ? { [I in keyof Filtered]: _JSArg<Filtered[I], [1, ...Depth]> }
    : never)
  | (OnlyJSArg<Arg, JSFunction> extends ((...args: infer AArgs) => infer AR)
    ? Fn<AArgs, AR>
    : Arg extends JSONable ? Arg
    : never);

type JSArgUnion = JSMapped | JSFunction | JSNative;
type JSNative = JSPrimitive | DirectlyStringifiable;
type JSMapped = readonly unknown[] | Record<any, any>;
type JSFunction = Function | Record<any, any>;
type OnlyJSArg<T, Filter> = Exclude<T, Exclude<JSArgUnion, Filter>>;

declare namespace JSOverrides {
  interface JS<T> {
    // Promise: T extends Promise<infer G> ? JSPromise<G> : never;
  }
}

export type { JSOverrides };

type JSOverride<T> = JSOverrides.JS<T>[keyof JSOverrides.JS<any>];

export type JSable<T = unknown> =
  & { readonly [jsSymbol]: JSMeta }
  & JSableType<T, boolean>;

export type JSMeta<T = unknown, R = false> = Readonly<JSableType<T, R>> & {
  readonly [jsSymbol]: JSMeta<T, R>;
  scope: JSMeta | null;
  template(): Array<string | JSMeta>;
  thenable?: JSMeta;
  isAwaited?: boolean;
  isntAssignable?: boolean;
  mustDeclare?: boolean;
  readonly hasResources?: boolean;
  readonly isOptional?: boolean;
};

export declare const typeSymbol: unique symbol;

export type JSableType<T, R = false> = {
  [typeSymbol]: T;
  [returnSymbol]: R;
};

export type Fn<Args extends readonly unknown[], T = void> = (
  ...args: { [I in keyof Args]: JS<Args[I]> }
) => JSFnBody<T>;

export type JSFnBody<T = unknown> = JSable<T> | JSStatements<T>;

export type JSStatements<T> = readonly JSable[];
// readonly [
//   JSable | (JSable<T> & JSReturn),
//   ...readonly (JSable | (JSable<T> & JSReturn))[],
// ];

export type JSStatementsReturn<S extends JSStatements<unknown>> = S extends
  readonly JSNoReturn[] ? JS<void> & JSNoReturn
  : S extends JSStatements<infer T> ? JS<T> & JSReturn
  : never;

export type JSReturn = { [returnSymbol]: true };
export type JSNoReturn = { [returnSymbol]: false };
export declare const returnSymbol: unique symbol;

export type ResourceGroup<
  T extends Readonly<Record<string, JSONable>>,
  U extends string,
> = ((v: { [k in ParamKeys<U>]: string | number }) => Promise<JS<T>>) & {
  pattern: U;
  each: (
    values: ReadonlyArray<{ [k in ParamKeys<U>]: string | number }>,
  ) => Promise<Resources<T, U>>;
};

export type Resources<
  T extends Readonly<Record<string, JSONable>>,
  U extends string,
> = {
  readonly group: ResourceGroup<T, U>;
  readonly values: readonly JS<T>[];
};

export type JSONLiteral = string | number | boolean | null;

export type JSONRecord = {
  readonly [member: string]: JSONLiteral | JSONArray | JSONRecord | undefined; // In order to handle optional properties
  readonly [jsSymbol]?: never;
};

export type JSONArray = Array<JSONLiteral | JSONArray | JSONRecord>;

export type JSONable = JSONLiteral | JSONRecord | JSONArray;

export type ImplicitlyJSable<T = any> =
  | JSable<T>
  | Fn<any, any>
  | JSONLiteral
  | undefined
  | ImplicitlyJSable[]
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
  : T extends Fn<infer Args, infer R> ? (...args: Args) => R
  : T;

type Exact<A, B> = A extends B ? B extends A ? true : false : false;

export const jsSymbol = Symbol.for("classic.js");

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

export type Resolver = (spec: string) => string | undefined;
