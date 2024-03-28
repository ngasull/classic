import type { EffectAPI } from "../dom.ts";
import type { JSable, JSFn } from "../js/types.ts";
import type { JSXInternal } from "./dom.d.ts";

declare global {
  namespace JSX {
    type IntrinsicElements = {
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
    };

    type Element = SyncElement | Promise<SyncElement>;
  }
}

type JSOr<T> = T | JSable<T>;

type SyncElement =
  | JSXFragment
  | { readonly kind: ElementKind.Comment; readonly element: string }
  | {
    readonly kind: ElementKind.Component;
    readonly element: ComponentElement;
  }
  | {
    readonly kind: ElementKind.Intrinsic;
    readonly element: IntrinsicElement;
  }
  | { readonly kind: ElementKind.JS; readonly element: JSable<DOMLiteral> }
  | { readonly kind: ElementKind.Text; readonly element: TextElement }
  | {
    readonly kind: ElementKind.HTMLNode;
    readonly element: HTMLNodeElement;
  };

export enum ElementKind {
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
  readonly children: JSX.Element[];
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

export type JSXFragment = JSX.Element[];

export type JSXChildren =
  | JSX.Element
  | DOMLiteral
  | null
  | undefined
  | JSable<DOMLiteral | null | undefined>
  | JSXChildren[];

export type DOMLiteral = string | number;

export type JSXRef<T extends EventTarget> = JSFn<[T], T | void>;

export type JSXComponent<O extends Record<string, unknown> = {}> = (
  props: O,
  api: JSXComponentAPI,
) => JSX.Element;

export type JSXParentComponent<O extends Record<string, unknown> = {}> =
  JSXComponent<
    Omit<O, "children"> & { readonly children?: JSXChildren }
  >;

export type JSXComponentAPI = {
  readonly context: JSXContextAPI;
  readonly effect: (
    cb: JSFn<[EffectAPI], void | (() => void)>,
    uris?: string[],
  ) => void;
};

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
  | {
    readonly kind: DOMNodeKind.Tag;
    readonly node: {
      readonly tag: string;
      readonly attributes: ReadonlyMap<string, string | number | boolean>;
      readonly children: readonly DOMNode[];
    };
    readonly ref: JSable<EventTarget>;
  }
  | {
    readonly kind: DOMNodeKind.Text;
    readonly node: {
      readonly text: string;
    };
    readonly ref: JSable<EventTarget>;
  }
  | {
    readonly kind: DOMNodeKind.HTMLNode;
    readonly node: {
      readonly html: string;
    };
    readonly ref: JSable<EventTarget>;
  }
  | {
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
