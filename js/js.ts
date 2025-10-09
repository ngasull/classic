import {
  $declaredNames,
  $eval,
  $scopedDeclarations,
  currentScope,
  type IJSEntity,
  JSArbitrary,
  type JSArrow,
  JSArrowBody,
  JSAwait,
  JSModule,
  JSOptional,
  provideContext,
  runtimeRefPrefix,
  type Scope,
  varPrefix,
  writeEntity,
} from "./entity.ts";
import { implicit, jsTpl, mkJs } from "./proxy.ts";
import type { JS, JSArg } from "./types.ts";

/**
 * Generate JavaScript from a function body
 *
 * @param cb Function which tracks JS instructions
 * @returns JavaScript async function body transcribing `cb`
 */
export const toJs = <T>(cb: () => JSArg<T>): string => {
  try {
    return provideContext(() => writeJs(cb));
  } catch (e) {
    throw Error(`Failed generating JS`, { cause: e });
  }
};

const writeJs = <T>(cb: () => JSArg<T>): string => {
  const globalBody = new JSArrowBody(null, () => cb());

  const scopedDeclarations = $scopedDeclarations.use();
  const declaredNames = $declaredNames.use();

  let lastVarId = -1;

  const scopeToRefs = new Map<Scope, Set<IJSEntity>>();
  type ReuseRefMap = Map<
    IJSEntity | undefined,
    { outOfScope: boolean; refCount: number }
  >;
  const refToParentReuse = new Map<unknown, ReuseRefMap>();
  const refToChildren = new Map<unknown, readonly IJSEntity[]>();
  {
    type Job = readonly [
      IJSEntity,
      IJSEntity | undefined,
      JSArrow | null,
    ];
    const jobs: Job[] = [[globalBody, undefined, null]];
    for (let job; (job = jobs.shift());) {
      const [entity, parent, enclosing] = job;

      const entityInParentReuse: ReuseRefMap = refToParentReuse.get(entity) ??
        new Map();
      refToParentReuse.set(entity, entityInParentReuse);

      let def = entityInParentReuse.get(parent);
      if (def == null) {
        entityInParentReuse.set(
          parent,
          def = { outOfScope: false, refCount: 0 },
        );
      }

      def.refCount++;
      def.outOfScope ||= enclosing !== entity.scope;

      scopeToRefs.set(
        entity.scope,
        (scopeToRefs.get(entity.scope) ?? new Set()).add(entity),
      );

      if (!refToChildren.has(entity)) {
        const children = entity.entities.slice();
        refToChildren.set(entity, children);

        const subEnclosing = entity.asScope ?? enclosing;
        jobs.unshift(
          ...children.map((c) => [c, entity, subEnclosing] as const),
        );
      }
    }
  }

  const visitedRefs = new Set<IJSEntity>();
  const declaredRefs = new Set<IJSEntity>();

  const shouldDeclare = (entity: IJSEntity): boolean => {
    let totalCount = 0;
    if (entity.mustDeclare) return true;
    if (entity.isntAssignable) return false;

    const entityInParents = refToParentReuse.get(entity)!;
    for (
      const [parent, { outOfScope, refCount }] of entityInParents
    ) {
      if (refCount > 1) return true;
      if (parent == null || !declaredRefs.has(parent)) {
        if (outOfScope && (!parent || !hasAssignedParentInScope(parent))) {
          return true;
        } else {
          totalCount += refCount;
          if (totalCount > 1) return true;
        }
      }
    }

    return false;
  };

  const hasAssignedParentInScope = (entity: IJSEntity): boolean => {
    for (const parent of refToParentReuse.get(entity)!.keys()) {
      if (parent && parent.scope === entity.scope) {
        if (declaredRefs.has(parent) || hasAssignedParentInScope(parent)) {
          return true;
        }
      }
    }
    return false;
  };

  const declareIfNeeded = (entity: IJSEntity): boolean => {
    if (visitedRefs.has(entity)) return false;
    visitedRefs.add(entity);

    if (shouldDeclare(entity)) {
      declaredRefs.add(entity);
    }
    let assignedChildren = false;

    // Try declare contained expressions, pretending current is declared
    const children = refToChildren.get(entity);
    for (const c of children!) {
      if (!visitedRefs.has(c) && declareIfNeeded(c)) {
        assignedChildren = true;
      }
    }

    // Ensure current should still be declared
    if (
      declaredRefs.has(entity) &&
      (!assignedChildren || shouldDeclare(entity))
    ) {
      declaredNames.set(entity, `${varPrefix}${++lastVarId}`);
      const ds = scopedDeclarations.get(entity.scope);
      if (ds) ds.push(entity);
      else {
        scopedDeclarations.set(entity.scope, [entity]);
      }
      return true;
    } else {
      declaredRefs.delete(entity);
    }
    return false;
  };

  for (const refs of scopeToRefs.values()) {
    for (const meta of refs) {
      declareIfNeeded(meta);
    }
  }

  const fnStr = writeEntity(globalBody);
  const bodyStr = fnStr[0] === "{" ? fnStr.slice(1, -1) : fnStr;
  return bodyStr + ";";
};

/**
 * Evaluate a JS expression or an implicit one
 *
 * @param JS expression or value that may contain JS expressions
 * @returns A Promise resolving to the evaluated result
 */
export const evalJs: {
  <T>(expr: JS<T>): Promise<T>;
  <T>(expr: JSArg<T>): Promise<T>;
  <T>(expr: unknown): Promise<T>;
} = async <T>(expr: JSArg<T>) => {
  // Capture stack trace while still sync
  const err = Error();

  AsyncFunction ??= async function () {}.constructor as typeof Function;
  let rawJs: string | undefined;
  try {
    return await provideContext(async () => {
      $eval.set(new Map());

      rawJs = writeJs(() => expr);
      return new AsyncFunction(runtimeRefPrefix, rawJs)(
        [...$eval.use().keys()],
      );
    });
  } catch (e: any) {
    err.message = rawJs == null
      ? `Failed generating JS`
      : `Failed evaluating JS:\n${rawJs}`;
    err.cause = e;
    throw err;
  }
};

/** Userland modules */
export interface Module {}

let AsyncFunction: typeof Function;

let returnTpl: string[];

const jsUtils = {
  /**
   * Flag an expression as optional. Accessing properties will be transcribed as `.?` accesses
   *
   * @param expr Expression to make optional
   * @returns Optional expression
   */
  await: <T>(expr: JSArg<T>): JS<Awaited<T>> =>
    mkJs(new JSAwait(currentScope(), implicit(expr))),

  /**
   * Declare a JS module and gain access to its exports.
   *
   * @param spec Source specifier or function to resolve the specifier
   * @param writtenSpec Function to resolve the specifier to write, if different than spec (useful for isomorphic code)
   * @returns `JS` object of the modules exports
   *
   * @example Render a react app
   * ```tsx
   * import { js, jsGlobal, toJs } from "@classic/js";
   *
   * import type React from "npm:react";
   * import type { Root } from "npm:react-dom/client";
   *
   * const react = js.module<typeof import("npm:react-dom/client")>("npm:react-dom/client");
   * const app = js.module<{ render: (root: Root) => void }>(import.meta.resolve("./app.tsx"));
   *
   * const renderScript = toJs(() => {
   *   app.render(react.createRoot(jsGlobal.document.body));
   * });
   * ```
   */
  module:
    ((spec: string, writtenSpec?: () => string) =>
      mkJs(new JSModule(spec, writtenSpec))) as {
        <M extends keyof Module>(
          name: M,
          resolve?: () => string,
        ): JS<Module[M]>;
        <T = never>(
          spec: string,
          writtenSpec?: () => string,
        ): T extends never ? never : JS<T>;
      },

  /**
   * Declare a class instantiation
   *
   * @param constructible Class to construct
   * @params params Constructor parameters
   * @returns `JS` instance
   */
  new: <T extends abstract new (...params: P) => any, P extends unknown[]>(
    constructible: JSArg<T>,
    ...params: { [I in keyof P]: JSArg<P[I]> }
  ): JS<InstanceType<T>> =>
    jsTpl(
      ["new ", "(", ...Array(Math.max(0, params.length - 1)).fill(","), ")"],
      constructible,
      ...params,
    ),

  /**
   * Flag an expression as optional. Accessing properties will be transcribed as `.?` accesses
   *
   * @param expr Expression to make optional
   * @returns Optional expression
   */
  optional: <T>(expr: JS<T>): JS<NonNullable<T>> => mkJs(JSOptional.from(expr)),

  /**
   * Transforms a expression into a return instruction
   *
   * @param expr Expression to return
   * @returns The return instruction
   */
  return: <T extends JSArg<any>>(expr: T): JS<void> =>
    mkJs(
      new JSArbitrary(
        currentScope(),
        returnTpl ??= ["return ", ""],
        [implicit(expr)],
        true,
      ),
    ),

  /**
   * Helper template to generate a template string
   *
   * @example Generate a template interoplation that provides time
   * ```ts
   * const now = js<Date>`new Date()`;
   * js.string`Time is ${now.getHours()}:${now.getMinutes()}`;
   *
   * // Generated code looks like
   * // const now = new Date();
   * // `Time is ${now.getHours()}:${now.getMinutes()}`;
   * ```
   */
  string: (
    tpl: ReadonlyArray<string>,
    ...exprs: JSArg<any>[]
  ): JS<string> => {
    const parts = Array(tpl.length);
    parts[0] = `\`${tpl[0].replaceAll(/[`$]/g, (m) => "\\" + m)}`;
    for (let i = 0; i < exprs.length; i++) {
      parts[i] += "${";
      parts[i + 1] = `}${tpl[i + 1].replaceAll(/[`$]/g, (m) => "\\" + m)}`;
    }
    parts[parts.length - 1] += "`";
    return jsTpl<string>(parts, ...exprs);
  },
};

/**
 * Classic JS API
 *
 * May be used as a template string to manipulate JavaScript and automatically interpolate `JSable`s.
 * Also contains utility functions: await, module, new, optional, return, string, window
 */
export const js = Object.freeze(Object.assign(jsTpl, jsUtils)) as
  & typeof jsTpl
  & Readonly<typeof jsUtils>;

/** Helper to access browser globals */
export const jsGlobal = new Proxy({}, {
  get: (_, p) => jsTpl([p as string]),
}) as
  & Readonly<Omit<JS<Window & typeof globalThis>, keyof JSWindowOverrides>>
  & JSWindowOverrides;

type JSWindowOverrides = {
  readonly Promise: {
    all<P>(promises: P): P extends readonly JS<unknown>[] ? JS<
        Promise<
          { [I in keyof P]: P[I] extends JS<infer P> ? Awaited<P> : never }
        >
      >
      : P extends readonly JS<infer P>[] ? JS<Promise<Awaited<P>[]>>
      : never;
    allSettled: JSWindowOverrides["Promise"]["all"];
    any: JSWindowOverrides["Promise"]["all"];
    race<P>(
      promises: P,
    ): P extends readonly JS<infer P>[] ? JS<Promise<Awaited<P>>> : never;
    withResolvers<P>(): {
      promise: Promise<P>;
      resolve: (value: P) => void;
      reject: (reason: any) => void;
    };
  };
};
