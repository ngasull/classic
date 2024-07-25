import {
  deepMap,
  entries,
  isFunction,
  listen,
  NULL,
  UNDEFINED,
} from "@classic/util";
import {
  $extends,
  $props,
  type Children,
  type CustomElement,
  renderChildren,
} from "./element.ts";
import type { JSXInternal } from "./jsx-dom.d.ts";
import { callOrReturn, track } from "./signal.ts";

const doc = document;

type IntrinsicElementProps<T> = T extends "" ? Record<never, never>
  : T extends keyof JSX.IntrinsicElements ? JSX.IntrinsicElements[T]
  : never;

export type ClassicElementJSXProps<T> = T extends
  CustomElement<infer Props, infer Ref> ?
    & { [P in keyof Props]: Props[P] | (() => Props[P]) }
    & JSXInternal.MergedHTMLAttributes<Ref>
    & { readonly children?: Children }
  : never;

type NativeElement = Element;

declare namespace JSX {
  type IntrinsicElements =
    & JSXInternal.IntrinsicElements
    & {
      [K in keyof Classic.Elements]: ClassicElementJSXProps<
        Classic.Elements[K]
      >;
    };

  type Element = NativeElement;

  type ElementAttributesProperty = { [$props]: unknown };
}

declare namespace Classic {
  interface Elements {}
}

export type { Classic, JSX };

export const jsx = ((
  type: string | CustomElement<unknown, HTMLElement>,
  { children, xmlns: _, ...props }: Record<string, unknown> & {
    readonly children?: Children;
  } = {},
): ChildNode => {
  if (!type) return deepMap(children, (c) => c) as never;

  let createOpts: ElementCreationOptions | undefined = UNDEFINED;
  type = isFunction(type)
    ? type[$extends]
      ? (createOpts = { is: type.tag }, type[$extends])
      : type.tag
    : type;

  let el = ns
    ? doc.createElementNS(ns, type, createOpts)
    : doc.createElement(type, createOpts);
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
}) as {
  <T extends keyof JSX.IntrinsicElements>(
    type: T,
    opts: IntrinsicElementProps<T> & {
      readonly children?: Children;
      readonly xmlns?: never;
    },
  ): ChildNode;
  <T extends CustomElement<unknown, HTMLElement>>(
    type: T,
    opts: ClassicElementJSXProps<T>,
  ): ChildNode;
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
