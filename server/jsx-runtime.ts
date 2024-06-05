import { mkRef } from "classic/js";
import { isJSable } from "../js/types.ts";
import {
  DOMLiteral,
  ElementKind,
  IntrinsicElement,
  JSX,
  JSXChildren,
  JSXComponent,
  JSXElement,
} from "./types.ts";
import { VoidElement } from "./void.ts";

export type { JSX };

const jsx = ((
  tag: keyof JSX.IntrinsicElements | JSXComponent<Record<string, unknown>>,
  props: Record<string, unknown> | null | undefined,
  ...children: JSXChildren[]
): JSX.Element => {
  props ??= {};
  children = flatten(
    children.length
      ? children
      : props.children as JSXChildren | null | undefined ?? [],
  );
  delete props.children;
  return typeof tag === "string"
    ? {
      kind: ElementKind.Intrinsic,
      element: {
        tag,
        props: props as IntrinsicElement["props"],
        children: children as JSXElement[],
      } satisfies IntrinsicElement,
      ref: mkRef<Element>(),
    }
    : {
      kind: ElementKind.Component,
      element: {
        Component: tag,
        props: ((props.children = children), props),
      },
      ref: mkRef(),
    };
}) as {
  <Tag extends Exclude<keyof JSX.IntrinsicElements, VoidElement>>(
    tag: Tag,
    props: JSX.IntrinsicElements[Tag] | null | undefined,
    ...children: JSXChildren[]
  ): JSXElement;

  <Tag extends VoidElement>(
    tag: Tag,
    props: JSX.IntrinsicElements[Tag] | null | undefined,
  ): JSXElement;

  <
    Cpt extends JSXComponent<Record<any, any>>,
    Props extends ComponentProps<Cpt>,
  >(
    component: Cpt,
    props: NullableProps<
      Omit<Props, "children"> & Partial<Pick<Props, "children">>
    >,
    ...children: Props extends { readonly children: infer T }
      ? T extends readonly unknown[] ? T : [T]
      : Props extends { readonly children?: infer T }
        ? T extends readonly unknown[] ? T | [] : [T] | []
      : JSXChildren[]
  ): JSX.Element;

  <Cpt extends JSXComponent<Record<any, any>>>(
    component: Cpt,
    props: NullableProps<ComponentProps<Cpt>>,
  ): JSXElement;
};

type ComponentProps<Cpt extends JSXComponent<Record<any, any>>> = Cpt extends
  JSXComponent<infer O> ? O : never;

type NullableProps<Props> =
  | Props
  | ({} extends
    { readonly [K in keyof Props as Props[K] extends undefined ? never : K]: 1 }
    ? null | undefined
    : never);

const Fragment = ({ children }: { children: JSXChildren }): JSXElement => ({
  kind: ElementKind.Fragment,
  element: flatten(children),
  ref: mkRef(),
});

const flatten = (children: JSXChildren): JSX.Element[] => {
  if (!Array.isArray(children)) children = [children];

  const fragment: JSX.Element[] = [];
  for (const child of children) {
    if (Array.isArray(child)) {
      fragment.push(...flatten(child));
    } else if (child != null) {
      fragment.push(
        isJSable<DOMLiteral>(child)
          ? { kind: ElementKind.JS, element: child, ref: mkRef() }
          : typeof child === "object"
          ? (child as JSX.Element)
          : {
            kind: ElementKind.Text,
            element: { text: child as string | number },
            ref: mkRef(),
          },
      );
    }
  }

  return fragment;
};

export { Fragment, jsx, jsx as jsxDev, jsx as jsxs };
