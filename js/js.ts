import type { BuildContext } from "@classic/build";
import type {
  Activation,
  Fn,
  ImplicitlyJSable,
  JS,
  JSable,
  JSableType,
  JSFnBody,
  JSMeta as IJSMeta,
  JSONable,
  JSReturn,
  ParamKeys,
  RefTree,
  ResourceGroup,
  Resources,
} from "./types.ts";
import { isJSable, jsSymbol } from "./types.ts";

// https://graphemica.com/categories/letter-number/page/2
export const argn = (n: number) => `𐏒${n}`;
export const varArg = "𐏑";

type Writable<T> = { -readonly [K in keyof T]: T[K] };

class JSMeta implements IJSMeta<JSMetaContext> {
  thenable?: JSMeta;
  isAwaited?: boolean;
  isntAssignable?: boolean;
  mustDeclare?: boolean;
  readonly hasResources?: boolean;
  readonly isOptional?: boolean;
  readonly scope: JSMeta | null;

  constructor(scope: JSMeta | null = trackedScopes[0] as JSMeta ?? null) {
    this.scope = scope;
  }

  template(
    _context: JSMetaContext,
  ): (string | JSMeta)[] | Promise<(string | JSMeta)[]> {
    throw "unimplemented";
  }
}

type JSMetaContext = {
  isServer?: boolean;
  asyncScopes: Set<JSMetaFunction | null>;
  scopedDeclarations: Map<JSFnBody, JSMeta[]>;
  declaredNames: Map<JSMeta, string>;
  implicitRefs: Map<ImplicitlyJSable, JSMeta>;
  argn: number;
  args: Map<JSMetaArgument, string>;
  modules: JSMetaModuleStore;
  refs?: JSMetaRefStore;
  resources?: JSMetaResources;
  build?: BuildContext;
  moduleCache: Record<string, JSMetaModule>;
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

    const isKeySafe = safeRecordKeyRegExp.test(p as string);

    const before = expr[jsSymbol].isAwaited ? "(" : "";

    let after = expr[jsSymbol].isAwaited ? ")" : "";
    if (isOptional || isKeySafe) after += isOptional ? "?." : ".";
    after += isKeySafe ? p : `[${JSON.stringify(p)}]`;

    const accessedExpr = jsTpl([before, after], expr);
    if (isntAssignable) accessedExpr[jsSymbol].isntAssignable = true;
    if (p === "then") {
      if (expr[jsSymbol].isAwaited) return undefined;
      else accessedExpr[jsSymbol].thenable = expr[jsSymbol];
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
      scope: trackedScopes[0],
      isntAssignable: true,
      template: () => [js],
    } as const,
  )<unknown>();

export const inline = <T extends JSable<unknown>>(expr: T): T => {
  expr[jsSymbol].isntAssignable = true;
  return expr;
};

const jsTpl =
  ((tpl: ReadonlyArray<string>, ...exprs: ImplicitlyJSable[]) =>
    makeConvenient(jsable(new JSMetaTemplate(tpl, exprs))())) as {
      <T>(tpl: ReadonlyArray<string>, ...exprs: ImplicitlyJSable[]): JS<T>;
    };

class JSMetaTemplate extends JSMeta {
  public readonly hasResources: boolean;
  private parts: (string | JSMeta)[];

  constructor(
    readonly tpl: readonly string[],
    readonly exprs: ImplicitlyJSable[],
  ) {
    super();
    this.hasResources = this.exprs.some((e) =>
      isJSable(e) && e[jsSymbol].hasResources
    );

    this.parts = Array<string | JSMeta>(this.tpl.length + this.exprs.length);
    let i = 0;
    for (; i < this.exprs.length; i++) {
      this.parts[i * 2] = this.tpl[i];
      this.parts[i * 2 + 1] = implicit(this.exprs[i]);
    }
    this.parts[i * 2] = this.tpl[i];
  }

  template(): (string | JSMeta)[] {
    return this.parts;
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

const nullMeta: JSMeta = {
  scope: null,
  isntAssignable: true,
  template() {
    return ["null"];
  },
};

const undefinedMeta: JSMeta = {
  scope: null,
  isntAssignable: true,
  template() {
    return ["void 0"];
  },
};

const implicit = (
  expr: ImplicitlyJSable,
  scope: JSMeta | null = trackedScopes[0],
): JSMeta => {
  if (expr === null) {
    return nullMeta;
  } else if (expr === undefined) {
    return undefinedMeta;
  } else if ((typeof expr === "object" || typeof expr === "function")) {
    if (jsSymbol in expr && expr[jsSymbol]) return expr[jsSymbol];
    return new JSMetaVar((context) => {
      const existing = context.implicitRefs.get(expr);
      if (existing) return [existing];

      const newImplicit: JSMeta = typeof expr === "function"
        ? new JSMetaFunction(expr, { scope })
        : Array.isArray(expr)
        ? new JSMetaArray(expr, { scope })
        : new JSMetaObject(expr, { scope });
      context.implicitRefs.set(expr, newImplicit);
      return [newImplicit];
    }, { scope });
  } else {
    return new JSMetaVar(() => [JSON.stringify(expr)], {
      scope,
      isntAssignable: true,
    });
  }
};

class JSMetaObject extends JSMeta {
  private parts: (string | JSMeta)[];

  constructor(
    private readonly expr: {
      readonly [k: string]: ImplicitlyJSable;
      readonly [jsSymbol]?: undefined;
    },
    { scope }: { scope?: JSMeta | null } = {},
  ) {
    super(scope);
    const entries = Object.entries(expr as { [k: string]: ImplicitlyJSable });
    if (!entries.length) this.parts = [`{}`];
    else {
      this.parts = Array<string | JSMeta>(entries.length * 3 + 1);
      this.parts[0] = `{`;
      for (let i = 0; i < entries.length; i++) {
        const [k, v] = entries[i];
        this.parts[i * 3 + 1] = `${
          typeof k === "number" || safeRecordKeyRegExp.test(k)
            ? k
            : JSON.stringify(k)
        }:`;
        this.parts[i * 3 + 2] = implicit(v, scope);
        this.parts[i * 3 + 3] = `,`;
      }
      this.parts[this.parts.length - 1] = `}`;
    }
  }

  template(): (string | JSMeta)[] {
    return this.parts;
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

class JSMetaArray extends JSMeta {
  private parts: (string | JSMeta)[];

  constructor(
    private readonly expr: readonly ImplicitlyJSable[],
    { scope }: { scope?: JSMeta | null } = {},
  ) {
    super(scope);
    if (!this.expr.length) this.parts = [`[]`];
    else {
      this.parts = Array<string | JSMeta>(this.expr.length * 2 + 1);
      this.parts[0] = `[`;
      for (let i = 0; i < this.expr.length; i++) {
        this.parts[i * 2 + 1] = implicit(this.expr[i], scope);
        this.parts[i * 2 + 2] = `,`;
      }
      this.parts[this.parts.length - 1] = `]`;
    }
  }

  template(): (string | JSMeta)[] {
    return this.parts;
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
        new JSMetaCall(expr[jsSymbol], argArray.map((a) => implicit(a))),
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
      const scope = expr[jsSymbol].thenable.scope;
      (argArray[0] as (r: unknown) => void)(
        makeConvenient(jsable(new JSMetaAwait(expr[jsSymbol].thenable))()),
      );
    }

    return e;
  };
  callExpr[targetSymbol] = expr;
  return new Proxy(callExpr, jsProxyHandler) as unknown as J extends
    JSable<infer T> ? JS<T> & J : never;
};

class JSMetaCall extends JSMeta {
  readonly hasResources: boolean;

  constructor(
    private readonly callable: JSMeta,
    private readonly values: readonly JSMeta[],
  ) {
    super();
    this.hasResources = values.some((v) => v.hasResources);
  }

  template(context: JSMetaContext): (string | JSMeta)[] {
    return [
      ...(context.declaredNames.has(this.callable) ||
          !(this.callable instanceof JSMetaFunction)
        ? [this.callable]
        : ["(", this.callable, ")"]),
      "(",
      ...this.values.flatMap((v, i) => i > 0 ? [",", v] : v),
      ")",
    ];
  }

  [Symbol.for("Deno.customInspect")](opts: Deno.InspectOptions) {
    return `[${Deno.inspect(this.callable, opts)}](${
      this.values.map((v) => Deno.inspect(v, opts)).join(", ")
    })`;
  }
}

class JSMetaAwait extends JSMeta {
  isAwaited = true;

  constructor(private readonly _expr: JSMeta) {
    super();
  }

  template(): (string | JSMeta)[] {
    return ["await ", this._expr];
  }

  [Symbol.for("Deno.customInspect")](opts: Deno.InspectOptions) {
    return `await ${Deno.inspect(this._expr, opts)}`;
  }
}

export const toJS = async <A extends readonly unknown[]>(
  f: Fn<A, unknown>,
  { build, refs }: {
    build?: BuildContext;
    refs?: true | [string, RefTree];
  } = {},
): Promise<[string, ...{ -readonly [I in keyof A]: string }]> => {
  const globalFn = new JSMetaFunction(f as Fn<readonly never[], unknown>, {
    scoped: false,
  });
  const globalBody = globalFn.body;

  let lastVarId = -1;
  const context: JSMetaContext = mkMetaContext(!refs, build);

  if (refs && refs !== true) {
    context.refs = new JSMetaRefStore(...refs);
  }

  const scopeToRefs = new Map<JSMeta | null, Set<JSMeta>>();
  const refToParentReuse = new Map<
    JSMeta,
    Map<JSMeta | undefined, { reused?: boolean; outOfScope: boolean }>
  >();
  const refToChildren = new Map<JSMeta, readonly JSMeta[]>();
  {
    type Job = readonly [JSMeta, JSMeta | undefined, JSMetaFunction | null];
    const jobs: Job[] = [[globalBody, undefined, null]];
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
        context.asyncScopes.add(meta.scope as JSMetaFunction);
      }

      if (!refToChildren.has(meta)) {
        const children: JSMeta[] = [];
        for (const c of await meta.template(context)) {
          if (typeof c !== "string") children.push(c);
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
    if (meta.mustDeclare) return true;
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
        (meta.scope as JSMetaFunction ?? globalFn).body.fnBody,
      );
      if (ds) ds.push(meta);
      else {
        context.scopedDeclarations.set(
          (meta.scope as JSMetaFunction ?? globalFn).body.fnBody,
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
    (a.template(context) as string[]).join("")
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
  isServer = true,
  build?: BuildContext,
): JSMetaContext => ({
  isServer,
  argn: -1,
  args: new Map(),
  scopedDeclarations: new Map(),
  declaredNames: new Map(),
  implicitRefs: new Map(),
  asyncScopes: new Set(),
  modules: new JSMetaModuleStore(isServer),
  moduleCache: {},
  build,
});

const metaToJS = async (
  context: JSMetaContext,
  meta: JSMeta,
  declare?: boolean,
): Promise<string> => {
  const parts = [];
  const templates: (string | JSMeta)[] = [meta];

  for (let first; (first = templates.shift()) != null;) {
    if (typeof first === "string") {
      parts.push(first);
    } else {
      const d = context.declaredNames.get(first);
      if (d && !declare) {
        if (first.hasResources) parts.push(d, "()");
        else parts.push(d);
      } else {
        declare = false;
        templates.unshift(...await first.template(context));
      }
    }
  }

  return parts.join("");
};

export const jsResources = (expr: JSable): string[] => {
  const context: JSMetaContext = mkMetaContext();
  const r = new Set<string>();
  const visited = new Set<JSMeta>();
  const children: (JSMeta | string)[] = [expr[jsSymbol]];
  for (let meta; (meta = children.pop());) {
    if (typeof meta !== "string" && !visited.has(meta)) {
      visited.add(meta);
      if (meta instanceof JSMetaResource) r.add(meta.uri);
      else {
        const tpl = meta.template(context);
        if (!(tpl instanceof Promise)) children.push(...tpl);
      }
    }
  }
  return [...r];
};

export interface Module {}

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
    const [rawJS] = await toJS(() => expr);
    const jsBody = `return(async()=>{${rawJS}})()`;
    try {
      return new Function("document", "window", jsBody)();
    } catch (e) {
      console.error("Failed evaluating function with the following JS", jsBody);
      throw e;
    }
  },

  fn: <Cb extends (...args: readonly never[]) => JSFnBody<unknown>>(
    cb: Cb,
  ): Cb extends Fn<infer Args, infer T>
    ? JS<(...args: Args) => T> & { [jsSymbol]: JSMetaFunction }
    : never =>
    makeConvenient(jsable(new JSMetaFunction(cb))()) as Cb extends
      Fn<infer Args, infer T>
      ? JS<(...args: Args) => T> & { [jsSymbol]: JSMetaFunction }
      : never,

  module: ((name: string) =>
    makeConvenient(
      jsable(
        new JSMetaVar((context) => {
          if (!context.build) throw Error(`Must configure JS modules`);
          const pub = context.build.resolve(name);
          if (pub == null) {
            throw Error(
              `${name} needs to be added to your client modules configuration`,
            );
          }
          return [context.moduleCache[pub] ??= new JSMetaModule(name, pub)];
        }, { isntAssignable: true }),
      )(),
    )) as {
      <M extends keyof Module>(name: M): JS<Module[M]>;
      <T = never>(name: string): T extends never ? never : JS<T>;
    },

  resolve: ((name: string) =>
    makeConvenient(
      jsable(
        new JSMetaVar((context) => {
          if (!context.build) throw Error(`Must configure JS modules`);
          const r = context.build.resolve(name);
          return [r ? JSON.stringify(r) : "void 0"];
        }),
      )<string>(),
    )) as {
      (name: keyof Module): JS<string>;
      (name: string): JS<string | undefined>;
    },

  optional: <T>(expr: JSable<T>): JS<NonNullable<T>> => {
    const p = js<NonNullable<T>>`${expr}`;
    (p[jsSymbol] as Writable<JSMeta>).isOptional = true;
    return p;
  },

  reassign: <T>(varMut: JSable<T>, expr: JSable<T>): JS<T> =>
    makeConvenient(
      jsable(new JSMetaReassign(varMut[jsSymbol], expr[jsSymbol]))<T>(),
    ),

  return: <T extends ImplicitlyJSable>(
    expr: T,
  ): T extends JSable<infer T> ? JS<T> & JSReturn : T =>
    js`return ${expr as JSable}` as never,

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
  <M>(meta: M) => <T, R = false>(): { [jsSymbol]: M } & JSableType<T, R> => {
    const expr = {
      [jsSymbol]: meta as M & JSableType<T, R>,
      [Symbol.for("Deno.customInspect")]: (opts: Deno.InspectOptions) =>
        Deno.inspect(meta, opts),
    } as const;
    return expr as { [jsSymbol]: M } & JSableType<T, R>;
  };

class JSMetaFunction extends JSMeta {
  readonly args: readonly JSMetaArgument[];
  private readonly scoped: boolean;

  constructor(
    private readonly cb: Fn<readonly never[], unknown>,
    { scoped = true, scope }: { scoped?: boolean; scope?: JSMeta | null } = {},
  ) {
    super(scope);
    this.args = Array(cb.length).fill(0).map(() => new JSMetaArgument());
    this.scoped = scoped;
  }

  private _hasResources?: boolean;
  // @ts-ignore Do not care JSMeta definition
  get hasResources(): boolean {
    return this._hasResources ??= this.body.hasResources;
  }

  // Making body lazy allows self-referencing functions
  private _body?: JSMetaFunctionBody;
  get body(): JSMetaFunctionBody {
    if (!this._body) {
      if (this.scoped) trackedScopes.unshift(this);
      this._body = new JSMetaFunctionBody(
        this.cb(...this.args.map((a) => makeConvenient(jsable(a)<never>()))),
      );
      if (this.scoped) trackedScopes.shift();
    }
    return this._body;
  }

  template(context: JSMetaContext): (string | JSMeta)[] {
    const args: (string | JSMeta)[] = this.args.length === 1
      ? [this.args[0]]
      : ["(", ...this.args.flatMap((a, i) => i ? [",", a] : a), ")"];

    if (context.asyncScopes.has(this)) {
      args.unshift("async ");
    }

    return [...args, "=>", this.body];
  }

  [Symbol.for("Deno.customInspect")]({ ...opts }: Deno.InspectOptions): string {
    opts.depth ??= 4;
    return `function(${
      this.args.map((a) => Deno.inspect(a, opts)).join(", ")
    }) ${opts.depth! < 0 ? "..." : Deno.inspect(this.body, opts)}`;
  }
}

class JSMetaFunctionBody extends JSMeta {
  public readonly fnBody: Writable<JSFnBody>;
  readonly hasResources: boolean;

  constructor(fnBody: JSFnBody) {
    super();
    this.fnBody = fnBody as Writable<JSFnBody>;
    this.hasResources = Array.isArray(this.fnBody)
      ? this.fnBody.some((s) => s[jsSymbol].hasResources)
      : !!this.fnBody[jsSymbol].hasResources;
  }

  isExpression(context: JSMetaContext): boolean {
    return !Array.isArray(this.fnBody) &&
      !context.scopedDeclarations.get(this.fnBody)?.length;
  }

  async template(context: JSMetaContext): Promise<(string | JSMeta)[]> {
    const { scopedDeclarations, declaredNames } = context;
    const parts: (string | JSMeta)[] = ["{"];

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
        i < lastIndex ? parts.push(s[jsSymbol], ";") : parts.push(s[jsSymbol])
      );
    } else {
      if (assignments.length) {
        parts.push("return ", this.fnBody[jsSymbol]);
      } else {
        for (
          let firstBodyMeta: string | JSMeta | undefined =
            this.fnBody[jsSymbol];
          firstBodyMeta && typeof firstBodyMeta !== "string" &&
          !context.declaredNames.has(firstBodyMeta);
          firstBodyMeta = (await firstBodyMeta.template(context))
            .find((t) => t !== "")
        ) {
          if (firstBodyMeta instanceof JSMetaObject) {
            return ["(", this.fnBody[jsSymbol], ")"];
          }
        }

        return [this.fnBody[jsSymbol]];
      }
    }

    parts.push("}");
    return parts;
  }

  [Symbol.for("Deno.customInspect")](opts: Deno.InspectOptions): string {
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

class JSMetaArgument extends JSMeta {
  readonly isntAssignable = true;

  constructor(private name?: string) {
    super();
  }

  template(context: JSMetaContext): (string | JSMeta)[] {
    const existing = context.args.get(this);
    if (existing) return [existing];

    const newName = this.name ?? argn(++context.argn);
    context.args.set(this, newName);
    return [newName];
  }

  [Symbol.for("Deno.customInspect")](): string {
    return this.name ? this.name : "?";
  }
}

class JSMetaModule extends JSMeta {
  constructor(
    readonly localUrl: string,
    readonly publicUrl: string,
  ) {
    super();
  }

  template(context: JSMetaContext): (string | JSMeta)[] {
    return [
      context.modules,
      `[${
        context.modules.index(
          this.localUrl,
          this.publicUrl,
        )
      }]`,
    ];
  }

  [Symbol.for("Deno.customInspect")](): string {
    return `import(${this.localUrl}: ${this.publicUrl})`;
  }
}

class JSMetaModuleStore extends JSMeta {
  readonly mustDeclare = true;
  readonly isAwaited: boolean = true;
  #urls: Record<string, [number, string]> = {};
  #i = 0;

  constructor(private readonly isServer: boolean) {
    super();
  }

  template(_: JSMetaContext): (string | JSMeta)[] {
    return [
      `(await Promise.all(${
        JSON.stringify(
          Object.values(this.#urls).map(([, uri]) => uri),
        )
      }.map(u=>import(u))))`,
    ];
  }

  index(localUrl: string, publicUrl: string): number {
    const url = this.isServer ? localUrl : publicUrl;
    this.#urls[url] ??= [this.#i++, url];
    return this.#urls[url][0];
  }

  [Symbol.for("Deno.customInspect")](): string {
    return `modules`;
  }
}

class JSMetaRef extends JSMeta {
  readonly isntAssignable: boolean = true;

  constructor() {
    super();
  }

  template(context: JSMetaContext): (string | JSMeta)[] {
    if (!context.refs) throw Error(`Must provide activation when using refs`);
    return [context.refs, "[", context.refs.get(this).toString(), "]"];
  }

  [Symbol.for("Deno.customInspect")](): string {
    return `ref`;
  }
}

class JSMetaRefStore extends JSMeta {
  readonly mustDeclare = true;
  #metas: Set<JSMeta> = new Set();
  #referenced: Map<JSMeta, number> = new Map();
  #firstPass: boolean = true;

  constructor(
    private readonly currentScript: string,
    private readonly refs: RefTree,
  ) {
    super();

    const iterRefs = (refs: RefTree) =>
      refs.forEach(([r, children]) => {
        this.#metas.add(r[jsSymbol]);
        if (children) iterRefs(children);
      });
    iterRefs(refs);
  }

  template(_context: JSMetaContext): (string | JSMeta)[] {
    if (this.#firstPass) {
      this.#firstPass = false;
      return [];
    } else {
      // On second pass, every used ref is accessed: compute activation
      return [
        client.refs[jsSymbol],
        "(",
        this.currentScript,
        ",",
        this.refs.length.toString(),
        ",",
        JSON.stringify(this.#activateReferenced(this.refs)),
        ")",
      ];
    }
  }

  get(ref: JSMetaRef): number {
    if (!this.#metas.has(ref)) return -1;

    const i = this.#referenced.get(ref);
    if (i == null) {
      this.#referenced.set(ref, -1);
      return -1;
    }
    return i;
  }

  #lastRefIndex = -1;
  #activateReferenced(refs: RefTree): Activation {
    return refs.flatMap(([ref, children], i) => {
      const activation: Activation = [];
      const r = this.#referenced.get(ref[jsSymbol]);
      const referencedChildren = children && this.#activateReferenced(children);

      if (r) {
        activation.push([i]);
        this.#referenced.set(ref[jsSymbol], ++this.#lastRefIndex);
      }

      if (referencedChildren?.length) activation.push([i, referencedChildren]);

      return activation;
    });
  }
}

class JSMetaResource<T extends JSONable = JSONable> extends JSMeta {
  readonly hasResources: boolean = true;
  readonly isntAssignable: boolean = true;
  readonly js: JSable<T> = jsable(this)();

  constructor(
    public readonly uri: string,
    private readonly fetch: T | PromiseLike<T> | (() => T | PromiseLike<T>),
  ) {
    super();
  }

  async template(context: JSMetaContext): Promise<(string | JSMeta)[]> {
    context.resources ??= new JSMetaResources(context);
    return [await context.resources.peek<T>(this.uri, this.fetch)];
  }

  [Symbol.for("Deno.customInspect")](): string {
    return `$(${this.uri})`;
  }
}

class JSMetaResources extends JSMeta {
  readonly #store: Record<string, [number, JSONable]> = {};
  #i = 0;
  readonly #initialResources = new JSMetaVar(
    () => [
      JSON.stringify(
        Object.fromEntries(
          Object.entries(this.#store).map(([k, [, v]]) => [k, v]),
        ),
      ),
    ],
  );
  readonly #resources = jsable(this)();
  readonly #peek = js.fn((i: JS<number>) =>
    client.store.peek(js`${this.#resources}[${i}]`)
  );

  constructor(private readonly context: JSMetaContext) {
    super();
  }

  template(): (string | JSMeta)[] {
    return [
      `(`,
      client.store.set[jsSymbol],
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
  ): Promise<JSMeta> {
    this.#store[uri] ??= [
      this.#i++,
      await (typeof fetch === "function"
        ? (fetch as () => T | PromiseLike<T>)()
        : fetch),
    ];

    return this.context.isServer
      ? new JSMetaVar(
        () => [this.#initialResources, `[${JSON.stringify(uri)}]`],
        { isntAssignable: true },
      )
      : inline(this.#peek(this.#store[uri][0]))[jsSymbol];
  }

  indexOf(uri: string): number {
    return this.#store[uri][0];
  }

  [Symbol.for("Deno.customInspect")](): string {
    return `resources`;
  }
}

class JSMetaVar extends JSMeta {
  constructor(
    private readonly cb: (
      context: JSMetaContext,
    ) => (string | JSMeta)[] | Promise<(string | JSMeta)[]>,
    { scope, isntAssignable }: {
      scope?: JSMeta | null;
      isntAssignable?: boolean;
    } = {},
  ) {
    super(scope);
    this.isntAssignable = isntAssignable;
  }

  template(
    context: JSMetaContext,
  ): (string | JSMeta)[] | Promise<(string | JSMeta)[]> {
    return this.cb(context);
  }

  [Symbol.for("Deno.customInspect")](): string {
    return "var";
  }
}

class JSMetaURIs extends JSMeta {
  constructor(
    private readonly uris:
      | readonly string[]
      | JSable<readonly string[]>
      | readonly JSable<string>[],
  ) {
    super();
  }

  template(context: JSMetaContext): (string | JSMeta)[] {
    return Array.isArray(this.uris)
      ? context.resources
        ? [
          "[",
          ...this.uris.flatMap((uri: string | JSMeta, i) => {
            const tpl: (string | JSMeta)[] = typeof uri === "string"
              ? [
                ",",
                context.resources!,
                "[",
                String(context.resources!.indexOf(uri)),
                "]",
              ]
              : [",", uri];
            if (!i) tpl.shift();
            return tpl;
          }),
          "]",
        ]
        : []
      : [(this.uris as JSable)[jsSymbol]];
  }

  [Symbol.for("Deno.customInspect")](): string {
    return `$(${this.uris})`;
  }
}

export const indexedUris = (
  uris:
    | readonly string[]
    | JSable<readonly string[]>
    | readonly JSable<string>[],
): JSable<string[]> => jsable(new JSMetaURIs(uris))();

class JSMetaReassign extends JSMeta {
  constructor(
    private readonly varMut: JSMeta,
    private readonly expr: JSMeta,
  ) {
    super();
    if (expr === varMut) {
      // Re-evaluate
      this.expr = new JSMetaVar((context) => expr.template(context));
    }
  }

  template(context: JSMetaContext): (string | JSMeta)[] {
    const varMeta = this.varMut;
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
    ): Resources<T, U> => ({ group, values: values.map(make) }),
  });
  return group;
};

type DomApi = typeof import("./dom.ts");

const domApi = js.module<DomApi>("@classic/js/dom");
const domStore = domApi.store;

// Memoized version of the API, ensuring static JS references
export const client: JS<DomApi> = {
  refs: domApi.refs,
  store: {
    peek: domStore.peek,
    set: domStore.set,
    sub: domStore.sub,
    [jsSymbol]: domStore[jsSymbol],
  },
  sub: domApi.sub,
  [jsSymbol]: domApi[jsSymbol],
} as JS<DomApi>;
