import { isEvaluable } from "./js/types.ts";
import { ChildrenProp, ElementKind, ElementProps } from "./jsx/types.ts";

const jsx = ((
  tag: JSX.IntrinsicTag | JSX.GenericComponent<ElementProps>,
  props: (ElementProps & Partial<ChildrenProp>) | null,
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
  <Tag extends JSX.IntrinsicTag>(
    tag: Tag,
    props: JSX.IntrinsicElements[Tag],
  ): JSX.Element;

  <Tag extends JSX.IntrinsicTag>(
    tag: Tag,
    props: JSX.IntrinsicElements[Tag],
    ...children: JSX.Children[]
  ): JSX.Element;

  <O extends ElementProps>(
    tag: JSX.Component<O>,
    props: O & Partial<ChildrenProp>,
  ): JSX.Element;

  <O extends ElementProps>(
    tag: JSX.Component<O>,
    props: O | null | undefined,
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
