import {
  CustomElement,
  element as elementDOM,
  hyphenize,
  on,
  PropType,
  PropTypesProps,
  TypedShadow,
} from "../element.ts";
import {
  $type,
  Child,
  IntrinsicElementProps,
  JSX,
  JSXElementType,
} from "./jsx-runtime.ts";

export type ElementProps<T> = T extends CustomElement<infer Base, infer Props>
  ? Partial<Props> & { readonly ref?: (el: Base) => void }
  : never;

export const element = <
  PropTypes extends Record<string, PropType>,
  Form extends boolean | undefined,
  Def extends (
    dom: (
      jsx: JSX.Element,
    ) => TypedShadow<PropTypesProps<PropTypes>, Form>,
    props: PropTypesProps<PropTypes>,
  ) => any,
>(
  opts: {
    props?: PropTypes;
    style?: string | undefined;
    form?: Form;
    extends?: keyof JSX.IntrinsicElements;
  },
  def: Def,
): CustomElement<
  HTMLElement & (ReturnType<Def> extends void ? unknown : ReturnType<Def>),
  PropTypesProps<PropTypes>
> =>
  elementDOM(
    opts,
    (root, props, isDeclarative) =>
      def(
        (jsx) => {
          // TODO Hydrate
          // if (isDeclarative) root.innerHTML = "";

          render(root, jsx);
          return root;
        },
        props,
      ),
  );

export const ref = <T>(initial?: T): { (el: T): T; (): T } => {
  let stored: T = initial!;
  return (el?: T) => el ? stored = el : stored;
};

const propRemap: Record<string, string | undefined> = { class: "className" };

export const render = (
  root: ParentNode,
  element: JSX.Element,
  before: Node | null = null,
): void => {
  let type = (element as JSXElementType)[$type];
  let { children, ...attrs } = element as
    & JSXElementType
    & IntrinsicElementProps<keyof JSX.IntrinsicElements>;

  let el = root;
  let ref: ((v: ParentNode) => void) | null;
  let eventMatch: RegExpMatchArray | null;
  let renderChild;

  if (type !== "") {
    el = document.createElement(type);
    ref = null;
    for (let [k, v] of Object.entries(attrs)) {
      if (v != null) {
        if (k === "ref") {
          ref = v;
        } else if ((eventMatch = k.toLowerCase().match(eventRegExp))) {
          on(el, eventMatch[1], v, !!eventMatch[2]);
        } else if ((k = propRemap[k] ?? k) in el) {
          // @ts-ignore dynamically set
          el[k] = v;
        } else {
          (el as Element).setAttribute(k, hyphenize(v));
        }
      }
    }
    root.insertBefore(el, before);
    ref?.(el);
  }

  if (children) {
    renderChild = (c: Child) =>
      typeof c === "string"
        ? el.append(document.createTextNode(c))
        : c && render(el, c);

    if (Array.isArray(children)) {
      children.forEach(renderChild);
    } else {
      renderChild(children as Child);
    }
  }
};

const eventRegExp = /^on(.+?)(capture)?$/;

// export const hydrate = (root: ParentNode, element: JSXElement) => {
// };
