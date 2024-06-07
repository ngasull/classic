import type { Activation } from "../dom.ts";
import { hyphenize } from "../element/util.ts";
import type { BundleResult } from "../js/bundle.ts";
import {
  client,
  indexedUris,
  inline,
  js,
  jsResources,
  mkRef,
  toJS,
  unsafe,
} from "../js/js.ts";
import { Fn, isJSable, JS, JSable } from "../js/types.ts";
import {
  contextSymbol,
  DOMLiteral,
  DOMNode,
  DOMNodeKind,
  ElementKind,
  JSXContext,
  JSXContextAPI,
  JSXContextOf,
  JSXElement,
  JSXInitContext,
  JSXRef,
} from "./types.ts";
import { voidElements } from "./void.ts";

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
  root: JSXElement | PromiseLike<JSXElement>,
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
    async (partial) => {
      try {
        return await writeActivationScript(
          (chunk) => acc.push(chunk),
          tree,
          effects,
          { bundle, partial },
        );
      } catch (e) {
        console.log(e);
      }
    },
  );
  return acc.join("");
};

export const renderToStream = (
  root: JSXElement | PromiseLike<JSXElement>,
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
          async (partial) => {
            try {
              return await writeActivationScript(write, tree, effects, {
                bundle,
                partial,
              });
            } catch (e) {
              console.log(e);
            }
          },
        );

        controller.close();
      })();
    },
  });

type ContextData = Map<symbol, unknown>;

export type InferContext<C> = C extends JSXContext<infer T> ? T : never;

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

const targetContext = createContext<JSable<EventTarget>>("target");
const effectContext = createContext<JSable<void>[]>("effect");

export const bundleContext = createContext<{
  readonly result: BundleResult;
  readonly watched?: boolean;
}>("bundle");

const writeActivationScript = async (
  write: (chunk: string) => void,
  children: DOMNode[],
  effects: ReadonlyArray<JSable<void>>,
  { bundle, partial = false }: {
    bundle?: JSXContextOf<typeof bundleContext> | null;
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
      () => effects,
      {
        isServer: false,
        activation: [
          partial
            ? js<[Node]>`[_$.previousSibling]`
            : js<NodeList>`document.childNodes`,
          activation,
          refs,
        ],
        resolve: (url) => {
          if (!bundle) {
            throw Error(
              `Can't resolve external module without bundling (resolving ${url})`,
            );
          }
          const publicPath = bundle.result.publicPath(url);
          if (!publicPath) {
            throw Error(`Module expected to be bundled: ${url}`);
          }
          return publicPath;
        },
      },
    );

    if (partial) {
      write(`<script>{let _$=document.currentScript;(async()=>{`);
    } else {
      write(`<script type="module">`);
    }

    write(escapeScriptContent(activationScript));

    if (bundle?.watched && !partial) {
      write(
        `;new EventSource("/hmr").addEventListener("change",()=>location.reload())`,
      );
    }

    if (partial) {
      write(`});_$.remove()}`);
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

        if (!voidElements.has(node.tag)) {
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
  nodeLike: JSXElement | PromiseLike<JSXElement>,
  ctxData: ContextData,
): Promise<DOMNode[]> => {
  const node = "then" in nodeLike ? await nodeLike : nodeLike;

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
      const child = await Component(props, ctx);
      if (child) {
        ctx.set(targetContext, child.ref);
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

      if (ref) {
        const refHook = (ref as unknown as JSXRef<Element>)(node.ref);
        if (refHook !== node.ref && isJSable<void>(refHook)) {
          effects.unshift(refHook);
        }
      }

      const propEntries = Object.entries(props);
      let entry;
      while ((entry = propEntries.shift())) {
        const [prop, value] = entry;
        const name = hyphenize(prop);
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
            const eventMatch = prop.match(eventPropRegExp);
            if (eventMatch) {
              effects.push(
                onEvent(node.ref, eventMatch[1].toLowerCase(), value),
              );
            } else if (isJSable<string | number | boolean | null>(value)) {
              await recordAttr(name, await js.eval(value));
              reactiveAttributes.push([name, value]);
            } else {
              attributes.set(name, value);
            }
          }
        })(name, value);
      }

      for (const [name, expr] of reactiveAttributes) {
        const uris = jsResources(expr);
        if (uris.length) {
          effects.push(subAttribute(uris, node.ref, name, () => inline(expr)));
        }
      }

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
        effects.push(
          js.fn(() =>
            subText(
              node.ref,
              () => inline(node.element),
              // js.comma(js.reassign(node.element, node.element), node.element),
              indexedUris(uris),
            )
          )(),
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

const onEvent = js.fn((
  target: JS<EventTarget>,
  type: JS<string>,
  cb: JS<(e: Event) => void>,
) => [
  js`let c=${cb}`,
  target.addEventListener(type, unsafe("c")),
  js`return ()=>${target.removeEventListener(type, unsafe("c"))}`,
]);

const subAttribute = js.fn((
  uris: JS<string[]>,
  target: JS<Element>,
  k: JS<string>,
  expr: JS<() => unknown>,
): JS<void> =>
  client.sub(
    target,
    () => {
      const v = expr();
      return js`!${v}&&${v}!==""?${target.removeAttribute(k)}:${
        target.setAttribute(k, js`${v}===true?"":String(${v})`)
      }`;
    },
    indexedUris(uris),
  )
);

const subText = js.fn((
  node: JS<Text>,
  value: JS<() => DOMLiteral>,
  uris: JS<readonly string[]>,
) =>
  js<
    () => void
  >`${client.sub}(${node},_=>${node}.textContent=${value}(),${uris})`
);

export const addEffect = (
  ctx: JSXContextAPI,
  cb: Fn<[], void | (() => void)>,
  uris?:
    | readonly string[]
    | JSable<readonly string[]>
    | readonly JSable<string>[],
): void => {
  ctx(effectContext).push(
    js.fn(() => {
      const effectJs = js.fn(cb);
      return client.sub(
        ctx(targetContext),
        effectJs,
        uris ? indexedUris(uris) : [],
      );
    })(),
  );
};
