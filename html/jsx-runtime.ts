import { isJSable } from "@classic/js";
import { mkRef } from "./ref.ts";
import type {
  DOMLiteral,
  IntrinsicElementProps,
  JSX,
  JSXElement,
} from "./types.ts";
import { ElementKind } from "./types.ts";
import type { VoidElement } from "./void.ts";

export type { JSX };

const jsx = ((
  tag: keyof JSX.IntrinsicElements | JSX.FC<Record<string, unknown>>,
  props?: Record<string, unknown> | null | undefined,
  ...children: JSX.Children[]
): JSXElement => {
  props ??= {};
  children = flatten(
    children.length
      ? children
      : props.children as JSX.Children | null | undefined ?? [],
  );
  delete props.children;
  return typeof tag === "string"
    ? {
      kind: ElementKind.Intrinsic,
      tag,
      props: props as IntrinsicElementProps,
      children: children as JSXElement[],
      ref: mkRef<Element>(),
    }
    : {
      kind: ElementKind.Component,
      Component: tag,
      props: ((props.children = children), props),
      ref: mkRef(),
    };
}) as {
  <Tag extends Exclude<keyof JSX.IntrinsicElements, VoidElement>>(
    tag: Tag,
    props?: JSX.IntrinsicElements[Tag] | null | undefined,
    ...children: JSX.Children[]
  ): JSXElement;

  <Tag extends VoidElement>(
    tag: Tag,
    props?: JSX.IntrinsicElements[Tag] | null | undefined,
  ): JSXElement;

  <Cpt extends JSX.FC<any>, Props extends ComponentProps<Cpt>>(
    component: Cpt,
    props?: NullableProps<
      Omit<Props, "children"> & Partial<Pick<Props, "children">>
    >,
    ...children: Props extends { readonly children: infer T }
      ? T extends readonly unknown[] ? T : [T]
      : Props extends { readonly children?: infer T }
        ? T extends readonly unknown[] ? T | [] : [T] | []
      : JSX.Children[]
  ): JSXElement;

  <Cpt extends JSX.FC<any>>(
    component: Cpt,
    props?: NullableProps<ComponentProps<Cpt>>,
  ): JSXElement;
};

type ComponentProps<Cpt extends JSX.FC<Record<any, any>>> = Cpt extends
  JSX.FC<infer O> ? O : never;

type NullableProps<Props> =
  | Props
  | ({} extends
    { readonly [K in keyof Props as Props[K] extends undefined ? never : K]: 1 }
    ? null | undefined
    : never);

const Fragment = (
  { children }: { children?: JSX.Children } = {},
): JSXElement => ({
  kind: ElementKind.Fragment,
  children: flatten(children),
  ref: mkRef(),
});

const flatten = (children: JSX.Children): JSXElement[] => {
  if (!Array.isArray(children)) children = [children];

  const fragment: JSXElement[] = [];
  for (const child of children) {
    if (Array.isArray(child)) {
      fragment.push(...flatten(child));
    } else if (child != null) {
      fragment.push(
        isJSable<DOMLiteral>(child)
          ? { kind: ElementKind.JS, js: child, ref: mkRef() }
          : typeof child === "object"
          ? child instanceof ReadableStream
            ? {
              kind: ElementKind.HTMLNode,
              html: child,
              ref: mkRef(),
            }
            : child instanceof Uint8Array
            ? {
              kind: ElementKind.HTMLNode,
              html: new ReadableStream<Uint8Array>({
                start(controller) {
                  controller.enqueue(child);
                  controller.close();
                },
              }),
              ref: mkRef(),
            }
            : (child as JSXElement)
          : {
            kind: ElementKind.Text,
            text: child as string | number,
            ref: mkRef(),
          },
      );
    }
  }

  return fragment;
};

export { Fragment, jsx, jsx as jsxDev, jsx as jsxs };
