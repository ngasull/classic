import type {
  Activation,
  ActivationFn,
  ActivationInfo,
  ActivationRef,
  RefAPI,
} from "../dom.ts";
import { apiArg, argn, modulesArg, resourcesArg } from "../dom/arg-alias.ts";
import { voidElements } from "../dom/void.ts";
import { fn, js, statements, sync, toRawJS, unsafe } from "../js.ts";
import type { BundleResult } from "../js/bundle.ts";
import {
  isJSable,
  JS,
  JSable,
  JSONable,
  JSStatements,
  jsSymbol,
  Resource,
} from "../js/types.ts";
import {
  contextSymbol,
  DOMLiteral,
  DOMNode,
  DOMNodeKind,
  ElementKind,
  JSXContext,
  JSXContextAPI,
  JSXContextOf,
  JSXInitContext,
  JSXRef,
  JSXSyncRef,
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
  root: JSX.Element,
  { context }: { context?: JSXInitContext<unknown>[] } = {},
) => {
  const acc: string[] = [];
  const ctxData = subContext(undefined, context);
  const bundle = mkContext(ctxData).get(bundleContext);
  const tree = await nodeToDOMTree(root, ctxData);

  writeDOMTree(
    tree,
    (chunk) => acc.push(chunk),
    bundle
      ? ((partial) =>
        writeActivationScript((chunk) => acc.push(chunk), tree, {
          bundle,
          partial,
        }))
      : null,
  );
  return acc.join("");
};

export const renderToStream = (
  root: JSX.Element,
  { context }: { context?: JSXInitContext<unknown>[] },
) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      const write = (chunk: string) =>
        controller.enqueue(encoder.encode(chunk));

      const ctxData = subContext(undefined, context);
      const bundle = mkContext(ctxData).get(bundleContext);

      nodeToDOMTree(root, ctxData).then((tree) => {
        writeDOMTree(
          tree,
          write,
          bundle
            ? ((partial) =>
              writeActivationScript(write, tree, { bundle, partial }))
            : null,
        );
        controller.close();
      });
    },
  });

type ContextData = Map<symbol, unknown>;

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

export const bundleContext = createContext<{
  readonly result: BundleResult;
  readonly watched?: boolean;
}>("bundle");

const writeActivationScript = (
  write: (chunk: string) => void,
  children: DOMNode[],
  { bundle, partial = false }: {
    bundle: JSXContextOf<typeof bundleContext>;
    partial?: boolean;
  },
) => {
  const [activation, modules, store] = deepActivation(children);

  const publicModules = modules.map((m) => {
    const publicPath = bundle.result.publicPath(m);
    if (!publicPath) throw Error(`Module expected to be bundled: ${m}`);
    return publicPath;
  });

  const domPath = bundle.result.publicPath(
    import.meta.resolve("../dom.ts"),
  );
  if (!domPath) throw Error(`DOM lib is supposed to be bundled`);

  if (activation) {
    write("<script>(p=>");
    write(
      escapeScriptContent(
        js.promise(js<Promise<typeof import("../dom.ts")>>`import(${domPath})`)
          .then((dom) =>
            dom.a(activation, publicModules, store, js<NodeList | Node[]>`p`)
          )[jsSymbol].rawJS,
      ),
    );
    write(")(");
    write(
      partial
        ? `[document.currentScript.previousSibling]`
        : `document.childNodes`,
    );
    write(");");

    if (bundle.watched && !partial) {
      write(
        `new EventSource("/hmr").addEventListener("change",()=>location.reload());`,
      );
    }

    if (partial) {
      write(`document.currentScript.remove();`);
    }

    write("</script>");
  }
};

const deepActivation = (
  root: DOMNode[],
): [JSable<ActivationFn> | null, string[], [string, JSONable][]] => {
  let lastModuleIndex = -1;
  const modules = new Map<string, number>();
  const storeModule = (m: string) =>
    modules.get(m) ?? (modules.set(m, ++lastModuleIndex), lastModuleIndex);

  const activationStore = new Map<string, [number, [string, JSONable]]>();
  let storeIndex = 0;
  const storeResource = ({ uri, value }: Resource<JSONable>) => {
    if (!activationStore.has(uri)) {
      if (typeof (value as PromiseLike<JSONable>)?.then === "function") {
        throw Error(
          `Resource values should have been awaited with \`sync\` at this point`,
        );
      }
      activationStore.set(uri, [storeIndex++, [uri, value as JSONable]]);
    }
    return activationStore.get(uri)![0];
  };

  const activation = domActivation(root, storeModule, storeResource);

  return [
    activation.length
      ? js`(${unsafe(modulesArg)},${unsafe(resourcesArg)})=>${activation}`
      : null,
    [...modules.keys()],
    [...activationStore.values()].map(([, entry]) => entry),
  ];
};

const domActivation = (
  dom: readonly DOMNode[],
  storeModule: (path: string) => number,
  storeResource: (resource: Resource<JSONable>) => number,
) => {
  const activation: JSable<[number, ActivationInfo]>[] = [];

  for (let i = 0; i < dom.length; i++) {
    const { kind, node, refs = [] } = dom[i];
    for (const ref of refs) {
      const { body } = ref[jsSymbol];
      const activationRef = js<ActivationRef>`((${unsafe(argn(0))},${
        unsafe(apiArg)
      })=>{${
        Array.isArray(body) ? statements(body as JSStatements<unknown>) : body
      }})`;

      activation.push([
        i,
        unsafe(toRawJS(activationRef, { storeModule, storeResource })),
      ] as unknown as JSable<[number, ActivationRef]>);
    }
    if (kind === DOMNodeKind.Tag) {
      const childrenActivation = domActivation(
        node.children,
        storeModule,
        storeResource,
      );
      if (childrenActivation.length > 0) {
        activation.push(
          [i, childrenActivation] as unknown as JSable<[number, Activation]>,
        );
      }
    }
  }

  return activation;
};

const writeDOMTree = (
  tree: readonly DOMNode[],
  write: (chunk: string) => void,
  writeRootActivation: ((partial?: boolean) => void) | null,
  root = true,
) => {
  const partialRoot = root && (tree.length !== 1 ||
    tree[0].kind !== DOMNodeKind.Tag || tree[0].node.tag !== "html");

  for (const { kind, node } of tree) {
    switch (kind) {
      case DOMNodeKind.Comment: {
        write(`<!--`);
        write(escapeComment(node));
        write(`-->`);
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
            writeDOMTree(node.children, write, writeRootActivation, false);

            if (!partialRoot && node.tag === "head") {
              writeRootActivation?.();
            }
          }

          write("</");
          write(node.tag);
          write(">");
        }

        if (partialRoot && node.tag !== "script") {
          writeRootActivation?.(true);
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
  root: JSX.Element,
  ctxData: ContextData,
): Promise<DOMNode[]> => {
  const syncRoot = await root;

  if (Array.isArray(syncRoot)) {
    const children = await Promise
      .all(syncRoot.map((child) => nodeToDOMTree(child, ctxData)))
      .then((children) => children.flatMap(id));

    // Make sure we have no adjacent text nodes (would be parsed as only one)
    for (let i = children.length - 1; i > 0; i--) {
      if (
        children[i].kind === DOMNodeKind.Text &&
        children[i - 1].kind === DOMNodeKind.Text
      ) {
        children.splice(i, 0, { kind: DOMNodeKind.Comment, node: "" });
      }
    }

    return children;
  }

  switch (syncRoot.kind) {
    case ElementKind.Component: {
      const { Component, props } = syncRoot.element;
      const subCtxData = subContext(ctxData);
      return nodeToDOMTree(Component(props, mkContext(subCtxData)), subCtxData);
    }

    case ElementKind.Comment: {
      return [{ kind: DOMNodeKind.Comment, node: syncRoot.element }];
    }

    case ElementKind.Intrinsic: {
      const {
        tag,
        props: { ref, ...props },
        children,
      } = syncRoot.element;

      const attributes = new Map<string, string | number | boolean>();
      const reactiveAttributes: [
        string,
        JSable<string | number | boolean | null>,
      ][] = [];
      const refs: JSXSyncRef<Element>[] = ref
        ? [
          await sync(fn((api: JS<RefAPI<Element>>) =>
            (ref as unknown as JSXRef<Element>)(api)
          )),
        ]
        : [];

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
              refs.push(
                await sync(
                  fn(({ target }: JS<RefAPI<Element>>) =>
                    js.track(() => [
                      js`let c=${value}`,
                      target.addEventListener(eventType, unsafe("c")),
                      js`return ${
                        target.removeEventListener(eventType, unsafe("c"))
                      }`,
                    ])
                  ),
                ),
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

      refs.push(
        ...(await Promise.all(
          reactiveAttributes.map(([name, reactive]) =>
            sync(
              fn(({ target }: JS<RefAPI<Element>>) =>
                js.track(() =>
                  js`let k=${name},v=${reactive};!v&&v!==""?${target}.removeAttribute(k):${target}.setAttribute(k,v===true?"":String(v))`
                )
              ),
            )
          ),
        )),
      );

      return [{
        kind: DOMNodeKind.Tag,
        node: {
          tag: tag,
          attributes,
          children: await nodeToDOMTree(children, ctxData),
        },
        refs,
      }];
    }

    case ElementKind.JS: {
      return [{
        kind: DOMNodeKind.Text,
        node: {
          text: String(await js.eval(syncRoot.element) ?? ""),
        },
        refs: [
          await sync(
            fn(({ target }: JS<RefAPI<Text>>) =>
              js.track(() => js`${target}.textContent=${(syncRoot.element)}`)
            ),
          ),
        ],
      }];
    }

    case ElementKind.Text: {
      return [{
        kind: DOMNodeKind.Text,
        node: { text: String(syncRoot.element.text) },
        refs: syncRoot.element.ref
          ? [await sync(fn((api) => syncRoot.element.ref!(api)))]
          : [],
      }];
    }

    case ElementKind.HTMLNode: {
      return [{
        kind: DOMNodeKind.HTMLNode,
        node: { html: syncRoot.element.html },
        refs: syncRoot.element.ref
          ? [await sync(fn((api) => syncRoot.element.ref!(api)))]
          : [],
      }];
    }
  }

  throw Error(`Can't handle JSX node ${JSON.stringify(syncRoot)}`);
};
