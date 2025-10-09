import { Context } from "@classic/context";
import {
  asJs,
  evalJs,
  type Fn,
  isJs,
  type JS,
  js,
  type JSArg,
  toJs,
} from "@classic/js";
import { initRefs, mkRef, type RefTree } from "./ref.ts";
import {
  type DOMLiteral,
  type DOMNode,
  DOMNodeKind,
  ElementKind,
  type JSX,
  type JSXElement,
  type JSXRef,
} from "./types.ts";
import { voidElements } from "./void.ts";

const eventPropRegExp = /^on([A-Z]\w+)$/;

// Only escape when necessary ; avoids inline JS like "a && b" to become "a &amp;&amp; b"
const escapesRegex = /&(#\d{2,4}|[A-z][A-z\d]+);/g;
const escapeEscapes = (value: string) =>
  value.replaceAll(escapesRegex, (_, code) => `&amp;${code};`);

const escapeTag = (tag: string) => tag.replaceAll(/[<>"'&]/g, "");

const zeroWidthSpaceHTML = "&#8203;";

const escapeTextNode = (text: string) =>
  escapeEscapes(text)
    .replaceAll("<", "&lt;") ||
  // Consecutive and first/last white spaces are ignored anyways and can mess with HTML streaming
  // ... But they mess with inline element spacing!
  // .replaceAll(/^\s+|\s+$/g, "")
  // ... But <pre>formatted blocks use those trimmed spaces!
  // .replaceAll(/\s+/g, " ")
  zeroWidthSpaceHTML; // Empty would not be parsed as a text node

const commentEscapeRegExp = /--(#|>)/g;

const escapeComment = (comment: string) =>
  comment.replaceAll(commentEscapeRegExp, "--#$1");

export const escapeScriptContent = (node: DOMLiteral) =>
  String(node).replaceAll("</script", "</scr\\ipt");

const encoder = new TextEncoder();

/**
 * `render` options
 */
interface RenderOpts {
  /**
   * Prepend HTML5 doctype to the stream
   * @default true
   */
  doctype?: boolean;
}

/**
 * Render JSX to HTML
 *
 * @param root JSX element to render
 */
export const render = (
  root: JSX.Element,
  opts: RenderOpts = {},
): ReadableStream<Uint8Array> =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (chunk: Uint8Array) => controller.enqueue(chunk);
      const tree = domNodes(root);

      $effects.provide([], writeDOMTree, tree, { write, ...opts }, true)
        .finally(() => {
          controller.close();
        });
    },
  });

const $effects = Context<JSArg<() => void>[]>("classic.effects");

const activate = async (
  refs: RefTree,
  opts: {
    write: (chunk: Uint8Array) => void;
  },
): Promise<DOMNode | void> => {
  const effectsContext = $effects.use();
  const effects = effectsContext.splice(0, effectsContext.length);

  if (effects.length) {
    const activationScript = initRefs(
      refs,
      "$",
      toJs,
      () => {
        js`${effects}.map(e=>{try{return e()}catch(e){console.error(e)}})`;
      },
    );

    const s = new TextEncoderStream();
    const writer = s.writable.getWriter();
    // Find refs tree entry node
    writer.write(`{let $=document.currentScript;for(let i=0;i<`);
    writer.write(refs.length.toString());
    writer.write(`;i++)$=$.previousSibling;`);
    // Open an async closure to launch effecs into
    writer.write(`(async()=>{`);
    writer.write(activationScript);
    writer.write(`})()}`);
    writer.close();

    await writeDOMTree([{
      kind: DOMNodeKind.Tag,
      tag: "script",
      attributes: new Map(),
      children: [{
        kind: DOMNodeKind.HTMLNode,
        html: s.readable,
        ref: mkRef(),
      }],
      ref: mkRef(),
    }], opts);
  }
};

const writeDOMTree = async (
  tree: Iterable<DOMNode> | AsyncIterable<DOMNode>,
  opts: {
    doctype?: boolean;
    write: (chunk: Uint8Array) => void;
  },
  root?: boolean,
): Promise<RefTree> => {
  const { doctype, write } = opts;
  const writeStr = (chunk: string) => write(encoder.encode(chunk));
  const refs: RefTree = [];

  for await (const node of tree) {
    let childRefs: RefTree | null = null;

    switch (node.kind) {
      case DOMNodeKind.Comment: {
        if (node.text) {
          writeStr(`<!--`);
          writeStr(escapeComment(node.text));
          writeStr(`-->`);
        } else {
          writeStr(`<!>`);
        }
        break;
      }

      case DOMNodeKind.Tag: {
        if (
          root && (
            doctype === true ||
            (doctype == null && node.tag === "html")
          )
        ) {
          writeStr("<!DOCTYPE html>");
        }

        writeStr("<");
        writeStr(escapeTag(node.tag));

        for (const [name, value] of node.attributes) {
          if (value === false) continue;
          const valueStr = value === true ? "" : String(value);
          const escapedValue = escapeEscapes(valueStr).replaceAll("'", "&#39;");

          writeStr(" ");
          writeStr(escapeTag(name));
          if (escapedValue) {
            writeStr("=");
            if (/[\s>"]/.test(escapedValue)) {
              writeStr("'");
              writeStr(escapedValue);
              writeStr("'");
            } else {
              writeStr(escapedValue);
            }
          }
        }

        writeStr(">");

        if (!voidElements.has(node.tag)) {
          if (node.tag === "script") {
            const scriptChildren: DOMNode[] = [];
            for await (const c of node.children) {
              if (
                c.kind === DOMNodeKind.Text || c.kind === DOMNodeKind.HTMLNode
              ) {
                scriptChildren.push(c);
              } else {
                console.warn(`Ignoring <script>'s non-text child: ${c}`);
              }
            }
            await writeDOMTree(scriptChildren, opts);
          } else {
            // Write any global initializing effect that may use document.body
            // if (node.tag === "body") await activate([], opts);

            childRefs = await writeDOMTree(node.children, opts);

            if (node.tag === "body") await activate(childRefs, opts);
          }

          writeStr("</");
          writeStr(node.tag);
          writeStr(">");
        }

        break;
      }

      case DOMNodeKind.Text: {
        writeStr(escapeTextNode(node.text));
        break;
      }

      case DOMNodeKind.HTMLNode: {
        if (node.html instanceof Uint8Array) {
          write(node.html);
        } else {
          const reader = node.html.getReader();
          while (true) {
            const res = await reader.read();
            if (res.done) break;
            write(res.value);
          }
        }
        break;
      }
    }

    refs.push(childRefs?.length ? [node.ref, childRefs] : [node.ref]);
  }

  if (root) await activate(refs, opts);

  return refs;
};

const domNodes = async function* (
  nodeLike: JSX.Element,
): AsyncIterable<DOMNode> {
  const node = nodeLike && "then" in nodeLike ? await nodeLike : nodeLike;
  if (!node) return;

  const effects = $effects.use();

  switch (node.kind) {
    case ElementKind.Fragment: {
      for (const e of node.children) {
        yield* domNodes(e);
      }
      return;
    }

    case ElementKind.Component: {
      const { Component, props } = node;
      yield* domNodes(Component(props));
      return;
    }

    case ElementKind.Comment: {
      return yield {
        kind: DOMNodeKind.Comment,
        text: node.text,
        ref: node.ref,
      };
    }

    case ElementKind.Intrinsic: {
      const { tag, props: { ref, ...props } } = node;

      const attributes = new Map<string, string | number | boolean>();
      const reactiveAttributes: [
        string,
        JS<string | number | boolean | null>,
      ][] = [];

      if (ref != null) {
        effects.unshift(() => (ref as unknown as JSXRef<Element>)(node.ref));
      }

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
            | JS<string | number | boolean | null>,
        ) {
          if (value != null) {
            const eventMatch = name.match(eventPropRegExp);
            if (eventMatch) {
              effects.push(() =>
                onEvent(node.ref, eventMatch[1].toLowerCase(), value)
              );
            } else if (isJs<string | number | boolean | null>(value)) {
              await recordAttr(name, await evalJs(value));
              reactiveAttributes.push([name, value]);
            } else {
              attributes.set(name, value);
            }
          }
        })(name, value);
      }

      return yield {
        kind: DOMNodeKind.Tag,
        tag,
        attributes,
        children: disambiguateText(node.children),
        ref: node.ref as JS<EventTarget>,
      };
    }

    case ElementKind.JS: {
      return yield {
        kind: DOMNodeKind.Text,
        text: String(await evalJs(node.js) ?? ""),
        ref: node.ref,
      };
    }

    case ElementKind.Text: {
      return yield {
        kind: DOMNodeKind.Text,
        text: String(node.text),
        ref: node.ref,
      };
    }

    case ElementKind.HTMLNode: {
      return yield {
        kind: DOMNodeKind.HTMLNode,
        html: node.html,
        ref: node.ref,
      };
    }
  }

  throw Error(`Can't handle JSX node ${JSON.stringify(node)}`);
};

async function* disambiguateText(
  children: readonly JSXElement[],
): AsyncIterable<DOMNode> {
  let prev: DOMNode | null = null;

  for (const child of children) {
    for await (const c of domNodes(child)) {
      if (
        prev && c.kind === DOMNodeKind.Text &&
        prev.kind === DOMNodeKind.Text
      ) {
        yield {
          kind: DOMNodeKind.Comment,
          text: "",
          ref: mkRef(),
        };
      }
      yield c;
      prev = c;
    }
  }
}

const onEvent = asJs((
  target: JS<EventTarget>,
  type: JS<string>,
  cb: JS<(e: Event) => void>,
) => {
  target.addEventListener(type, cb);
  return () => target.removeEventListener(type, cb);
});

export const Effect: JSX.FC<{
  js: Fn<[], void | (() => void)>;
}> = ({ js: cb }) => {
  const ref = mkRef<Comment>();
  $effects.use().push(cb);
  return {
    kind: ElementKind.Comment,
    text: "",
    ref,
  };
};
