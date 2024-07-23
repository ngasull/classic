import type { Classic, CustomElement } from "@classic/element";
import type { JS, JSable } from "@classic/js";
import type { JSXInternal } from "./dom.d.ts";
import type { VoidElement } from "./void.ts";

type IntrinsicServerElement<
  T,
  Ref extends EventTarget,
  Children = JSXChildren,
> =
  & { [P in keyof T]: T[P] | JSable<T[P]> }
  & {
    readonly children?: Children;
    readonly ref?: JSXRef<Ref>;
  };

declare namespace JSX {
  type IntrinsicElements =
    & {
      [K in keyof JSXInternal.IntrinsicElements]: IntrinsicServerElement<
        JSXInternal.IntrinsicElements[K],
        JSXInternal.IntrinsicElements[K] extends
          JSXInternal.HTMLAttributes<infer E> ? E
          : JSXInternal.IntrinsicElements[K] extends
            JSXInternal.SVGAttributes<infer E> ? E
          : never,
        K extends VoidElement ? never : JSXChildren
      >;
    }
    & {
      "cc-route": IntrinsicServerElement<{ path?: string }, HTMLElement>;
    }
    & {
      [K in keyof Classic.Elements]: Classic.Elements[K] extends
        CustomElement<any, infer Props, infer Ref>
        ? IntrinsicServerElement<Props, Ref>
        : never;
    };
  type Element = JSXElement | null | PromiseLike<JSXElement | null>;
}

export type { JSX };

export type JSXElement =
  | {
    readonly kind: ElementKind.Fragment;
    readonly children: readonly JSXElement[];
    readonly ref: JS<Comment>;
  }
  | {
    readonly kind: ElementKind.Comment;
    readonly text: string;
    readonly ref: JS<Comment>;
  }
  | {
    readonly kind: ElementKind.Component;
    readonly Component: JSXComponent<Record<string, unknown>>;
    readonly props: Record<string, unknown>;
    readonly ref: JS<EventTarget>;
  }
  | {
    readonly kind: ElementKind.Intrinsic;
    readonly tag: keyof JSX.IntrinsicElements;
    readonly props: IntrinsicElementProps;
    readonly children: readonly JSXElement[];
    readonly ref: JS<Element>;
  }
  | {
    readonly kind: ElementKind.JS;
    readonly js: JSable<DOMLiteral>;
    readonly ref: JS<Text>;
  }
  | {
    readonly kind: ElementKind.Text;
    readonly text: DOMLiteral;
    readonly ref: JS<Text>;
  }
  | {
    readonly kind: ElementKind.HTMLNode;
    readonly html: ReadableStream<Uint8Array>;
    readonly ref: JS<Node>;
  };

export enum ElementKind {
  Fragment,
  Comment,
  Component,
  Intrinsic,
  JS,
  Text,
  HTMLNode,
}

export type IntrinsicElementProps = Readonly<
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

export type JSXChildren =
  | JSX.Element
  | DOMLiteral
  | null
  | undefined
  | JSable<DOMLiteral | null | undefined>
  | JSXChildren[];

export type DOMLiteral = string | number;

export type JSXRef<T extends EventTarget> = (target: JS<T>) => unknown;

export type JSXComponent<
  O extends Record<string, unknown> = Record<never, never>,
> = (props: O, use: JSXContextAPI) => JSX.Element;

export type JSXParentComponent<
  O extends Record<string, unknown> = Record<never, never>,
> = JSXComponent<O & { readonly children?: JSXChildren }>;

export type JSXContextInit<T> = readonly [symbol, T];

export type JSXContextAPI = {
  <T>(context: JSXContext<T>): T;
  <Args extends any[], T>(
    use: (ctx: JSXContextAPI, ...args: Args) => T,
    ...args: Args
  ): T;
  readonly get: <T>(context: JSXContext<T>) => T | undefined;
  readonly provide: <T>(context: JSXContext<T>, value: T) => JSXContextAPI;
};

export type JSXContext<T> = {
  readonly init: (value: T) => JSXContextInit<T>;
  readonly [contextSymbol]: symbol;
};

export type InferContext<C> = C extends JSXContext<infer T> ? T : never;

export const contextSymbol = Symbol("context");

export type DOMNode =
  | DOMNodeTag
  | DOMNodeText
  | DOMNodeHTMLNode
  | DOMNodeComment;

export type DOMNodeTag = {
  readonly kind: DOMNodeKind.Tag;
  readonly tag: string;
  readonly attributes: ReadonlyMap<string, string | number | boolean>;
  readonly children: Iterable<DOMNode> | AsyncIterable<DOMNode>;
  readonly ref: JSable<EventTarget>;
};

export type DOMNodeText = {
  readonly kind: DOMNodeKind.Text;
  readonly text: string;
  readonly ref: JSable<EventTarget>;
};

export type DOMNodeHTMLNode = {
  readonly kind: DOMNodeKind.HTMLNode;
  readonly html: ReadableStream<Uint8Array>;
  readonly ref: JSable<EventTarget>;
};

export type DOMNodeComment = {
  readonly kind: DOMNodeKind.Comment;
  readonly text: string;
  readonly ref: JSable<EventTarget>;
};

export enum DOMNodeKind {
  Tag,
  Text,
  HTMLNode,
  Comment,
}
