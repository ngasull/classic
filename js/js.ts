import type { Context } from "@classic/context";
import { createContext } from "@classic/context/create";
import type {
  Fn,
  ImplicitlyJSable,
  JS,
  JSable,
  JSFnBody,
  JSMeta,
  JSONable,
  JSReturn,
  ParamKeys,
  Resolver,
  ResourceGroup,
  Resources,
  returnSymbol,
  typeSymbol,
} from "./types.ts";
import { isJSable, jsSymbol } from "./types.ts";

// https://graphemica.com/categories/letter-number/page/2
export const argn = (n: number) => `𐏒${n}`;
export const varArg = "𐏑";

type Writable<T> = { -readonly [K in keyof T]: T[K] };

export abstract class JSMetaBase<T = unknown, R = false>
  implements JSMeta<T, R> {
  readonly [jsSymbol] = this;
  declare readonly [typeSymbol]: T;
  declare readonly [returnSymbol]: R;

  thenable?: JSMeta;
  isAwaited?: boolean;
  isntAssignable?: boolean;
  mustDeclare?: boolean;
  readonly hasResources?: boolean;
  readonly isOptional?: boolean;

  constructor(
    public readonly scope: JSMetaBase | null = trackedScopes[0] as JSMetaBase ??
      null,
  ) {}

  template(_context: JSMetaContext): Array<string | JSMetaBase> {
    throw "unimplemented";
  }
}

type JSMetaContext = {
  isServer?: boolean;
  asyncScopes: Set<JSMetaFunction | null>;
  scopedDeclarations: Map<JSFnBody, JSMetaBase[]>;
  declaredNames: Map<JSMetaBase, string>;
  implicitRefs: Map<ImplicitlyJSable, JSMetaBase>;
  argn: number;
  args: Map<JSMetaArgument, string>;
  modules: JSMetaModuleStore;
  resources?: JSMetaResources;
  resolve?: Resolver;
  moduleCache: Record<string, JSMetaModule>;
  user: Context;
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

class JSMetaRaw extends JSMetaBase {
  readonly #tpl: string[];

  constructor(js: string) {
    super();
    this.#tpl = [js];
  }

  override template() {
    return this.#tpl;
  }
}

export const unsafe = (js: string): JSable<unknown> => new JSMetaRaw(js);

export const inline = <T extends JSable<unknown>>(expr: T): T => {
  expr[jsSymbol].isntAssignable = true;
  return expr;
};

const jsTpl = <T>(
  tpl: ReadonlyArray<string>,
  ...exprs: ImplicitlyJSable[]
): JS<T> => mkJS(new JSMetaTemplate(tpl, exprs) as JSable<T>);

class JSMetaTemplate extends JSMetaBase {
  public override readonly hasResources: boolean;
  private parts: (string | JSMetaBase)[];

  constructor(
    readonly tpl: readonly string[],
    readonly exprs: ImplicitlyJSable[],
  ) {
    super();
    this.hasResources = this.exprs.some((e) =>
      isJSable(e) && e[jsSymbol].hasResources
    );

    this.parts = Array<string | JSMetaBase>(
      this.tpl.length + this.exprs.length,
    );
    let i = 0;
    for (; i < this.exprs.length; i++) {
      this.parts[i * 2] = this.tpl[i];
      this.parts[i * 2 + 1] = implicit(this.exprs[i]);
    }
    this.parts[i * 2] = this.tpl[i];
  }

  override template(): (string | JSMetaBase)[] {
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

const nullMeta = new class NullMeta extends JSMetaBase {
  override readonly isntAssignable = true;
  override template() {
    return ["null"];
  }
}(null);

const undefinedMeta = new class UndefinedMeta extends JSMetaBase {
  override readonly isntAssignable = true;
  override template() {
    return ["void 0"];
  }
}(null);

const implicit = (
  expr: ImplicitlyJSable,
  scope: JSMetaBase | null = trackedScopes[0],
): JSMetaBase => {
  if (expr === null) {
    return nullMeta;
  } else if (expr === undefined) {
    return undefinedMeta;
  } else if ((typeof expr === "object" || typeof expr === "function")) {
    if (jsSymbol in expr && expr[jsSymbol]) return expr[jsSymbol];
    return new JSMetaVar((context) => {
      const existing = context.implicitRefs.get(expr);
      if (existing) return [existing];

      const newImplicit: JSMetaBase = typeof expr === "function"
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

class JSMetaVar<T = unknown> extends JSMetaBase<T> {
  constructor(
    private readonly cb: (context: JSMetaContext) => Array<string | JSMetaBase>,
    { scope, isntAssignable }: {
      scope?: JSMetaBase | null;
      isntAssignable?: boolean;
    } = {},
  ) {
    super(scope);
    this.isntAssignable = isntAssignable;
  }

  override template(
    context: JSMetaContext,
  ): Array<string | JSMetaBase> {
    return this.cb(context);
  }

  [Symbol.for("Deno.customInspect")](): string {
    return "var";
  }
}

class JSMetaURIs extends JSMetaBase<string[]> {
  constructor(
    private readonly uris:
      | readonly string[]
      | JSable<readonly string[]>
      | readonly JSable<string>[],
  ) {
    super();
  }

  override template(context: JSMetaContext): (string | JSMetaBase)[] {
    return Array.isArray(this.uris)
      ? context.resources
        ? [
          "[",
          ...this.uris.flatMap((uri: string | JSMetaBase, i) => {
            const tpl: (string | JSMetaBase)[] = typeof uri === "string"
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

class JSMetaObject extends JSMetaBase {
  private parts: (string | JSMetaBase)[];

  constructor(
    private readonly expr: {
      readonly [k: string]: ImplicitlyJSable;
      readonly [jsSymbol]?: undefined;
    },
    { scope }: { scope?: JSMetaBase | null } = {},
  ) {
    super(scope);
    const entries = Object.entries(expr as { [k: string]: ImplicitlyJSable });
    if (!entries.length) this.parts = [`{}`];
    else {
      this.parts = Array<string | JSMetaBase>(entries.length * 3 + 1);
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

  override template(): (string | JSMetaBase)[] {
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

class JSMetaArray extends JSMetaBase {
  private parts: (string | JSMetaBase)[];

  constructor(
    private readonly expr: readonly ImplicitlyJSable[],
    { scope }: { scope?: JSMetaBase | null } = {},
  ) {
    super(scope);
    if (!this.expr.length) this.parts = [`[]`];
    else {
      this.parts = Array<string | JSMetaBase>(this.expr.length * 2 + 1);
      this.parts[0] = `[`;
      for (let i = 0; i < this.expr.length; i++) {
        this.parts[i * 2 + 1] = implicit(this.expr[i], scope);
        this.parts[i * 2 + 2] = `,`;
      }
      this.parts[this.parts.length - 1] = `]`;
    }
  }

  override template(): (string | JSMetaBase)[] {
    return this.parts;
  }

  [Symbol.for("Deno.customInspect")]({ ...opts }: Deno.InspectOptions) {
    opts.depth ??= 4;
    if (--opts.depth < 0) return `[...]`;
    return `[${this.expr.map((e) => Deno.inspect(e, opts)).join(", ")}]`;
  }
}

export const mkJS = <J extends JSable>(
  expr: J,
): J extends JSable<infer T> ? JS<T> & Pick<J, keyof JSable> : never => {
  const callExpr = (...argArray: ReadonlyArray<JSable | JSONable>) => {
    const e = mkJS(
      new JSMetaCall(expr[jsSymbol], argArray.map((a) => implicit(a))),
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
        mkJS(new JSMetaAwait(expr[jsSymbol].thenable)),
      );
    }

    return e;
  };
  callExpr[targetSymbol] = expr;
  return new Proxy(callExpr, jsProxyHandler) as unknown as J extends
    JSable<infer T> ? JS<T> & J : never;
};

class JSMetaCall extends JSMetaBase {
  override readonly hasResources: boolean;

  constructor(
    private readonly callable: JSMetaBase,
    private readonly values: readonly JSMetaBase[],
  ) {
    super();
    this.hasResources = values.some((v) => v.hasResources);
  }

  override template(context: JSMetaContext): (string | JSMetaBase)[] {
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

class JSMetaAwait extends JSMetaBase {
  override isAwaited = true;

  constructor(private readonly _expr: JSMetaBase) {
    super();
  }

  override template(): (string | JSMetaBase)[] {
    return ["await ", this._expr];
  }

  [Symbol.for("Deno.customInspect")](opts: Deno.InspectOptions) {
    return `await ${Deno.inspect(this._expr, opts)}`;
  }
}

type ToJSResult<A extends string[]> = {
  js: string;
  args: A;
};

export const toJS = <A extends readonly unknown[]>(
  f: Fn<A, unknown>,
  { resolve, isServer = false, context: user }: {
    resolve?: Resolver;
    isServer?: boolean;
    context?: Context;
  } = {},
): ToJSResult<{ -readonly [I in keyof A]: string }> => {
  const globalFn = new JSMetaFunction(f as Fn<readonly never[], unknown>, {
    scoped: false,
  });
  const globalBody = globalFn.body;

  let lastVarId = -1;
  const context: JSMetaContext = mkMetaContext(isServer, resolve, user);

  const scopeToRefs = new Map<JSMetaBase | null, Set<JSMetaBase>>();
  const refToParentReuse = new Map<
    JSMetaBase,
    Map<JSMetaBase | undefined, { reused?: boolean; outOfScope: boolean }>
  >();
  const refToChildren = new Map<JSMetaBase, readonly JSMetaBase[]>();
  {
    type Job = readonly [
      JSMetaBase,
      JSMetaBase | undefined,
      JSMetaFunction | null,
    ];
    const jobs: Job[] = [[globalBody, undefined, null]];
    for (let job; (job = jobs.shift());) {
      const [meta, parent, enclosing] = job;

      const refParentReuse = refToParentReuse.get(meta) ??
        new Map<
          JSMetaBase | undefined,
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
        const children: JSMetaBase[] = [];
        for (const c of meta.template(context)) {
          if (typeof c !== "string") children.push(c);
        }
        refToChildren.set(meta, children);

        const subEnclosing = meta instanceof JSMetaFunction ? meta : enclosing;
        jobs.unshift(...children.map((c) => [c, meta, subEnclosing] as const));
      }
    }
  }

  const visitedRefs = new Set<JSMetaBase>();
  const declaredRefs = new Set<JSMetaBase>();
  const shouldDeclare = (meta: JSMetaBase): boolean => {
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
  const hasAssignedParentInScope = (meta: JSMetaBase): boolean => {
    for (const parent of refToParentReuse.get(meta)!.keys()) {
      if (parent && parent.scope === meta.scope) {
        if (declaredRefs.has(parent) || hasAssignedParentInScope(parent)) {
          return true;
        }
      }
    }
    return false;
  };

  const declareIfNeeded = (meta: JSMetaBase): boolean => {
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
  const globalBodyStr = metaToJS(context, globalBody);

  return {
    js: globalBody.isExpression(context)
      ? `return ${globalBodyStr};`
      : globalBodyStr.slice(1, -1) + ";",
    args: argsName,
  };
};

const mkMetaContext = (
  isServer = true,
  resolve?: Resolver,
  user?: Context,
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
  user: user ?? createContext(),
  resolve,
});

const metaToJS = (
  context: JSMetaContext,
  meta: JSMetaBase,
  declare?: boolean,
): string => {
  const parts = [];
  const templates: (string | JSMetaBase)[] = [meta];

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
        templates.unshift(...first.template(context));
      }
    }
  }

  return parts.join("");
};

export const jsResources = (expr: JSable): string[] => {
  const context: JSMetaContext = mkMetaContext();
  const r = new Set<string>();
  const visited = new Set<JSMetaBase>();
  const children: (JSMetaBase | string)[] = [expr[jsSymbol]];
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
    const { js: rawJS } = toJS(() => expr, { isServer: true });
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
    mkJS(new JSMetaFunction(cb) as JSable<Cb>) as Cb extends
      Fn<infer Args, infer T>
      ? JS<(...args: Args) => T> & { [jsSymbol]: JSMetaFunction }
      : never,

  module: ((name: string) =>
    mkJS(
      new JSMetaVar((context) => {
        if (!context.resolve) throw Error(`Must configure JS modules`);
        const publicPath = context.resolve(name);
        if (publicPath == null) {
          throw Error(
            `${name} needs to be added to your client modules configuration`,
          );
        }
        return [
          context.moduleCache[name] ??= new JSMetaModule(
            name,
            publicPath,
          ),
        ];
      }, { isntAssignable: true }),
    )) as {
      <M extends keyof Module>(name: M): JS<Module[M]>;
      <T = never>(name: string): T extends never ? never : JS<T>;
    },

  resolve: ((name: string) =>
    mkJS(
      new JSMetaVar<string>((context) => {
        if (!context.resolve) throw Error(`Must configure JS modules`);
        const publicPath = context.resolve(name);
        return [publicPath ? JSON.stringify(publicPath) : "void 0"];
      }),
    )) as {
      (name: keyof Module): JS<string>;
      (name: string): JS<string | undefined>;
    },

  optional: <T>(expr: JSable<T>): JS<NonNullable<T>> => {
    const p = js<NonNullable<T>>`${expr}`;
    (p[jsSymbol] as Writable<JSMetaBase>).isOptional = true;
    return p;
  },

  reassign: <T>(varMut: JSable<T>, expr: JSable<T>): JS<T> =>
    mkJS(new JSMetaReassign<T>(varMut[jsSymbol], expr[jsSymbol])),

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

export const js = Object.freeze(Object.assign(jsTpl, jsUtils)) as
  & typeof jsTpl
  & Readonly<typeof jsUtils>;

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

class JSMetaFunction extends JSMetaBase {
  readonly args: readonly JSMetaArgument[];
  private readonly scoped: boolean;

  constructor(
    private readonly cb: Fn<readonly never[], unknown>,
    { scoped = true, scope }: { scoped?: boolean; scope?: JSMetaBase | null } =
      {},
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
        this.cb(...this.args.map(mkJS)),
      );
      if (this.scoped) trackedScopes.shift();
    }
    return this._body;
  }

  override template(context: JSMetaContext): (string | JSMetaBase)[] {
    const args: (string | JSMetaBase)[] = this.args.length === 1
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

class JSMetaFunctionBody extends JSMetaBase {
  public readonly fnBody: Writable<JSFnBody>;
  override readonly hasResources: boolean;

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

  override template(context: JSMetaContext): Array<string | JSMetaBase> {
    const { scopedDeclarations, declaredNames } = context;
    const parts: (string | JSMetaBase)[] = ["{"];

    const assignments: string[] = [];
    for (const scoped of scopedDeclarations.get(this.fnBody) ?? []) {
      assignments.push(
        `${declaredNames.get(scoped)}=${scoped.hasResources ? "()=>" : ""}${
          metaToJS(context, scoped, true)
        }`,
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
          let firstBodyMeta: string | JSMetaBase | undefined =
            this.fnBody[jsSymbol];
          firstBodyMeta && typeof firstBodyMeta !== "string" &&
          !context.declaredNames.has(firstBodyMeta);
          firstBodyMeta = firstBodyMeta.template(context)
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

class JSMetaArgument extends JSMetaBase<never> {
  override readonly isntAssignable = true;

  constructor(private name?: string) {
    super();
  }

  override template(context: JSMetaContext): (string | JSMetaBase)[] {
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

class JSMetaModule extends JSMetaBase {
  constructor(
    readonly localUrl: string,
    readonly publicUrl: string,
  ) {
    super();
  }

  override template(context: JSMetaContext): (string | JSMetaBase)[] {
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

class JSMetaModuleStore extends JSMetaBase {
  override readonly mustDeclare = true;
  override readonly isAwaited: boolean = true;
  #urls: Record<string, [number, string]> = {};
  #i = 0;

  constructor(private readonly isServer: boolean) {
    super();
  }

  override template(_: JSMetaContext): (string | JSMetaBase)[] {
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

export const { store } = js.module<typeof import("./dom/store.ts")>(
  import.meta.resolve("./dom/store.ts"),
);

class JSMetaResource<T extends JSONable = JSONable> extends JSMetaBase<T> {
  override readonly hasResources: boolean = true;
  override readonly isntAssignable: boolean = true;

  constructor(
    public readonly uri: string,
    private readonly fetch: T | (() => T),
  ) {
    super();
  }

  override template(context: JSMetaContext): Array<string | JSMetaBase> {
    context.resources ??= new JSMetaResources(context);
    return [context.resources.peek<T>(this.uri, this.fetch)];
  }

  [Symbol.for("Deno.customInspect")](): string {
    return `$(${this.uri})`;
  }
}

class JSMetaResources extends JSMetaBase {
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
  readonly #peek = js.fn((i: JS<number>) => store.peek(js`${this}[${i}]`));

  constructor(private readonly context: JSMetaContext) {
    super();
  }

  override template(): (string | JSMetaBase)[] {
    return [
      `(`,
      store.set[jsSymbol],
      `(`,
      this.#initialResources,
      `),Object.keys(`,
      this.#initialResources,
      `))`,
    ];
  }

  peek<T extends JSONable>(
    uri: string,
    fetch: T | (() => T),
  ): JSMetaBase {
    this.#store[uri] ??= [
      this.#i++,
      typeof fetch === "function" ? fetch() : fetch,
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

export const indexedUris = (
  uris:
    | readonly string[]
    | JSable<readonly string[]>
    | readonly JSable<string>[],
): JSable<string[]> => new JSMetaURIs(uris);

class JSMetaReassign<T> extends JSMetaBase<T> {
  constructor(
    private readonly varMut: JSMetaBase,
    private readonly expr: JSMetaBase,
  ) {
    super();
    if (expr === varMut) {
      // Re-evaluate
      this.expr = new JSMetaVar((context) => expr.template(context));
    }
  }

  override template(context: JSMetaContext): (string | JSMetaBase)[] {
    const varMeta = this.varMut;
    return context.declaredNames.has(varMeta) ||
        varMeta instanceof JSMetaArgument
      ? [this.varMut, "=", this.expr]
      : [this.varMut, ",", this.expr];
  }
}

export const resource = <T extends Readonly<Record<string, JSONable>>>(
  uri: string,
  fetch: T | (() => T),
): JS<T> & { [jsSymbol]: JSMetaResource } =>
  mkJS(new JSMetaResource(uri, fetch));

export const resources = <
  T extends Readonly<Record<string, JSONable>>,
  U extends string,
>(
  pattern: U,
  fetch: (params: { [k in ParamKeys<U>]: string }) => T | Promise<T>,
): ResourceGroup<T, U> => {
  const make = async (params: { [k in ParamKeys<U>]: string | number }) => {
    const stringParams = (
      Object.fromEntries(
        Object.entries(params).map(([k, v]) => [k, String(v)]),
      )
    ) as { [k in ParamKeys<U>]: string };

    const value = await fetch(stringParams);
    return resource(
      pattern.replaceAll(
        /:([^/]+)/g,
        (_, p) => stringParams[p as ParamKeys<U>],
      ),
      value,
    );
  };
  const group: ResourceGroup<T, U> = Object.assign(make, {
    pattern,
    each: async (
      values: ReadonlyArray<{ [k in ParamKeys<U>]: string | number }>,
    ): Promise<Resources<T, U>> => ({
      group,
      values: await Promise.all(values.map(make)),
    }),
  });
  return group;
};
