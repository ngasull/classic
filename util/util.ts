// Const

const globalThis_ = globalThis;
const Object_ = Object;

export const TRUE: boolean = !0;
export const NULL: null = null;
export const UNDEFINED: undefined = void 0;

// FP

export const call = <T>(cb: () => T): T => cb();

export const first = <T>(a: readonly [T, ...any[]]): T => a[0];

export const last = <T>(a: readonly T[]): T => a[length(a) - 1];

export const forEach = <
  T extends Record<"forEach", (...item: readonly any[]) => any>,
>(
  iterable: T | null | undefined,
  cb: T extends Record<"forEach", (cb: infer Cb) => void> ? Cb : never,
): void => iterable?.forEach(cb);

export const forOf = <T>(
  iterable: Iterable<T>,
  cb: (item: T) => unknown,
): void => {
  for (let i of iterable) cb(i);
};

export const reverseForOf = <T>(
  iterable: Iterable<T>,
  cb: (item: T) => unknown,
): void => {
  let arr = [...iterable], i = arr.length - 1;
  for (; i >= 0; i--) cb(arr[i]);
};

export const id = <T>(v: T): T => v;

export const isFunction = <T extends Function>(v: unknown): v is T =>
  typeof v == "function";

export const isString = (v: unknown): v is string => typeof v === "string";

export const length = (lengthy: { length: number }) => lengthy.length;

export const noop = (): void => {};

export const isArray = /* @__PURE__ */ Array.isArray;

export const assign = /* @__PURE__ */ Object_.assign;
export const defineProperty = /* @__PURE__ */ Object_.defineProperty;
export const defineProperties = /* @__PURE__ */ Object_.defineProperties;
export const entries = /* @__PURE__ */ Object_.entries;
export const freeze = /* @__PURE__ */ Object_.freeze;
export const fromEntries = /* @__PURE__ */ Object_.fromEntries;
export const getOwnPropertyDescriptors =
  /* @__PURE__ */ Object_.getOwnPropertyDescriptors;
export const keys = /* @__PURE__ */ Object_.keys;
export const values = /* @__PURE__ */ Object_.values;

// DOM

let domParser: DOMParser | null = NULL;

export const domParse = (html: string): Document =>
  (domParser ??= new DOMParser()).parseFromString(html, "text/html");

export const html = (
  xml: string,
): ChildNode[] => [...domParse(xml).body.childNodes];

export const adoptNode = <T extends Node>(node: T): T =>
  document.adoptNode(node);

export const cloneNode = <T extends Node>(node: T): T =>
  node.cloneNode(TRUE) as T;

export const dataset = (el: HTMLElement | SVGElement): DOMStringMap =>
  el.dataset;

export const dispatchPrevented = (el: EventTarget, event: Event): boolean => (
  el.dispatchEvent(event), event.defaultPrevented
);

export const ifDef = <T, U>(v: T, cb: (v: NonNullable<T>) => U): T | U =>
  v == null ? (v as Exclude<T, NonNullable<T>>) : cb(v);

export const insertBefore = (
  parent: Node,
  node: Node,
  child: Node | null,
): Node => parent.insertBefore(node, child);

export const preventDefault = (e: Event): void => e.preventDefault();

export const querySelector = <E extends Element>(
  selector: string,
  node: ParentNode = document.body,
): E | null => node.querySelector<E>(selector);

export const querySelectorAll = <E extends Element>(
  selector: string,
  node: ParentNode = document.body,
): NodeListOf<E> => node.querySelectorAll<E>(selector);

export const remove = <Args extends readonly unknown[], R>(
  el: { readonly remove: (...args: Args) => R },
  ...args: Args
): R => el.remove(...args);

export const replaceWith = (
  el: ChildNode,
  ...node: readonly (Node | string)[]
): void => el.replaceWith(...node);

export const stopPropagation = (e: Event): void => e.stopPropagation();

type Deep<T> = T | readonly Deep<T>[];

export const deepMap = <T, R>(v: Deep<T>, cb: (v: T) => R): R[] =>
  isArray(v) ? deepMap_(v, cb) as R[] : [cb(v as T)];

const deepMap_ = <T, R>(v: Deep<T>, cb: (v: T) => R): R | R[] =>
  isArray(v) ? v.flatMap((v) => deepMap_(v, cb)) : cb(v as T);

const camelRegExp = /[A-Z]/g;

export const hyphenize = (camel: string): string =>
  camel.replace(
    camelRegExp,
    (l: string) => "-" + l.toLowerCase(),
  );

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

export type EventType<T> =
  & (undefined extends T ? { (detail?: T): CustomEvent<T> }
    : { (detail: T): CustomEvent<T> })
  & { readonly type: string };

const eventTypeIndex = /* @__PURE__ */ global("cc.eti", 0);

export const eventType = <T = undefined>(
  { type, ...opts }: CustomEventInit<T> & { type?: string } = {},
): EventType<T> => {
  let t = type ?? "cc" + eventTypeIndex(eventTypeIndex() + 1),
    factory: ((detail: T) => CustomEvent<T>) & { type?: string } = (
      detail: T,
    ) =>
      new CustomEvent(t, { bubbles: TRUE, cancelable: TRUE, detail, ...opts });
  factory.type = t;
  return factory as EventType<T>;
};

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

export type CSSRules = Record<string, CSSDeclaration | string>;

type CSSDeclaration = { [k: string]: string | number | CSSDeclaration };

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
