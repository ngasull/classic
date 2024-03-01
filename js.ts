import {
  argn,
  lifecycleArg,
  modulesArg,
  nodeArg,
  resourcesArg,
} from "./dom/arg-alias.ts";
import type {
  ExtractImplicitlyJSable,
  ImplicitlyJSable,
  JS,
  JSable,
  JSFn,
  JSFnBody,
  JSMeta,
  JSONable,
  JSReturn,
  JSStatements,
  JSStatementsReturn,
  JSWithBody,
  ParamKeys,
  Resource,
  ResourceGroup,
  Resources,
} from "./js/types.ts";
import { isReactive, jsSymbol } from "./js/types.ts";

type Writable<T> = { -readonly [K in keyof T]: T[K] };

export const statements = <S extends JSStatements<unknown>>(stmts: S) => {
  const tpl = Array(stmts.length).fill(";");
  tpl[0] = "";
  return jsFn(
    tpl,
    ...stmts,
  ) as JSStatementsReturn<S>;
};

export const fn = <Cb extends (...args: readonly any[]) => JSFnBody<any>>(
  cb: Cb,
) => {
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

export const effect = (cb: JSFn<[], void | (() => void)>) =>
  js<void>`${unsafe(lifecycleArg)}.e(${unsafe(nodeArg)},${
    unsafe(resourcesArg)
  }.u,${cb})`;

const targetSymbol = Symbol("target");

const safeRecordKeyRegExp = /^[A-z_$][\w_$]*$/;

const jsProxyHandler: ProxyHandler<{
  (...argArray: ReadonlyArray<JSable<unknown> | JSONable>): JSable<unknown>;
  [targetSymbol]: JSable<unknown>;
}> = {
  has(target, p) {
    const expr = target[targetSymbol];
    return p === jsSymbol || p in expr;
  },

  get(target, p) {
    const expr = target[targetSymbol];
    return p === Symbol.iterator
      ? () => jsIterator(expr)
      : typeof p === "symbol"
      ? expr[p as typeof jsSymbol]
      : !isNaN(parseInt(p))
      ? jsFn`${expr}[${unsafe(p as string)}]`
      : safeRecordKeyRegExp.test(p as string)
      ? jsFn`${expr}.${unsafe(p as string)}`
      : jsFn`${expr}[${JSON.stringify(p)}]`;
  },
};

const jsIterator = <T>(expr: JSable<T>): Iterator<JS<T>> => {
  let i = -1;

  const r: IteratorResult<JS<T>> = {
    done: false as boolean,
    get value() {
      return jsFn<T>`${expr}[${i}]`;
    },
  };

  return {
    next() {
      i += 1;
      // Iterator is meant for destructuring through JS. Prevent infinite iteration
      if (i > 50) r.done = true;
      return r;
    },
  };
};

export const unsafe = (js: string) => mkPureJS(js);

const mkPureJS = (rawJS: string) => ({
  [jsSymbol]: ({
    rawJS,
    modules: [] as const,
    resources: [] as const,
  }) as unknown as JSMeta<unknown>,
});

const jsFn = (<T>(
  tpl: ReadonlyArray<string>,
  ...exprs: ImplicitlyJSable[]
) => {
  const modules: Record<string, number[]> = {};

  let resIndex = 0;
  const resources = new Map<Resource<JSONable>, number>();
  const trackResource = (res: Resource<JSONable>) => {
    if (!resources.has(res)) {
      resources.set(res, resIndex++);
    }
    return resources.get(res)!;
  };

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
        const [path, relativeIndices] of Object.entries(expr[jsSymbol].modules)
      ) {
        const indices = relativeIndices.map((i) => i + exprIndex);
        if (path in modules) {
          modules[path].push(...indices);
        } else {
          modules[path] = indices;
        }
      }

      const subres = expr[jsSymbol].resources.map(trackResource);
      if (subres.length > 0 && subres.some((r, i) => r !== i)) {
        return `(${resourcesArg}=>(${expr[jsSymbol].rawJS}))(${resourcesArg}(${
          subres.join(",")
        }))`;
      } else {
        return expr[jsSymbol].rawJS;
      }
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

  const expr = mkPureJS(rawParts.join("")) as unknown as JSable<T>;
  const exprMeta = expr[jsSymbol] as Writable<JSMeta<T>>;
  exprMeta.modules = modules;

  if (resources.size > 0) {
    exprMeta.resources = [...resources.keys()] as [
      Resource<JSONable>,
      ...Resource<JSONable>[],
    ];
  }

  const callExpr = (
    ...argArray: ReadonlyArray<JSable<unknown> | JSONable>
  ) => {
    const jsArgs = argArray.length > 0
      ? argArray.reduce((acc, a) => jsFn`${acc},${a}`)
      : jsFn``;

    return jsFn`${expr}(${jsArgs})`;
  };

  callExpr[targetSymbol] = expr;

  return new Proxy(callExpr, jsProxyHandler) as unknown as JS<T>;
}) as {
  <T>(tpl: ReadonlyArray<string>, ...exprs: ImplicitlyJSable[]): JS<T>;
};

export const toRawJS = (
  expr: JSable<any>,
  cb?: (path: string, moduleIndex: number) => number,
): string => {
  const { modules, rawJS } = expr[jsSymbol];

  const replacements = Object.entries(modules)
    .flatMap(([path, indices], moduleIndex) =>
      indices.map((index) =>
        [index, cb ? cb(path, moduleIndex) : moduleIndex] as const
      )
    )
    .sort((a, b) => a[0] - b[0]);

  const jsParts = Array<string>(2 * replacements.length + 1);
  jsParts[0] = replacements.length > 0
    ? rawJS.slice(0, replacements[0][0])
    : rawJS;

  let i = -1;
  for (const [index, replacement] of replacements) {
    i++;
    jsParts[i * 2] = `${modulesArg}[${replacement}]`;
    jsParts[i * 2 + 1] = rawJS.slice(
      index,
      replacements[i + 1]?.[0] ?? rawJS.length,
    );
  }

  return jsParts.join("");
};

const jsUtils = {
  eval: async <T>(expr: JSable<T>): Promise<T> => {
    const argsBody = [`return(${toRawJS(expr)})`];
    const args: unknown[] = [];

    if (isReactive(expr)) {
      argsBody.unshift(resourcesArg);
      args.unshift((function mkResProxy(resources): JSONable[] {
        return new Proxy(
          ((...argArray: number[]) =>
            mkResProxy(
              argArray.map((r) => resources[r]),
            )) as unknown as JSONable[],
          {
            get(_, p) {
              return resources[p as any];
            },
          },
        );
      })(await Promise.all(expr[jsSymbol].resources.map((r) => r.value))));
    }

    const modules = Object.keys(expr[jsSymbol].modules);
    if (modules.length > 0) {
      argsBody.unshift(modulesArg);
      args.unshift(await Promise.all(modules.map((path) => import(path))));
    }

    return new Function(...argsBody)(...args);
  },

  import: <M>(url: string) => jsFn<Promise<M>>`import(${url})`,

  module: <M>(path: string) => {
    const expr = jsFn<M>``;
    (expr[jsSymbol] as Writable<JSMeta<M>>).modules = { [path]: [0] };
    return expr;
  },

  nonNullable: <T>(v: T) =>
    v as T extends JS<infer T> ? JS<NonNullable<T>> : never,

  if: <S extends JSStatements<unknown>>(
    test: ImplicitlyJSable,
    stmts: S,
  ): JSStatementsReturn<S> =>
    jsFn`if(${test}){${statements(stmts)}}` as JSStatementsReturn<S>,

  elseif: <S extends JSStatements<unknown>>(
    test: ImplicitlyJSable,
    stmts: S,
  ): JSStatementsReturn<S> =>
    jsFn`else if(${test}){${statements(stmts)}}` as JSStatementsReturn<S>,

  else: <S extends JSStatements<unknown>>(stmts: S) =>
    jsFn`else{${statements(stmts)}}` as JSStatementsReturn<S>,

  return: <E extends ImplicitlyJSable>(expr: E) =>
    // @ts-ignore: Don't worry, be happy TS
    jsFn`return ${expr}` as JS<ExtractImplicitlyJSable<E>> & JSReturn,

  set: <T>(receiver: JSable<T>, value: ImplicitlyJSable<T>) =>
    jsFn<never>`${receiver}=${value}`,

  symbol: jsSymbol,

  window: new Proxy({}, {
    get(_, p) {
      return jsFn`${unsafe(p as string)}`;
    },
  }) as
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
  fetch: () => T | Promise<T>,
): JS<T> => {
  let value = null;

  const r = {
    uri,
    get value() {
      return (value ??= [fetch()])[0];
    },
  } as Resource<T>;

  const expr = jsFn`${unsafe(resourcesArg)}[0]` as unknown as JS<
    T
  >;
  (expr[jsSymbol] as Writable<JSMeta<T>>).resources = [r];

  return expr;
};

export const resources = <
  T extends Readonly<Record<string, JSONable>>,
  U extends string,
>(
  pattern: U,
  fetch: (params: { readonly [k in ParamKeys<U>]: string }) => T | Promise<T>,
): ResourceGroup<T, U> => {
  const make = (
    params: { readonly [k in ParamKeys<U>]: string | number },
  ): JS<T> => {
    const stringParams = (
      Object.fromEntries(
        Object.entries(params).map(([k, v]) => [k, String(v)]),
      )
    ) as { readonly [k in ParamKeys<U>]: string };

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
      values: ReadonlyArray<{ readonly [k in ParamKeys<U>]: string | number }>,
    ): Resources<T, U> => ({
      group,
      values: (
        values.map((v) => make(v)[jsSymbol].resources[0])
      ) as unknown as ReadonlyArray<Resource<T>>,
    }),
  });
  return group;
};

export const sync = async <J extends JSWithBody<any, any>>(js: J): Promise<{
  readonly fn: J;
  readonly values: readonly JSONable[];
}> => {
  return {
    fn: js,
    values: js[jsSymbol].resources.length > 0
      ? await Promise.all(js[jsSymbol].resources.map(({ value }) => value))
      : [],
  };
};
