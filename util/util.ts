/**
 * Common client code intended to be used in a minified bundle.
 *
 * By sharing the same utilities with minification in mind,
 * bundles may save a significant amount of code size.
 *
 * @example Add and remove listener on `#foo` to log its first child's text on click
 * ```ts
 * listen(globalThis, "load", () => {
 *   const foo = querySelector("#foo")!;
 *   const unsub = listen(foo, "click", () => console.log(first(foo.childNodes).textContent));
 *   return unsub;
 * });
 * ```
 *
 * @module
 */

// Const

const globalThis_ = globalThis;
const Object_ = Object;

/** `null` */
export const NULL: null = null;

/** `undefined` */
export const UNDEFINED: undefined = void 0;

// FP

/**
 * Call provided closure
 *
 * @param cb Closure (function with no argument)
 * @returns `cb`'s result
 */
export const call = <T>(cb: () => T): T => cb();

/**
 * Get the first element of an array
 *
 * @param a Input array
 * @returns First element
 */
export const first = <T>(
  a: readonly [T, ...any[]] | { readonly [i: number]: T },
): T => a[0];

/**
 * Get the last element of an array
 *
 * @param a Input array
 * @returns Last element
 */
export const last = <T>(
  a: Readonly<{ length: number; [i: number]: T }>,
): T => a[length(a) - 1];

/**
 * Run `forEach` on provided input if any
 *
 * @param iterable "forEach"able input
 * @param cb `forEach` callback
 */
export const forEach = <
  T extends Record<"forEach", (...item: readonly any[]) => any>,
>(
  iterable: T | null | undefined,
  cb: T extends Record<"forEach", (cb: infer Cb) => void> ? Cb : never,
): void => iterable?.forEach(cb);

/**
 * Functional `for ... of` iteration
 *
 * @param iterable Iterable input
 * @param cb Callback receiving each item
 */
export const forOf = <T>(
  iterable: Iterable<T>,
  cb: (item: T) => unknown,
): void => {
  for (let i of iterable) cb(i);
};

/**
 * Functional `for` loop in reverse order of an iterable
 *
 * @param iterable Iterable input
 * @param cb Callback receiving each item
 */
export const reverseFor = <T>(
  iterable: Iterable<T>,
  cb: (item: T) => unknown,
): void => {
  let arr: ReadonlyArray<T> = isArray(iterable) ? iterable : [...iterable],
    i = arr.length - 1;
  for (; i >= 0; i--) cb(arr[i]);
};

/**
 * Functional identity
 *
 * @param v Value
 * @returns `v`
 */
export const id = <T>(v: T): T => v;

/**
 * @param v Value
 * @returns `typeof v === "function"`
 */
export const isFunction = <T extends Function>(v: unknown): v is T =>
  typeof v == "function";

/**
 * @param v Value
 * @returns `typeof v === "string"`
 */
export const isString = (v: unknown): v is string => typeof v === "string";

/**
 * Get length of a length object
 *
 * @param v Value
 * @returns `v.length`
 */
export const length = (lengthy: { length: number }) => lengthy.length;

/** No-operation closure */
export const noop = (): void => {};

/** See {@linkcode Array.isArray} */
export const isArray = /* @__PURE__ */ Array.isArray;

/** See {@linkcode Object.assign} */
export const assign = /* @__PURE__ */ Object_.assign;

/** See {@linkcode Object.defineProperty} */
export const defineProperty = /* @__PURE__ */ Object_.defineProperty;

/** See {@linkcode Object.defineProperties} */
export const defineProperties = /* @__PURE__ */ Object_.defineProperties;

/** See {@linkcode Object.entries} */
export const entries = /* @__PURE__ */ Object_.entries;

/** See {@linkcode Object.freeze} */
export const freeze = /* @__PURE__ */ Object_.freeze;

/** See {@linkcode Object.fromEntries} */
export const fromEntries = /* @__PURE__ */ Object_.fromEntries;

/** See {@linkcode Object.getOwnPropertyDescriptors} */
export const getOwnPropertyDescriptors =
  /* @__PURE__ */ Object_.getOwnPropertyDescriptors;

/** See {@linkcode Object.keys} */
export const keys = /* @__PURE__ */ Object_.keys;

/** See {@linkcode Object.values} */
export const values = /* @__PURE__ */ Object_.values;

/**
 * Promisified version of `setTimeout`
 *
 * @param delay Timeout delay in milliseconds
 * @returns Promise resoving after `delay`
 */
export const timeout = (delay: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, delay));

// DOM

let domParser: DOMParser | null = NULL;

/**
 * Parse HTML natively (see {@linkcode DOMParser})
 *
 * @param html HTML string
 * @returns HTML Document
 */
export const domParse = (html: string): Document =>
  (domParser ??= new DOMParser()).parseFromString(html, "text/html");

/**
 * Helper to parse arbitrary HTML in-body nodes (not necessarily a document)
 *
 * @param html HTML string
 * @returns Child nodes
 */
export const html = (
  html: string,
): ChildNode[] => [...domParse(html).body.childNodes];

/**
 * Adopt a node in current document
 *
 * @param node Node to adopt
 */
export const adoptNode = <T extends Node>(node: T): T =>
  document.adoptNode(node);

/**
 * Clone a node recursively
 *
 * @param node Node to clone
 * @returns Clone
 */
export const cloneNode = <T extends Node>(node: T): T =>
  node.cloneNode(true) as T;

/**
 * @param el DOM element
 * @returns `el.dataset`
 */
export const dataset = (el: HTMLElement | SVGElement): DOMStringMap =>
  el.dataset;

/**
 * Dispatch an even and check whether it has been prevented (`preventDefault`)
 *
 * @param el Target to dispatch from
 * @param event Event to dispatch
 * @returns True if the event has been prevented
 */
export const dispatchPrevented = (el: EventTarget, event: Event): boolean => (
  el.dispatchEvent(event), event.defaultPrevented
);

/**
 * Execute logic only with non-nullable value
 *
 * @param v Nullable value
 * @param cb Logic that only accepts non-nullable value
 * @returns `v` if nullable, `cb`'s result otherwise
 */
export const ifDef = <T, U>(v: T, cb: (v: NonNullable<T>) => U): T | U =>
  v == null ? (v as Exclude<T, NonNullable<T>>) : cb(v);

/** See {@linkcode Node.insertBefore} */
export const insertBefore = (
  parent: Node,
  node: Node,
  child: Node | null,
): Node => parent.insertBefore(node, child);

/** See {@linkcode Event.preventDefault} */
export const preventDefault = (e: Event): void => e.preventDefault();

/** See {@linkcode Document.querySelector} */
export const querySelector = <E extends Element>(
  selector: string,
  node: ParentNode = document.body,
): E | null => node.querySelector<E>(selector);

/** See {@linkcode Document.querySelectorAll} */
export const querySelectorAll = <E extends Element>(
  selector: string,
  node: ParentNode = document.body,
): NodeListOf<E> => node.querySelectorAll<E>(selector);

/**
 * @param el Removable object
 * @params args Optional arguments
 * @returns `el.remove(...args)`
 */
export const remove = <Args extends readonly unknown[], R>(
  el: { readonly remove: (...args: Args) => R },
  ...args: Args
): R => el.remove(...args);

/** See {@linkcode ChildNode.replaceWith} */
export const replaceWith = (
  el: ChildNode,
  ...node: readonly (Node | string)[]
): void => el.replaceWith(...node);

/** See {@linkcode Event.stopPropagation} */
export const stopPropagation = (e: Event): void => e.stopPropagation();

type Deep<T> = T | readonly Deep<T>[];

/**
 * Deeply map and transform elements
 *
 * @param v Nested array
 * @param cb Callback to transform nested elements
 * @returns Flat array of transformed elements
 */
export const deepMap = <T, R>(v: Deep<T>, cb: (v: T) => R): R[] =>
  isArray(v) ? deepMap_(v, cb) as R[] : [cb(v as T)];

const deepMap_ = <T, R>(v: Deep<T>, cb: (v: T) => R): R | R[] =>
  isArray(v) ? v.flatMap((v) => deepMap_(v, cb)) : cb(v as T);

const camelRegExp = /[A-Z]/g;

/**
 * Switch case from camel to hyphens
 *
 * @param camel Camel-case
 * @returns Hyphens-case
 */
export const hyphenize = (camel: string): string =>
  camel.replace(
    camelRegExp,
    (l: string) => "-" + l.toLowerCase(),
  );

/**
 * Declare a non-invasive typed global (indexed with `Symbol.for`)
 *
 * @param name Global's name
 * @param init Initialization logic
 * @returns Function that sets the global if receiving an argument, gets the global otherwise
 */
export const global = <T>(name: string, init: T): { (): T; (v: T): T } => {
  let $accessor = Symbol.for(name),
    getSet = (...args: [] | [T]) =>
      length(args)
        // @ts-ignore wrapped in this function to avoid overloading global types
        ? globalThis_[$accessor] = args[0]
        : $accessor in globalThis_
        // @ts-ignore wrapped in this function to avoid overloading global types
        ? globalThis_[$accessor]
        : init;
  return getSet;
};

/** Typed event type */
export type EventType<T> =
  & (undefined extends T ? { (detail?: T): CustomEvent<T> }
    : { (detail: T): CustomEvent<T> })
  & { readonly type: string };

const eventTypeIndex = /* @__PURE__ */ global("cc.eti", 0);

/**
 * Declare an event type
 *
 * @param opts Event definition object - May have an explicit "type" and any option that accepts {@linkcode CustomEvent}'s constructor
 * @returns Factory generating event of declared type
 */
export const eventType = <T = undefined>(
  { type, ...opts }: CustomEventInit<T> & { type?: string } = {},
): EventType<T> => {
  let t = type ?? "cc" + eventTypeIndex(eventTypeIndex() + 1),
    factory: ((detail: T) => CustomEvent<T>) & { type?: string } = (
      detail: T,
    ) =>
      new CustomEvent(t, { bubbles: true, cancelable: true, detail, ...opts });
  factory.type = t;
  return factory as EventType<T>;
};

/**
 * Compact wrapper for `addEventListener` and `removeEventListener`
 *
 * @param target Target that listens
 * @param event Event type
 * @param cb Callback to run
 * @param options `addEventListener` options
 * @returns Function removing the listener
 */
export const listen = <
  T extends EventTarget,
  K extends string | EventType<any>,
>(
  target: T,
  event: K,
  cb: (
    this: T,
    e: K extends EventType<infer ET> ? CustomEvent<ET>
      : T extends Window
        ? K extends keyof WindowEventMap ? WindowEventMap[K] : Event
      : K extends keyof HTMLElementEventMap ? HTMLElementEventMap[K]
      : Event,
  ) => void,
  options?: boolean | AddEventListenerOptions | undefined,
): () => void => {
  let type = isString(event) ? event : event.type;
  target.addEventListener(
    type,
    cb as Parameters<typeof target["addEventListener"]>[1],
    options,
  );
  return () =>
    target.removeEventListener(
      type,
      cb as Parameters<typeof target["removeEventListener"]>[1],
      options,
    );
};

/** Object-style CSS rules declaration */
export type CSSRules = Record<string, CSSDeclaration | string>;

type CSSDeclaration = { [k: string]: string | number | CSSDeclaration };

/**
 * Convert CSS rules to CSS
 *
 * @param rules CSS rules
 * @returns CSS
 */
export const toCSS = (rules: CSSRules): string =>
  entries(rules).map(([selector, declaration]) =>
    isString(declaration)
      ? selector + declaration
      : toRule(selector, declaration)
  ).join("");

const toRule = (selector: string, declaration: CSSDeclaration): string =>
  `${selector || ":host"}{${
    entries(declaration)
      .map(([property, value], ty: any) =>
        (ty = typeof value) === "object"
          ? toRule(property, value as CSSDeclaration)
          : `${hyphenize(property)}:${value}${ty === "number" ? "px" : ""};`
      )
      .join("")
  }}`;
