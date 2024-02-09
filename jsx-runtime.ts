import { VoidElement } from "./dom/void.ts";
import { isEvaluable } from "./js/types.ts";
import { ChildrenProp, ElementKind, ElementProps } from "./jsx/types.ts";

const jsx = ((
  tag: JSX.IntrinsicTag | JSX.Component<any>,
  props: (ElementProps & Partial<ChildrenProp>) | null | undefined,
  ...children: JSX.Children[]
): JSX.Element => {
  props ??= {};
  children = flatten(children.length ? children : props.children ?? []);
  delete props.children;
  return typeof tag === "string"
    ? {
      kind: ElementKind.Intrinsic,
      element: {
        tag,
        props: props as JSX.IntrinsicElement["props"],
        children: children as JSX.Fragment,
      } satisfies JSX.IntrinsicElement,
    }
    : {
      kind: ElementKind.Component,
      element: {
        Component: tag,
        props: ((props.children = children), props),
      },
    };
}) as {
  <Tag extends Exclude<JSX.IntrinsicTag, VoidElement>>(
    tag: Tag,
    props: JSX.IntrinsicElements[Tag] | null | undefined,
    ...children: JSX.Children[]
  ): JSX.Element;

  <Tag extends VoidElement>(
    tag: Tag,
    props: JSX.IntrinsicElements[Tag] | null | undefined,
  ): JSX.Element;

  <
    Cpt extends JSX.Component<any>,
    Props extends Cpt extends JSX.Component<infer O> ? O
      : Cpt extends JSX.IntrinsicTag ? JSX.IntrinsicElements[Cpt]
      : never,
  >(
    tag: Cpt,
    props:
      | Omit<Props, "children"> & Partial<Pick<Props, "children">>
      | null
      | undefined,
    ...children: JSX.Children[]
  ): JSX.Element;
};

const Fragment = ({ children }: { children: JSX.Children }): JSX.Fragment =>
  flatten(children);

const flatten = (children: JSX.Children): JSX.Fragment => {
  if (!Array.isArray(children)) children = [children];

  const fragment: JSX.Fragment = [];
  for (const child of children) {
    if (Array.isArray(child)) {
      fragment.push(...flatten(child));
    } else if (child != null) {
      fragment.push(
        isEvaluable<JSX.DOMLiteral>(child)
          ? { kind: ElementKind.JS, element: child }
          : typeof child === "object"
          ? (child as JSX.Element)
          : {
            kind: ElementKind.Text,
            element: { text: child as string | number },
          },
      );
    }
  }

  return fragment;
};

export { Fragment, jsx, jsx as jsxDev, jsx as jsxs };
