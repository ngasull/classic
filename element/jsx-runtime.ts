import { deepMap, doc, entries, listen, NULL } from "@classic/js/dom/util";
import type { Classic, CustomElement } from "./element.ts";
import { type Children, renderChildren } from "./element.ts";
import type { JSXInternal } from "./jsx-dom.d.ts";
import { callOrReturn, track } from "./signal.ts";

declare const $type: unique symbol;

export type Tagged<T> = T extends
  CustomElement<infer Tag extends `${string}-${string}`, infer Props, any>
  ? Record<Tag, Props & { [$type]?: T }>
  : never;

export type DOMClass<T> = T extends { [$type]?: infer C } ? C : never;

export type IntrinsicElementProps<T> = T extends "" ? Record<never, never>
  : T extends keyof JSX.IntrinsicElements ? JSX.IntrinsicElements[T]
  : never;

type NativeElement = Element;

type Tags = JSXInternal.IntrinsicElements & Classic.Elements;

declare namespace JSX {
  interface IntrinsicElements extends Tags {}
  type Element = NativeElement;
}

export type { JSX };

export const jsx = <T extends keyof JSX.IntrinsicElements>(
  type: T,
  { children, xmlns: _, ...props }: IntrinsicElementProps<T> & {
    readonly children?: Children;
    readonly xmlns?: never;
  } = {} as IntrinsicElementProps<T> & {
    readonly children?: Children;
    readonly xmlns?: never;
  },
): ChildNode => {
  if (!type) return deepMap(children, (c) => c) as never;

  let el = ns ? doc.createElementNS(ns, type) : doc.createElement(type);
  let ref: ((v: ParentNode) => void) | null = NULL;
  let eventMatch: RegExpMatchArray | null;

  for (
    let [k, v] of entries(
      // @ts-ignore TS going mad on this uncastable argument
      props,
    )
  ) {
    if (v != null) {
      if (k == "ref") {
        ref = v as (v: ParentNode) => void;
      } else if ((eventMatch = k.toLowerCase().match(eventRegExp))) {
        listen(
          el,
          eventMatch[1],
          v as (e: Event) => void,
          !!eventMatch[2],
        );
      } else {
        k = k === "class" ? "className" : k;
        track(() =>
          ns
            ? el.setAttribute(k, String(callOrReturn(v)))
            // @ts-ignore dynamically set
            : el[k] = callOrReturn(v)
        );
      }
    }
  }

  ref?.(el);
  renderChildren(el, children);
  return el;
};

export { jsx as jsxs };

export const Fragment = "";

export const ref = <T>(initial?: T): { (el: T): T; (): T } => {
  let stored: T = initial!;
  return (el?: T) => el ? stored = el : stored;
};

export const xmlns = <T>(xmlns: string, cb: () => T): T => {
  let prevNS = ns;
  try {
    ns = xmlns;
    return cb();
  } finally {
    ns = prevNS;
  }
};

export const svgns = <T>(cb: () => T): T =>
  xmlns("http://www.w3.org/2000/svg", cb);

const eventRegExp = /^on(.+?)(capture)?$/;

let ns = "";
