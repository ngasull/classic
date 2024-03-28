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
  const args = Array(cb.length).fill(0).map((_, i) => arg(i));

  const argsJs = args.length > 1
    ? jsFn`(${args.reduce((a, b) => jsFn`${a},${b}`)})`
    : args.length === 1
    ? args[0]
    : unsafe("()");

  const body = cb(...args);

  const jsfnExpr = Array.isArray(body)
    ? jsFn`(${argsJs}=>{${statements(body as JSStatements<unknown>)}})`
    : jsFn`(${argsJs}=>(${body}))`;

  (jsfnExpr[jsSymbol] as Writable<JSMeta<unknown>>).args = args;
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

export const unsafe = (js: string): JSable<unknown> => mkPureJS([js]);

const mkPureJS = (rawJS: readonly string[]) => ({
  [jsSymbol]: ({ rawJS, replacements: [] }) as unknown as JSMeta<unknown>,
});

const jsFn = ((
  tpl: ReadonlyArray<string>,
  ...exprs: ImplicitlyJSable[]
) => {
  const rawParts: string[] = [];
  let last: string[] = [tpl[0]];

  const replacements: JSReplacement[] = [];

  const handleExpression = (expr: ImplicitlyJSable): void => {
    if (expr === null) {
      last.push(`null`);
    } else if (expr === undefined) {
      last.push(`undefined`);
    } else if (
      (typeof expr === "function" || typeof expr === "object") &&
      jsSymbol in expr && expr[jsSymbol]
    ) {
      const meta = expr[jsSymbol];
      last.push(meta.rawJS[0]);
      for (let i = 0; i < meta.replacements.length; i++) {
        replacements.push(meta.replacements[i]);
        rawParts.push(last.join(""));
        last = [meta.rawJS[i + 1]];
      }
    } else if (typeof expr === "function") {
      handleExpression(fn(expr));
    } else if (Array.isArray(expr)) {
      last.push(`[`);
      for (let i = 0; i < expr.length; i++) {
        if (i > 0) last.push(`,`);
        handleExpression(expr[i]);
      }
      last.push(`]`);
    } else if (typeof expr === "object") {
      last.push(`{`);
      const entries = Object.entries(expr as { [k: string]: ImplicitlyJSable });
      for (let i = 0; i < entries.length; i++) {
        if (i > 0) last.push(`,`);
        const [k, expr] = entries[i];
        last.push(
          typeof k === "number" || safeRecordKeyRegExp.test(k)
            ? k
            : JSON.stringify(k),
          `:`,
        );
        handleExpression(expr);
      }
      last.push(`}`);
    } else {
      last.push(JSON.stringify(expr));
    }
  };

  exprs.forEach((expr, i) => {
    handleExpression(expr);
    last.push(tpl[i + 1]);
  });
  rawParts.push(last.join(""));

  const expr = mkPureJS(rawParts);
  (expr[jsSymbol] as Writable<JSMeta<unknown>>).replacements = replacements;

  const callExpr = (
    ...argArray: ReadonlyArray<JSable<unknown> | JSONable>
  ) => {
    const jsArgs = argArray.length > 0
      ? argArray.reduce((a, b) => jsFn`${a},${b}`)
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

  const argStore = new Map<JSable<unknown>, string>();
  let argIndex = -1;
  const storeArg = (expr: JSable<unknown>) =>
    argStore.get(expr) ?? (() => {
      argIndex += 1;
      const name = argn(argIndex);
      argStore.set(expr, name);
      return name;
    })();

  const jsParts = Array<string>(2 * replacements.length + 1);
  jsParts[0] = rawJS[0];

  let i = 0;
  for (const { kind, value } of replacements) {
    i++;

    jsParts[i * 2 - 1] = kind === JSReplacementKind.Argument
      ? value.name ?? storeArg(value.expr)
      : kind === JSReplacementKind.Module
      ? `${modulesArg}[${storeModule(value.url)}]`
      : kind === JSReplacementKind.Ref
      ? `${refsArg}[${getRef(value.expr)}]`
      : kind === JSReplacementKind.Resource
      ? `${resourcesArg}(${storeResource(value)})`
      : "null";

    jsParts[i * 2] = rawJS[i];
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
    (expr[jsSymbol].rawJS as string[]).push("");
    (expr[jsSymbol] as Writable<JSMeta<M>>).replacements = [{
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

  string: (
    tpl: ReadonlyArray<string>,
    ...exprs: ImplicitlyJSable[]
  ): JS<string> => {
    const template = exprs.reduce<JS<string>>(
      (a, b, i) => jsFn`${a}\${${b}}${jsString(tpl[i + 1])}`,
      jsFn`${jsString(tpl[0])}`,
    );

    return jsFn`\`${template}\``;

    function jsString(tpl: string) {
      return unsafe(tpl.replaceAll("`", "\\`"));
    }
  },

  symbol: jsSymbol,

  track: (def: JSFn<[], any>): JS<void> => {
    const f = fn(def);
    const uris = f[jsSymbol].replacements.flatMap((r) =>
      r.kind === JSReplacementKind.Resource ? [r.value.uri] : []
    );
    return js`${unsafe(apiArg)}.effect(${f},${uris})`;
  },

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

export const arg = <T>(
  index: number,
  { name }: { name?: string } = {},
): JS<T> => {
  const expr = jsFn<T>``;

  (expr[jsSymbol].rawJS as string[]).push("");
  (expr[jsSymbol] as Writable<JSMeta<T>>).replacements = [{
    kind: JSReplacementKind.Argument,
    value: {
      expr,
      index,
      name,
    },
  }];

  return expr;
};

export const resource = <T extends Readonly<Record<string, JSONable>>>(
  uri: string,
  fetch: T | PromiseLike<T> | (() => T | PromiseLike<T>),
): JS<T> => {
  const expr = jsFn<T>``;

  (expr[jsSymbol].rawJS as string[]).push("");

  let value: null | [T | PromiseLike<T>] = null;
  (expr[jsSymbol] as Writable<JSMeta<T>>).replacements = [{
    kind: JSReplacementKind.Resource,
    value: {
      uri,
      get value() {
        return (value ??= [typeof fetch === "function" ? fetch() : fetch])[0];
      },
      set value(v: T | PromiseLike<T>) {
        value = [v];
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
      (value as Writable<Resource<JSONable>>).value = await Promise.resolve(
        value.value,
      );
    }
  }
  return js;
};
