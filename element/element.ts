// deno-lint-ignore-file prefer-const

import { callOrReturn, on, Signal, signal } from "./signal.ts";
import {
  defineProperties,
  entries,
  fromEntries,
  getOwnPropertyDescriptors,
  hyphenize,
  isString,
  keys,
  mapOrDo,
} from "./util.ts";

export const { document: doc, Symbol: $ } = globalThis;

const $disconnectCallbacks: unique symbol = $() as never;
const $internals: unique symbol = $() as never;
const $props: unique symbol = $() as never;
declare const $tag: unique symbol;

declare global {
  namespace Classic {
    // deno-lint-ignore no-empty-interface
    interface Events {}
  }
}

type ClassOf<T> = { new (): T; readonly prototype: T };

type CustomTag = `${string}-${string}`;

export type CustomElement<Tag extends CustomTag | undefined, T, Props> =
  & ClassOf<T>
  & {
    [$tag]?: Tag;
    readonly [$props]: Props;
  };

export type TypedShadow<
  Form extends boolean | undefined = boolean | undefined,
> =
  & ShadowRoot
  & {
    readonly host: {
      readonly [$internals]: Form extends true ? ElementInternals : never;
      readonly [$disconnectCallbacks]: Array<() => void>;
    };
  };

export type ElementProps<T> = T extends
  CustomElement<CustomTag, infer Base, infer Props>
  ? Partial<Props> & { readonly ref?: (el: Base) => void }
  : never;

export type Children = Child | readonly Child[];

export type Child =
  | Node
  | string
  | number
  | null
  | undefined
  | Signal<Node | string | number | null | undefined>;

type Reactive<Props> = { [K in keyof Props]: Signal<Props[K]> };

type ReactiveReadonly<Props> = { [K in keyof Props]: () => Props[K] };

export const define = <
  N extends CustomTag,
  PropTypes extends Record<string, PropType>,
  Form extends boolean | undefined,
  Def extends (
    dom: (children: Children) => TypedShadow<Form>,
    props: ReactiveReadonly<PropTypesProps<PropTypes>>,
    isDeclarative: boolean,
  ) => any,
>(
  name: N,
  { props: propTypes = {} as PropTypes, extends: extendsTag, form, js, css }: {
    readonly props?: PropTypes;
    readonly extends?: string;
    readonly form?: Form;
    readonly css?:
      | string
      | CSSRules
      | CSSStyleSheet
      | (string | CSSRules | CSSStyleSheet)[];
    readonly js?: Def;
  },
): CustomElement<
  N,
  HTMLElement & (ReturnType<Def> extends void ? unknown : ReturnType<Def>),
  PropTypesProps<PropTypes>
> => {
  type Props = PropTypesProps<PropTypes>;

  if (!doc) {
    // @ts-ignore stub switch for universal compiling
    return;
  }

  let ParentClass =
    (extendsTag
      ? doc.createElement(extendsTag).constructor
      : HTMLElement) as typeof HTMLElement;
  let styleSheet: CSSStyleSheet[] | null = null;
  let attrToProp: Record<string, keyof Props> = {};
  let propToAttr = {} as Record<keyof Props, string>;

  class ElementClass extends ParentClass {
    [$props]: Reactive<Props> = fromEntries(
      entries(propTypes).map(([prop, type]) => {
        let s = signal(() =>
          nativePropTypes.get(type)!(this.getAttribute(hyphenize(prop)))
        );
        on(s, (value) => {
          if (value == null || value === false) {
            this.removeAttribute(propToAttr[prop]);
          } else {
            setAttr(this, propToAttr[prop], value);
          }
        });
        return [prop, s];
      }),
    ) as never;
    [$internals] = (form && this.attachInternals()) as Form extends true
      ? ElementInternals
      : never;
    [$disconnectCallbacks]: Array<() => void> = [];

    static observedAttributes: string[];
    static readonly formAssociated = !!form;

    connectedCallback() {
      let root = this.shadowRoot as TypedShadow<Form> | null;
      let isDeclarative = !!root;
      root ??= this.attachShadow({ mode: "open" }) as TypedShadow<Form>;
      let api = js?.(
        (children: Children) => (renderChildren(root!, children), root!),
        new Proxy(this[$props], readonlyPropsHandler) as ReactiveReadonly<
          Props
        >,
        isDeclarative,
      );

      if (api) {
        defineProperties(this, getOwnPropertyDescriptors(api));
      }

      if (css) {
        root.adoptedStyleSheets = styleSheet ??= mapOrDo(
          css,
          buildStyleSheet,
        );
      }
    }

    disconnectedCallback() {
      this[$disconnectCallbacks].forEach((cb) => cb());
    }

    attributeChangedCallback(
      name: string,
      _prev: string | null,
      next: string | null,
    ) {
      let prop = attrToProp[name];
      this[$props][prop](nativePropTypes.get(propTypes[prop])!(next));
    }
  }

  let proto = ElementClass.prototype;
  let properties: PropertyDescriptorMap & {
    [p: string]: ThisType<ElementClass>;
  } = {};

  for (let prop of keys(propTypes)) {
    let attr = hyphenize(prop);
    attrToProp[attr] = prop;
    propToAttr[prop as keyof Props] = attr;
    if (!(prop in proto)) {
      properties[prop] = {
        get() {
          return this[$props][prop]();
        },
        set(value) {
          this[$props][prop](value);
        },
      };
    }
  }

  defineProperties(proto, properties);
  ElementClass.observedAttributes = keys(attrToProp);

  customElements.define(name, ElementClass, { extends: extendsTag });

  return ElementClass as unknown as CustomElement<
    undefined,
    HTMLElement & (ReturnType<Def> extends void ? unknown : ReturnType<Def>),
    PropTypesProps<PropTypes>
  >;
};

export const onDisconnect = (root: TypedShadow, cb: () => void): void => {
  root.host[$disconnectCallbacks].push(cb);
};

export const useInternals = (root: TypedShadow<true>): ElementInternals =>
  root.host[$internals];

export type PropTypesProps<PropTypes extends Record<string, PropType>> = {
  [K in keyof PropTypes]: PropTypePrimitive<PropTypes[K]>;
};

export type PropPrimitive =
  | boolean
  | number
  | bigint
  | string
  | Date
  | undefined;

type PropTypePrimitive<T extends PropType> = T extends typeof Boolean ? boolean
  : T extends typeof Number ? number | undefined
  : T extends typeof BigInt ? bigint | undefined
  : T extends typeof String ? string | undefined
  : T extends typeof Date ? Date | undefined
  : never;

export type PropType =
  | typeof Boolean
  | typeof Number
  | typeof BigInt
  | typeof String
  | typeof Date;

const nativePropTypes = new Map<PropType, (attr: string | null) => any>([
  [Boolean, (attr: string | null) => attr != null],
  ...[Number, BigInt, String, Date].map((decode: PropType) =>
    [decode, (v: string | null) => v == null ? undefined : decode(v)] as const
  ),
]);

const readonlyPropsHandler: ProxyHandler<Record<string, () => unknown>> = {
  get: (target, p) => () => target[p as string](),
};

export const customEvent: {
  <T extends keyof Classic.Events>(
    type: Classic.Events[T] extends void | undefined ? T : never,
    detail?: Classic.Events[T],
  ): CustomEvent<Classic.Events[T]>;
  <T extends keyof Classic.Events>(
    type: T,
    detail: Classic.Events[T],
  ): CustomEvent<Classic.Events[T]>;
} = <T extends keyof Classic.Events>(
  type: T,
  detail: Classic.Events[T],
): CustomEvent<Classic.Events[T]> => new CustomEvent(type, { detail });

export const listen = <T extends EventTarget, K extends string>(
  target: T,
  event: K,
  cb: (
    this: T,
    e: T extends Window
      ? K extends keyof WindowEventMap ? WindowEventMap[K] : Event
      : K extends keyof HTMLElementEventMap ? HTMLElementEventMap[K]
      : K extends keyof Classic.Events ? CustomEvent<Classic.Events[K]>
      : Event,
  ) => void,
  options?: boolean | AddEventListenerOptions | undefined,
): void => target.addEventListener(event, cb as EventListener, options);

export const declarativeFirstStyle = (): void => {
  let tagStyles: Record<string, CSSStyleSheet[] | undefined> = {},
    el,
    shadowRoot;
  for (el of doc.querySelectorAll(":not(:defined)")) {
    shadowRoot = el.shadowRoot;
    if (shadowRoot) {
      shadowRoot.adoptedStyleSheets = tagStyles[el.tagName] ??= [
        ...(shadowRoot.styleSheets ?? []),
      ].map((s) => buildStyleSheet((s.ownerNode as Element).innerHTML));
    }
  }
};

export const renderChildren = (el: ParentNode, children: Children) =>
  el.replaceChildren(
    ...mapOrDo(
      callOrReturn(children),
      (c) => {
        let node: Node;
        on(
          () => {
            node = (callOrReturn(c) ?? "") as Node;
            return node = node instanceof Node
              ? node
              : document.createTextNode(node as string);
          },
          (current, prev) => el.replaceChild(current, prev),
        );
        return node!;
      },
    ),
  );

export const setAttr = (el: Element, k: string, v: PropPrimitive) =>
  (el as Element).setAttribute(
    k,
    v instanceof Date ? v.toISOString() : String(v),
  );

export const css = (tpl: TemplateStringsArray): string => tpl[0];

export type CSSRules = Record<string, CSSDeclaration | string>;

type CSSDeclaration = { [k: string]: string | number | CSSDeclaration };

const buildStyleSheet = (
  rules: string | CSSRules | CSSStyleSheet,
): CSSStyleSheet => {
  if (rules instanceof CSSStyleSheet) return rules;

  let styleSheet = new CSSStyleSheet();
  if (isString(rules)) {
    styleSheet.replace(rules);
  } else {
    entries(rules).forEach(([selector, declaration], i) =>
      styleSheet.insertRule(
        isString(declaration)
          ? selector + declaration
          : toRule(selector, declaration),
        i,
      )
    );
  }
  return styleSheet;
};

const toRule = (selector: string, declaration: CSSDeclaration): string =>
  `${selector || ":host"}{${
    entries(declaration)
      .map(([property, value]) =>
        typeof value === "object"
          ? toRule(property, value)
          : `${hyphenize(property)}:${value};`
      )
      .join("")
  }}`;
