import {
  deepMap,
  entries,
  isFunction,
  listen,
  NULL,
  UNDEFINED,
} from "@classic/util";
import { $extends, type Children, type CustomElement } from "./element.ts";
import type { JSXInternal } from "./jsx-dom.d.ts";
import { callOrReturn, onChange, track } from "./signal.ts";

const doc = document;

type IntrinsicElementProps<T> = T extends "" ? Record<never, never>
  : T extends keyof JSX.IntrinsicElements ? JSX.IntrinsicElements[T]
  : never;

/** Infer classic element prop types */
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
      [K in keyof CustomElements]: ClassicElementJSXProps<CustomElements[K]>;
    };

  type Element = NativeElement;
}

/** Define custom elements props by re-defining (extending) this interface */
export interface CustomElements {}

/** @ignore */
export type { JSX };

/**
 * Render reactive children
 *
 * @param el Parent node
 * @param children Reactive children
 */
export const render = (el: ParentNode, children: Children): void =>
  el.replaceChildren(
    ...deepMap(children, (c) => {
      let node: Node;
      onChange(
        () => {
          node = (callOrReturn(c) ?? "") as Node;
          return node = node instanceof Node
            ? node
            : doc.createTextNode(node as string);
        },
        (current, prev) => el.replaceChild(current, prev),
      );
      return node!;
    }),
  );

/** @ignore */
export const jsx = ((
  type: string | CustomElement<Record<string, unknown>, HTMLElement>,
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
  render(el, children);
  return el;
}) as {
  <T extends keyof JSX.IntrinsicElements>(
    type: T,
    opts: IntrinsicElementProps<T> & {
      readonly children?: Children;
      readonly xmlns?: never;
    },
  ): ChildNode;
  <T extends CustomElement<Record<string, unknown>, HTMLElement>>(
    type: T,
    opts: ClassicElementJSXProps<T>,
  ): ChildNode;
};

/** @ignore */
export { jsx as jsxs };

/** @ignore */
export const Fragment = "";

/** Imperative element reference access */
export const ref = <T>(initial?: T): { (el: T): T; (): T } => {
  let stored: T = initial!;
  return (el?: T) => el ? stored = el : stored;
};

/**
 * Change XML namespace in provided scope
 *
 * @param xmlns Target namespace
 * @param cb Scope affected by namespace change
 * @returns `cb`'s result
 */
export const xmlns = <T>(xmlns: string, cb: () => T): T => {
  let prevNS = ns;
  try {
    ns = xmlns;
    return cb();
  } finally {
    ns = prevNS;
  }
};

/**
 * Set SVG namespace in provided scope
 *
 * @param cb Scope affected by namespace change
 * @returns `cb`'s result
 */
export const svgns = <T>(cb: () => T): T =>
  xmlns("http://www.w3.org/2000/svg", cb);

const eventRegExp = /^on(.+?)(capture)?$/;

let ns = "";
