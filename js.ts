import type { Activation } from "./dom.ts";
import { varArg } from "./dom/arg-alias.ts";
import { argn } from "./dom/arg-alias.ts";
import type {
  Fn,
  ImplicitlyJSable,
  JS,
  JSable,
  JSableType,
  JSFnBody,
  JSMeta,
  JSONable,
  ParamKeys,
  Resource,
  ResourceGroup,
  Resources,
} from "./js/types.ts";
import { isJSable, jsSymbol } from "./js/types.ts";

type Writable<T> = { -readonly [K in keyof T]: T[K] };

type IJSMeta = {
  scope?: JSMeta & { body: JSFnBody };
  template(
    context: IJSMetaContext,
  ): (string | JSable)[] | Promise<(string | JSable)[]>;
};

type IJSMetaContext = {
  isServer?: boolean;
  asyncScopes: Set<JSMetaFunction | undefined>;
  scopedDeclarations: Map<JSFnBody, JSMeta[]>;
  declaredNames: Map<JSMeta, string>;
  implicitRefs: Map<ImplicitlyJSable, JSable>;
  argn: number;
  args: Map<JSMetaArgument, string>;
  modules: JSable & { [jsSymbol]: JSMetaModuleStore };
  refs?: JSMetaRefStore;
  resources?: JSable & { [jsSymbol]: JSMetaResources };
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
  jsable({ template: () => [js], isntAssignable: true } as const)<unknown>();

const jsTpl = ((
  tpl: ReadonlyArray<string> | ((...args: any[]) => JSFnBody<any>),
  ...exprs: ImplicitlyJSable[]
) =>
  typeof tpl === "function"
    ? makeConvenient(jsable(new JSMetaFunction(tpl))())
    : makeConvenient(jsable(new JSMetaTemplate(tpl, exprs))())) as {
    <T>(tpl: ReadonlyArray<string>, ...exprs: ImplicitlyJSable[]): JS<T>;
    <Cb extends (...args: any[]) => JSFnBody<any>>(
      cb: Cb,
    ): Cb extends Fn<infer Args, infer T>
      ? JS<(...args: Args) => T> & { [jsSymbol]: JSMetaFunction }
      : never;
  };

class JSMetaTemplate implements IJSMeta {
  public readonly hasResources: boolean;

  constructor(
    readonly tpl: readonly string[],
    readonly exprs: ImplicitlyJSable[],
  ) {
    this.hasResources = this.exprs.some((e) =>
      isJSable(e) && e[jsSymbol].hasResources
    );
  }

  template(context: IJSMetaContext): (string | JSable)[] {
    const r = Array<string | JSable>(
      this.tpl.length + this.exprs.length,
    );
    let i = 0;
    for (; i < this.exprs.length; i++) {
      r[i * 2] = this.tpl[i];
      r[i * 2 + 1] = implicit(context, this.exprs[i], (this as IJSMeta).scope);
    }
    r[i * 2] = this.tpl[i];
    return r;
  }

  [Symbol.for("Deno.customInspect")](opts: Deno.InspectOptions) {
    return this.tpl.map((t, i) => {
      const expr = this.exprs[i];
      return `${t}${
        i < this.exprs.length
          ? Deno.inspect(isJSable(expr) ? expr[jsSymbol] : expr, opts)
          : ""
      }`;
    }).join("");
  }
}

const implicit = (
  context: IJSMetaContext,
  expr: ImplicitlyJSable,
  scope: undefined | JSMeta & { body: JSFnBody },
): JSable | string => {
  if (expr === null) {
    return `null`;
  } else if (expr === undefined) {
    return `void 0`;
  } else if ((typeof expr === "object" || typeof expr === "function")) {
    if (jsSymbol in expr && expr[jsSymbol]) return expr as JSable;

    const existing = context.implicitRefs.get(expr);
    if (existing) return existing;

    const newImplicit = typeof expr === "function"
      ? jsable(new JSMetaFunction(expr))()
      : Array.isArray(expr)
      ? jsable(new JSMetaArray(expr))()
      : jsable(new JSMetaObject(expr))();
    // @ts-ignore
    newImplicit[jsSymbol].scope = scope;
    // @ts-ignore
    context.implicitRefs.set(expr, newImplicit);
    // @ts-ignore
    return newImplicit;
  } else {
    return JSON.stringify(expr);
  }
};

class JSMetaObject implements IJSMeta {
  constructor(
    private readonly expr: {
      readonly [k: string]: ImplicitlyJSable;
      readonly [jsSymbol]?: undefined;
    },
  ) {}

  template(context: IJSMetaContext): (string | JSable)[] {
    const entries = Object.entries(
      this.expr as { [k: string]: ImplicitlyJSable },
    );
    if (!entries.length) return [`{}`];
    else {
      const tpl = Array<string | JSable>(entries.length * 3 + 1);
      tpl[0] = `{`;
      for (let i = 0; i < entries.length; i++) {
        const [k, v] = entries[i];
        tpl[i * 3 + 1] = `${
          typeof k === "number" || safeRecordKeyRegExp.test(k)
            ? k
            : JSON.stringify(k)
        }:`;
        tpl[i * 3 + 2] = implicit(context, v, (this as IJSMeta).scope);
        tpl[i * 3 + 3] = `,`;
      }
      tpl[tpl.length - 1] = `}`;
      return tpl;
    }
  }

  [Symbol.for("Deno.customInspect")]({ ...opts }: Deno.InspectOptions) {
    opts.depth ??= 4;
    if (--opts.depth < 0) return `{...}`;
    return `{${
      Object.entries(this.expr).map(([k, v]) =>
        `${k}: ${Deno.inspect(v, opts)}`
      )
        .join(", ")
    }}`;
  }
}

class JSMetaArray implements IJSMeta {
  constructor(private readonly expr: readonly ImplicitlyJSable[]) {}

  template(context: IJSMetaContext): (string | JSable)[] {
    if (!this.expr.length) return [`[]`];
    else {
      const tpl = Array<string | JSable>(this.expr.length * 2 + 1);
      tpl[0] = `[`;
      for (let i = 0; i < this.expr.length; i++) {
        tpl[i * 2 + 1] = implicit(
          context,
          this.expr[i],
          (this as IJSMeta).scope,
        );
        tpl[i * 2 + 2] = `,`;
      }
      tpl[tpl.length - 1] = `]`;
      return tpl;
    }
  }

  [Symbol.for("Deno.customInspect")]({ ...opts }: Deno.InspectOptions) {
    opts.depth ??= 4;
    if (--opts.depth < 0) return `[...]`;
    return `[${this.expr.map((e) => Deno.inspect(e, opts)).join(", ")}]`;
  }
}

const makeConvenient = <J extends JSable>(
  expr: J,
): J extends JSable<infer T> ? JS<T> & J : never => {
  const callExpr = (...argArray: ReadonlyArray<JSable | JSONable>) => {
    const e = makeConvenient(
      jsable<JSMetaCall>(
        new JSMetaCall(
          expr as unknown as JSable & { [jsSymbol]: JSMetaFunction },
          argArray.map((a) =>
            typeof a === "function" && jsSymbol in a ? a : js`${a}`
          ),
        ),
      )(),
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
      (argArray[0] as (r: unknown) => void)(
        makeConvenient(jsable(new JSMetaAwait(expr[jsSymbol].thenable))()),
      );
    }

    return e;
  };
  callExpr[targetSymbol] = expr;
  return new Proxy(callExpr, jsProxyHandler) as any;
};

class JSMetaCall implements IJSMeta {
  readonly hasResources: boolean;

  constructor(
    private readonly callable: JSable,
    private readonly values: readonly JSable[],
  ) {
    this.hasResources = values.some((v) => v[jsSymbol].hasResources);
  }

  template(context: IJSMetaContext): (string | JSable)[] {
    return [
      ...(context.declaredNames.has(this.callable[jsSymbol]) ||
          !(this.callable[jsSymbol] instanceof JSMetaFunction)
        ? [this.callable]
        : ["(", this.callable, ")"]),
      "(",
      ...this.values.flatMap((v, i) => i > 0 ? [",", v] : v),
      ")",
    ];
  }

  [Symbol.for("Deno.customInspect")](opts: Deno.InspectOptions) {
    return `[${Deno.inspect(this.callable[jsSymbol], opts)}](${
      this.values.map((v) => Deno.inspect(v[jsSymbol], opts)).join(", ")
    })`;
  }
}

class JSMetaAwait implements IJSMeta {
  isAwaited = true;

  constructor(private readonly _expr: JSable) {}

  template(): (string | JSable)[] {
    return ["(await ", this._expr, ")"];
  }

  [Symbol.for("Deno.customInspect")](opts: Deno.InspectOptions) {
    return `await ${Deno.inspect(this._expr[jsSymbol], opts)}`;
  }
}

export const toJS = async <A extends readonly unknown[]>(f: Fn<A, unknown>, {
  activation,
  resolve,
  isServer,
}: {
  resolve?: (url: string) => string;
  activation?: [
    JS<NodeList | readonly Node[]>,
    Activation,
    readonly JSable<EventTarget>[],
  ];
  isServer?: boolean;
} = {}): Promise<[string, ...{ -readonly [I in keyof A]: string }]> => {
  const globalFn = jsable(
    new JSMetaFunction(f as Fn<readonly any[], unknown>, false),
  )()[jsSymbol];
  const globalBody = globalFn.body[jsSymbol];

  let lastVarId = -1;
  const context: IJSMetaContext = mkMetaContext({ isServer, resolve });

  if (activation) {
    context.refs = new JSMetaRefStore(
      activation[0],
      activation[1],
      activation[2],
    );
  }

  const scopeToRefs = new Map<JSMeta | undefined, Set<JSMeta>>();
  const refToParentReuse = new Map<
    JSMeta,
    Map<JSMeta | undefined, { reused?: boolean; outOfScope: boolean }>
  >();
  const refToChildren = new Map<JSMeta, readonly JSMeta[]>();
  {
    type Job =
      | readonly [JSMeta]
      | readonly [JSMeta, JSMeta | undefined, JSMetaFunction | undefined];
    const jobs: Job[] = [[globalBody]];
    for (let job; (job = jobs.shift());) {
      const [meta, parent, enclosing] = job;

      const refParentReuse = refToParentReuse.get(meta) ??
        new Map<
          JSMeta | undefined,
          { reused?: boolean; outOfScope: boolean }
        >();
      refToParentReuse.set(meta, refParentReuse);

      const def = refParentReuse.get(parent) ?? { outOfScope: false };
      def.reused = def.reused != null;
      def.outOfScope ||= enclosing !== meta.scope;
      refParentReuse.set(parent, def);

      scopeToRefs.set(
        meta.scope,
        (scopeToRefs.get(meta.scope) ?? new Set()).add(meta),
      );

      if (meta.isAwaited) {
        context.asyncScopes.add(meta.scope as unknown as JSMetaFunction);
      }

      if (!refToChildren.has(meta)) {
        const children: JSMeta[] = [];
        for (const c of await meta.template(context)) {
          if (typeof c !== "string") children.push(c[jsSymbol]);
        }
        refToChildren.set(meta, children);

        const subEnclosing = meta instanceof JSMetaFunction ? meta : enclosing;
        jobs.unshift(...children.map((c) => [c, meta, subEnclosing] as const));
      }
    }
  }

  const visitedRefs = new Set<JSMeta>();
  const declaredRefs = new Set<JSMeta>();
  const shouldDeclare = (meta: JSMeta): boolean => {
    let used = false;
    if (meta.isntAssignable) return false;

    for (
      const [parent, { reused, outOfScope }] of refToParentReuse.get(meta)!
    ) {
      if (reused) return true;
      if (!(parent && declaredRefs.has(parent))) {
        if (
          used || (outOfScope && (!parent || !hasAssignedParentInScope(parent)))
        ) return true;
        used = true;
      }
    }

    return false;
  };
  const hasAssignedParentInScope = (meta: JSMeta): boolean => {
    for (const parent of refToParentReuse.get(meta)!.keys()) {
      if (parent && parent.scope === meta.scope) {
        if (declaredRefs.has(parent) || hasAssignedParentInScope(parent)) {
          return true;
        }
      }
    }
    return false;
  };

  const declareIfNeeded = (meta: JSMeta): boolean => {
    if (visitedRefs.has(meta)) return false;
    visitedRefs.add(meta);

    if (shouldDeclare(meta)) {
      declaredRefs.add(meta);
    }
    let assignedChildren = false;

    // Try declare contained expressions, pretending current is declared
    for (const c of refToChildren.get(meta)!) {
      if (!visitedRefs.has(c) && declareIfNeeded(c)) assignedChildren = true;
    }

    // Ensure current should still be declared
    if (declaredRefs.has(meta) && (!assignedChildren || shouldDeclare(meta))) {
      context.declaredNames.set(meta, `${varArg}${++lastVarId}`);
      const ds = context.scopedDeclarations.get(
        (meta.scope as unknown as JSMetaFunction ?? globalFn).body[jsSymbol]
          .fnBody,
      );
      if (ds) ds.push(meta);
      else {
        context.scopedDeclarations.set(
          (meta.scope as unknown as JSMetaFunction ?? globalFn).body[jsSymbol]
            .fnBody,
          [meta],
        );
      }
      return true;
    } else {
      declaredRefs.delete(meta);
    }
    return false;
  };

  for (const refs of scopeToRefs.values()) {
    for (const meta of refs) {
      declareIfNeeded(meta);
    }
  }

  const argsName = globalFn.args.map((a) =>
    (a[jsSymbol].template(context) as string[]).join("")
  ) as { -readonly [I in keyof A]: string };
  const globalBodyStr = await metaToJS(context, globalBody);

  return [
    globalBody.isExpression(context)
      ? `return ${globalBodyStr};`
      : globalBodyStr.slice(1, -1) + ";",
    ...argsName,
  ];
};

const mkMetaContext = (
  { resolve = (url) => import.meta.resolve(url), isServer = true }: {
    resolve?: (uri: string) => string;
    isServer?: boolean;
  } = {},
): IJSMetaContext => ({
  isServer,
  argn: -1,
  args: new Map(),
  scopedDeclarations: new Map(),
  declaredNames: new Map(),
  implicitRefs: new Map(),
  asyncScopes: new Set(),
  modules: jsable(new JSMetaModuleStore(resolve))(),
});

const metaToJS = async (
  context: IJSMetaContext,
  meta: JSMeta,
  declare?: boolean,
): Promise<string> => {
  const parts = [];
  const templates: (string | JSable)[] = [jsable(meta)()];

  for (let first; (first = templates.shift()) != null;) {
    if (typeof first === "string") {
      parts.push(first);
    } else {
      const d = context.declaredNames.get(first[jsSymbol]);
      if (d && !declare) {
        if (first[jsSymbol].hasResources) parts.push(d, "()");
        else parts.push(d);
      } else {
        declare = false;
        templates.unshift(...await first[jsSymbol].template(context));
      }
    }
  }

  return parts.join("");
};

export const jsResources = (expr: JSable): string[] => {
  const context: IJSMetaContext = mkMetaContext();
  const r = new Set<string>();
  const visited = new Set<JSable>();
  const children: (JSable | string)[] = [expr];
  for (let c; (c = children.pop());) {
    if (typeof c !== "string" && !visited.has(c)) {
      visited.add(c);
      const meta = c[jsSymbol];
      if (meta instanceof JSMetaResource) r.add(meta.uri);
      else {
        const tpl = meta.template(context);
        if (!(tpl instanceof Promise)) children.push(...tpl);
      }
    }
  }
  return [...r];
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
    const [rawJS] = await toJS(() => expr, { isServer: true });
    const jsBody = `return(async()=>{${rawJS}})()`;
    try {
      return new Function("document", "window", jsBody)();
    } catch (e) {
      console.error("Failed evaluating function with the following JS", jsBody);
      throw e;
    }
  },

  fn: <Cb extends (...args: any[]) => JSFnBody<any>>(
    cb: Cb,
  ): Cb extends Fn<infer Args, infer T>
    ? JS<(...args: Args) => T> & { [jsSymbol]: JSMetaFunction }
    : never =>
    makeConvenient(jsable(new JSMetaFunction(cb))()) as Cb extends
      Fn<infer Args, infer T>
      ? JS<(...args: Args) => T> & { [jsSymbol]: JSMetaFunction }
      : never,

  module: <M>(path: string): JS<M> =>
    makeConvenient(jsable(new JSMetaModule(path))<M>()),

  optional: <T>(expr: JSable<T>): JS<NonNullable<T>> => {
    const p = js<NonNullable<T>>`${expr}`;
    (p[jsSymbol] as Writable<JSMeta<NonNullable<T>>>).isOptional = true;
    return p;
  },

  reassign: <T>(varMut: JSable<T>, expr: JSable<T>): JS<T> =>
    makeConvenient(jsable(new JSMetaReassign(varMut, expr))<T>()),

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

const trackedScopes: JSMetaFunction[] = [];

const jsable =
  <M>(meta: M) => <T, R = false>(): { [jsSymbol]: M & JSableType<T, R> } => {
    (meta as { scope: JSMetaFunction }).scope ??= trackedScopes[0];
    const expr = {
      [jsSymbol]: meta as M & JSableType<T, R>,
      [Symbol.for("Deno.customInspect")]: (opts: Deno.InspectOptions) =>
        Deno.inspect(meta, opts),
    } as const;
    return expr;
  };

class JSMetaFunction implements IJSMeta {
  readonly args: readonly (JS<unknown> & { [jsSymbol]: JSMetaArgument })[];

  constructor(
    private readonly cb: Fn<readonly unknown[], unknown>,
    private readonly scoped = true,
  ) {
    this.args = Array(cb.length).fill(0).map(() =>
      makeConvenient(jsable(new JSMetaArgument())())
    );
  }

  private _hasResources?: boolean;
  get hasResources() {
    return this._hasResources ??= this.body[jsSymbol].hasResources;
  }

  // Making body lazy allows self-referencing functions
  private _body?: JSable & { [jsSymbol]: JSMetaFunctionBody };
  get body(): JSable & { [jsSymbol]: JSMetaFunctionBody } {
    if (!this._body) {
      if (this.scoped) trackedScopes.unshift(this);
      this._body = jsable(new JSMetaFunctionBody(this.cb(...this.args)))();
      if (this.scoped) trackedScopes.shift();
    }
    return this._body;
  }

  template(context: IJSMetaContext): (string | JSable)[] {
    const args: (string | JSable)[] = this.args.length === 1
      ? [this.args[0]]
      : ["(", ...this.args.flatMap((a, i) => i ? [",", a] : a), ")"];

    if (context.asyncScopes.has(this)) {
      args.unshift("async ");
    }

    return [...args, "=>", this.body];
  }

  [Symbol.for("Deno.customInspect")]({ ...opts }: Deno.InspectOptions) {
    opts.depth ??= 4;
    return `function(${
      this.args.map((a) => Deno.inspect(a[jsSymbol], opts)).join(", ")
    }) ${opts.depth! < 0 ? "..." : Deno.inspect(this.body, opts)}`;
  }
}

class JSMetaFunctionBody implements IJSMeta {
  readonly hasResources?: boolean;

  constructor(public readonly fnBody: JSFnBody) {
    this.hasResources = Array.isArray(this.fnBody)
      ? this.fnBody.some((s) => s[jsSymbol].hasResources)
      : this.fnBody[jsSymbol].hasResources;
  }

  isExpression(context: IJSMetaContext): boolean {
    return !Array.isArray(this.fnBody) &&
      !context.scopedDeclarations.get(this.fnBody)?.length;
  }

  async template(context: IJSMetaContext): Promise<(string | JSable)[]> {
    const { scopedDeclarations, declaredNames } = context;
    const parts: (string | JSable)[] = ["{"];

    const assignments: string[] = [];
    for (const scoped of scopedDeclarations.get(this.fnBody) ?? []) {
      assignments.push(
        `${declaredNames.get(scoped)}=${
          scoped.hasResources ? "()=>" : ""
        }${await metaToJS(context, scoped, true)}`,
      );
    }

    if (assignments.length) {
      parts.push(`let ${assignments.join(",")};`);
    }

    if (Array.isArray(this.fnBody)) {
      const lastIndex = this.fnBody.length - 1;
      this.fnBody.forEach((s, i) =>
        i < lastIndex ? parts.push(s, ";") : parts.push(s)
      );
    } else {
      if (assignments.length) {
        parts.push("return ", this.fnBody);
      } else {
        let firstBodyMeta = this.fnBody[jsSymbol];
        while (firstBodyMeta instanceof JSMetaTemplate) {
          const e = implicit(
            context,
            firstBodyMeta.exprs[0],
            firstBodyMeta.scope as any,
          );
          if (typeof e === "string") break;
          else firstBodyMeta = e[jsSymbol];
        }

        if (
          firstBodyMeta instanceof JSMetaObject &&
          !context.declaredNames.has(firstBodyMeta)
        ) {
          return ["(", this.fnBody, ")"];
        }

        return [this.fnBody];
      }
    }

    parts.push("}");
    return parts;
  }

  [Symbol.for("Deno.customInspect")](opts: Deno.InspectOptions) {
    return Array.isArray(this.fnBody)
      ? this.fnBody.length
        ? `{${
          this.fnBody.map((s) => `\n  ${Deno.inspect(s[jsSymbol], opts)};`)
            .join("")
        }\n}`
        : `{}`
      : Deno.inspect(this.fnBody[jsSymbol], opts);
  }
}

class JSMetaArgument implements IJSMeta {
  readonly isntAssignable = true;

  constructor(private name?: string) {}

  template(context: IJSMetaContext): (string | JSable)[] {
    const existing = context.args.get(this);
    if (existing) return [existing];

    const newName = this.name ?? argn(++context.argn);
    context.args.set(this, newName);
    return [newName];
  }

  [Symbol.for("Deno.customInspect")]() {
    return this.name ? this.name : "?";
  }
}

class JSMetaModule implements IJSMeta {
  constructor(private url: string) {}

  template(context: IJSMetaContext): (string | JSable)[] {
    return [context.modules, `[${context.modules[jsSymbol].index(this.url)}]`];
  }

  [Symbol.for("Deno.customInspect")]() {
    return `import(${this.url})`;
  }
}

class JSMetaModuleStore implements IJSMeta {
  isAwaited = true;
  readonly #urls: Record<string, number> = {};
  #i = 0;

  constructor(private readonly resolve: (url: string) => string) {}

  template(_: IJSMetaContext): (string | JSable)[] {
    return [
      `await Promise.all(${
        JSON.stringify(Object.keys(this.#urls).map(this.resolve))
      }.map(u=>import(u)))`,
    ];
  }

  index(url: string) {
    return this.#urls[url] ??= this.#i++;
  }

  [Symbol.for("Deno.customInspect")]() {
    return `modules`;
  }
}

class JSMetaRef implements IJSMeta {
  readonly isntAssignable = true;

  constructor() {}

  template(context: IJSMetaContext): (string | JSable)[] {
    if (!context.refs) throw Error(`Must provide activation when using refs`);
    return [context.refs.js, `[${context.refs.byMeta.get(this)}]`];
  }

  [Symbol.for("Deno.customInspect")]() {
    return `ref`;
  }
}

const makeRefs = js.fn((
  nodes: JS<NodeList | readonly Node[]>,
  activation: JS<Activation>,
): JSable<readonly EventTarget[]> =>
  // @ts-ignore
  activation.flatMap(([childIndex, h1]) => {
    const child = js<ChildNode>`${nodes}[${childIndex}]`;
    // @ts-ignore
    return js`${h1}?${makeRefs(child.childNodes, h1)}:${child}`;
  })
);

class JSMetaRefStore {
  readonly byMeta = new Map<JSMetaRef, number>();
  readonly js: JS<readonly EventTarget[]>;

  constructor(
    nodes: JS<NodeList | readonly Node[]>,
    activation: Activation,
    refs: readonly JSable<EventTarget>[],
  ) {
    refs.forEach((r, i) =>
      this.byMeta.set(
        // @ts-ignore: TODO Make JSables specific to new sub-meta types
        r[jsSymbol],
        i,
      )
    );
    this.js = makeRefs(
      nodes,
      makeConvenient(unsafe(JSON.stringify(activation)) as JSable<Activation>),
    );
  }
}

const domApi =
  js.module<typeof import("./dom.ts")>(import.meta.resolve("./dom.ts")).api;
const domStore = domApi.store;

export const client = {
  store: {
    peek: domStore.peek,
    set: domStore.set,
    sub: domStore.sub,
    [jsSymbol]: domStore[jsSymbol],
  },
  sub: domApi.sub,
  [jsSymbol]: domApi[jsSymbol],
};

class JSMetaResource<T extends JSONable = JSONable> implements IJSMeta {
  readonly hasResources = true;
  readonly isntAssignable = true;

  constructor(
    public readonly uri: string,
    private readonly fetch: T | PromiseLike<T> | (() => T | PromiseLike<T>),
  ) {}

  async template(context: IJSMetaContext): Promise<(string | JSable)[]> {
    context.resources ??= jsable(new JSMetaResources(context))();
    return [await context.resources[jsSymbol].peek<T>(this.uri, this.fetch)];
  }

  [Symbol.for("Deno.customInspect")]() {
    return `$(${this.uri})`;
  }
}

class JSMetaResources implements IJSMeta {
  readonly #store: Record<string, [number, JSONable]> = {};
  #i = 0;
  readonly #initialResources = jsable(
    new JSMetaVar(
      () => [
        JSON.stringify(
          Object.fromEntries(
            Object.entries(this.#store).map(([k, [, v]]) => [k, v]),
          ),
        ),
      ],
    ),
  )();
  readonly #resources = jsable(this)();
  readonly #peek = js.fn((i: JS<number>) =>
    client.store.peek(js`${this.#resources}[${i}]`)
  );

  constructor(private readonly _context: IJSMetaContext) {}

  template(): (string | JSable)[] {
    return [
      `(`,
      client.store.set,
      `(`,
      this.#initialResources,
      `),Object.keys(`,
      this.#initialResources,
      `))`,
    ];
  }

  async peek<T extends JSONable>(
    uri: string,
    fetch: T | PromiseLike<T> | (() => T | PromiseLike<T>),
  ): Promise<JSable<T>> {
    this.#store[uri] ??= [
      this.#i++,
      await (typeof fetch === "function"
        ? (fetch as () => T | PromiseLike<T>)()
        : fetch),
    ];

    return jsable( // Make it non-await-able
      this._context.isServer
        ? new JSMetaVar(
          () => [this.#initialResources, `[${JSON.stringify(uri)}]`],
        )
        : this.#peek(this.#store[uri][0])[jsSymbol],
    )();
  }

  indexOf(uri: string) {
    return this.#store[uri][0];
  }

  [Symbol.for("Deno.customInspect")]() {
    return `resources`;
  }
}

class JSMetaVar implements IJSMeta {
  constructor(
    private readonly cb: (
      context: IJSMetaContext,
    ) => (string | JSable)[] | Promise<(string | JSable)[]>,
  ) {}

  template(
    context: IJSMetaContext,
  ): (string | JSable)[] | Promise<(string | JSable)[]> {
    return this.cb(context);
  }
}

class JSMetaURIs implements IJSMeta {
  constructor(
    private readonly uris:
      | readonly string[]
      | JSable<readonly string[]>
      | readonly JSable<string>[],
  ) {}

  template(context: IJSMetaContext): (string | JSable)[] {
    return Array.isArray(this.uris)
      ? context.resources
        ? [
          "[",
          ...this.uris.flatMap((uri: string | JSable<string>, i) => {
            if (typeof uri === "string") {
              const indexed = js<string>`${context.resources}[${
                context.resources![jsSymbol].indexOf(uri)
              }]`;
              return i > 0 ? [",", indexed] : [indexed];
            } else {
              return i > 0 ? [",", uri] : [uri];
            }
          }),
          "]",
        ]
        : []
      : [this.uris as JSable];
  }
}

export const indexedUris = (
  uris:
    | readonly string[]
    | JSable<readonly string[]>
    | readonly JSable<string>[],
): JSable<string[]> => jsable(new JSMetaURIs(uris))();

class JSMetaReassign implements IJSMeta {
  constructor(
    private readonly varMut: JSable,
    private readonly expr: JSable,
  ) {
    if (expr === varMut) {
      // Re-evaluate
      this.expr = jsable(
        new JSMetaVar((context) => expr[jsSymbol].template(context)),
      )();
    }
  }

  template(context: IJSMetaContext): (string | JSable)[] {
    const varMeta = this.varMut[jsSymbol];
    return context.declaredNames.has(varMeta) ||
        varMeta instanceof JSMetaArgument
      ? [this.varMut, "=", this.expr]
      : [this.varMut, ",", this.expr];
  }
}

export const mkRef = <T extends EventTarget>(): JS<T> =>
  makeConvenient(jsable(new JSMetaRef())<T>());

export const resource = <T extends Readonly<Record<string, JSONable>>>(
  uri: string,
  fetch: T | PromiseLike<T> | (() => T | PromiseLike<T>),
): JS<T> & { [jsSymbol]: JSMetaResource } =>
  makeConvenient(jsable(new JSMetaResource(uri, fetch))<T>());

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
        // @ts-ignore
        make(v)[jsSymbol].resource.value
      )) as unknown as readonly Resource<T>[],
    }),
  });
  return group;
};
