import { refsArg, varArg } from "./dom/arg-alias.ts";
import { argn, modulesArg, resourcesArg } from "./dom/arg-alias.ts";
import type {
  Fn,
  ImplicitlyJSable,
  JS,
  JSable,
  JSFn,
  JSFnBody,
  JSMeta,
  JSONable,
  JSPromise,
  JSStatements,
  JSStatementsReturn,
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
  const res = jsTpl(tpl, ...stmts) as JSStatementsReturn<S>;
  (res[jsSymbol] as Writable<JSMeta<unknown>>).isntAssignable = true;
  return res;
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
    const { isOptional, isThenable, isntAssignable } = expr[jsSymbol];

    if (p === Symbol.iterator) {
      return () => jsIterator(expr);
    } else if (typeof p === "symbol") {
      return expr[p as keyof JSable<unknown>];
    } else if (p === "then" && !isThenable) {
      return {
        [jsSymbol]:
          jsTpl`${expr}${unsafe(isOptional ? "?." : ".")}then`[jsSymbol],
      };
    }

    const accessedExpr = !isNaN(parseInt(p))
      ? jsTpl`${expr}${unsafe(isOptional ? "?." : "")}[${unsafe(p)}]`
      : safeRecordKeyRegExp.test(p as string)
      ? jsTpl`${expr}${unsafe(isOptional ? "?." : ".")}${unsafe(p)}`
      : jsTpl`${expr}${unsafe(isOptional ? "?." : "")}[${p}]`;

    if (isntAssignable) {
      (accessedExpr[jsSymbol] as Writable<JSMeta<unknown>>).isntAssignable =
        true;
    }

    return accessedExpr;
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
        value: jsTpl<T>`${expr}[${i}]`,
      };
    },
  };
};

export const unsafe = (js: string): JSable<unknown> => {
  const expr = mkPureJS([js]);
  (expr[jsSymbol] as Writable<JSMeta<unknown>>).isntAssignable = true;
  return expr;
};

const mkPureJS = (rawJS: readonly string[]) => ({
  [jsSymbol]:
    ({ rawJS, replacements: [], scope: new Map() }) as unknown as JSMeta<
      unknown
    >,
});

const jsTpl = ((
  tpl: ReadonlyArray<string>,
  ...exprs: ImplicitlyJSable[]
) => {
  const builtExpr = mkPureJS([]);
  const { rawJS, replacements, scope } = builtExpr[jsSymbol] as {
    [K in keyof JSMeta<unknown>]: Writable<JSMeta<unknown>[K]>;
  };

  let last: string[] = [tpl[0]];

  const handleExpression = (expr: ImplicitlyJSable): void => {
    if (expr === null) {
      last.push(`null`);
    } else if (expr === undefined) {
      last.push(`void 0`);
    } else if (
      (typeof expr === "function" || typeof expr === "object") &&
      jsSymbol in expr && expr[jsSymbol]
    ) {
      if (expr[jsSymbol].isntAssignable) {
        // Inline parts, replacements and scope
        const meta = expr[jsSymbol];
        last.push(meta.rawJS[0]);
        for (let i = 0; i < meta.replacements.length; i++) {
          rawJS.push(last.join(""));
          replacements.push(meta.replacements[i]);
          last = [meta.rawJS[i + 1]];
        }

        meta.scope.forEach(([count, parents], k) => {
          const existing = scope.get(k);
          if (existing) {
            existing[0] += count;
            parents.forEach((p) => existing[1].add(p));
          } else {
            scope.set(expr, [count, parents]);
          }
        });
      } else {
        // Treat as potential variable
        rawJS.push(last.join(""));
        replacements.push({ kind: JSReplacementKind.Var, value: expr });
        last = [];

        const existing = scope.get(expr);
        if (existing) {
          existing[0] += 1;
          existing[1].add(builtExpr);
        } else {
          scope.set(expr, [1, new Set([builtExpr])]);
        }
      }
    } else if (typeof expr === "function") {
      handleExpression(js.fn(expr));
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
  rawJS.push(last.join(""));

  const callExpr = (
    ...argArray: ReadonlyArray<JSable<unknown> | JSONable>
  ) => {
    const jsArgs = argArray.length > 0
      ? argArray.reduce((a, b) => jsTpl`${a},${b}`)
      : jsTpl``;
    return jsTpl`${builtExpr}(${jsArgs})`;
  };

  callExpr[targetSymbol] = builtExpr;

  return new Proxy(callExpr, jsProxyHandler) as unknown as JS<unknown>;
}) as {
  <T>(tpl: ReadonlyArray<string>, ...exprs: ImplicitlyJSable[]): JS<T>;
};

export const toRawJS = <A extends readonly unknown[]>(
  f: Fn<A, unknown>,
  { storeModule = neverStore, storeResource = neverStore, getRef = neverStore }:
    {
      readonly storeModule?: (url: string) => number;
      readonly storeResource?: (resource: Resource<JSONable>) => number;
      readonly getRef?: (expr: JSable<EventTarget>) => number | undefined;
    } = {},
): [string, ...{ -readonly [I in keyof A]: string }] => {
  const fnExpr = js.fn(f as Fn<readonly any[], unknown>);
  const { args, body, scope } = fnExpr[jsSymbol];

  const wholeScope = new Map<JSable<unknown>, [number, Set<JSable<unknown>>]>();
  scope.forEach(function recScope([count, parents], expr) {
    const existing = wholeScope.get(expr);
    if (existing) {
      existing[0] += count;
      for (const p of parents) existing[1].add(p);
    } else {
      wholeScope.set(expr, [count, new Set(parents)]);
    }
    expr[jsSymbol].scope.forEach(recScope);
  });

  const argStore = new Map<JSable<unknown>, string>();
  let argIndex = -1;
  const storeArg = (expr: JSable<unknown>, name?: string) =>
    argStore.get(expr) ?? (() => {
      argIndex += 1;
      const storedName = name ?? argn(argIndex);
      argStore.set(expr, storedName);
      return storedName;
    })();

  const argsToString = (args: readonly JSable<unknown>[]) =>
    args.map((a) =>
      storeArg(a, (a[jsSymbol].replacements[0].value as { name?: string }).name)
    );

  const bodyToRawStatements = (
    expr: JSFn<readonly any[], unknown>,
    parentOwnScope: Map<JSable<unknown>, [number, Set<JSable<unknown>>]> | null,
  ): readonly string[] => {
    const body = expr[jsSymbol].body;
    const ownScope = new Map<JSable<unknown>, [number, Set<JSable<unknown>>]>();
    const rawStatements = Array.isArray(body)
      ? body.map((s) => exprToRawJS(s, ownScope))
      : [exprToRawJS(body, ownScope)];

    const assignments: string[] = [];
    for (const [value, scoped] of ownScope) {
      (function recScope(value, [count, parents]) {
        if (parentOwnScope && count < wholeScope.get(value)![0]) {
          const existing = parentOwnScope.get(value);
          if (existing) {
            existing[0] += count;
            for (const p of parents) existing[1].add(p);
          } else {
            parentOwnScope.set(value, [count, new Set(parents)]);
          }
        } else {
          const assignment = varIds.get(value);
          if (assignment) {
            const [varId, expr] = assignment;
            varIds.delete(value);

            assignments.push(`${varArg}${varId}=${expr}`);

            for (const p of parents) {
              const parentInScope = ownScope.get(p);
              if (parentInScope) recScope(p, parentInScope);
            }
          }
        }
      })(value, scoped);
    }

    if (assignments.length) {
      rawStatements.unshift(`let ${assignments.join(",")}`);

      if (!Array.isArray(body)) {
        rawStatements[1] = `return ${rawStatements[1]}`;
      }
    }

    return rawStatements;
  };

  const exprToRawJS = (
    expr: JSable<unknown>,
    ownScope: Map<JSable<unknown>, [number, Set<JSable<unknown>>]>,
  ): string => {
    const assignment = varIds.get(expr);
    if (assignment != null) {
      const [varId] = assignment;
      const existing = ownScope.get(expr);
      if (existing) {
        existing[0] += 1;
        existing[1].add(expr);
      } else {
        ownScope.set(expr, [1, new Set([expr])]);
      }
      return `${varArg}${varId}`;
    }

    const { replacements, rawJS, args, body } = expr[jsSymbol];

    if (args && body) {
      const argNames = argsToString(args);
      const argsStr = argNames.length === 1
        ? argNames[0]
        : `(${argNames.join(",")})`;
      const stmts = bodyToRawStatements(
        expr as JSFn<unknown[], unknown>,
        ownScope,
      );
      const bodyStr = stmts.length === 1 && !Array.isArray(body)
        ? `(${stmts[0]})`
        : `{${stmts.join(";")}}`;
      return `(${argsStr}=>${bodyStr})`;
    }

    const jsParts = Array<string>(2 * replacements.length + 1);
    jsParts[0] = rawJS[0];
    for (let r = 0; r < replacements.length; r++) {
      const { kind, value } = replacements[r];
      const p = r + 1;

      if (kind === JSReplacementKind.Var) {
        jsParts[p * 2 - 1] = exprToRawJS(value, ownScope);
      } else {
        jsParts[p * 2 - 1] = kind === JSReplacementKind.Argument
          ? storeArg(value.expr, value.name)
          : kind === JSReplacementKind.Ref
          ? `${refsArg}[${getRef(value.expr)}]`
          : kind === JSReplacementKind.Module
          ? `${modulesArg}[${storeModule(value.url)}]`
          : kind === JSReplacementKind.Resource
          ? `${resourcesArg}(${storeResource(value)})`
          : "null";
      }

      jsParts[p * 2] = rawJS[p];
    }

    return jsParts.join("");
  };

  const varIds = new Map<
    JSable<unknown>,
    [number, string, Map<JSable<unknown>, [number, Set<JSable<unknown>>]>]
  >();
  let lastVarId = -1;
  for (const [v, parents] of wholeScope) {
    if (parents[0] > 1) {
      const ownScope = new Map<
        JSable<unknown>,
        [number, Set<JSable<unknown>>]
      >();
      varIds.set(v, [++lastVarId, exprToRawJS(v, ownScope), ownScope]);
    }
  }

  const argStrs = argsToString(args) as { -readonly [I in keyof A]: string };
  return [
    bodyToRawStatements(
      Array.isArray(body) ? fnExpr : js.fn(() => [js`return ${body}`]),
      null,
    ).join(";"),
    ...argStrs,
  ];
};

const neverStore = () => {
  throw Error("All modules, refs and resources must be stored");
};

const jsUtils = {
  comma: <T>(...exprs: [...JSable<unknown>[], JSable<T>]): JS<T> => {
    const template = exprs.length > 1
      ? exprs.reduce((a, b) => jsTpl`${a},${b}`)
      : exprs[0];
    return jsTpl`(${template})`;
  },

  eval: async <T>(expr: JSable<T>): Promise<T> => {
    let m = 0, r = 0;
    const mStore: Record<string, number> = {};
    const mArg: Promise<unknown>[] = [];
    const rStore: Record<string, number> = {};
    const rArg: (JSONable | PromiseLike<JSONable>)[] = [];

    const argsBody = [
      toRawJS(() => expr, {
        storeModule: (url) => (
          mStore[url] ??= (mArg.push(import(url)), m++)
        ),
        storeResource: (res) => (
          rStore[res.uri] ??= (rArg.push(res.value), r++)
        ),
      })[0],
    ];
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

  fn: <Cb extends (...args: readonly any[]) => JSFnBody<any>>(
    cb: Cb,
  ): Cb extends Fn<infer Args, infer T> ? JSFn<Args, T>
    : never => {
    const args = Array(cb.length).fill(0).map(() => arg());

    const argsJs = args.length > 1
      ? jsTpl`(${args.reduce((a, b) => jsTpl`${a},${b}`)})`
      : args.length === 1
      ? args[0]
      : unsafe("()");

    const body = cb(...args);

    const jsfnExpr = Array.isArray(body)
      ? jsTpl`(${argsJs}=>{${statements(body)}})`
      : jsTpl`(${argsJs}=>(${body}))`;

    (jsfnExpr[jsSymbol] as Writable<JSMeta<unknown>>).args = args;
    (jsfnExpr[jsSymbol] as Writable<JSMeta<unknown>>).body = body;

    return jsfnExpr as Cb extends Fn<infer Args, infer T> ? JSFn<Args, T>
      : never;
  },

  module: <M>(path: string): JS<M> => {
    const expr = jsTpl<M>``;
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
      (a, b, i) => jsTpl`${a}\${${b}}${jsString(tpl[i + 1])}`,
      jsTpl`${jsString(tpl[0])}`,
    );

    return jsTpl`\`${template}\``;

    function jsString(tpl: string) {
      return unsafe(tpl.replaceAll("`", "\\`"));
    }
  },

  symbol: jsSymbol,

  window: new Proxy({}, { get: (_, p) => jsTpl`${unsafe(p as string)}` }) as
    & Readonly<Omit<JS<Window & typeof globalThis>, keyof JSWindowOverrides>>
    & JSWindowOverrides,
};

export const js = Object.assign(jsTpl, jsUtils) as
  & typeof jsTpl
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

export const arg = <T>(name?: string): JS<T> => {
  const expr = jsTpl<T>``;

  (expr[jsSymbol].rawJS as string[]).push("");
  (expr[jsSymbol] as Writable<JSMeta<T>>).replacements = [{
    kind: JSReplacementKind.Argument,
    value: { expr, name },
  }];
  (expr[jsSymbol] as Writable<JSMeta<unknown>>).isntAssignable = true;

  return expr;
};

export const mkRef = <T extends EventTarget>(): JS<T> => {
  const expr = jsTpl<T>``;

  (expr[jsSymbol].rawJS as string[]).push("");
  (expr[jsSymbol] as Writable<JSMeta<T>>).replacements = [{
    kind: JSReplacementKind.Ref,
    value: { expr },
  }];
  (expr[jsSymbol] as Writable<JSMeta<unknown>>).isntAssignable = true;

  return expr;
};

export const resource = <T extends Readonly<Record<string, JSONable>>>(
  uri: string,
  fetch: T | PromiseLike<T> | (() => T | PromiseLike<T>),
): JS<T> => {
  const expr = jsTpl<T>``;

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
  (expr[jsSymbol] as Writable<JSMeta<unknown>>).isntAssignable = true;

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
    } else if (kind === JSReplacementKind.Var) {
      await sync(value);
    }
  }
  return js;
};
