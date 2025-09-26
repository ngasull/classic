import { morph } from "@classic/morph";
import { domParse, listen, timeout } from "@classic/util";

const { document, history, location, Promise } = globalThis;

const suspenseDelay = 500;

let needsInit = 1;
let submitting = 0;
let currentNavigateQ: Promise<unknown> | 0;

const fetchingClass = "fetching";
const submittingClass = "submitting";

const navigate = async (href: string) => {
  let url = new URL(href, location.origin),
    hasChanged = location.href != url.href,
    navigateQ: Promise<void | Document>,
    receivedDocQ: Promise<Document>,
    rootClassList = document.documentElement.classList;

  if (hasChanged) {
    history.pushState(0, "", href);
  }

  navigateQ = currentNavigateQ = Promise.race([
    timeout(suspenseDelay),
    receivedDocQ = fetch(url)
      .then((res): Promise<Document> =>
        res.redirected
          ? Promise.reject(navigate(res.url))
          : res.text().then((html) =>
            currentNavigateQ == navigateQ ? domParse(html) : Promise.reject()
          )
      )
      .finally(() => {
        currentNavigateQ = 0;
        rootClassList.remove(fetchingClass);
      }),
  ]);

  if (!await navigateQ) rootClassList.add(fetchingClass);

  patchDocument(await receivedDocQ, hasChanged);
};

const isLocal = (href: string) => {
  let origin = location.origin;
  return new URL(href, origin).origin == origin;
};

const submit = async (
  form: HTMLFormElement,
  action: string,
  body: FormData,
) => {
  let url = new URL(action, location.origin),
    hasChanged: boolean = location.href != url.href,
    resQ: Promise<Document | void>,
    receivedDoc: Document | void,
    formClassList = form.classList,
    contentLocation: string,
    res = await Promise.race([
      timeout(suspenseDelay).then(() => 0),
      resQ = Promise.resolve(
        fetch(url, {
          method: "post",
          body,
          headers: { "Classic-Route": "1" },
        }).then((res): Promise<Document | void> =>
          res.redirected
            ? Promise.reject(submit(form, res.url, body))
            : res.text().then((html) => {
              contentLocation = res.headers.get("Content-Location") ??
                url.pathname;
              if (contentLocation) {
                if (contentLocation != location.pathname) {
                  history.pushState(0, "", contentLocation);
                  hasChanged = true;
                }
                return domParse(html);
              }
            })
        ),
      ).finally(() => formClassList.remove(fetchingClass, submittingClass)),
    ]);

  if (res === 0) formClassList.add(fetchingClass, submittingClass);
  if ((receivedDoc = await resQ)) {
    patchDocument(receivedDoc, hasChanged);
  }
};

const patchDocument = (receivedDoc: Document, resetScroll: boolean) => {
  morph(document, receivedDoc);
  if (resetScroll) document.children[0].scrollTo(0, 0);
};

const initRoot = (root: EventTarget | null) => {
  if (root) {
    let t: EventTarget | null;
    listen(
      root,
      "click",
      (e) =>
        !e.ctrlKey &&
        !e.shiftKey &&
        (t = e.composedPath()[0]) instanceof HTMLAnchorElement &&
        isLocal(t.href) && (e.preventDefault(), navigate(t.href)),
    );

    listen(
      root,
      "submit",
      (e) => {
        let form = e.target as HTMLFormElement,
          submitter = e.submitter,
          action = submitter?.getAttribute("formaction") ?? form.action,
          data = new FormData(form, submitter);
        if (isLocal(action)) {
          e.preventDefault();
          if (form.method == "get") {
            navigate(
              // @ts-ignore TS bug: URLSearchParams accepts an Iterable<[string, string]> as per https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams/URLSearchParams#options and FormData is one.
              action + "?" + new URLSearchParams(data),
            );
          } else if (!submitting) {
            submitting = 1;
            submit(form, action, data)
              .finally(() => submitting = 0);
          }
        }
      },
    );
  }
};

/** Initialize dynamic routing in current window */
export const init = (): void => {
  if (needsInit) {
    needsInit = 0;
    initRoot(document.body);
    listen(window, "popstate", (_) => navigate(location.href));
  }
};
