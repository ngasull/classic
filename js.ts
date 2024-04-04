import { refsArg, varArg } from "./dom/arg-alias.ts";
import { argn, modulesArg, resourcesArg } from "./dom/arg-alias.ts";
import type {
  Fn,
  ImplicitlyJSable,
  JS,
  JSable,
  JSableArgument,
  JSableFunction,
  JSableResource,
  JSableType,
  JSFnBody,
  JSMeta,
  JSMetaArgument,
  JSMetaFunction,
  JSMetaRef,
  JSONable,
  ParamKeys,
  Resource,
  ResourceGroup,
  Resources,
} from "./js/types.ts";
import { JSMetaCall } from "./js/types.ts";
import { JSMetaKind, jsSymbol } from "./js/types.ts";

type Writable<T> = { -readonly [K in keyof T]: T[K] };

export const forEachInExpression = (
  expr: JSable,
  cb: (expr: JSable, parent?: JSable) => unknown,
  parent?: JSable,
): void => {
  cb(expr, parent);

  switch (expr[jsSymbol].kind) {
    case JSMetaKind.Template:
      return expr[jsSymbol].replacements.forEach((r) =>
        forEachInExpression(r, cb, expr)
      );
    case JSMetaKind.Function:
      return Array.isArray(expr[jsSymbol].body)
        ? expr[jsSymbol].body.forEach((s) => forEachInExpression(s, cb, expr))
        : forEachInExpression(expr[jsSymbol].body, cb, expr);
    case JSMetaKind.Call:
      forEachInExpression(expr[jsSymbol].callable, cb, expr);
      return expr[jsSymbol].values.forEach((v) =>
        forEachInExpression(v, cb, expr)
      );
  }
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
    const { isOptional, isntAssignable } = expr[jsSymbol];

    if (p === Symbol.iterator) {
      return () => jsIterator(expr);
    } else if (typeof p === "symbol") {
      return expr[p as keyof JSable<unknown>];
    }

    const accessedExpr = !isNaN(parseInt(p))
      ? jsTpl(["", isOptional ? `?.[${p}]` : `[${p}]`], expr)
      : safeRecordKeyRegExp.test(p as string)
      ? jsTpl(["", isOptional ? `?.${p}` : `.${p}`], expr)
      : jsTpl([
        "",
        isOptional ? `?.[${JSON.stringify(p)}]` : `[${JSON.stringify(p)}]`,
      ], expr);

    if (isntAssignable) {
      (accessedExpr[jsSymbol] as Writable<JSMeta<unknown>>).isntAssignable =
        true;
    }
    if (p === "then") {
      if (expr[jsSymbol].isAwaited) return undefined;
      else accessedExpr[jsSymbol].thenable = expr;
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

export const unsafe = (js: string): JSable<unknown> =>
  jsable(
    {
      kind: JSMetaKind.Template,
      rawJS: [js],
      replacements: [],
      isntAssignable: true,
    } as const,
  )<unknown>();

const jsTpl = <T>(
  tpl: ReadonlyArray<string>,
  ...exprs: ImplicitlyJSable[]
): JS<T> => {
  const rawJS: string[] = [];
  const replacements: JSable[] = [];

  const builtExpr = jsable(
    { kind: JSMetaKind.Template, rawJS, replacements } as const,
  )<T>();

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
      rawJS.push(last.join(""));
      replacements.push(expr);
      last = [];
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

  return makeConvenient(builtExpr);
};

const makeConvenient = <J extends JSable>(
  expr: J,
): J extends JSable<infer T> ? JS<T> & J : never => {
  const callExpr = (...argArray: ReadonlyArray<JSable | JSONable>) => {
    const e = makeConvenient(
      jsable<JSMetaCall>({
        kind: JSMetaKind.Call,
        callable: expr,
        values: argArray.map((a) =>
          typeof a === "function" && jsSymbol in a ? a : js`${a}`
        ),
      })(),
    );

    // Event loop might be await-ing for the JS<> ; resolve with a non-thenable
    if (
      expr[jsSymbol].thenable &&
      argArray.length === 2 &&
      typeof argArray[0] === "function" &&
      typeof argArray[1] === "function" &&
      !(jsSymbol in argArray[0]) &&
      !(jsSymbol in argArray[1])
    ) {
      const scope = expr[jsSymbol].thenable[jsSymbol].scope;
      const awaited = jsTpl`(await ${expr[jsSymbol].thenable})`;
      awaited[jsSymbol].isAwaited = true;
      (argArray[0] as (r: unknown) => void)(awaited);
    }

    return e;
  };
  callExpr[targetSymbol] = expr;
  return new Proxy(callExpr, jsProxyHandler) as any;
};

export const toRawJS = <A extends readonly unknown[]>(
  f: Fn<A, unknown>,
  { storeModule = neverStore, storeResource = neverStore, getRef = neverStore }:
    {
      readonly storeModule?: (url: string) => number;
      readonly storeResource?: (resource: Resource<JSONable>) => number;
      readonly getRef?: (expr: JSMetaRef) => number | undefined;
    } = {},
): [string, ...{ -readonly [I in keyof A]: string }] => {
  const globalArgs = Array(f.length).fill(0).map(() => arg());
  const globalBody = (f as Fn<readonly any[], unknown>)(...globalArgs);

  const scopeToRefs = new Map<JSMetaFunction | undefined, Set<JSMeta>>();
  const refToParentReuse = new Map<JSMeta, Map<JSMeta | undefined, boolean>>();
  const buildScopes = (
    meta: JSMeta,
    parent?: JSMeta,
    enclosing?: JSMetaFunction | undefined,
  ): void => {
    switch (meta.kind) {
      case JSMetaKind.Template:
      case JSMetaKind.Function:
      case JSMetaKind.Call: {
        const wasWalked = refToParentReuse.has(meta);
        const parentDefs = refToParentReuse.get(meta) ??
          new Map<JSMeta | undefined, boolean>();
        refToParentReuse.set(meta, parentDefs);
        parentDefs.set(
          parent,
          parentDefs.has(parent) || enclosing !== meta.scope,
        );
        scopeToRefs.set(
          meta.scope,
          (scopeToRefs.get(meta.scope) ?? new Set()).add(meta),
        );

        if (!wasWalked) {
          if (meta.kind === JSMetaKind.Function) {
            Array.isArray(meta.body)
              ? meta.body.forEach((s) => buildScopes(s[jsSymbol], meta, meta))
              : buildScopes(meta.body[jsSymbol], meta, meta);
          } else if (meta.kind === JSMetaKind.Call) {
            buildScopes(meta.callable[jsSymbol], meta, enclosing);
            meta.values.forEach((v) =>
              buildScopes(v[jsSymbol], meta, enclosing)
            );
          } else {
            meta.replacements.forEach((r) =>
              buildScopes(r[jsSymbol], meta, enclosing)
            );
          }
        }
      }
    }
  };

  if (Array.isArray(globalBody)) {
    globalBody.forEach((s) => buildScopes(s[jsSymbol]));
  } else {
    buildScopes(globalBody[jsSymbol]);
  }

  const visitedRefs = new Set<JSMeta>();
  const declaredRefs = new Set<JSMeta>();
  const scopedDeclarations = new Map<JSFnBody<unknown>, JSMeta[]>();
  const shouldDeclare = (source: JSMeta): boolean => {
    let used = false;
    const rec = (meta: JSMeta) => {
      if (meta.isntAssignable) return false;
      for (const [parent, parentReused] of refToParentReuse.get(meta)!) {
        if (used) return true;
        if (parent && declaredRefs.has(parent)) continue;
        if (parentReused || parent && shouldDeclare(parent)) {
          return true;
        }
        used = true;
      }
      return false;
    };
    return rec(source);
  };

  scopeToRefs.forEach((refs) =>
    refs.forEach(function declareIfNeeded(meta) {
      if (
        visitedRefs.has(meta) ||
        (meta.kind !== JSMetaKind.Function && meta.kind !== JSMetaKind.Call &&
          meta.kind !== JSMetaKind.Template)
      ) return;
      visitedRefs.add(meta);

      if (shouldDeclare(meta)) {
        declaredRefs.add(meta);

        // Try declare contained expressions, pretending current is declared
        if (meta.kind === JSMetaKind.Function) {
          if (Array.isArray(meta.body)) {
            meta.body.forEach((s) => declareIfNeeded(s[jsSymbol]));
          } else {
            declareIfNeeded(meta.body[jsSymbol]);
          }
        } else if (meta.kind === JSMetaKind.Call) {
          declareIfNeeded(meta.callable[jsSymbol]);
          meta.values.forEach((v) => declareIfNeeded(v[jsSymbol]));
        } else if (meta.kind === JSMetaKind.Template) {
          for (const r of meta.replacements) {
            declareIfNeeded(r[jsSymbol]);
          }
        }

        // Ensure current should still be declared
        if (shouldDeclare(meta)) {
          const ds = scopedDeclarations.get(meta.scope?.body ?? globalBody);
          if (ds) ds.push(meta);
          else scopedDeclarations.set(meta.scope?.body ?? globalBody, [meta]);
        } else {
          declaredRefs.delete(meta);
        }
      }
    })
  );

  let argIndex = -1;
  const argNames = new Map<JSMeta & JSMetaArgument, string>();
  const argName = (arg: JSMeta & JSMetaArgument) =>
    argNames.get(arg) ?? (() => {
      const name = argn(++argIndex);
      argNames.set(arg, name);
      return name;
    })();

  let lastVarId = -1;
  const declared = new Map<JSMeta, string>();

  const bodyToRawStatements = (body: JSFnBody<unknown>): readonly string[] => {
    const rawStatements: string[] = [];

    const assignments: string[] = [];
    scopedDeclarations.get(body)?.forEach((scoped) => {
      if (!declared.has(scoped)) {
        const name = `${varArg}${++lastVarId}`;
        declared.set(scoped, name);
        assignments.push(`${name}=${exprToRawJS(scoped, true)}`);
      }
    });

    if (assignments.length) {
      rawStatements.push(`let ${assignments.join(",")}`);
    }

    if (Array.isArray(body)) {
      rawStatements.push(
        ...body.map((s) => exprToRawJS(s[jsSymbol])),
      );
    } else {
      rawStatements.push(exprToRawJS(body[jsSymbol]));

      if (rawStatements.length === 2) {
        rawStatements[1] = `return ${rawStatements[1]}`;
      }
    }

    return rawStatements;
  };

  const exprToRawJS = (meta: JSMeta, declare?: boolean): string => {
    const varName = declared.get(meta);
    if (varName && !declare) return varName;

    switch (meta.kind) {
      case JSMetaKind.Function: {
        const { args, body } = meta;
        const argNames = args.map((a) => argName(a[jsSymbol]));
        const argsStr = argNames.length === 1
          ? argNames[0]
          : `(${argNames.join(",")})`;

        const stmts = bodyToRawStatements(body);
        const bodyStr = stmts.length === 1 && !Array.isArray(body)
          ? `(${stmts[0]})`
          : `{${stmts.join(";")}}`;
        return declare ? `${argsStr}=>${bodyStr}` : `(${argsStr}=>${bodyStr})`;
      }

      case JSMetaKind.Call: {
        return `${exprToRawJS(meta.callable[jsSymbol])}(${
          meta.values.map((v) => exprToRawJS(v[jsSymbol])).join(",")
        })`;
      }

      case JSMetaKind.Template: {
        const { rawJS, replacements } = meta;
        const jsParts = Array<string>(2 * replacements.length + 1);
        jsParts[0] = rawJS[0];
        for (let r = 0; r < replacements.length; r++) {
          const p = r + 1;
          jsParts[p * 2 - 1] = exprToRawJS(replacements[r][jsSymbol]);
          jsParts[p * 2] = rawJS[p];
        }
        return jsParts.join("");
      }

      case JSMetaKind.Argument:
        return argName(meta);

      case JSMetaKind.Ref:
        return `${refsArg}[${getRef(meta)}]`;

      case JSMetaKind.Module:
        return `${modulesArg}[${storeModule(meta.url)}]`;

      case JSMetaKind.Resource:
        return `${resourcesArg}(${storeResource(meta.resource)})`;
    }
  };

  const argsName = globalArgs.map((a) => argName(a[jsSymbol])) as {
    -readonly [I in keyof A]: string;
  };
  const statements = bodyToRawStatements(globalBody);

  return [
    statements.length > 1 || Array.isArray(globalBody)
      ? statements.join(";") + ";"
      : `return ${statements[0]};`,
    ...argsName,
  ];
};

const neverStore = () => {
  throw Error("All modules, refs and resources must be stored");
};

const trackedScopes: (JSMeta & JSMetaFunction)[] = [];

const jsable =
  <M>(meta: M) => <T, R = false>(): { [jsSymbol]: M & JSableType<T, R> } => {
    (meta as { scope: JSMetaFunction }).scope = trackedScopes[0];
    const expr = {
      [jsSymbol]: meta as M & JSableType<T, R>,
    } as const;
    return expr;
  };

const jsUtils = {
  comma: <T>(...exprs: [...JSable<unknown>[], JSable<T>]): JS<T> => {
    const parts = Array(exprs.length + 1);
    parts[0] = `(`;
    for (let i = 0; i < exprs.length; i++) {
      parts[i + 1] = ",";
    }
    parts[exprs.length] = ")";
    return jsTpl(parts, ...exprs);
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
  ): Cb extends Fn<infer Args, infer T>
    ? JS<(...args: Args) => T> & JSableFunction<(...args: Args) => T>
    : never => {
    const args = Array(cb.length).fill(0).map(() => arg());
    const expr = jsable(
      { kind: JSMetaKind.Function, args, body: null! } as const,
    )<Cb extends Fn<infer Args, infer T> ? (...args: Args) => T : never>();

    // Making body lazy allows self-referencing functions
    let body: JSFnBody<unknown> | null = null;
    Object.defineProperty(expr[jsSymbol], "body", {
      get() {
        if (!body) {
          trackedScopes.unshift(expr[jsSymbol]);
          body = cb(...args);
          trackedScopes.shift();
        }
        return body;
      },
    });

    return makeConvenient(expr) as Cb extends Fn<infer Args, infer T>
      ? JS<(...args: Args) => T> & JSableFunction<(...args: Args) => T>
      : never;
  },

  module: <M>(path: string): JS<M> =>
    makeConvenient(
      jsable({ kind: JSMetaKind.Module, url: path } as const)<M>(),
    ),

  optional: <T>(expr: JSable<T>): JS<NonNullable<T>> => {
    const p = js<NonNullable<T>>`${expr}`;
    (p[jsSymbol] as Writable<JSMeta<NonNullable<T>>>).isOptional = true;
    return p;
  },

  string: (
    tpl: ReadonlyArray<string>,
    ...exprs: ImplicitlyJSable[]
  ): JS<string> => {
    const parts = Array(tpl.length);
    parts[0] = `\`${tpl[0].replaceAll(/[`$]/g, (m) => "\\" + m)}`;
    for (let i = 0; i < exprs.length; i++) {
      parts[i] += "${";
      parts[i + 1] = `}${tpl[i + 1].replaceAll(/[`$]/g, (m) => "\\" + m)}`;
    }
    parts[parts.length - 1] += "`";
    return jsTpl(parts, ...exprs);
  },

  window: new Proxy({}, { get: (_, p) => jsTpl([p as string]) }) as
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

export const arg = <T>(name?: string): JS<T> & JSableArgument<T> =>
  makeConvenient(
    jsable({ kind: JSMetaKind.Argument, name, isntAssignable: true } as const)<
      T
    >(),
  );

export const mkRef = <T extends EventTarget>(): JS<T> =>
  makeConvenient(
    jsable({ kind: JSMetaKind.Ref, isntAssignable: true } as const)<T>(),
  );

export const resource = <T extends Readonly<Record<string, JSONable>>>(
  uri: string,
  fetch: T | PromiseLike<T> | (() => T | PromiseLike<T>),
): JS<T> & JSableResource<T> => {
  let value: null | [T | PromiseLike<T>] = null;
  return makeConvenient(
    jsable(
      {
        kind: JSMetaKind.Resource,
        resource: {
          uri,
          get value() {
            return (value ??= [typeof fetch === "function" ? fetch() : fetch])[
              0
            ];
          },
          set value(v: T | PromiseLike<T>) {
            value = [v];
          },
        },
        isntAssignable: true,
      } as const,
    )<T>(),
  );
};

export const resources = <
  T extends Readonly<Record<string, JSONable>>,
  U extends string,
>(
  pattern: U,
  fetch: (params: { [k in ParamKeys<U>]: string }) => T | Promise<T>,
): ResourceGroup<T, U> => {
  const make = (params: { [k in ParamKeys<U>]: string | number }) => {
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
      values: (values.map((v) =>
        make(v)[jsSymbol].resource.value
      )) as unknown as readonly Resource<T>[],
    }),
  });
  return group;
};

export const sync = async <J extends JSable<any>>(
  js: J,
  store = new Map<string, Promise<JSONable>>(),
): Promise<J> => {
  const meta = js[jsSymbol];

  if (meta.kind === JSMetaKind.Resource) {
    const q = store.get(meta.resource.uri) ??
      Promise.resolve(meta.resource.value);
    store.set(meta.resource.uri, q);
    (meta.resource as Writable<Resource<JSONable>>).value = await q;
  } else if (meta.kind === JSMetaKind.Function) {
    if (Array.isArray(meta.body)) {
      await Promise.all(meta.body.map((r) => sync(r, store)));
    } else {
      await sync(meta.body, store);
    }
  } else if (meta.kind === JSMetaKind.Call) {
    await Promise.all([
      sync(meta.callable, store),
      ...meta.values.map((v) => sync(v, store)),
    ]);
  } else if (meta.kind === JSMetaKind.Template) {
    await Promise.all(meta.replacements.map((r) => sync(r, store)));
  }

  return js;
};
