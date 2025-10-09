import type {
  DirectlyStringifiable,
  JSPrimitive,
} from "./stringify/stringify.ts";

declare const $jsHint: unique symbol;
type JSHint<T> = Record<typeof $jsHint, T>;

/**
 * A {@linkcode JSable} proxy that reflects property access
 * and function calls into intuitively related {@linkcode JS}
 */
export type JS<T> = _JS<T, []>;

type _JS<T, Depth extends unknown[]> =
  & JSHint<T>
  & (T extends string ? JS<typeof String["prototype"]>
    : T extends number ? JS<typeof Number["prototype"]>
    : T extends bigint ? JS<typeof BigInt["prototype"]>
    : T extends boolean ? JS<typeof Boolean["prototype"]>
    : T extends symbol ? JS<typeof Symbol["prototype"]>
    : T extends object ? JSOverride<T> extends never ? (
          Depth["length"] extends 8 ? unknown // Prevent TS from infinitely recursing
            : (
              & (T extends (...args: infer Args) => infer Ret ? (
                  <R = Ret>(
                    ...args: { [I in keyof Args]: JSArg<Args[I]> }
                  ) => JS<R>
                )
                : T extends unknown[]
                  ? { [I in keyof T]: _JS<T[I], [1, ...Depth]> } // Default to mapped object
                : unknown)
              & (
                Record<any, never> extends T // General map (no specific keys)
                  ? T extends Record<infer K, infer V> ? Record<
                      K,
                      unknown extends V ? never : _JS<V, [1, ...Depth]>
                    >
                  : never
                  // Mapped type (object or array)
                  : { [K in keyof T]: _JS<T[K], [1, ...Depth]> }
              )
            )
        )
      : JSOverride<T>
    : unknown);

/**
 * What can be passed as {@linkcode JS} call argument.
 *
 * For example, given `a: JS<number>` in `a.toFixed(arg)`,
 * `arg` has to have type `JSArg<number>` (because
 * {@linkcode Number.prototype.toFixed} expects a number).
 * Basically, `arg` can be `number | JS<number>`
 */
export type JSArg<Arg> = _JSArg<Arg, []>;

type _JSArg<Arg, Depth extends unknown[]> =
  | JSHint<Arg>
  | JSValue<Arg, Depth>;

type JSValue<Arg, Depth extends unknown[] = []> =
  | (OnlyJSArg<Arg, JSNative> extends infer P extends JSNative ? P
    : never)
  | (Depth["length"] extends 8 ? never // Prevent TS from infinitely recursing
    : OnlyJSArg<Arg, JSMapped> extends infer Filtered extends JSMapped
      ? { [I in keyof Filtered]: _JSArg<Filtered[I], [1, ...Depth]> }
    : never)
  | (OnlyJSArg<Arg, JSFunction> extends ((...args: infer AArgs) => infer AR)
    ? Fn<AArgs, AR>
    : Arg extends JSNative ? Arg
    : never);

type JSArgUnion = JSMapped | JSFunction | JSNative;
type JSNative = JSPrimitive | DirectlyStringifiable;
type JSMapped = readonly unknown[] | Record<any, any>;
type JSFunction = ((...args: any[]) => unknown) | Record<any, any>;
type OnlyJSArg<T, Filter> = Exclude<T, Exclude<JSArgUnion, Filter>>;

/** Userland configuration */
declare namespace JSOverrides {
  /** Specific overrides for global JS */
  interface JS<T> {
    // Promise: T extends Promise<infer G> ? JSPromise<G> : never;
  }
}

export type { JSOverrides };

type JSOverride<T> = JSOverrides.JS<T>[keyof JSOverrides.JS<any>];

export declare const typeSymbol: unique symbol;

export type Fn<Args extends readonly unknown[], T = void> = (
  ...args: { [I in keyof Args]: JS<Args[I]> }
) => void extends T ? JSArg<T> | void : JSArg<T>;

export type JSPromise<T> = {
  readonly then: <R>(
    onFulfilled: (value: JS<T>) => JS<R | PromiseLike<R>>,
    onRejected?: (reason: JS<unknown>) => JS<R | PromiseLike<R>>,
  ) => JS<Promise<R>>;
  readonly catch: <R>(
    onRejected: (reason: JS<unknown>) => JS<R | PromiseLike<R>>,
  ) => JS<Promise<R>>;
  readonly finally: <R>(
    onFinally: () => JS<R | PromiseLike<R>>,
  ) => JS<Promise<R>>;
};

export const $customInspect = Symbol.for("Deno.customInspect");
export const empty = Object.freeze([]);
