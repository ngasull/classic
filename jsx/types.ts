/// <reference path="./dom.types.ts" />

import type { LifecycleFunctions } from "../dom.ts";
import type { JS, JSable, JSONable } from "../js/types.ts";
import { jsSymbol } from "../js/types.ts";

declare global {
  namespace JSX {
    type IntrinsicTag = Exclude<keyof IntrinsicElements, number>;

    type IntrinsicElements = {
      [K in keyof DOMElements]: {
        [P in keyof DOMElements[K]]?:
          | DOMElements[K][P]
          | JSable<DOMElements[K][P]>;
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
      | Array<Children>;

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
      O extends Record<string, unknown> = Record<string, unknown>,
    > {
      Component: Component<O>;
      props: O;
    }

    type Component<
      O extends ElementProps = ElementProps & Partial<ChildrenProp>,
    > = GenericComponent<O>;

    type ParentComponent<O extends ElementProps = ElementProps> =
      GenericComponent<O & ChildrenProp>;

    type GenericComponent<O extends ElementProps> = (
      props: O,
      ctx: ContextAPI,
    ) => Element;

    type Context<T> = Record<typeof contextSymbol, symbol> & Record<symbol, T>;

    type ContextAPI = {
      get<T>(context: Context<T>): T;
      getOrNull<T>(context: Context<T>): T | null;
      has<T>(context: Context<T>): boolean;
      set<T>(context: Context<T>, value: T): ContextAPI;
      delete<T>(context: Context<T>): ContextAPI;
    };

    type DOMLiteral = string | number;

    type Ref<N> = (
      ref: JS<N>,
      lifecycle: JS<LifecycleFunctions>,
    ) => JS<any>;
  }
}

export type SyncRef<N> = {
  fn: JS<(ref: N, lifecycle: LifecycleFunctions) => void> & {
    [jsSymbol]: { body: JS<unknown> };
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

export type ElementProps = { [k: Exclude<string, "children">]: unknown };

export type ChildrenProp = Record<"children", JSX.Children>;
