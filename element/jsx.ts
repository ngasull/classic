import { deepMap, document, entries, listen, NULL } from "@classic/util";
import {
  type Children,
  type CustomElement,
  renderChildren,
} from "./element.ts";
import type { JSXInternal } from "./jsx-dom.d.ts";
import { callOrReturn, track } from "./signal.ts";

type IntrinsicElementProps<T> = T extends "" ? Record<never, never>
  : T extends keyof JSX.IntrinsicElements ? JSX.IntrinsicElements[T]
  : never;

type NativeElement = Element;

declare namespace JSX {
  type IntrinsicElements =
    & JSXInternal.IntrinsicElements
    & {
      [K in keyof Classic.Elements]: Classic.Elements[K] extends
        CustomElement<any, infer Props, infer Ref> ?
          & { [P in keyof Props]: Props[P] | (() => Props[P]) }
          & JSXInternal.MergedHTMLAttributes<Ref>
          & { readonly children?: Children }
        : never;
    };
  type Element = NativeElement;
}

declare namespace Classic {
  interface Elements {}
}

export type { Classic, JSX };

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

  let el = ns
    ? document.createElementNS(ns, type)
    : document.createElement(type);
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
