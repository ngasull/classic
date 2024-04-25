import type { Activation } from "../dom.ts";
import { voidElements } from "../dom/void.ts";
import { client, indexedUris } from "../js.ts";
import { js, jsResources, mkRef, toJS, unsafe } from "../js.ts";
import type { BundleResult } from "../js/bundle.ts";
import { Fn, isJSable, JS, JSable } from "../js/types.ts";
import {
  contextSymbol,
  DOMLiteral,
  DOMNode,
  DOMNodeKind,
  ElementKind,
  JSXComponentAPI,
  JSXContext,
  JSXContextAPI,
  JSXContextOf,
  JSXElement,
  JSXInitContext,
  JSXRef,
} from "./types.ts";

const id = <T>(v: T) => v;

const eventPropRegExp = /^on([A-Z]\w+)$/;

// Only escape when necessary ; avoids inline JS like "a && b" to become "a &amp;&amp; b"
const escapesRegex = /&(#\d{2,4}|[A-z][A-z\d]+);/g;
const escapeEscapes = (value: string) =>
  value.replaceAll(escapesRegex, (_, code) => `&amp;${code};`);

const escapeTag = (tag: string) => tag.replaceAll(/[<>"'&]/g, "");

const zeroWidthSpaceHTML = "&#8203;";

const escapeTextNode = (text: string) =>
  escapeEscapes(text).replaceAll("<", "&lt;") || zeroWidthSpaceHTML; // Empty would not be parsed as a text node

const commentEscapeRegExp = /--(#|>)/g;

const escapeComment = (comment: string) =>
  comment.replaceAll(commentEscapeRegExp, "--#$1");

export const escapeScriptContent = (node: DOMLiteral) =>
  String(node).replaceAll("</script", "</scr\\ipt");

export const renderToString = async (
  root: JSXElement,
  { context }: { context?: JSXInitContext<unknown>[] } = {},
) => {
  const acc: string[] = [];
  const ctxData = subContext(undefined, context);
  ctxData.set(effectContext[contextSymbol], []);

  const bundle = mkContext(ctxData).get(bundleContext);
  const tree = await nodeToDOMTree(root, ctxData);
  const effects = ctxData.get(
    effectContext[contextSymbol],
  ) as InferContext<typeof effectContext>;

  await writeDOMTree(
    tree,
    (chunk) => acc.push(chunk),
    bundle
      ? (async (partial) => {
        try {
          return writeActivationScript(
            (chunk) => acc.push(chunk),
            tree,
            effects,
            {
              bundle,
              partial,
            },
          );
        } catch (e) {
          console.log(e);
        }
      })
      : null,
  );
  return acc.join("");
};

export const renderToStream = (
  root: JSXElement,
  { context }: { context?: JSXInitContext<unknown>[] },
) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      const write = (chunk: string) =>
        controller.enqueue(encoder.encode(chunk));

      const ctxData = subContext(undefined, context);
      ctxData.set(effectContext[contextSymbol], []);

      const bundle = mkContext(ctxData).get(bundleContext);

      (async () => {
        const tree = await nodeToDOMTree(root, ctxData);
        const effects = ctxData.get(
          effectContext[contextSymbol],
        ) as InferContext<typeof effectContext>;

        await writeDOMTree(
          tree,
          write,
          bundle
            ? (async (partial) => {
              try {
                return writeActivationScript(write, tree, effects, {
                  bundle,
                  partial,
                });
              } catch (e) {
                console.log(e);
              }
            })
            : null,
        );

        controller.close();
      })();
    },
  });

type ContextData = Map<symbol, unknown>;

export type InferContext<C extends JSXContext<any>> = C extends
  JSXContext<infer T> ? T : never;

export const createContext = <T>(name?: string): JSXContext<T> => {
  const context = (value: T) => [context[contextSymbol], value] as const;
  context[contextSymbol] = Symbol(name);
  return context;
};

const subContext = (
  parent?: ContextData,
  added: JSXInitContext<unknown>[] = [],
): ContextData => {
  const sub = new Map(parent);
  for (const [k, v] of added) {
    sub.set(k, v);
  }
  return sub;
};

const mkContext = (data: ContextData): JSXContextAPI => {
  const ctx = <T>(context: JSXContext<T>) => {
    if (!data.has(context[contextSymbol])) {
      throw new Error(`Looking up unset context`);
    }
    return data.get(context[contextSymbol]) as T;
  };

  ctx.get = <T>(context: JSXContext<T>) =>
    data.get(context[contextSymbol]) as T;

  ctx.set = <T>(context: JSXContext<T>, value: T) => {
    data.set(context[contextSymbol], value);
    return ctx;
  };

  ctx.delete = (context: JSXContext<never>) => {
    data.delete(context[contextSymbol]);
    return ctx;
  };

  return ctx;
};

const effectContext = createContext<Fn<[], void | (() => void)>[]>("effect");

export const bundleContext = createContext<{
  readonly result: BundleResult;
  readonly watched?: boolean;
}>("bundle");

const writeActivationScript = async (
  write: (chunk: string) => void,
  children: DOMNode[],
  effects: ReadonlyArray<Fn<[], void | (() => void)>>,
  { bundle, partial = false }: {
    bundle: JSXContextOf<typeof bundleContext>;
    partial?: boolean;
  },
): Promise<void> => {
  if (effects.length) {
    const refs: JSable<EventTarget>[] = [];
    const activation = domActivation(children, (expr: JSable<EventTarget>) => {
      refs.push(expr);
      return true;
    });

    const [activationScript] = await toJS(
      () => effects.map((effect) => js.fn(effect)()),
      {
        isServer: false,
        activation: [
          partial
            ? js<[Node]>`[document.currentScript.previousSibling]`
            : js<NodeList>`document.childNodes`,
          activation,
          refs,
        ],
        resolve: (url) => {
          const publicPath = bundle.result.publicPath(url);
          if (!publicPath) {
            throw Error(`Module expected to be bundled: ${url}`);
          }
          return publicPath;
        },
      },
    );

    write(`<script type="module">`);
    write(escapeScriptContent(activationScript));

    if (bundle.watched && !partial) {
      write(
        `;new EventSource("/hmr").addEventListener("change",()=>location.reload())`,
      );
    }

    if (partial) {
      write(`;document.currentScript.remove()`);
    }

    write("</script>");
  }
};

const domActivation = (
  dom: readonly DOMNode[],
  walkRef: (expr: JSable<EventTarget>) => boolean,
  parent: readonly number[] = [],
) => {
  const activation: Activation = [];

  for (let i = 0; i < dom.length; i++) {
    const { kind, node, ref } = dom[i];

    if (walkRef(ref)) activation.push([i]);

    if (kind === DOMNodeKind.Tag) {
      const childrenActivation = domActivation(
        node.children,
        walkRef,
        [...parent, i],
      );
      if (childrenActivation.length > 0) {
        activation.push([i, childrenActivation]);
      }
    }
  }

  return activation;
};

const writeDOMTree = async (
  tree: readonly DOMNode[],
  write: (chunk: string) => void,
  writeRootActivation: ((partial?: boolean) => Promise<void>) | null,
  root = true,
) => {
  const partialRoot = root && (tree.length !== 1 ||
    tree[0].kind !== DOMNodeKind.Tag || tree[0].node.tag !== "html");

  for (const { kind, node } of tree) {
    switch (kind) {
      case DOMNodeKind.Comment: {
        if (node) {
          write(`<!--`);
          write(escapeComment(node));
          write(`-->`);
        } else {
          write(`<!>`);
        }
        break;
      }

      case DOMNodeKind.Tag: {
        if (partialRoot && node.tag !== "script") {
          write("<html><body>");
        }

        write("<");
        write(escapeTag(node.tag));

        for (const [name, value] of node.attributes) {
          if (value === false) continue;
          const valueStr = value === true ? "" : String(value);

          write(" ");
          write(escapeTag(name));
          write("=");
          const escapedValue = escapeEscapes(valueStr).replaceAll("'", "&#39;");
          if (!escapedValue || /[\s>"]/.test(escapedValue)) {
            write("'");
            write(escapedValue);
            write("'");
          } else {
            write(escapedValue);
          }
        }

        write(">");

        if (!(node.tag in voidElements)) {
          if (node.tag === "script") {
            for (const c of node.children) {
              if (c.kind === DOMNodeKind.Text) {
                write(escapeScriptContent(c.node.text));
              } else {
                console.warn(`<script> received non-text child: ${c}`);
              }
            }
          } else {
            await writeDOMTree(
              node.children,
              write,
              writeRootActivation,
              false,
            );

            if (!partialRoot && node.tag === "head") {
              await writeRootActivation?.();
            }
          }

          write("</");
          write(node.tag);
          write(">");
        }

        if (partialRoot && node.tag !== "script") {
          await writeRootActivation?.(true);
          write("</body></html>");
        }
        break;
      }

      case DOMNodeKind.Text: {
        write(escapeTextNode(node.text));
        break;
      }

      case DOMNodeKind.HTMLNode: {
        write(node.html);
        break;
      }
    }
  }
};

const nodeToDOMTree = async (
  node: JSXElement,
  ctxData: ContextData,
): Promise<DOMNode[]> => {
  const effects = ctxData.get(
    effectContext[contextSymbol],
  ) as InferContext<typeof effectContext>;

  switch (node.kind) {
    case ElementKind.Fragment: {
      return [
        { kind: DOMNodeKind.Comment, node: "", ref: node.ref },
        ...(await Promise
          .all(node.element.map((e) => nodeToDOMTree(e, ctxData)))
          .then((children) => children.flatMap(id))),
      ];
    }

    case ElementKind.Component: {
      const { Component, props } = node.element;
      const subCtxData = subContext(ctxData);
      const ctx = mkContext(subCtxData);
      const apiTarget: Partial<JSXComponentAPI> = { context: ctx };
      const api = new Proxy<JSXComponentAPI>(
        apiTarget as JSXComponentAPI,
        componentApiHandler,
      );
      const child = await Component(props, api);
      if (child) {
        apiTarget.target = child.ref;
        return nodeToDOMTree(child, subCtxData);
      } else {
        return [];
      }
    }

    case ElementKind.Comment: {
      return [{
        kind: DOMNodeKind.Comment,
        node: node.element,
        ref: node.ref,
      }];
    }

    case ElementKind.Intrinsic: {
      const { tag, props: { ref, ...props } } = node.element;

      const attributes = new Map<string, string | number | boolean>();
      const reactiveAttributes: [
        string,
        JSable<string | number | boolean | null>,
      ][] = [];

      if (ref) (ref as unknown as JSXRef<Element>)(node.ref);

      const propEntries = Object.entries(props);
      let entry;
      while ((entry = propEntries.shift())) {
        const [name, value] = entry;
        await (async function recordAttr(
          name: string,
          value:
            | string
            | number
            | boolean
            | null
            | undefined
            | JSable<string | number | boolean | null>,
        ) {
          if (value != null) {
            const eventMatch = name.match(eventPropRegExp);
            if (eventMatch) {
              const eventType = eventMatch[1].toLowerCase();
              effects.push(() => [
                js`let c=${value}`,
                node.ref.addEventListener(eventType, unsafe("c")),
                js`return ${
                  node.ref.removeEventListener(eventType, unsafe("c"))
                }`,
              ]);
            } else if (isJSable<string | number | boolean | null>(value)) {
              await recordAttr(name, await js.eval(value));
              reactiveAttributes.push([name, value]);
            } else {
              attributes.set(name, value);
            }
          }
        })(name, value);
      }

      effects.push(
        ...reactiveAttributes.flatMap(([name, expr]) => {
          const uris = jsResources(expr);
          return uris.length
            ? () =>
              client.sub(
                node.ref,
                js`let k=${name},v=${expr};!v&&v!==""?${node.ref}.removeAttribute(k):${node.ref}.setAttribute(k,v===true?"":String(v))`,
                indexedUris(uris),
              )
            : [];
        }),
      );

      const children = await Promise
        .all(
          node.element.children.map((child) => nodeToDOMTree(child, ctxData)),
        )
        .then((children) => children.flatMap(id));

      // Make sure we have no adjacent text nodes (would be parsed as only one)
      for (let i = children.length - 1; i > 0; i--) {
        if (
          children[i].kind === DOMNodeKind.Text &&
          children[i - 1].kind === DOMNodeKind.Text
        ) {
          children.splice(i, 0, {
            kind: DOMNodeKind.Comment,
            node: "",
            ref: mkRef(),
          });
        }
      }

      return [{
        kind: DOMNodeKind.Tag,
        node: { tag, attributes, children },
        ref: node.ref,
      }];
    }

    case ElementKind.JS: {
      const uris = jsResources(node.element);
      if (uris.length) {
        effects.push(() =>
          subText(
            node.ref,
            () => node.element,
            // js.comma(js.reassign(node.element, node.element), node.element),
            indexedUris(uris),
          )
        );
      }
      return [{
        kind: DOMNodeKind.Text,
        node: { text: String(await js.eval(node.element) ?? "") },
        ref: node.ref,
      }];
    }

    case ElementKind.Text: {
      return [{
        kind: DOMNodeKind.Text,
        node: { text: String(node.element.text) },
        ref: node.ref,
      }];
    }

    case ElementKind.HTMLNode: {
      return [{
        kind: DOMNodeKind.HTMLNode,
        node: { html: node.element.html },
        ref: node.ref,
      }];
    }
  }

  throw Error(`Can't handle JSX node ${JSON.stringify(node)}`);
};

const subText = js.fn((
  node: JS<Text>,
  value: JS<() => DOMLiteral>,
  uris: JS<readonly string[]>,
) =>
  js<
    () => void
  >`${client.sub}(${node},_=>${node}.textContent=${value}(),${uris})`
);

const componentApiHandler = {
  get: (target: any, k) =>
    target[k] ??= lazyComponentApi[k as keyof typeof lazyComponentApi]?.(
      target,
    ),
} satisfies ProxyHandler<JSXComponentAPI>;

const lazyComponentApi = {
  effect: (target: JSXComponentAPI) =>
  (
    cb: Fn<[], void | (() => void)>,
    uris?:
      | readonly string[]
      | JSable<readonly string[]>
      | readonly JSable<string>[],
  ) => {
    componentApiHandler.get(target, "context");
    target.context(effectContext).push(() => {
      const effectJs = js.fn(cb);
      return client.sub(
        target.target,
        effectJs,
        uris ? indexedUris(uris) : [],
      );
    });
  },
};
