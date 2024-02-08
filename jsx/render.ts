import type { Activation } from "../dom.ts";
import { fn, js, statements, sync, track } from "../js.ts";
import {
  isEvaluable,
  JS,
  JSable,
  JSONable,
  JSStatements,
  jsSymbol,
  ModuleMeta,
  Resource,
} from "../js/types.ts";
import { WebBundle } from "../js/web.ts";
import { contextSymbol, DOMNode, DOMNodeKind, ElementKind } from "./types.ts";

const id = <T>(v: T) => v;

const voidElements = {
  area: true,
  base: true,
  br: true,
  col: true,
  embed: true,
  hr: true,
  img: true,
  input: true,
  link: true,
  meta: true,
  param: true,
  source: true,
  track: true,
  wbr: true,
};

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

export const escapeScriptContent = (node: JSX.DOMLiteral) =>
  String(node).replaceAll("</script", "</scr\\ipt");

export const renderToString = async (
  root: JSX.Element,
  opts: { bundle: WebBundle },
) => DOMTreeToString(await toDOMTree(root), opts);

export const DOMTreeToString = (
  tree: DOMNode[],
  { bundle }: { bundle: WebBundle },
) => {
  const acc: string[] = [];
  writeDOMTree(
    tree,
    (chunk) => acc.push(chunk),
    (partial) =>
      writeActivationScript((chunk) => acc.push(chunk), tree, {
        domPath: bundle.lib.dom,
        partial,
      }),
  );
  return acc.join("");
};

export const renderToStream = (
  root: JSX.Element,
  { bundle }: { bundle: WebBundle },
) =>
  new ReadableStream<string>({
    async start(controller) {
      const tree = await toDOMTree(root);
      writeDOMTree(
        tree,
        controller.enqueue,
        (partial) =>
          writeActivationScript(controller.enqueue, tree, {
            domPath: bundle.lib.dom,
            partial,
          }),
      );
      controller.close();
    },
  });

type ContextData = Map<symbol, unknown>;

export const createContext = <T>() =>
  ({ [contextSymbol]: Symbol() }) as JSX.Context<T>;

const subContext = (
  parent?: ContextData,
  added: [symbol, unknown][] = [],
): ContextData => {
  const contexts = new Map(parent);
  for (const [c, v] of added) {
    contexts.set(c as unknown as symbol, v);
  }
  return contexts;
};

const contextAPI = (data: ContextData) => {
  const ctx: JSX.ContextAPI = {
    get: <T>(context: JSX.Context<T>) => {
      if (!data.has(context[contextSymbol])) {
        throw new Error(`Looking up unset context`);
      }
      return data.get(context[contextSymbol]) as T;
    },
    getOrNull: <T>(context: JSX.Context<T>) =>
      data.get(context[contextSymbol]) as T | null,
    has: (context) => data.has(context[contextSymbol]),
    set: <T>(context: JSX.Context<T>, value: T) => (
      data.set(context[contextSymbol], value), ctx
    ),
    delete: <T>(context: JSX.Context<T>) => (
      data.delete(context[contextSymbol]), ctx
    ),
  };
  return ctx;
};

const writeActivationScript = (
  write: (chunk: string) => void,
  children: DOMNode[],
  { domPath, partial = false }: {
    domPath: string;
    partial?: boolean;
  },
) => {
  const [activation, modules, store] = deepActivation(children);
  if (activation.length) {
    write("<script>(p=>");
    write(
      js.import<typeof import("../dom.ts")>(domPath).then((dom) =>
        dom.a(
          activation,
          modules,
          store,
          js<NodeList | Node[]>`p`,
        )
      )[jsSymbol].rawJS,
    );
    write(")(");
    write(
      partial
        ? `[document.currentScript.previousSibling]`
        : `document.childNodes`,
    );
    write(")</script>");
  }
};

export const deepActivation = (
  root: DOMNode[],
): [Activation, string[], [string, JSONable][]] => {
  const modules: Record<string, 1> = {};
  const storeModule = ({ pub }: ModuleMeta) => {
    modules[pub] = 1;
  };

  const activationStore: Record<string, [number, JSONable]> = {};
  let storeIndex = 0;
  const store = ({ uri }: Resource<JSONable>, value: JSONable) => {
    activationStore[uri] ??= [storeIndex++, value];
    return activationStore[uri][0];
  };
  return [
    domActivation(root, storeModule, store),
    Object.keys(modules),
    Object.entries(activationStore).map(([uri, [, value]]) => [uri, value]),
  ];
};

const domActivation = (
  dom: DOMNode[],
  storeModule: (m: ModuleMeta) => void,
  store: (resource: Resource<JSONable>, value: JSONable) => number,
) => {
  const activation: Activation = [];

  for (let i = 0; i < dom.length; i++) {
    const { kind, node, refs = [] } = dom[i];
    for (const ref of refs) {
      for (const m of ref.fn[jsSymbol].modules) {
        storeModule(m);
      }

      const { body } = ref.fn[jsSymbol];
      activation.push([
        i,
        (Array.isArray(body)
          ? statements(body as JSStatements<unknown>)
          : body)[jsSymbol].rawJS,
        ...(ref.fn[jsSymbol].resources?.map((r, i) =>
          store(r, ref.values[i])
        ) ??
          []),
      ]);
    }
    if (kind === DOMNodeKind.Tag) {
      const childrenActivation = domActivation(
        node.children,
        storeModule,
        store,
      );
      if (childrenActivation.length > 0) {
        activation.push([i, childrenActivation]);
      }
    }
  }

  return activation;
};

export const writeDOMTree = (
  tree: DOMNode[],
  write: (chunk: string) => void,
  writeRootActivation: (partial?: boolean) => void,
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

        for (const [name, value] of Object.entries(node.attributes)) {
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
              writeRootActivation();
            }
          }

          write("</");
          write(node.tag);
          write(">");
        }

        if (partialRoot && node.tag !== "script") {
          writeRootActivation(true);
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

export const toDOMTree = (root: JSX.Element): Promise<DOMNode[]> =>
  nodeToDOMTree(root, subContext());

const nodeToDOMTree = async (
  root: JSX.Element,
  ctxData: ContextData,
): Promise<DOMNode[]> => {
  const syncRoot = await root;

  if (Array.isArray(syncRoot)) {
    return Promise.all(
      syncRoot.map((child) => nodeToDOMTree(child, ctxData)),
    ).then((children) => children.flatMap(id));
  }

  switch (syncRoot.kind) {
    case ElementKind.Component: {
      const { Component, props } = syncRoot.element;
      const subCtxData = subContext(ctxData);
      return nodeToDOMTree(
        Component(props, contextAPI(subCtxData)),
        subCtxData,
      );
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

      const attributes: Record<string, string | number | boolean> = {};
      const reactiveAttributes: [
        string,
        JSable<string | number | boolean | null>,
      ][] = [];

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
            if (isEvaluable<string | number | boolean | null>(value)) {
              await recordAttr(name, await js.eval(value));
              reactiveAttributes.push([name, value]);
            } else {
              attributes[name] = value;
            }
          }
        })(name, value);
      }

      return [
        {
          kind: DOMNodeKind.Tag,
          node: {
            tag: tag,
            attributes,
            children: await nodeToDOMTree(children, ctxData),
          },
          refs: [
            ...(await Promise.all(
              reactiveAttributes.map(([name, reactive]) =>
                sync(
                  fn((node: JS<Element>) =>
                    track(() =>
                      js`let k=${name},v=${reactive};!v&&v!==""?${node}.removeAttribute(k):${node}.setAttribute(k,v===true?"":String(v))`
                    )
                  ),
                )
              ),
            )),
            ...(ref
              ? [
                await sync(
                  fn((elRef: JS<Element>) =>
                    (ref as unknown as JSX.Ref<Element>)(elRef) as JSable<void>
                  ),
                ),
              ]
              : []),
          ],
        },
      ];
    }

    case ElementKind.JS: {
      return [
        {
          kind: DOMNodeKind.Text,
          node: {
            text: String(await js.eval(syncRoot.element)),
          },
          refs: [
            await sync(
              fn((node: JS<Text>) =>
                track(() => js`${node}.textContent=${(syncRoot.element)}`)
              ),
            ),
          ],
        },
      ];
    }

    case ElementKind.Text: {
      return [
        {
          kind: DOMNodeKind.Text,
          node: { text: String(syncRoot.element.text) },
          refs: syncRoot.element.ref
            ? [
              await sync(
                fn((ref) => syncRoot.element.ref!(ref) as JSable<void>),
              ),
            ]
            : [],
        },
      ];
    }

    case ElementKind.HTMLNode: {
      return [
        {
          kind: DOMNodeKind.HTMLNode,
          node: { html: syncRoot.element.html },
          refs: syncRoot.element.ref
            ? [
              await sync(
                fn((ref) => syncRoot.element.ref!(ref) as JSable<void>),
              ),
            ]
            : [],
        },
      ];
    }
  }

  throw Error(`Can't handle JSX node ${JSON.stringify(syncRoot)}`);
};
