import { CustomElement, PropPrimitive } from "./element.ts";
import {
  $,
  Children,
  doc,
  listen,
  renderChildren,
  setAttr,
} from "./element.ts";
import { JSXInternal } from "./jsx-dom.d.ts";
import { callOrReturn, on } from "./signal.ts";
import {
  entries,
  getOwnPropertyDescriptors,
  hyphenize,
  mapOrDo,
} from "./util.ts";

export const $type: unique symbol = $() as never;

export type JSXElementType = {
  [$type]: "" | keyof JSX.IntrinsicElements;
  readonly children?: Children;
};

export type Tagged<T> = T extends
  CustomElement<infer Tag extends `${string}-${string}`, any, infer Props>
  ? Record<Tag, Props & { [$type]: T }>
  : never;

export type DOMClass<T> = T extends { [$type]: infer C } ? C : never;

export type IntrinsicElementProps<T> = T extends "" ? Record<never, never>
  : T extends keyof JSX.IntrinsicElements ? JSX.IntrinsicElements[T]
  : never;

declare global {
  namespace Classic {
    // deno-lint-ignore no-empty-interface
    interface Config {}
    // deno-lint-ignore no-empty-interface
    interface Elements {}
  }
}

type NativeElement = Element;

type Tags = JSXInternal.IntrinsicElements & Classic.Elements;

declare namespace JSX {
  interface IntrinsicElements extends Tags {}
  type Element = NativeElement;
}

export type { JSX };

export type GetConfig<K extends string | symbol> = Classic.Config extends
  Record<K, infer X> ? X
  : never;

export const jsx = <T extends keyof JSX.IntrinsicElements>(
  type: T,
  { children, xmlns: _, ...props }: IntrinsicElementProps<T> & {
    readonly children?: Children;
    readonly xmlns?: never;
  } = {} as IntrinsicElementProps<T> & { readonly children?: Children },
): ChildNode => {
  if (!type) return mapOrDo(children, (c) => c) as never;

  let el = ns ? doc.createElementNS(ns, type) : doc.createElement(type);
  let descriptors = getOwnPropertyDescriptors(el);
  let ref: ((v: ParentNode) => void) | null = null;
  let eventMatch: RegExpMatchArray | null;

  for (let [k, v] of entries(props)) {
    if (v != null) {
      if (k === "ref") {
        ref = v as unknown as typeof ref;
      } else if ((eventMatch = k.toLowerCase().match(eventRegExp))) {
        listen(
          el,
          eventMatch[1],
          v as unknown as (e: Event) => void,
          !!eventMatch[2],
        );
      } else {
        k = k === "class" ? "className" : k;
        on(
          () => callOrReturn(v),
          (v) =>
            descriptors[k]?.writable
              // @ts-ignore dynamically set
              ? el[k] = v
              : setAttr(el as Element, hyphenize(k), v as PropPrimitive),
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
// (
//   { children }: { key?: string; children?: Children },
// ): Node => {
//   let f = new DocumentFragment(),
//     c = isFunction(children) ? children : () => children;
//   track(() =>
//     f.replaceChildren(...mapOrDo(c(), (c) => (isFunction(c) ? c() : c) ?? ""))
//   );
//   return f;
// };

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
