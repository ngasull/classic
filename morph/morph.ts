const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const COMMENT_NODE = 8;
const DOCUMENT_FRAGMENT_NODE = 11;

const { entries, keys } = Object;

export const morph = (
  src: Element | HTMLDocument,
  patch: Element | HTMLDocument,
): void => {
  src = skipDocument(src);
  patch = skipDocument(patch);
  let srcAttrs = attributesMap(src);
  let patchAttrs = attributesMap(patch);
  keys(srcAttrs).map((k) => k in patchAttrs || src.removeAttribute(k));
  entries(patchAttrs).map(([k, v]) => src.setAttribute(k, v));
  morphChildren(src, patch);
};

export const morphChildren = (
  srcRoot: ParentNode,
  patchRoot: ParentNode,
): void => {
  let srcIndices: Map<Node, number> = new Map();
  let srcElements: Record<string, Element[] | undefined> = {};
  for (
    let next = iterateChildren(srcRoot), srcChild, i = 0;
    (srcChild = next());
  ) {
    srcIndices.set(srcChild, i++);
    if (
      srcChild.nodeType == ELEMENT_NODE &&
      !(srcChild as Element).id
    ) {
      (srcElements[(srcChild as Element).tagName] ??= [])
        .push(srcChild as Element);
    }
  }

  let nextSrcChild: ChildNode | null = srcRoot.firstChild;
  for (
    let next = iterateChildren(patchRoot), patchChild;
    (patchChild = next());
  ) {
    let nextType = nextSrcChild?.nodeType;
    let patchType = patchChild.nodeType;

    if (
      (patchChild.nodeType == TEXT_NODE || patchChild.nodeType == COMMENT_NODE)
    ) {
      if (patchType == nextType) {
        (nextSrcChild as CharacterData).data =
          (patchChild as CharacterData).data;
        nextSrcChild = nextSrcChild!.nextSibling;
      } else {
        srcRoot.insertBefore(patchChild, nextSrcChild);
      }
    } else if (
      patchType == nextType &&
      patchType == DOCUMENT_FRAGMENT_NODE
    ) {
      morphChildren(
        nextSrcChild! as Node as ParentNode,
        patchChild as Node as ParentNode,
      );
      nextSrcChild = nextSrcChild!.nextSibling;
    } else if (patchChild.nodeType == ELEMENT_NODE) {
      if (
        (patchChild as Element).tagName == "TEMPLATE" &&
        (patchChild as Element).getAttribute("shadowrootmode") == "open"
      ) {
        morphChildren(
          (srcRoot as Element).shadowRoot ??
            (srcRoot as Element).attachShadow({ mode: "open" }),
          (patchChild as HTMLTemplateElement).content,
        );
        nextSrcChild = nextSrcChild?.nextSibling as ChildNode | null;
      } else {
        let tag = (patchChild as Element).tagName;
        let srcChild = idSrcChild(srcRoot, patchChild as Element) ??
          srcElements[tag]?.shift() ?? patchChild;

        if (srcChild != patchChild) {
          morph(srcChild as Element, patchChild as Element);
        }

        if (srcChild != nextSrcChild) {
          srcRoot.insertBefore(srcChild, nextSrcChild);
        }
        nextSrcChild = srcChild.nextSibling;
      }
    } else {
      // Insert unmatched by default
      srcRoot.insertBefore(patchChild, nextSrcChild);
    }
  }

  // Remove unwalked src children
  while (nextSrcChild) {
    let notReused = nextSrcChild;
    nextSrcChild = nextSrcChild.nextSibling;
    notReused.remove();
  }
};

const skipDocument = (root: Node) =>
  (root as HTMLDocument).documentElement ?? root;

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

const ancestors = (node?: Node | null, set = new Set<Node>()): Set<Node> => {
  let parent = node?.parentElement;
  return parent ? ancestors(parent, set.add(parent)) : set;
};

const idSrcChild = (srcRoot: Node, patchChild: Element) => {
  let candidate = (srcRoot.getRootNode() as Document)
    .getElementById(patchChild.id);
  if (ancestors(candidate).has(srcRoot)) return candidate;
};
