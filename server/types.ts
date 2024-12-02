import type { CustomElement, CustomElements } from "@classic/element";
import { isJSable, type JS, type JSable } from "@classic/js";
import type { JSXInternal } from "./dom.d.ts";
import type { Use } from "./use.ts";
import type { VoidElement } from "./void.ts";

type IntrinsicServerElement<
  T,
  Ref extends EventTarget,
  Children = JSX.Children,
> =
  & { [P in keyof T]: T[P] | JSable<T[P]> }
  & {
    readonly children?: Children;
    readonly ref?: JSXRef<Ref>;
  };

declare namespace JSX {
  // JSX Spec

  type IntrinsicElements =
    & {
      [K in keyof JSXInternal.IntrinsicElements]: IntrinsicServerElement<
        JSXInternal.IntrinsicElements[K],
        JSXInternal.IntrinsicElements[K] extends
          JSXInternal.HTMLAttributes<infer E> ? E
          : JSXInternal.IntrinsicElements[K] extends
            JSXInternal.SVGAttributes<infer E> ? E
          : never,
        K extends VoidElement ? never : JSX.Children
      >;
    }
    & {
      "cc-route": IntrinsicServerElement<{ path?: string }, HTMLElement>;
    }
    & {
      [K in keyof CustomElements]: CustomElements[K] extends
        CustomElement<infer Props, infer Ref>
        ? IntrinsicServerElement<Props, Ref>
        : never;
    };
  type Element = JSXElement | null | PromiseLike<JSXElement | null>;

  // Classic helpers

  type Children =
    | JSX.Element
    | DOMLiteral
    | Uint8Array
    | ReadableStream<Uint8Array>
    | null
    | undefined
    | JSable<DOMLiteral | null | undefined>
    | JSX.Children[];

  type FC<O extends Record<string, unknown> = Record<never, never>> = (
    props: O,
    use: Use,
  ) => JSX.Element;

  type PFC<
    O extends Record<string, unknown> = Record<never, never>,
  > = JSX.FC<O & { readonly children?: JSX.Children }>;
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
    readonly Component: JSX.FC<Record<string, unknown>>;
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

export const isJsx = (v: unknown): v is JSXElement =>
  typeof v === "object" && !!v && isJSable((v as any).ref);

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

export type FCProps<C> = C extends JSX.FC<infer P> ? P : never;

export type DOMLiteral = string | number;

export type JSXRef<T extends EventTarget> = (target: JS<T>) => unknown;

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
