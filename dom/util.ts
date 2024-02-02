// Const

export const win = window;
export const doc = document;
export const head = doc.head;

export const textHtml = "text/html";

export const routeLoadEvent = "route-load";
export const routeFormEvent = "route-form";
export const submit = "submit";

// FP

export const call = <T>(cb: () => T): T => cb();

type DoMatch = {
  <T, M extends { [K in string | number]: (k: K) => T }>(
    k: string | number,
    matchers: M,
    cb: () => T,
  ): T;
  <T, M extends { [K in string | number]: (k: K) => T }>(
    k: string | number,
    matchers: M,
  ): T | undefined;
};

export const doMatch: DoMatch = <
  T,
  M extends { [K in string | number]: (k: K) => T },
>(
  k: string | number,
  matchers: M,
  cb = (): undefined => {},
): T | undefined => (matchers[k] ?? cb)(k as never);

export const first = <T>(a: readonly [T, ...any[]]): T => a[0];

export const last = <T>(a: readonly T[]): T => a[length(a) - 1];

export const forEach = <T extends Record<"forEach", (...item: any[]) => any>>(
  iterable: T | null | undefined,
  cb: T extends Record<"forEach", (cb: infer Cb) => void> ? Cb : never,
) => iterable?.forEach(cb);

export const forOf = <T>(iterable: Iterable<T>, cb: (item: T) => unknown) => {
  for (let i of iterable) cb(i);
};

export const id = <T>(v: T): T => v;

export const isFunction = <T extends Function>(v: unknown): v is T =>
  typeof v == "function";

export const length = (lengthy: { length: number }) => lengthy.length;

export const memo1 = <Fn extends (arg: any) => any>(
  fn: Fn,
  cache = new WeakMap(),
) =>
  assign(
    ((arg) => (
      !cache.has(arg) && cache.set(arg, fn(arg)), cache.get(arg)
    )) as Fn,
    {
      del(arg: Parameters<Fn>[0]) {
        cache.delete(arg);
      },
    },
  );

export const noop = () => {};

export const popR = <T>(arr: T[]) => (arr.pop(), arr);

export const pushR = <T>(arr: T[], ...v: T[]) => (arr.push(...v), arr);

export const startsWith = (str: string, start: string) => str.startsWith(start);

export const toLowerCase = (str: string) => str.toLowerCase();

export const { Promise } = win;

export const {
  isArray,
  prototype: { slice: arraySlice },
} = Array;

export const { parse } = JSON;

export const { assign, entries, fromEntries, keys, values } = Object;

// DOM

const domParser = new DOMParser();

export const parseHtml = (html: string) =>
  domParser.parseFromString(html, textHtml);

export const adoptNode = <T extends Node>(node: T) => doc.adoptNode(node);

export const cloneNode = <T extends Node>(node: T) => node.cloneNode(true) as T;

export const dataset = (el: HTMLElement | SVGElement) => el.dataset;

export const dispatchPrevented = (el: EventTarget, event: Event) => (
  el.dispatchEvent(event), event.defaultPrevented
);

export const customEvent = <T>(
  type: string,
  detail?: T,
  opts?: CustomEventInit<T>,
) =>
  new CustomEvent(type, { bubbles: true, cancelable: true, detail, ...opts });

export const ifDef = <T, U>(v: T, cb: (v: NonNullable<T>) => U) =>
  v == null ? (v as Exclude<T, NonNullable<T>>) : cb(v);

export const insertBefore = (parent: Node, node: Node, child: Node | null) =>
  parent.insertBefore(node, child);

export const newURL = (url: string | URL, base?: string | URL | undefined) =>
  new URL(url, base);

export const preventDefault = (e: Event) => e.preventDefault();

export const querySelector = <E extends Element>(
  selector: string,
  node: ParentNode = doc.body,
) => node.querySelector<E>(selector);

export const querySelectorAll = <E extends Element>(
  selector: string,
  node: ParentNode = doc.body,
) => node.querySelectorAll<E>(selector);

export const remove = (el: ChildNode) => el.remove();

export const replaceWith = (
  el: ChildNode,
  ...node: readonly (Node | string)[]
) => el.replaceWith(...node);

type ListenerOfAddEvent<T extends EventTarget | Window, K extends string> = (
  this: T,
  e: T extends Window ? K extends keyof WindowEventMap ? WindowEventMap[K]
    : Event
    : K extends keyof HTMLElementEventMap ? HTMLElementEventMap[K]
    : Event,
) => void;

export const stopPropagation = (e: Event) => e.stopPropagation();

export const subEvent = <
  K extends string,
  T extends (EventTarget | Window) & {
    addEventListener(type: K, listener: ListenerOfAddEvent<T, K>): void;
    removeEventListener(type: K, listener: ListenerOfAddEvent<T, K>): void;
  },
>(
  target: T,
  type: K,
  listener: ListenerOfAddEvent<T, K>,
  stopPropag?: 1 | 0 | boolean,
) => {
  let wrappedListener = stopPropag
    ? (function (e) {
      stopPropagation(e);
      listener.call(this, e);
    } as typeof listener)
    : listener;
  target.addEventListener(type, wrappedListener);
  return () => target.removeEventListener(type, wrappedListener);
};
