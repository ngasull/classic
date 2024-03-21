import type { RefAPI } from "../dom.ts";
import { cleanup, trackChildren } from "./lifecycle.ts";
import {
  adoptNode,
  call,
  customEvent,
  dispatchPrevented,
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
  routeFormEvent,
  routeLoadEvent,
  startsWith,
  subEvent,
  submit,
  win,
} from "./util.ts";

const suspenseDelay = 500;
const routeIndexParam = "_index";
const routeLayoutParam = "_layout";

type Segment = { p: string; s?: ChildNode };
const segments = new Map<EventTarget, Segment>();
let unsubRoot: () => void;

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
  let { pathname, search } = location,
    obsolete = findObsolete(pathname);

  // Fallback to regular navigation if page defines no route
  if (!obsolete) return location.replace(pathname + search);

  let [missingPartials, slot] = obsolete,
    curSlot = slot as ChildNode | null | undefined,
    searchParams = new URLSearchParams(search),
    resEls: Promise<Document>[],
    el: Document,
    raceRes: unknown;

  searchParams.append(routeIndexParam, "");

  await Promise.race([
    new Promise<void>((resolve) => setTimeout(resolve, suspenseDelay)),
    Promise.all(
      resEls = missingPartials.map(
        (url, i, q: any) => (routeRequests[url] ??= q = fetch(
          `${url}?${
            i == missingPartials.length - 1 ? searchParams : routeLayoutParam
          }`,
        )
          .then((res) =>
            res.redirected ? Promise.reject(navigate(res.url)) : res.text()
          )
          .then((html) =>
            q == routeRequests[url] ? parseHtml(html) : Promise.reject()
          )
          .finally(() => {
            delete routeRequests[url];
          })),
      ),
    ),
  ]);

  if (!raceRes && curSlot) {
    cleanup(curSlot);
    replaceWith(curSlot, curSlot = doc.createElement("progress"));
  }

  for await (el of resEls) {
    if (!(curSlot = processHtmlRoute(el, curSlot!))) break;
  }

  dispatchPrevented(slot, customEvent(routeLoadEvent));
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
    content,
    script = 0 as Element | 0,
    receivedChildren = receivedDoc.body.children,
    children = [
      content = receivedChildren.length
        ? adoptNode(receivedChildren[0])
        : textElement(receivedDoc.body.innerText),
    ];

  if (receivedChildren.length) {
    children.push(script = adoptNode(receivedChildren[0]));
  }

  forEach(
    querySelectorAll<HTMLTemplateElement>(`template[data-head]`, receivedDoc),
    (headEl) => {
      forOf(headEl.content.children, (el) =>
        doMatch(el.tagName, {
          TITLE() {
            doc.title = (el as HTMLTitleElement).text;
          },
          LINK: handleResource(el as HTMLLinkElement, "href"),
          SCRIPT: handleResource(el as HTMLScriptElement, "src"),
        }));
      headEl.remove();
    },
  );

  cleanup(slot);
  trackChildren(content);
  replaceWith(slot, ...children);

  subSegment(content);

  // Scripts parsed with DOMParser are not marked to be run
  if (script) {
    reviveScript(script as HTMLScriptElement);
  }

  forEach(
    querySelectorAll<HTMLScriptElement>("script", content),
    reviveScript,
  );

  return segments.get(content)?.s;
};

const textElement = (text: string): Element => {
  const el = doc.createElement("span");
  el.innerText = text;
  return el;
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

export const ref = (
  { effect, target }: RefAPI<ChildNode>,
  path?: string,
): void => effect(() => subSegment(target, path));

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
        submit,
        (e) =>
          (t = e.target) instanceof HTMLFormElement &&
          t.method == "get" &&
          !dispatchPrevented(t, customEvent(routeFormEvent)) &&
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

const subSegment = (target: ChildNode, path?: string) => {
  if (!segments.size) subRoot();

  if (path) segments.set(target, { p: path });

  // Notify closest parent that this target is the slot
  let parent: Node | null = target, parentSegment: Segment | null | undefined;
  do {
    parent = parent.parentNode;
    parentSegment = parent && segments.get(parent);
  } while (parent && !parentSegment);
  if (parentSegment) parentSegment.s = target;

  return () => {
    if (path != null) segments.delete(target);

    if (segments.size < 2) unsubRoot();
    else if (parent) delete segments.get(parent)!.s;
  };
};
