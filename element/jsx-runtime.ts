import { Children, on, renderChildren, setAttr } from "./element.ts";
import { JSXInternal } from "./jsx-dom.d.ts";
import { entries, hyphenize } from "./util.ts";

export const $type = Symbol();

export type JSXElementType = {
  [$type]: "" | keyof JSX.IntrinsicElements;
  readonly children?: Children;
};

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

declare namespace JSX {
  type IntrinsicElements = JSXInternal.IntrinsicElements & Classic.Elements;
  type Element = NativeElement;
}

export type { JSX };

export type GetConfig<K extends string | symbol> = Classic.Config extends
  Record<K, infer X> ? X
  : never;

export const jsx = <T extends keyof JSX.IntrinsicElements>(
  type: T,
  { children, ...props }: IntrinsicElementProps<T> & {
    readonly children?: Children;
  } = {} as IntrinsicElementProps<T> & { readonly children?: Children },
): Element => {
  let el = document.createElement(type);
  let ref: ((v: ParentNode) => void) | null = null;
  let eventMatch: RegExpMatchArray | null;

  for (let [k, v] of entries(props)) {
    if (v != null) {
      if (k === "ref") {
        ref = v as unknown as typeof ref;
      } else if ((eventMatch = k.toLowerCase().match(eventRegExp))) {
        on(
          el,
          eventMatch[1],
          v as unknown as (e: Event) => void,
          !!eventMatch[2],
        );
      } else if ((k = propRemap[k] ?? k) in el) {
        // @ts-ignore dynamically set
        el[k] = v;
      } else {
        setAttr(el as Element, hyphenize(k), v);
      }
    }
  }
  ref?.(el);
  renderChildren(el, children);
  return el;
};

export const Fragment = (
  { children }: { key?: string; children?: Children },
): Children => children;

export const ref = <T>(initial?: T): { (el: T): T; (): T } => {
  let stored: T = initial!;
  return (el?: T) => el ? stored = el : stored;
};

const propRemap: Record<string, string | undefined> = { class: "className" };

const eventRegExp = /^on(.+?)(capture)?$/;
