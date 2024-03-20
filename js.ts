import { apiArg } from "./dom/arg-alias.ts";
import { argn, modulesArg, resourcesArg } from "./dom/arg-alias.ts";
import type {
  ImplicitlyJSable,
  JS,
  JSable,
  JSFn,
  JSFnBody,
  JSMeta,
  JSONable,
  JSPromise,
  JSReplacement,
  JSStatements,
  JSStatementsReturn,
  JSWithBody,
  ParamKeys,
  Resource,
  ResourceGroup,
  Resources,
} from "./js/types.ts";
import { JSReplacementKind, jsSymbol } from "./js/types.ts";

type Writable<T> = { -readonly [K in keyof T]: T[K] };

export const statements = <S extends JSStatements<unknown>>(
  stmts: S,
): JSStatementsReturn<S> => {
  const tpl = Array(stmts.length).fill(";");
  tpl[0] = "";
  return jsFn(
    tpl,
    ...stmts,
  ) as JSStatementsReturn<S>;
};

export const fn = <Cb extends (...args: readonly any[]) => JSFnBody<any>>(
  cb: Cb,
): Cb extends JSFn<infer Args, infer T> ? JSWithBody<Args, T>
  : never => {
  const argList = unsafe(
    Array(cb.length).fill(0)
      .map((_, i) => argn(i))
      .join(","),
  );

  const body = cb(
    ...(Array(cb.length)
      .fill(0)
      .map((_, i) => jsFn`${unsafe(argn(i))}`)),
  );

  const jsfnExpr = Array.isArray(body)
    ? jsFn`((${argList})=>{${statements(body as JSStatements<unknown>)}})`
    : jsFn`((${argList})=>(${body}))`;

  (jsfnExpr[jsSymbol] as Writable<JSMeta<unknown>>).body = body;

  return jsfnExpr as Cb extends JSFn<infer Args, infer T> ? JSWithBody<Args, T>
    : never;
};

export const effect = (cb: JSFn<[], void | (() => void)>): JS<void> => {
  const cbFn = fn(cb);
  const uris = cbFn[jsSymbol].replacements.flatMap(({ kind, value }) =>
    kind === JSReplacementKind.Resource ? [value.uri] : []
  );
  return js<void>`${unsafe(apiArg)}.effect(${cbFn},${uris})`;
};

const targetSymbol = Symbol("target");

const safeRecordKeyRegExp = /^[A-z_$][\w_$]*$/;

const jsProxyHandler: ProxyHandler<{
  (...argArray: ReadonlyArray<JSable<unknown> | JSONable>): JSable<unknown>;
  [targetSymbol]: JSable<unknown>;
}> = {
  has: (target, p) => p in target[targetSymbol],

  get: (target, p) => {
    const expr = target[targetSymbol];
    const { isOptional, isThenable } = expr[jsSymbol];
    return p === Symbol.iterator
      ? () => jsIterator(expr)
      : typeof p === "symbol"
      ? expr[p as keyof JSable<unknown>]
      : p === "then" && !isThenable
      ? {
        [jsSymbol]:
          jsFn`${expr}${unsafe(isOptional ? "?." : ".")}then`[jsSymbol],
      }
      : !isNaN(parseInt(p))
      ? jsFn`${expr}${unsafe(isOptional ? "?." : "")}[${unsafe(p)}]`
      : safeRecordKeyRegExp.test(p as string)
      ? jsFn`${expr}${unsafe(isOptional ? "?." : ".")}${unsafe(p)}`
      : jsFn`${expr}${unsafe(isOptional ? "?." : "")}[${p}]`;
  },
};

const jsIterator = <T>(expr: JSable<T>): Iterator<JS<T>> => {
  let i = -1;
  return {
    next() {
      i += 1;
      return {
        // Iterator is meant for destructuring through JS. Prevent infinite iteration
        done: i > 50,
        value: jsFn<T>`${expr}[${i}]`,
      };
    },
  };
};

export const unsafe = (js: string): JSable<unknown> => mkPureJS(js);

const mkPureJS = (rawJS: string) => ({
  [jsSymbol]: ({
    rawJS,
    replacements: [],
  }) as unknown as JSMeta<unknown>,
});

const jsFn = ((
  tpl: ReadonlyArray<string>,
  ...exprs: ImplicitlyJSable[]
) => {
  const replacements: JSReplacement[] = [];

  // Tracks the cumulated length of generated JS
  let exprIndex = 0;

  const handleExpression = (expr: ImplicitlyJSable): string => {
    if (expr === null) {
      return `null`;
    } else if (expr === undefined) {
      return `undefined`;
    } else if (
      (typeof expr === "function" || typeof expr === "object") &&
      jsSymbol in expr && expr[jsSymbol]
    ) {
      for (
        const { position, ...def } of expr[jsSymbol].replacements
      ) {
        // Preserves position ordering
        replacements.push({ position: exprIndex + position, ...def });
      }

      return expr[jsSymbol].rawJS;
    } else if (typeof expr === "function") {
      return handleExpression(fn(expr));
    } else if (Array.isArray(expr)) {
      return `[${expr.map(handleExpression).join(",")}]`;
    } else if (typeof expr === "object") {
      return `{${
        Object.entries(expr as { [k: string]: ImplicitlyJSable })
          .map(
            ([k, expr]) =>
              `${
                typeof k === "number" || safeRecordKeyRegExp.test(k)
                  ? k
                  : JSON.stringify(k)
              }:${handleExpression(expr)}`,
          )
          .join(",")
      }}`;
    } else {
      return JSON.stringify(expr);
    }
  };

  const rawParts = [];
  for (let i = 0; i < exprs.length; i++) {
    exprIndex += tpl[i].length;
    const handledExpr = handleExpression(exprs[i]);
    exprIndex += handledExpr.length;
    rawParts.push(tpl[i], handledExpr);
  }

  if (tpl.length > exprs.length) rawParts.push(tpl[exprs.length]);

  const expr = mkPureJS(rawParts.join(""));
  (expr[jsSymbol] as Writable<JSMeta<unknown>>).replacements = replacements;

  const callExpr = (
    ...argArray: ReadonlyArray<JSable<unknown> | JSONable>
  ) => {
    const jsArgs = argArray.length > 0
      ? argArray.reduce((acc, a) => jsFn`${acc},${a}`)
      : jsFn``;
    return jsFn`${expr}(${jsArgs})`;
  };

  callExpr[targetSymbol] = expr;

  return new Proxy(callExpr, jsProxyHandler) as unknown as JS<unknown>;
}) as {
  <T>(tpl: ReadonlyArray<string>, ...exprs: ImplicitlyJSable[]): JS<T>;
};

export const toRawJS = <T>(
  expr: JSable<T>,
  { storeModule, storeResource }: {
    readonly storeModule: (url: string) => number;
    readonly storeResource: (resource: Resource<JSONable>) => number;
  },
): string => {
  const { replacements, rawJS } = expr[jsSymbol];

  const jsParts = Array<string>(2 * replacements.length + 1);
  jsParts[0] = replacements.length > 0
    ? rawJS.slice(0, replacements[0].position)
    : rawJS;

  let i = -1;
  for (const { position, kind, value } of replacements) {
    i++;

    jsParts[i * 2] = kind === JSReplacementKind.Module
      ? `${modulesArg}[${storeModule(value.url)}]`
      : kind === JSReplacementKind.Resource
      ? `${resourcesArg}(${storeResource(value)})`
      : "null";

    jsParts[i * 2 + 1] = rawJS.slice(
      position,
      replacements[i + 1]?.position ?? rawJS.length,
    );
  }

  return jsParts.join("");
};

const jsUtils = {
  eval: async <T>(expr: JSable<T>): Promise<T> => {
    let m = 0, r = 0;
    const mStore: Record<string, number> = {};
    const mArg: Promise<unknown>[] = [];
    const rStore: Record<string, number> = {};
    const rArg: (JSONable | PromiseLike<JSONable>)[] = [];

    const argsBody = [`return(${
      toRawJS(expr, {
        storeModule: (url) => (
          mStore[url] ??= (mArg.push(import(url)), m++)
        ),
        storeResource: (res) => (
          rStore[res.uri] ??= (rArg.push(res.value), r++)
        ),
      })
    })`];
    const args: unknown[] = [];

    if (m > 0) {
      argsBody.unshift(modulesArg);
      args.unshift(await Promise.all(mArg));
    }

    if (r > 0) {
      const resources = await Promise.all(rArg);
      argsBody.unshift(resourcesArg);
      args.unshift((i: number) => resources[i]);
    }

    return new Function(...argsBody)(...args);
  },

  module: <M>(path: string): JS<M> => {
    const expr = jsFn<M>``;
    (expr[jsSymbol] as Writable<JSMeta<M>>).replacements = [{
      position: 0,
      kind: JSReplacementKind.Module,
      value: { url: path },
    }];
    return expr;
  },

  optional: <T>(expr: JSable<T>): JS<NonNullable<T>> => {
    const p = js<NonNullable<T>>`${expr}`;
    (p[jsSymbol] as Writable<JSMeta<NonNullable<T>>>).isOptional = true;
    return p;
  },

  promise: <T extends PromiseLike<unknown>>(
    expr: JSable<T>,
  ): JS<T> & JSPromise<Awaited<T>> => {
    const p = js<T>`${expr}`;
    (p[jsSymbol] as Writable<JSMeta<T>>).isThenable = true;
    return p as JS<T> & JSPromise<Awaited<T>>;
  },

  symbol: jsSymbol,

  window: new Proxy({}, { get: (_, p) => jsFn`${unsafe(p as string)}` }) as
    & Readonly<Omit<JS<Window & typeof globalThis>, keyof JSWindowOverrides>>
    & JSWindowOverrides,
};

export const js = Object.assign(jsFn, jsUtils) as
  & typeof jsFn
  & typeof jsUtils;

type JSWindowOverrides = {
  readonly Promise: {
    all<P>(
      promises: P,
    ): P extends readonly JSable<unknown>[] ? JS<
        Promise<
          { [I in keyof P]: P[I] extends JSable<infer P> ? Awaited<P> : never }
        >
      >
      : P extends readonly JSable<infer P>[] ? JS<Promise<Awaited<P>[]>>
      : never;
    allSettled: JSWindowOverrides["Promise"]["all"];
    any: JSWindowOverrides["Promise"]["all"];
    race<P>(
      promises: P,
    ): P extends readonly JSable<infer P>[] ? JS<Promise<Awaited<P>>> : never;
    withResolvers<P>(): {
      promise: Promise<P>;
      resolve: (value: P) => void;
      reject: (reason: any) => void;
    };
  };
};

export const resource = <T extends Readonly<Record<string, JSONable>>>(
  uri: string,
  fetch: T | PromiseLike<T> | (() => T | PromiseLike<T>),
): JS<T> => {
  const expr = jsFn<T>``;

  let value: null | [T | PromiseLike<T>] = null;
  (expr[jsSymbol] as Writable<JSMeta<T>>).replacements = [{
    position: 0,
    kind: JSReplacementKind.Resource,
    value: {
      uri,
      get value() {
        return (value ??= [typeof fetch === "function" ? fetch() : fetch])[0];
      },
    },
  }];

  return expr;
};

export const resources = <
  T extends Readonly<Record<string, JSONable>>,
  U extends string,
>(
  pattern: U,
  fetch: (params: { [k in ParamKeys<U>]: string }) => T | Promise<T>,
): ResourceGroup<T, U> => {
  const make = (params: { [k in ParamKeys<U>]: string | number }): JS<T> => {
    const stringParams = (
      Object.fromEntries(
        Object.entries(params).map(([k, v]) => [k, String(v)]),
      )
    ) as { [k in ParamKeys<U>]: string };

    return resource(
      pattern.replaceAll(
        /:([^/]+)/g,
        (_, p) => stringParams[p as ParamKeys<U>],
      ),
      () => fetch(stringParams),
    );
  };
  const group: ResourceGroup<T, U> = Object.assign(make, {
    pattern,
    each: (
      values: ReadonlyArray<{ [k in ParamKeys<U>]: string | number }>,
    ): Resources<T, U> => ({
      group,
      values: (
        values.map((v) =>
          (make(v)[jsSymbol].replacements[0].value as Resource<JSONable>).value
        )
      ) as unknown as readonly Resource<T>[],
    }),
  });
  return group;
};

export const sync = async <J extends JSable<any>>(js: J): Promise<J> => {
  for (const { kind, value } of js[jsSymbol].replacements) {
    if (kind === JSReplacementKind.Resource) {
      value.value = await Promise.resolve(value.value);
    }
  }
  return js;
};
