import { doCleanup } from "./lifecycle.ts";

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const COMMENT_NODE = 8;
const DOCUMENT_FRAGMENT_NODE = 11;

const SCRIPT = "SCRIPT";

const { entries, keys } = Object;

/**
 * Morph a source element into a patched version
 *
 * @param src Source element
 * @param patch Patch element
 */
export const morph = (
  src: Element | Document,
  patch: Element | Document,
): void => {
  src = skipDocument(src);
  patch = skipDocument(patch);
  doCleanup(src);
  morphElement(src, patch);
};

const morphElement = (
  src: Element,
  patch: Element,
): void => {
  let srcAttrs = attributesMap(src);
  let patchAttrs = attributesMap(patch);
  keys(srcAttrs).forEach((k) => k in patchAttrs || src.removeAttribute(k));
  entries(patchAttrs).forEach(([k, v]) =>
    v === srcAttrs[k] || src.setAttribute(k, v)
  );
  morphChildren(src, patch);
};

/**
 * Morph a source tree into a patched version
 *
 * @param src Source parent node
 * @param patch Patch parent root
 */
export const morphChildren = (
  srcParent: ParentNode,
  patchParent: ParentNode,
): void => morphChildrenInternal(srcParent, patchParent, 1);

const morphChildrenInternal = (
  srcParent: ParentNode,
  patchParent: ParentNode,
  clean?: 1,
): void => {
  let srcIndices: Map<Node, number> = new Map();
  let srcElements: Record<string, Element[] | undefined> = {};
  for (
    let next = iterateChildren(srcParent), srcChild, i = 0;
    (srcChild = next());
  ) {
    if (clean) doCleanup(srcChild);

    srcIndices.set(srcChild, i++);
    if (hasNodeType(srcChild, ELEMENT_NODE) && !srcChild.id) {
      (srcElements[srcChild.tagName] ??= []).push(srcChild);
    }
  }

  let nextSrcChild: ChildNode | null = srcParent.firstChild;
  for (
    let next = iterateChildren(patchParent), patchChild;
    (patchChild = next());
  ) {
    let nextType = nextSrcChild?.nodeType;
    let patchType = patchChild.nodeType;

    if (hasNodeType(patchChild, TEXT_NODE, COMMENT_NODE)) {
      if (patchType == nextType) {
        if ((nextSrcChild as CharacterData).data !== patchChild.data) {
          (nextSrcChild as CharacterData).data = patchChild.data;
        }
        nextSrcChild = nextSrcChild!.nextSibling;
      } else {
        srcParent.insertBefore(patchChild, nextSrcChild);
      }
    } else if (
      patchType == nextType &&
      hasNodeType(patchChild, DOCUMENT_FRAGMENT_NODE)
    ) {
      morphChildrenInternal(nextSrcChild! as Node as ParentNode, patchChild);
      nextSrcChild = nextSrcChild!.nextSibling;
    } else if (hasNodeType(patchChild, ELEMENT_NODE)) {
      let tag = patchChild.tagName;
      if (isOpenShadowTemplate(patchChild)) {
        morphChildrenInternal(
          (srcParent as Element).shadowRoot ??
            (srcParent as Element).attachShadow({ mode: "open" }),
          patchChild.content,
        );
        nextSrcChild = nextSrcChild?.nextSibling as ChildNode | null;
      } else {
        let srcChild = idSrcChild(srcParent, patchChild) ??
          srcElements[tag]?.shift() ?? patchChild;

        if (
          tag == SCRIPT &&
          (!(patchChild as HTMLScriptElement).type ||
            (patchChild as HTMLScriptElement).type == "text/javascript")
        ) {
          srcChild = srcParent.ownerDocument!.createElement(SCRIPT);
        }

        if (srcChild != patchChild) {
          morphElement(srcChild as Element, patchChild);
        }

        if (srcChild != nextSrcChild) {
          srcParent.insertBefore(srcChild, nextSrcChild);
        }
        nextSrcChild = srcChild.nextSibling;
      }
    } else {
      // Insert unmatched by default
      srcParent.insertBefore(patchChild, nextSrcChild);
    }
  }

  // Remove unwalked src children
  while (nextSrcChild) {
    let notReused = nextSrcChild;
    nextSrcChild = nextSrcChild.nextSibling;
    notReused.remove();
  }
};

const skipDocument = (root: Node) => (root as Document).documentElement ?? root;

const iterateChildren = (node: ParentNode) => {
  let child: ChildNode | null | undefined;
  let next: ChildNode | null | undefined = node.firstChild;
  return () => (child = next, next = next?.nextSibling, child);
};

const attributesMap = (el: Element) => {
  let map: Record<string, string> = {}, a;
  for (a of el.attributes) map[a.name] = a.value;
  return map;
};

// Find an src node matching a patch node
const idSrcChild = (srcParent: Node, patchChild: Element) => {
  let candidate = patchChild.id == ""
    ? null
    : srcParent.ownerDocument!.getElementById(patchChild.id);
  if (srcParent.contains(candidate)) return candidate;
};

const hasNodeType = <T extends number[]>(
  el: Node,
  ...type: T
): el is {
  [I in keyof T]: T[I] extends typeof ELEMENT_NODE ? Element
    : T[I] extends typeof TEXT_NODE ? Text
    : T[I] extends typeof COMMENT_NODE ? Comment
    : T[I] extends typeof DOCUMENT_FRAGMENT_NODE ? DocumentFragment
    : Node;
}[number] => type.includes(el.nodeType);

const isOpenShadowTemplate = (el: ChildNode): el is HTMLTemplateElement =>
  (el as Element).tagName == "TEMPLATE" &&
  // Prefer getAttribute for compatibility
  (el as Element).getAttribute("shadowrootmode") == "open";
