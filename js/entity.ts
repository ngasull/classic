import { Context } from "@classic/context";
import { stringify } from "./stringify/mod.ts";
import { $customInspect, empty, type JS } from "./types.ts";
import { $target, hasTarget, implicit, mkJs } from "./proxy.ts";

const $context = Context<Map<symbol, unknown>>("classic.js.context");

export const provideContext = <T>(cb: () => T): T =>
  $context.provide(new Map(), cb);

// https://graphemica.com/categories/letter-number/page/2
export const argn = (n: number) => `𐏒${n}`;
export const varPrefix = "𐏑";
export const runtimeRefPrefix = "𐏓";

export type Scope = JSArrow | null;

export type JSFn = (...args: any[]) => unknown;

export class Some<T> {
  constructor(
    public readonly value: T,
  ) {}
}

/** Declare context to share across JS-rendered values */
export class JSContext<T> {
  readonly #symbol = Symbol();
  readonly #factory: () => T;

  /**
   * @param factory Factory function to generate context when not defined yet
   */
  constructor(factory: () => T) {
    this.#factory = factory;
  }

  /**
   * @returns Existing context or a newly generated one with `factory`
   */
  use(): T {
    const context = $context.use();
    if (context.has(this.#symbol)) {
      return context.get(this.#symbol) as T;
    } else {
      const value = this.#factory();
      context.set(this.#symbol, value);
      return value;
    }
  }

  /**
   * @returns Existing context or undefined
   */
  get(): T | undefined {
    return $context.use().get(this.#symbol) as T | undefined;
  }

  /**
   * @param value Value to define as current context
   * @returns `value`
   */
  set(value: T): T {
    $context.use().set(this.#symbol, value);
    return value;
  }
}

export const writeEntity = (
  meta: IJSEntity,
  declare?: boolean,
): string => {
  const declaredNames = $declaredNames.use();
  const parts = [];
  const templates: Array<string | IJSEntity> = [meta];

  for (let first; (first = templates.shift()) != null;) {
    if (typeof first === "string") {
      parts.push(first);
    } else {
      const d = declaredNames.get(first);
      if (d && !declare) {
        parts.push(d);
      } else {
        declare = false;
        const firsts: Array<string | IJSEntity> = [];
        first.write((v) => firsts.push(v));
        templates.unshift(...firsts);
      }
    }
  }

  return parts.join("");
};

export interface IJSEntity {
  readonly scope: Scope;
  // Refers to every use of an entity
  readonly entities: readonly IJSEntity[];
  // Refers to contained operations (may differ from pure entity references)
  readonly operations?: readonly IJSEntity[];
  write(write: (value: string | IJSEntity) => void): void;
  runtimeReference?(): Some<unknown> | void;

  readonly asScope?: JSArrow;
  readonly needsParensOnAccess?: boolean;
  readonly isOptional?: boolean;
  readonly isntAssignable?: boolean;
  readonly mustDeclare?: boolean;
  readonly owner?: IJSEntity;
  readonly startsWithCurly?: boolean;
}

export const $eval = new JSContext<Map<unknown, number>>(() => {
  throw Error(`eval context must be set on demand`);
});

/**
 * Check whether current generation context is for evaluation
 *
 * returns `true` if evaluating, `false` otherwise
 */
export const isEvaluating = (): boolean => $eval.get() != null;

const getRuntimeRefIndex = (value: unknown): number | void => {
  const runtimeMap = $eval.get();
  if (runtimeMap != null) {
    const existing = runtimeMap.get(value);
    if (existing != null) return existing;
    else {
      const index = runtimeMap.size;
      runtimeMap.set(value, index);
      return index;
    }
  }
};

const $runtimeRefs = new JSContext(() => new Map<unknown, IJSEntity>());

export class JSReference implements IJSEntity {
  readonly #runtime: unknown;
  readonly #factory: () => IJSEntity;

  public readonly scope: Scope;

  constructor(runtime: unknown, factory: () => IJSEntity) {
    this.#runtime = runtime;
    this.#factory = factory;
    this.scope = currentScope();
  }

  #getEntity(): IJSEntity {
    const refs = $runtimeRefs.use();
    const ref = refs.get(this.#runtime);
    if (ref == null) {
      const entity = this.#factory();
      refs.set(this.#runtime, entity);
      return entity;
    } else {
      return ref;
    }
  }

  get #isDirectlyReferenced() {
    return getRuntimeRefIndex(this.#runtime) != null &&
      this.#getEntity().runtimeReference?.() != null;
  }

  get entities() {
    return this.#isDirectlyReferenced ? empty : [this.#getEntity()];
  }

  write(write: (value: string | IJSEntity) => void): void {
    if (this.#isDirectlyReferenced) {
      write(`${runtimeRefPrefix}[${getRuntimeRefIndex(this.#runtime)}]`);
    } else {
      write(this.#getEntity());
    }
  }

  runtimeReference() {
    return this.#getEntity().runtimeReference?.();
  }

  get isntAssignable() {
    return true;
  }

  get startsWithCurly() {
    return this.#getEntity().startsWithCurly;
  }

  get needsParensOnAccess() {
    return this.#getEntity().needsParensOnAccess;
  }

  [$customInspect](opts: Deno.InspectOptions) {
    return `ref(${Deno.inspect(this.#getEntity(), opts)})`;
  }
}

export class JSArbitrary implements IJSEntity {
  readonly #template: readonly string[];
  readonly #values: ReadonlyArray<IJSEntity>;

  constructor(
    public readonly scope: Scope,
    template: readonly string[],
    values: ReadonlyArray<IJSEntity>,
    public readonly isntAssignable?: boolean,
  ) {
    this.#template = template;
    this.#values = values;
    trackedOperations[0]?.push(this);
  }

  get entities(): readonly IJSEntity[] {
    return this.#values;
  }

  write(write: (value: string | IJSEntity) => void): void {
    let i = 0;
    for (; i < this.#values.length; i++) {
      write(this.#template[i]);
      write(this.#values[i]);
    }
    write(this.#template[i]);
  }

  get startsWithCurly() {
    return this.#template[0].length > 0
      ? this.#template[0][0] === "{"
      : this.#values[0].startsWithCurly;
  }

  [$customInspect](opts: Deno.InspectOptions) {
    const parts = [this.#template[0]];
    this.#values.forEach((v, i) => {
      parts.push(Deno.inspect(v, opts), this.#template[i + 1]);
    });
    return parts.join("");
  }
}

export class JSRaw implements IJSEntity {
  readonly #rawJs: string;
  readonly #ref?: Some<unknown>;

  constructor(rawJs: string, ref?: Some<unknown>) {
    this.#rawJs = rawJs;
    this.#ref = ref;
  }

  get scope() {
    return null;
  }

  get entities(): readonly IJSEntity[] {
    return empty;
  }

  write(write: (value: string | IJSEntity) => void): void {
    write(this.#rawJs);
  }

  runtimeReference() {
    return this.#ref;
  }

  get isntAssignable() {
    return true;
  }

  [$customInspect](opts: Deno.InspectOptions) {
    return Deno.inspect(this.#rawJs, opts);
  }
}

export class JSObject implements IJSEntity {
  readonly #obj: Record<string, unknown>;
  readonly #entries: Array<[string, IJSEntity]>;

  public readonly entities: readonly IJSEntity[];

  constructor(
    public readonly scope: Scope,
    obj: Record<string, unknown>,
  ) {
    this.#obj = obj;

    this.#entries = Object.entries(obj) as Array<[string, IJSEntity]>;
    this.#entries.forEach(([, v], i) => {
      this.#entries[i][1] = implicit(v);
    });

    this.entities = this.#entries.map(([, v]) => v);

    trackedOperations[0]?.push(this);
  }

  write(write: (value: string | IJSEntity) => void): void {
    write("{");
    for (let i = 0; i < this.#entries.length; i++) {
      const [k, v] = this.#entries[i];
      if (i > 0) write(",");
      write(JSObject.safeRecordKeyRegExp.test(k) ? k : JSON.stringify(k));
      write(":");
      write(v);
    }
    write("}");
  }

  runtimeReference() {
    const isExactSame = this.#entries.every(([k, child]) => {
      const ref = child.runtimeReference?.();
      return ref != null && ref.value === this.#obj[k];
    });
    if (isExactSame) return new Some(this.#obj);
  }

  get startsWithCurly() {
    return true;
  }

  static safeRecordKeyRegExp = /^[A-z_$][\w_$]*$/;

  [$customInspect]({ ...opts }: Deno.InspectOptions) {
    opts.depth ??= 4;
    if (--opts.depth < 0) return `{...}`;
    return `{${
      this.#entries.map(([k, v]) =>
        `${Deno.inspect(k, opts)}: ${Deno.inspect(v, opts)}`
      ).join(", ")
    }}`;
  }
}

export class JSMap implements IJSEntity {
  readonly #entries: Array<[IJSEntity, IJSEntity]>;

  public readonly entities: readonly IJSEntity[];

  constructor(
    public readonly scope: Scope,
    map: ReadonlyMap<unknown, unknown>,
  ) {
    this.#entries = Array<[IJSEntity, IJSEntity]>(map.size);
    let i = 0;
    map.forEach((v, k) => {
      this.#entries[i++] = [implicit(k), implicit(v)];
    });

    const entities = Array<IJSEntity>(2 * this.#entries.length);
    this.#entries.forEach(([k, v], i) => {
      i *= 2;
      entities[i] = k;
      entities[i + 1] = v;
    });
    this.entities = entities;

    trackedOperations[0]?.push(this);
  }

  write(write: (value: string | IJSEntity) => void): void {
    write(`new Map([[`);
    this.#entries.forEach(([k, v], i) => {
      if (i > 0) write(`],[`);
      write(k);
      write(",");
      write(v);
    });
    write(`]])`);
  }

  [$customInspect]({ ...opts }: Deno.InspectOptions) {
    opts.depth ??= 4;
    if (--opts.depth < 0) return `Map{...}`;
    return `Map{${
      [...this.#entries.map(([k, v]) =>
        `${Deno.inspect(k, opts)}: ${Deno.inspect(v, opts)}`
      )].join(", ")
    }}`;
  }
}

export class JSArray implements IJSEntity {
  readonly #values: ReadonlyArray<IJSEntity>;

  constructor(
    public readonly scope: Scope,
    values: ReadonlyArray<IJSEntity>,
  ) {
    this.#values = values;
    trackedOperations[0]?.push(this);
  }

  get entities(): readonly IJSEntity[] {
    return this.#values;
  }

  write(write: (value: string | IJSEntity) => void): void {
    write(`[`);
    for (let i = 0; i < this.#values.length; i++) {
      if (i > 0) write(`,`);
      write(this.#values[i]);
    }
    write(`]`);
  }

  [$customInspect]({ ...opts }: Deno.InspectOptions) {
    opts.depth ??= 4;
    if (--opts.depth < 0) return `[...]`;
    return `[${this.#values.map((v) => Deno.inspect(v, opts)).join(", ")}]`;
  }
}

export class JSSet implements IJSEntity {
  readonly #values: IJSEntity[];

  constructor(
    public readonly scope: Scope,
    set: ReadonlySet<unknown>,
  ) {
    this.#values = Array<IJSEntity>(set.size);
    let i = 0;
    set.forEach((v) => {
      this.#values[i++] = implicit(v);
    });

    trackedOperations[0]?.push(this);
  }

  get entities(): readonly IJSEntity[] {
    return this.#values;
  }

  write(write: (value: string | IJSEntity) => void): void {
    write(`[`);
    this.#values.forEach((v) => {
      write(v);
      write(`,`);
    });
    write(`]`);
  }

  [$customInspect]({ ...opts }: Deno.InspectOptions) {
    opts.depth ??= 4;
    if (--opts.depth < 0) return `Set[...]`;
    return `Set[${
      [...this.#values.map((e) => Deno.inspect(e, opts))].join(", ")
    }]`;
  }
}

const $asyncScopes = new JSContext(() => new Set<Scope>());

export class JSArrow implements IJSEntity {
  readonly body: JSArrowBody;

  constructor(
    public readonly scope: Scope,
    fn: JSFn,
  ) {
    this.body = new JSArrowBody(this, fn);

    trackedOperations[0]?.push(this);
  }

  get entities() {
    return [this.body];
  }

  write(write: (value: string | IJSEntity) => void): void {
    if ($asyncScopes.use().has(this)) {
      write("async ");
    }

    if (this.body.args.length === 1) {
      write(this.body.args[0]);
    } else {
      write("(");
      this.body.args.forEach((a, i) => {
        if (i > 0) write(",");
        write(a);
      });
      write(")");
    }

    write("=>");
    write(this.body);
  }

  get asScope() {
    return this;
  }

  get needsParensOnAccess() {
    return true;
  }

  [$customInspect](opts: Deno.InspectOptions) {
    return `(${
      this.body.args.map((a) => Deno.inspect(a, opts)).join(", ")
    }) => ${Deno.inspect(this.body, opts)}`;
  }
}

const trackedScopes: Scope[] = [];
const trackedOperations: IJSEntity[][] = [];

export const currentScope = (): Scope => trackedScopes[0] ?? null;

// Actual operations happen in reverse entity instantiation time.
// We keep it reverse as it is more useful for matching
const toReversedOperations = (scope: Scope, entity: IJSEntity): IJSEntity[] => {
  const visited = new Set<IJSEntity>();
  const jobs = [entity];
  const flattened: IJSEntity[] = [];
  let next;
  while ((next = jobs.shift())) {
    if (next.scope === scope && !visited.has(next)) {
      flattened.push(next);
      visited.add(next);
      // Entities are in operations order so we reverse them
      (next.operations ?? next.entities).forEach((e) => jobs.unshift(e));
    }
  }

  return flattened;
};

export const $scopedDeclarations = new JSContext(() =>
  new Map<Scope, IJSEntity[]>()
);
export const $declaredNames = new JSContext(() => new Map<IJSEntity, string>());

export class JSArrowBody implements IJSEntity {
  readonly #fn: JSFn;
  readonly #trackedOperations: IJSEntity[] = [];
  #operations!: Set<IJSEntity>;
  #entities!: readonly IJSEntity[];
  #returned: IJSEntity | undefined;

  public readonly args: readonly JSArgument[];

  constructor(
    public readonly scope: Scope,
    fn: JSFn,
  ) {
    this.args = Array(fn.length).fill(0).map(() => new JSArgument());
    this.#fn = fn;
  }

  #init() {
    if (this.#operations != null) return;
    this.#operations = new Set();
    this.#entities = empty;

    trackedScopes.unshift(this.scope);
    trackedOperations.unshift(this.#trackedOperations);
    try {
      // ! \\ Order matters
      const rawReturned = this.#fn(...this.args.map(mkJs));
      this.#returned = rawReturned === undefined
        ? undefined
        : implicit(rawReturned, this.scope);
    } finally {
      trackedScopes.shift();
      trackedOperations.shift();
    }

    // Only keep top-level operations: for each met operation try to skip its children
    const operationsMut = this.#trackedOperations.slice();
    const topLevelOperations: IJSEntity[] = [];
    let o: IJSEntity | undefined;
    let deepContainsReturned = false;
    while ((o = operationsMut.pop()) != null) {
      const entities = toReversedOperations(this.scope, o);

      const first = entities.shift();
      if (first != null && first !== this.#returned) {
        topLevelOperations.unshift(first);
      }

      for (
        let i = 0;
        i < entities.length &&
        operationsMut[operationsMut.length - 1] === entities[i];
        i++
      ) {
        const removed = operationsMut.pop()!;
        deepContainsReturned ||= removed === this.#returned;
      }
    }

    this.#operations = new Set(topLevelOperations);

    // If returned is tracked, we removed it from operations;
    // otherwise, it is not in trackedOperations to begin with.
    if (this.#returned != null && !deepContainsReturned) {
      topLevelOperations.push(this.#returned);
    }
    this.#entities = topLevelOperations;
  }

  get entities() {
    this.#init();
    return this.#entities;
  }

  write(write: (value: string | IJSEntity) => void): void {
    const scopedDeclarations = $scopedDeclarations.use();
    const declaredNames = $declaredNames.use();
    const scoped = new Set(scopedDeclarations.get(this.scope));

    let isReturnExpression = true;
    const declareAsStatements = () => {
      if (isReturnExpression) write("{");
      isReturnExpression = false;
    };

    if (this.#returned === undefined) declareAsStatements();

    let hasWrittenYet = false;
    let isLetOpen = false;
    const writeScoped = (o: IJSEntity) => {
      const varName = declaredNames.get(o);
      if (varName == null) {
        return false;
      } else {
        declareAsStatements();
        if (isLetOpen) {
          write(",");
        } else {
          if (hasWrittenYet) write(";");
          write("let ");
          isLetOpen = true;
        }
        write(varName);
        write("=");
        write(writeEntity(o, true));
        hasWrittenYet = true;
        return true;
      }
    };

    if (this.scope == null) {
      const trackedOperations = new Set(this.#trackedOperations);
      scoped.forEach((o) => {
        if (!trackedOperations.has(o)) writeScoped(o);
      });
    }

    this.#trackedOperations.forEach((o) => {
      if (
        !(scoped.has(o) && writeScoped(o)) &&
        this.#operations.has(o)
      ) {
        declareAsStatements();
        if (hasWrittenYet) write(";");
        if (isLetOpen) isLetOpen = false;

        write(o);
        hasWrittenYet = true;
      }
    });

    if (isReturnExpression && this.scope !== null) {
      if (this.#returned!.startsWithCurly) write("(");
      write(this.#returned!);
      if (this.#returned!.startsWithCurly) write(")");
    } else {
      if (this.#returned != null) {
        const returnedVarName = scoped.has(this.#returned)
          ? declaredNames.get(this.#returned)
          : null;

        if (hasWrittenYet) write(";");
        write("return ");
        write(returnedVarName ?? this.#returned);
      }

      if (!isReturnExpression) write("}");
    }
  }

  get isntAssignable() {
    return true;
  }

  [$customInspect]({ ...opts }: Deno.InspectOptions) {
    opts.depth ??= 4;
    if (--opts.depth < 0) return `{...}`;
    return this.#returned ? Deno.inspect(this.#returned, opts) : "{...}";
  }
}

const $argn = new JSContext(() => -1);
const $args = new JSContext(() => new Map<JSArgument, string>());

export class JSArgument implements IJSEntity {
  get scope() {
    return null;
  }

  get entities(): readonly IJSEntity[] {
    return empty;
  }

  write(write: (value: string | IJSEntity) => void) {
    const args = $args.use();
    const existing = args.get(this);
    if (existing == null) {
      const newName = argn($argn.set($argn.use() + 1));
      args.set(this, newName);
      write(newName);
    } else {
      write(existing);
    }
  }

  get isntAssignable() {
    return true;
  }

  [Symbol.for("Deno.customInspect")](): string {
    return `?`;
  }
}

export class JSCall implements IJSEntity {
  readonly #fn: IJSEntity;
  readonly #values: readonly IJSEntity[];

  public readonly entities: readonly IJSEntity[];
  public readonly operations: readonly IJSEntity[];

  constructor(
    public readonly scope: Scope,
    fn: IJSEntity,
    args: readonly unknown[],
  ) {
    this.#fn = fn;
    this.#values = args.map((a) => implicit(a, scope));
    this.operations = [fn, ...this.#values];
    this.entities = fn.owner != null
      ? [fn, fn.owner, ...this.#values]
      : this.operations;

    trackedOperations[0]?.push(this);
  }

  write(write: (value: string | IJSEntity) => void) {
    const isFnDeclared = $declaredNames.use().get(this.#fn);
    const needsCall = this.#fn.owner != null && isFnDeclared;

    if (this.#fn.needsParensOnAccess && !isFnDeclared) {
      write("(");
      write(this.#fn);
      write(")");
    } else {
      write(this.#fn);
    }

    write(needsCall ? ".call(" : "(");

    const args = needsCall ? [this.#fn.owner!, ...this.#values] : this.#values;
    args.forEach((v, i) => {
      if (i > 0) write(",");
      write(v);
    });

    write(")");
  }

  runtimeReference() {
    const fn = this.#fn.runtimeReference?.();
    let allArgsAreRefs = true;
    const args = this.#values.map((v) => {
      const ref = v.runtimeReference?.();
      if (ref != null) {
        return ref.value;
      } else {
        allArgsAreRefs = false;
      }
    });

    if (fn != null && allArgsAreRefs) {
      return new Some(
        (fn.value as JSFn).call(...args as [unknown, ...unknown[]]),
      );
    }
  }

  [$customInspect](opts: Deno.InspectOptions) {
    return `[${Deno.inspect(this.#fn, opts)}](${
      this.#values.map((v) => Deno.inspect(v, opts)).join(", ")
    })`;
  }
}

export class JSAccess implements IJSEntity {
  readonly #entity: IJSEntity;
  readonly #key: string | number | symbol | IJSEntity;

  public readonly entities: readonly IJSEntity[];

  constructor(
    public readonly scope: Scope,
    entity: IJSEntity,
    key: string | number | symbol | IJSEntity,
  ) {
    this.#entity = entity;
    this.#key = key;
    this.entities = typeof this.#key === "object"
      ? [this.#entity, this.#key]
      : [this.#entity];

    trackedOperations[0]?.push(this);
  }

  write(write: (value: string | IJSEntity) => void) {
    const isKeySafe = typeof this.#key === "string" &&
      JSObject.safeRecordKeyRegExp.test(this.#key);

    const needsParens = this.#entity.needsParensOnAccess &&
      !$declaredNames.use().has(this.#entity);
    if (needsParens) write("(");
    write(this.#entity);
    if (needsParens) write(")");

    if (isKeySafe) {
      write(this.#entity.isOptional ? "?." : ".");
      write(this.#key as string);
    } else {
      if (this.#entity.isOptional) write("?.");
      write("[");
      if (typeof this.#key === "object") {
        write(this.#key);
      } else {
        write(stringify(this.#key));
      }
      write("]");
    }
  }

  runtimeReference() {
    const obj = this.#entity.runtimeReference?.() as
      | Some<Record<string | number | symbol, unknown>>
      | undefined;
    const key = typeof this.#key === "object"
      ? this.#key.runtimeReference?.() as
        | Some<string | number | symbol>
        | undefined
      : new Some(this.#key);

    if (obj != null && key != null) {
      return new Some(
        this.#entity.isOptional ? obj.value?.[key.value] : obj.value[key.value],
      );
    }
  }

  get owner() {
    return this.#entity;
  }

  get isntAssignable() {
    return this.#entity.isntAssignable;
  }

  get startsWithCurly() {
    return !this.#entity.needsParensOnAccess && this.#entity.startsWithCurly;
  }

  [$customInspect](opts: Deno.InspectOptions) {
    return `${Deno.inspect(this.#entity, opts)}[${
      Deno.inspect(this.#key, opts)
    }]`;
  }
}

export class JSOptional implements IJSEntity {
  public readonly entities: readonly IJSEntity[];

  constructor(entity: IJSEntity) {
    this.entities = Object.freeze([entity]);
  }

  static from = <T>(js: JS<T>): JSOptional =>
    new JSOptional((js as any)[$target]);

  get scope() {
    return this.entities[0].scope;
  }

  write(write: (value: string | IJSEntity) => void) {
    write(this.entities[0]);
  }

  runtimeReference() {
    return this.entities[0].runtimeReference?.();
  }

  get isOptional() {
    return true;
  }

  get isntAssignable() {
    return true;
  }

  get startsWithCurly() {
    return this.entities[0].startsWithCurly;
  }

  [$customInspect](opts: Deno.InspectOptions) {
    return Deno.inspect(this.entities[0], opts);
  }
}

/**
 * User API to write custom JavaScript
 *
 * @param raw Raw JavaScript string or JS value or callback to return one of the previous (which executes later, useful for context scanning)
 */
export type JSWrite = (
  raw: string | JS<unknown> | (() => void),
) => void;

export const $js = Symbol.for("classic.js");

export class JSUser implements IJSEntity {
  readonly #obj: { [$js](write: JSWrite): void };
  #entities?: IJSEntity[];
  #registered?: Parameters<JSWrite>[0][];
  #currentWriter?: (value: string | IJSEntity) => void;

  constructor(
    public readonly scope: Scope,
    obj: { [$js]: unknown },
  ) {
    if (typeof obj[$js] !== "function") {
      throw Error(`Symbol["${Symbol.keyFor($js)}"] must expose a method`);
    }
    this.#obj = obj as { [$js](write: JSWrite): void };
  }

  get entities() {
    if (this.#entities == null) {
      this.#entities = [];
      this.#registered = [];
      try {
        trackedScopes.unshift(this.scope);
        this.#obj[$js]((value) => {
          if (this.#currentWriter == null) {
            this.#registered!.push(value);
            if (typeof value === "function" && hasTarget(value)) {
              this.#entities!.push(value[$target]);
            }
          } else {
            this.#currentWriter(value as string | IJSEntity);
          }
        });
      } finally {
        trackedScopes.shift();
      }
    }

    return this.#entities;
  }

  write(write: (value: string | IJSEntity) => void): void {
    this.#currentWriter = write;
    try {
      this.#registered!.forEach((raw) => {
        switch (typeof raw) {
          case "string":
            write(raw);
            break;
          case "function":
            if (hasTarget(raw)) {
              write(raw[$target]);
            } else {
              raw();
            }
            break;
          default:
            write(String(raw));
        }
      });
    } finally {
      this.#currentWriter = undefined;
    }
  }

  runtimeReference() {
    return new Some(this.#obj);
  }
}

const $modules = new JSContext(() => new JSModuleStore());

export class JSModuleStore implements IJSEntity {
  readonly #urls: Record<string, [number, string, undefined | (() => string)]> =
    {};
  #i = 0;

  get scope(): Scope {
    return null;
  }

  get entities(): readonly IJSEntity[] {
    return empty;
  }

  write(write: (value: string | IJSEntity) => void): void {
    write(`await Promise.all([`);
    write(
      Object.values(this.#urls)
        .map(([, spec, writtenSpec]) =>
          `import(${
            JSON.stringify(
              !isEvaluating() && writtenSpec != null ? writtenSpec() : spec,
            )
          })`
        )
        .join(","),
    );
    write(`])`);
  }

  index(url: string, writtenSpec?: () => string): number {
    this.#urls[url] ??= [this.#i++, url, writtenSpec];
    return this.#urls[url][0];
  }

  get urls() {
    return Object.keys(this.#urls);
  }

  get mustDeclare() {
    return true;
  }

  [$customInspect](): string {
    return `[modules]`;
  }
}

export class JSModule implements IJSEntity {
  readonly #spec: string;
  readonly #writtenSpec?: () => string;

  constructor(spec: string, writtenSpec?: () => string) {
    this.#spec = spec;
    this.#writtenSpec = writtenSpec;

    trackedOperations[0]?.push(this);
  }

  get scope() {
    return null;
  }

  get entities(): readonly IJSEntity[] {
    const modules = $modules.use();
    modules.index(this.#spec, this.#writtenSpec);
    return [modules];
  }

  write(write: (value: string | IJSEntity) => void): void {
    const modules = $modules.use();
    write($modules.use());
    write(`[${modules.index(this.#spec, this.#writtenSpec)}]`);
  }

  get isntAssignable() {
    return true;
  }

  [$customInspect](_opts: Deno.InspectOptions) {
    return `import(${this.#spec})`;
  }
}

export class JSAwait implements IJSEntity {
  readonly #entity: IJSEntity;

  constructor(
    public readonly scope: Scope,
    entity: IJSEntity,
  ) {
    this.#entity = entity;
    trackedOperations[0]?.push(this);
  }

  get entities(): readonly IJSEntity[] {
    $asyncScopes.use().add(this.#entity.scope);
    return [this.#entity];
  }

  write(write: (value: string | IJSEntity) => void): void {
    write("await ");
    write(this.#entity);
  }

  get needsParensOnAccess() {
    return true;
  }

  [$customInspect](opts: Deno.InspectOptions) {
    return `await ${Deno.inspect(this.#entity, opts)}`;
  }
}
