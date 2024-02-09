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
  <Tag extends JSX.Component<any> | JSX.IntrinsicTag>(
    tag: Tag,
    props:
      | (Tag extends JSX.Component<infer O> ? O
        : Tag extends JSX.IntrinsicTag ? JSX.IntrinsicElements[Tag]
        : never)
      | null
      | undefined,
  ): JSX.Element;

  <
    Tag extends
      | JSX.Component<{ children: any }>
      | Exclude<JSX.IntrinsicTag, VoidElement>,
    Props extends Tag extends JSX.Component<infer O> ? O
      : Tag extends JSX.IntrinsicTag ? JSX.IntrinsicElements[Tag]
      : never,
  >(
    tag: Tag,
    props: Omit<Props, "children"> | null | undefined,
    ...children: Props extends { children?: undefined | infer Children }
      ? Children extends readonly unknown[] ? Children : [Children]
      : never
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
