import {
  $js,
  currentScope,
  type IJSEntity,
  JSAccess,
  JSArbitrary,
  JSArray,
  JSArrow,
  JSCall,
  type JSFn,
  JSMap,
  JSObject,
  JSRaw,
  JSReference,
  JSSet,
  JSUser,
  type Scope,
  Some,
} from "./entity.ts";
import { isDirectlyStringifiable, stringify } from "./stringify/mod.ts";
import { $customInspect, empty, type JS, type JSArg } from "./types.ts";

export const $target = Symbol.for("classic.js.target");

export const isJs = <T>(obj: unknown): obj is JS<T> =>
  typeof obj === "function" && $target in obj;

export const hasTarget = <T>(obj: object): obj is
  & JS<T>
  & { readonly [$target]: IJSEntity } => $target in obj;

const jsProxyHandler: ProxyHandler<{
  (...argArray: readonly unknown[]): JS<unknown>;
  [$target]: IJSEntity;
}> = {
  has: (target, p) => p === $target || p in target[$target],

  get: (target, p, expr: JS<unknown>) =>
    p === $target
      ? target[$target]
      : p === Symbol.iterator
      ? () => jsIterator(expr as JS<unknown[]>)
      : p === $customInspect
      ? (opts: Deno.InspectOptions) =>
        `JS<${Deno.inspect(target[$target], opts)}>`
      : mkJs(new JSAccess(currentScope(), target[$target], p)),

  set: (target, p, newValue) => {
    const scope = currentScope();
    new JSArbitrary(scope, ["", "=", ""], [
      new JSAccess(scope, target[$target], p),
      implicit(newValue, scope),
    ]);
    return true;
  },
};

const jsIterator = <T>(expr: JS<T[]>): Iterator<JS<T>> => {
  let i = -1;
  return {
    next() {
      i += 1;
      return {
        // Iterator is meant for destructuring through JS. Prevent infinite iteration
        done: i > 50,
        value: jsTpl<T>`${expr}[${i}]`,
      };
    },
  };
};

/**
 * Wraps a js-able entity into a `JS` proxy,
 * giving access to convenient and typed JS manipulations
 *
 * @param expr Entity to proxy
 * @return Proxied `expr`
 */
export const mkJs = <T>(entity: IJSEntity): JS<T> => {
  const callExpr = (...argArray: readonly unknown[]) =>
    mkJs(new JSCall(currentScope(), entity, argArray));
  callExpr[$target] = entity;
  return new Proxy(callExpr, jsProxyHandler) as unknown as JS<T>;
};

/**
 * Wrap a value in an explicit JS proxy
 *
 * @param value Arbitrary value, object with `Symbol.for("classic.js")` or existing JS proxy
 * @returns JS proxy for `expr`
 */
export const asJs: {
  <Args extends unknown[], R>(value: (...args: Args) => R): JS<
    (
      ...args: {
        [I in keyof Args]: Args[I] extends JS<infer A> ? A : Args[I];
      }
    ) => R extends JS<infer R> ? R : R
  >;
  <T extends JS<unknown>>(value: T): T;
  <T>(value: JSArg<T>): JS<T>;
  <T>(value: T): JS<T>;
} = (value: unknown): any => isJs(value) ? value : mkJs(implicit(value));

/**
 * Create a JSable expression which contains provided JavaScript
 *
 * @param js JavaScript to directly make `JSable` - MUST CHECKED AS SAFE
 * @returns `JS` from raw `js`
 */
export const unsafe = (js: string): JS<unknown> =>
  mkJs(new JSArbitrary(currentScope(), [js], empty));

export const jsTpl = <T>(
  tpl: ReadonlyArray<string>,
  ...exprs: unknown[]
): JS<T> =>
  mkJs(new JSArbitrary(currentScope(), tpl, exprs.map((v) => implicit(v))));

let globals: Map<unknown, string>;
let jsUndefined: IJSEntity;
let jsNull: IJSEntity;

export const implicit = (value: unknown, scope?: Scope): IJSEntity => {
  if (scope === undefined) scope = currentScope();

  globals ??= new Map<unknown, string>(
    Object.getOwnPropertyNames(globalThis).map(
      (n) => [(globalThis as Record<string, unknown>)[n], n] as const,
    ),
  );
  let globalName;

  if (value === undefined) {
    return jsUndefined ??= new JSRaw("void 0", new Some(undefined));
  } else if (value === null) {
    return jsNull ??= new JSRaw("null", new Some(null));
  } else if ((globalName = globals.get(value)) != null) {
    return new JSRaw(globalName, new Some(value));
  } else if ((typeof value === "object" || typeof value === "function")) {
    return hasTarget(value)
      ? value[$target] as IJSEntity
      : typeof value === "function" && !($js in value)
      ? new JSArrow(scope, value as JSFn)
      : new JSReference(
        value,
        () =>
          $js in value
            ? new JSUser(scope, value)
            : Array.isArray(value)
            ? new JSArray(scope, value.map((v) => implicit(v)))
            : value instanceof Map
            ? new JSMap(scope, value)
            : value instanceof Set
            ? new JSSet(scope, value)
            : isDirectlyStringifiable(value)
            ? new JSArbitrary(scope, [stringify(value)], empty)
            : new JSObject(scope, value),
      );
  } else {
    // Literal: not assignable
    return new JSRaw(stringify(value), new Some(value));
  }
};
