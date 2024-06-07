// deno-lint-ignore-file prefer-const

import {
  defineProperties,
  entries,
  getOwnPropertyDescriptors,
  hyphenize,
  isArray,
  isString,
  keys,
  mapOrDo,
} from "./util.ts";

const $ = Symbol;
const $extends: unique symbol = $() as never;
const $propsStore: unique symbol = $() as never;
const $props: unique symbol = $() as never;
const $internals: unique symbol = $() as never;
const $changedCallbacks: unique symbol = $() as never;
const $disconnectCallbacks: unique symbol = $() as never;
const $setProp: unique symbol = $() as never;

declare global {
  namespace Classic {
    // deno-lint-ignore no-empty-interface
    interface Events {}
  }
}

type ClassOf<T> = { new (): T; readonly prototype: T };

export type CustomElement<T, Props> = ClassOf<T> & {
  readonly [$props]: Props;
  readonly [$extends]: string | undefined;
};

export type TypedShadow<
  Props extends Record<string, PropPrimitive> = Record<never, never>,
  Form extends boolean | undefined = boolean | undefined,
> =
  & ShadowRoot
  & {
    readonly host: {
      readonly [$internals]: Form extends true ? ElementInternals : never;
      readonly [$changedCallbacks]: Array<
        <A extends keyof Props>(attr: A, v: Props[A], prev: Props[A]) => void
      >;
      readonly [$disconnectCallbacks]: Array<() => void>;
    };
  };

export type ElementProps<T> = T extends CustomElement<infer Base, infer Props>
  ? Partial<Props> & { readonly ref?: (el: Base) => void }
  : never;

export type Children = Child | readonly Child[];

export type Child = Element | string | null | undefined;

export const define = <
  N extends `${string}-${string}`,
  E extends CustomElement<HTMLElement, unknown>,
>(
  name: N,
  customElement: E,
): Record<N, ElementProps<E>> =>
  customElements.define(
    name,
    customElement,
    { extends: customElement[$extends] },
  )!;

export const element = <
  PropTypes extends Record<string, PropType>,
  Form extends boolean | undefined,
  Def extends (
    dom: (children: Children) => TypedShadow<PropTypesProps<PropTypes>, Form>,
    props: PropTypesProps<PropTypes>,
    isDeclarative: boolean,
  ) => any,
>(
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
  HTMLElement & (ReturnType<Def> extends void ? unknown : ReturnType<Def>),
  PropTypesProps<PropTypes>
> => {
  type Props = PropTypesProps<PropTypes>;

  let ParentClass =
    (extendsTag
      ? document.createElement(extendsTag).constructor
      : HTMLElement) as typeof HTMLElement;
  let styleSheet: CSSStyleSheet[] | null = null;
  let attrToProp = new Map<string, keyof Props>();
  let listenAttrChanges: 0 | 1 = 1;

  class ElementClass extends ParentClass {
    [$propsStore]: Partial<Props> = {};
    [$props]: Props = new Proxy(propTypes, {
      get: (target, prop: keyof Props & string) =>
        prop in this[$propsStore]
          ? this[$propsStore][prop]
          : this[$propsStore][prop] = nativePropTypes.get(target[prop])!(
            this.getAttribute(hyphenize(prop)),
          ),
    }) as never;
    [$internals] = (form && this.attachInternals()) as Form extends true
      ? ElementInternals
      : never;
    [$changedCallbacks]: Array<
      <A extends keyof Props>(attr: A, v: Props[A], prev: Props[A]) => void
    > = [];
    [$disconnectCallbacks]: Array<() => void> = [];

    static readonly [$extends] = extendsTag;
    static observedAttributes: string[];
    static readonly formAssociated = !!form;

    connectedCallback() {
      let root = this.shadowRoot as TypedShadow<Props, Form> | null;
      let isDeclarative = !!root;
      root ??= this.attachShadow({ mode: "open" }) as TypedShadow<
        Props,
        Form
      >;
      let api = js?.(
        (children: Children) => (renderChildren(root!, children), root!),
        this[$props],
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
      if (listenAttrChanges) {
        let prop = attrToProp.get(name)!;
        this[$setProp](
          prop,
          nativePropTypes.get(propTypes[prop])!(next),
        );
      }
    }

    [$setProp]<K extends keyof Props>(k: K, v: Props[K]) {
      let prev = this[$props][k];
      this[$propsStore][k] = v;
      this[$changedCallbacks].forEach((cb) => cb(k, v, prev));
    }
  }

  let proto = ElementClass.prototype;
  let properties: PropertyDescriptorMap & {
    [p: string]: ThisType<ElementClass>;
  } = {};

  for (let prop of keys(propTypes)) {
    let attr = hyphenize(prop);
    attrToProp.set(attr, prop);
    if (!(prop in proto)) {
      properties[prop] = {
        get() {
          return this[$props][prop];
        },
        set(value) {
          listenAttrChanges = 0;
          if (value == null || value === false) this.removeAttribute(attr);
          else {
            setAttr(this, attr, value);
          }
          listenAttrChanges = 1;
          this[$setProp](prop, value);
        },
      };
    }
  }

  defineProperties(proto, properties);
  ElementClass.observedAttributes = [...attrToProp.keys()];

  return ElementClass as unknown as CustomElement<
    HTMLElement & (ReturnType<Def> extends void ? unknown : ReturnType<Def>),
    PropTypesProps<PropTypes>
  >;
};

export const onChange = <Props extends Record<string, PropPrimitive>>(
  root: TypedShadow<Props>,
  cb: <K extends keyof Props>(prop: K, v: Props[K], prev: Props[K]) => void,
): void => {
  root.host[$changedCallbacks].push(cb);
};

export const onPropChange = <
  Props extends Record<string, PropPrimitive>,
  K extends keyof Props,
>(
  root: TypedShadow<Props>,
  prop: K,
  cb: (v: Props[K], prev: Props[K]) => void,
): void =>
  onChange(
    root,
    (k, v, prev) => k as keyof Props === prop && cb(v as never, prev as never),
  );

export const onDisconnect = (root: TypedShadow, cb: () => void): void => {
  root.host[$disconnectCallbacks].push(cb);
};

export const useInternals = (
  root: TypedShadow<Record<string, PropPrimitive>, true>,
): ElementInternals => root.host[$internals];

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

export const on = <T extends EventTarget, K extends string>(
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
  for (el of document.querySelectorAll(":not(:defined)")) {
    shadowRoot = el.shadowRoot;
    if (shadowRoot) {
      shadowRoot.adoptedStyleSheets = tagStyles[el.tagName] ??= [
        ...(shadowRoot.styleSheets ?? []),
      ].map((s) => buildStyleSheet((s.ownerNode as Element).innerHTML));
    }
  }
};

export const renderChildren = (el: ParentNode, children: Children) => {
  let r = (children: Children): unknown =>
    children &&
    mapOrDo<Child, void>(
      children,
      (c: Child) => c && (isArray(c) ? r(c) : el.append(c)),
    );
  r(children);
};

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
  `${selector}{${
    entries(declaration)
      .map(([property, value]) =>
        typeof value === "object"
          ? toRule(property, value)
          : `${hyphenize(property)}:${value};`
      )
      .join("")
  }}`;
