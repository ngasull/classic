import { type CustomElement, define, element } from "@classic/element";
import { listen } from "@classic/util";

export const Scope: CustomElement = element({
  defer: true,
  js(dom) {
    let host = dom();
    let shadow = host.shadowRoot ?? dom(
      host.querySelector<HTMLTemplateElement>(
        "template[shadowrootmode=open]",
      )!.content,
    ).shadowRoot;

    listen(shadow, "*", (e) =>
      host.dispatchEvent(
        new CustomEvent("c-forward", {
          detail: e.type == "c-forward" ? (e as CustomEvent).detail : e,
        }),
      ));
  },
});

define("c-scope", Scope);
