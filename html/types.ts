import { isJSable, type JS, type JSable } from "@classic/js";
import type { JSXInternal } from "./dom.d.ts";
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

/**
 * Specifies JSX types for `@classic/html` plus helpers
 *
 * [Specification details on typescriptlang.org](https://www.typescriptlang.org/docs/handbook/jsx.html#the-jsx-namespace)
 */
declare namespace JSX {
  // JSX Spec

  /** Instrinsic elements identified by lowercase tag name */
  type IntrinsicElements =
    & {
      [K in keyof JSXInternal.IntrinsicElements]: IntrinsicServerElement<
        JSXInternal.IntrinsicElements[K],
        ComponentProps<K>,
        K extends VoidElement ? never : JSX.Children
      >;
    }
    & {
      "cc-route": IntrinsicServerElement<{ path?: string }, HTMLElement>;
    };
  // import type { CustomElement, CustomElements } from "@classic/element";
  // & {
  //   [K in keyof CustomElements]: CustomElements[K] extends
  //     CustomElement<infer Props, infer Ref>
  //     ? IntrinsicServerElement<Props, Ref>
  //     : never;
  // }

  /**
   * Union of all types of values that can be returned by `jsx`
   */
  type Element = JSXElement | null | PromiseLike<JSXElement | null>;

  // Classic helpers

  /** Nodes that may be passed as children to elements and components that accepts them */
  type Children =
    | JSX.Element
    | DOMLiteral
    | Uint8Array
    | ReadableStream<Uint8Array>
    | null
    | undefined
    | JSable<DOMLiteral | null | undefined>
    | JSX.Children[];

  /** Functional component */
  type FC<O extends Record<string, unknown> = Record<never, never>> = (
    props: O,
  ) => JSX.Element;

  /** Parent functional component (accepts children) */
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

/**
 * Infer props from a functional component or an intrinsic HTML/SVG/MathML element
 */
export type ComponentProps<C> = C extends keyof JSXInternal.IntrinsicElements
  ? JSXInternal.IntrinsicElements[C] extends JSXInternal.HTMLAttributes<infer E>
    ? E
  : JSXInternal.IntrinsicElements[C] extends JSXInternal.SVGAttributes<infer E>
    ? E
  : JSXInternal.IntrinsicElements[C] extends
    JSXInternal.MathMLAttributes<infer E> ? E
  : never
  : C extends JSX.FC<infer P> ? P
  : never;

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
