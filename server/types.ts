import type { JS, JSable } from "classic/js";
import type { JSXInternal } from "./dom.d.ts";

declare global {
  namespace Classic {
    // deno-lint-ignore no-empty-interface
    interface Elements {}
  }
}

declare namespace JSX {
  type IntrinsicElements =
    & {
      [K in keyof JSXInternal.IntrinsicElements]:
        & {
          [P in keyof JSXInternal.IntrinsicElements[K]]?: JSOr<
            JSXInternal.IntrinsicElements[K][P]
          >;
        }
        & {
          readonly children?: JSXChildren;
          readonly ref?: JSXRef<
            JSXInternal.IntrinsicElements[K] extends
              JSXInternal.HTMLAttributes<infer E> ? E
              : JSXInternal.IntrinsicElements[K] extends
                JSXInternal.SVGAttributes<infer E> ? E
              : never
          >;
        };
    }
    & Classic.Elements;

  type Element = JSXElement | PromiseLike<JSXElement>;
}

export type { JSX };

export type JSXElement =
  | {
    readonly kind: ElementKind.Fragment;
    readonly element: readonly JSXElement[];
    readonly ref: JS<Comment>;
  }
  | {
    readonly kind: ElementKind.Comment;
    readonly element: string;
    readonly ref: JS<Comment>;
  }
  | {
    readonly kind: ElementKind.Component;
    readonly element: ComponentElement;
    readonly ref: JS<EventTarget>;
  }
  | {
    readonly kind: ElementKind.Intrinsic;
    readonly element: IntrinsicElement;
    readonly ref: JS<Element>;
  }
  | {
    readonly kind: ElementKind.JS;
    readonly element: JSable<DOMLiteral>;
    readonly ref: JS<Text>;
  }
  | {
    readonly kind: ElementKind.Text;
    readonly element: TextElement;
    readonly ref: JS<Text>;
  }
  | {
    readonly kind: ElementKind.HTMLNode;
    readonly element: HTMLNodeElement;
    readonly ref: JS<Node>;
  };

type JSOr<T> = T | JSable<T>;

export enum ElementKind {
  Fragment,
  Comment,
  Component,
  Intrinsic,
  JS,
  Text,
  HTMLNode,
}

export interface IntrinsicElement {
  readonly tag: keyof JSX.IntrinsicElements;
  readonly props: Readonly<
    Record<
      string,
      | JSable<string | number | boolean | null>
      | string
      | number
      | boolean
      | null
      | undefined
    >
  >;
  readonly children: readonly JSXElement[];
}

interface TextElement {
  readonly text: DOMLiteral;
  readonly ref?: JSXRef<Text>;
}

interface HTMLNodeElement {
  readonly html: string;
  readonly ref?: JSXRef<Node>;
}

interface ComponentElement<
  O extends Readonly<Record<string, unknown>> = {},
> {
  readonly Component: JSXComponent<O>;
  readonly props: O;
}

export type JSXChildren =
  | JSX.Element
  | DOMLiteral
  | null
  | undefined
  | JSable<DOMLiteral | null | undefined>
  | JSXChildren[];

export type DOMLiteral = string | number;

export type JSXRef<T extends EventTarget> = (target: JS<T>) => unknown;

export type JSXComponent<O extends Record<string, unknown> = {}> = (
  props: O,
  api: JSXContextAPI,
) => JSX.Element | null;

export type JSXParentComponent<O extends Record<string, unknown> = {}> =
  JSXComponent<
    Omit<O, "children"> & { readonly children?: JSXChildren }
  >;

export type JSXInitContext<T> = readonly [symbol, T];

export type JSXContextAPI = {
  <T>(context: JSXContext<T>): T;
  readonly get: <T>(context: JSXContext<T>) => T | null;
  readonly set: <T>(context: JSXContext<T>, value: T) => JSXContextAPI;
  readonly delete: (context: JSXContext<never>) => JSXContextAPI;
};

export type JSXContext<T> = {
  (value: T): JSXInitContext<T>;
  readonly [contextSymbol]: symbol;
};

export type JSXContextOf<C extends JSXContext<any>> = C extends
  JSXContext<infer T> ? T : never;

export const contextSymbol = Symbol("context");

export type DOMNode =
  | DOMNodeTag
  | DOMNodeText
  | DOMNodeHTMLNode
  | DOMNodeComment;

export type DOMNodeTag = {
  readonly kind: DOMNodeKind.Tag;
  readonly node: {
    readonly tag: string;
    readonly attributes: ReadonlyMap<string, string | number | boolean>;
    readonly children: readonly DOMNode[];
  };
  readonly ref: JSable<EventTarget>;
};

export type DOMNodeText = {
  readonly kind: DOMNodeKind.Text;
  readonly node: { readonly text: string };
  readonly ref: JSable<EventTarget>;
};

export type DOMNodeHTMLNode = {
  readonly kind: DOMNodeKind.HTMLNode;
  readonly node: { readonly html: string };
  readonly ref: JSable<EventTarget>;
};

export type DOMNodeComment = {
  readonly kind: DOMNodeKind.Comment;
  readonly node: string;
  readonly ref: JSable<EventTarget>;
};

export enum DOMNodeKind {
  Tag,
  Text,
  HTMLNode,
  Comment,
}
