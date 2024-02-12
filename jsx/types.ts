import type { JSable, JSFn, JSONable, JSWithBody } from "../js/types.ts";
import type { JSXInternal } from "./dom.d.ts";

declare global {
  namespace JSX {
    type IntrinsicElements = {
      readonly [K in keyof JSXInternal.IntrinsicElements]:
        & {
          readonly [P in keyof JSXInternal.IntrinsicElements[K]]?: ValueOrJS<
            JSXInternal.IntrinsicElements[K][P]
          >;
        }
        & {
          readonly children?: JSXChildren;
          readonly ref?: Ref<
            JSXInternal.IntrinsicElements[K] extends
              JSXInternal.HTMLAttributes<infer E> ? E
              : JSXInternal.IntrinsicElements[K] extends
                JSXInternal.SVGAttributes<infer E> ? E
              : JSXElement
          >;
        };
    };
  }
}

type ValueOrJS<T> = T | JSable<T>;

export type JSXElement = SyncElement | AsyncElement | JSXFragment;

type AsyncElement = Promise<SyncElement | JSXFragment>;

type SyncElement =
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
  readonly children: JSXFragment;
}

interface TextElement {
  readonly text: DOMLiteral;
  readonly ref?: Ref<Text>;
}

interface HTMLNodeElement {
  readonly html: string;
  readonly ref?: Ref<Node>;
}

interface ComponentElement<
  O extends Readonly<Record<string, unknown>> = {},
> {
  readonly Component: Component<O>;
  readonly props: O;
}

export type JSXFragment = JSXElement[];

export type JSXChildren =
  | JSXElement
  | DOMLiteral
  | null
  | undefined
  | JSable<DOMLiteral | null | undefined>
  | JSXChildren[];

export type DOMLiteral = string | number;

export type Ref<N> = JSFn<[N], unknown>;

export type SyncRef<N> = {
  readonly fn: JSWithBody<[N], void>;
  readonly values: readonly JSONable[];
};

export type Component<O extends Record<string, unknown> = {}> = (
  props: O,
  ctx: ContextAPI,
) => JSXElement;

export type ParentComponent<O extends Record<string, unknown> = {}> = Component<
  Omit<O, "children"> & { readonly children?: JSXChildren }
>;

export type InitContext<T> = readonly [symbol, T];

export type ContextAPI = {
  readonly get: <T>(context: Context<T>) => T;
  readonly getOrNull: <T>(context: Context<T>) => T | null;
  readonly has: <T>(context: Context<T>) => boolean;
  readonly set: <T>(context: Context<T>, value: T) => ContextAPI;
  readonly delete: <T>(context: Context<T>) => ContextAPI;
};

export type Context<T> = {
  readonly [contextSymbol]: symbol;
  readonly [contextTypeSymbol]: T;
  init(value: T): InitContext<T>;
};

declare const contextTypeSymbol: unique symbol;

export type ContextTypeSymbol = typeof contextTypeSymbol;

export enum ElementKind {
  Comment,
  Component,
  Intrinsic,
  JS,
  Text,
  HTMLNode,
}

export enum DOMNodeKind {
  Tag,
  Text,
  HTMLNode,
  Comment,
}

export type DOMNode =
  | {
    readonly kind: DOMNodeKind.Tag;
    readonly node: {
      readonly tag: string;
      readonly attributes: Readonly<Record<string, string | number | boolean>>;
      readonly children: readonly DOMNode[];
    };
    readonly refs?: readonly SyncRef<Element>[];
  }
  | {
    readonly kind: DOMNodeKind.Text;
    readonly node: {
      readonly text: string;
    };
    readonly refs?: readonly SyncRef<Text>[];
  }
  | {
    readonly kind: DOMNodeKind.HTMLNode;
    readonly node: {
      readonly html: string;
    };
    readonly refs?: readonly SyncRef<Node>[];
  }
  | {
    readonly kind: DOMNodeKind.Comment;
    readonly node: string;
    readonly refs?: readonly SyncRef<Comment>[];
  };

export const contextSymbol = Symbol("context");
