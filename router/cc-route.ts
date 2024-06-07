import { define, element, onDisconnect } from "classic/element";
import { jsx } from "classic/element/jsx-runtime";
import {
  adoptNode,
  call,
  doc,
  doMatch,
  forEach,
  forOf,
  head,
  newURL,
  parseHtml,
  preventDefault,
  Promise,
  querySelector,
  querySelectorAll,
  replaceWith,
  startsWith,
  subEvent,
  win,
} from "../dom/util.ts";

const Route = element({
  props: { path: String },
  css: { ":host": { display: "contents" } },
  js(dom, { path }) {
    const root = dom(jsx("slot"));
    const host = root.host;

    if (!unsubRoot) subRoot();

    if (path) segments.set(host, { p: path });

    // Notify closest parent that this target is the slot
    let parent: Node | null = host,
      parentSegment: Segment | null | undefined;
    do {
      parent = parent.parentNode;
      parentSegment = parent && segments.get(parent);
    } while (parent && !parentSegment);
    if (parentSegment) parentSegment.s = host;

    onDisconnect(root, () => {
      if (path != null) segments.delete(host);
      if (segments.size > 1 && parent) delete segments.get(parent)!.s;
    });
  },
});

const suspenseDelay = 500;
const routeIndexParam = "_index";
const routeLayoutParam = "_layout";

type Segment = { p: string; s?: ChildNode };
const segments = new Map<EventTarget, Segment>();
let unsubRoot: () => void = null!;

let routeRequests: Record<string, Promise<Document> | undefined> = {};

const findObsolete = (
  destination: string,
  parent: ChildNode = doc.body,
  segment: Segment = segments.get(parent)!,
): [string[], ChildNode] | null | undefined => {
  let slot = segment?.s,
    subSegment = slot && segments.get(slot),
    subPath = (subSegment ?? segment).p;
  return slot
    ? subSegment && startsWith(destination, subPath)
      // Slot is part of destination: find inside
      ? findObsolete(destination, slot, subSegment)
      : startsWith(subPath, destination)
      // Only index needed
      ? [[destination], slot]
      // Subpaths starting from segment
      : [
        destination
          .slice(segment.p.length)
          .split("/")
          .map((_, i, arr) => segment.p + arr.slice(0, i + 1).join("/")),
        slot,
      ]
    : parent
    ? [[destination], parent] // No layout to replace; parent is the page to replace
    : slot;
};

const handleLocationChange = async () => {
  let { pathname, search, href } = location,
    obsolete = findObsolete(pathname);

  // Fallback to regular navigation if page defines no route
  if (!obsolete) return location.replace(pathname + search);

  let [missingPartials, slot] = obsolete,
    curSlot = slot as ChildNode | null | undefined,
    searchParams = new URLSearchParams(search),
    resEls: Promise<Document>[],
    el: Document,
    raceRes: unknown,
    url: string;

  searchParams.append(routeIndexParam, "");

  raceRes = await Promise.race([
    new Promise<void>((resolve) => setTimeout(resolve, suspenseDelay)),
    Promise.all(
      resEls = missingPartials.map((path, i, q: any) => (
        url = `${path}?${
          i == missingPartials.length - 1 ? searchParams : routeLayoutParam
        }`,
          routeRequests[url] ??= q = fetch(url)
            .then((res) =>
              res.redirected
                ? Promise.reject(navigate(res.url))
                : !res.headers.has("Partial")
                ? Promise.reject(location.href = href)
                : res.text()
            )
            .then((html) =>
              q == routeRequests[url] ? parseHtml(html) : Promise.reject()
            )
            .finally(() => {
              delete routeRequests[url];
            })
      )),
    ),
  ]);

  if (!raceRes && curSlot) {
    replaceWith(curSlot, curSlot = jsx("progress"));
  }

  for await (el of resEls) {
    if (!(curSlot = processHtmlRoute(el, curSlot!))) break;
  }
};

const processHtmlRoute = (receivedDoc: Document, slot: ChildNode) => {
  let handleResource =
      <A extends string>(el: HTMLElement & Record<A, string>, srcAttr: A) =>
      (tagName: string, src?: string) => {
        if (
          (src = el[srcAttr]) &&
          !querySelector(`${tagName}[${srcAttr}="${src}"]`, head)
        ) {
          head.append(adoptNode(el));
        }
      },
    fragment = new DocumentFragment();

  fragment.append(...adoptNode(receivedDoc.body).children);

  forOf(receivedDoc.head.children, (el) =>
    doMatch(el.tagName, {
      TITLE() {
        doc.title = (el as HTMLTitleElement).text;
      },
      LINK: handleResource(el as HTMLLinkElement, "href"),
      SCRIPT: handleResource(el as HTMLScriptElement, "src"),
    }));

  replaceWith(slot, fragment);

  // Scripts parsed with DOMParser are not marked to be run
  forEach(
    querySelectorAll<HTMLScriptElement>("script", fragment),
    reviveScript,
  );

  return segments.get(fragment.children[0])?.s;
};

const reviveScript = (script: HTMLScriptElement) => {
  let copy = doc.createElement("script");
  copy.text = script.text;
  replaceWith(script, copy);
};

export const navigate = (path: string): boolean => {
  let origin = location.origin,
    url = newURL(path, origin),
    navigated = url.origin == origin;
  if (navigated) {
    history.pushState(0, "", url);
    handleLocationChange();
  }
  return navigated;
};

const subRoot = () => {
  let t: EventTarget | null,
    body = doc.body,
    parent: Node | null,
    subs: Array<() => void> = [
      subEvent(
        body,
        "click",
        (e) =>
          !e.ctrlKey &&
          !e.shiftKey &&
          (t = e.target) instanceof HTMLAnchorElement &&
          navigate(t.href) &&
          preventDefault(e),
      ),

      subEvent(
        body,
        "submit",
        (e) =>
          (t = e.target) instanceof HTMLFormElement &&
          t.method == "get" &&
          !e.defaultPrevented &&
          navigate(t.action) &&
          preventDefault(e),
      ),

      subEvent(win, "popstate", handleLocationChange),
    ];

  segments.set(body, { p: "/" });

  unsubRoot = () => {
    segments.delete(body);
    subs.map(call);
    routeRequests = {};
  };
};

const d = define("cc-route", Route);

type D = typeof d;
declare global {
  namespace Classic {
    interface Elements extends D {}
  }
}
