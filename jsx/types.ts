import type { JS, JSable, JSFn, JSFnBody, JSONable } from "../js/types.ts";
import { jsSymbol } from "../js/types.ts";
import type { JSXInternal } from "./dom.d.ts";

type ValueOrJS<T> = T | JSable<T>;

declare global {
  namespace JSX {
    type IntrinsicTag = keyof JSXInternal.IntrinsicElements;

    type IntrinsicElements = {
      [K in keyof JSXInternal.IntrinsicElements]:
        & {
          [P in keyof JSXInternal.IntrinsicElements[K]]?: ValueOrJS<
            JSXInternal.IntrinsicElements[K][P]
          >;
        }
        & {
          children?: JSX.Children;
          ref?: JSX.Ref<
            JSXInternal.IntrinsicElements[K] extends
              JSXInternal.HTMLAttributes<infer E> ? E
              : JSXInternal.IntrinsicElements[K] extends
                JSXInternal.SVGAttributes<infer E> ? E
              : Element
          >;
        };
    };

    type Element = SyncElement | AsyncElement | Fragment;

    type AsyncElement = Promise<SyncElement | Fragment>;

    type Fragment = Element[];

    type Children =
      | Element
      | DOMLiteral
      | null
      | undefined
      | JSable<DOMLiteral | null | undefined>
      | Children[];

    type SyncElement =
      | { kind: ElementKind.Comment; element: string }
      | { kind: ElementKind.Component; element: ComponentElement }
      | { kind: ElementKind.Intrinsic; element: IntrinsicElement }
      | { kind: ElementKind.JS; element: JSable<DOMLiteral> }
      | { kind: ElementKind.Text; element: TextElement }
      | { kind: ElementKind.HTMLNode; element: HTMLNodeElement };

    interface IntrinsicElement {
      tag: IntrinsicTag;
      props: Record<
        string,
        | JSable<string | number | boolean | null>
        | string
        | number
        | boolean
        | null
        | undefined
      >;
      children: Fragment;
    }

    interface TextElement {
      text: DOMLiteral;
      ref?: Ref<Text>;
    }

    interface HTMLNodeElement {
      html: string;
      ref?: Ref<Node>;
    }

    interface ComponentElement<
      O extends Record<string, any> = Record<string, any>,
    > {
      Component: Component<O>;
      props: O;
    }

    type Component<O extends Record<string, any> = Record<string, never>> = (
      props: O,
      ctx: ContextAPI,
    ) => Element;

    type ParentComponent<O extends ElementProps = ElementProps> = Component<
      O & ChildrenProp
    >;

    type Context<T> = {
      [contextSymbol]: symbol;
      [contextTypeSymbol]: T;
      init(value: T): InitContext<T>;
    };

    type InitContext<T> = [symbol, T];

    type ContextAPI = {
      get<T>(context: Context<T>): T;
      getOrNull<T>(context: Context<T>): T | null;
      has<T>(context: Context<T>): boolean;
      set<T>(context: Context<T>, value: T): ContextAPI;
      delete<T>(context: Context<T>): ContextAPI;
    };

    type DOMLiteral = string | number;

    type Ref<N> = JSFn<[N], unknown>;
  }
}

declare const contextTypeSymbol: unique symbol;

export type SyncRef<N> = {
  fn: JS<(ref: N) => void> & {
    [jsSymbol]: { body: JSFnBody<unknown> };
  };
  values: JSONable[];
};

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
    kind: DOMNodeKind.Tag;
    node: {
      tag: string;
      attributes: Record<string, string | number | boolean>;
      children: DOMNode[];
    };
    refs?: SyncRef<Element>[];
  }
  | {
    kind: DOMNodeKind.Text;
    node: {
      text: string;
    };
    refs?: SyncRef<Text>[];
  }
  | {
    kind: DOMNodeKind.HTMLNode;
    node: {
      html: string;
    };
    refs?: SyncRef<Node>[];
  }
  | {
    kind: DOMNodeKind.Comment;
    node: string;
    refs?: SyncRef<Comment>[];
  };

export const contextSymbol = Symbol("context");

export type ElementProps = Omit<Record<string, unknown>, "children">;

export type ChildrenProp = Record<"children", JSX.Children>;
