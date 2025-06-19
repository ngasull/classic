import { DOMParser } from "@b-fuze/deno-dom";
import { assertStrictEquals } from "@std/assert";
import { morph } from "./morph.ts";

const parser = new DOMParser();
const html = (tpl: TemplateStringsArray) =>
  parser.parseFromString(tpl[0], "text/html") as never as HTMLDocument;

Deno.test({
  name: "updates existing text nodes",
  fn() {
    // deno-fmt-ignore
    const document = html`<h1>Hello World!</h1>`;
    const h1 = document.querySelector("h1");
    morph(
      document,
      // deno-fmt-ignore
      html`<h1>Sup Gang!</h1>`,
    );
    assertStrictEquals(
      document.querySelector("h1"),
      h1,
      "h1 must be preserved",
    );
    assertStrictEquals(h1!.textContent, "Sup Gang!");
  },
});

Deno.test({
  name: "appends trailing nodes",
  fn() {
    // deno-fmt-ignore
    const document = html`<h1>Hello World!</h1>`;
    const h1 = document.querySelector("h1");

    // deno-fmt-ignore
    const patch = html`<h1>Sup Gang!</h1><p>Super paragraph</p>`;
    const p = patch.querySelector("p");

    morph(document, patch);

    assertStrictEquals(
      document.body.childNodes[0],
      h1,
      "h1 must be preserved",
    );
    assertStrictEquals(
      document.body.childNodes[1],
      p,
      "p must be appended as-is",
    );
    assertStrictEquals(
      document.body.innerHTML,
      `<h1>Sup Gang!</h1><p>Super paragraph</p>`,
      "Content must be updated",
    );
  },
});

Deno.test({
  name: "prepends leading nodes",
  fn() {
    // deno-fmt-ignore
    const document = html`<p>Hell of a paragraph</p>`;
    const p = document.querySelector("p");

    // deno-fmt-ignore
    const patch = html`<h1>Sup Gang!</h1><p>Super paragraph</p>`;
    const h1 = patch.querySelector("h1");

    morph(document, patch);

    assertStrictEquals(
      document.body.childNodes[0],
      h1,
      "h1 must be prepended as-is",
    );
    assertStrictEquals(
      document.body.childNodes[1],
      p,
      "p must be preserved",
    );
    assertStrictEquals(
      document.body.innerHTML,
      `<h1>Sup Gang!</h1><p>Super paragraph</p>`,
    );
  },
});

Deno.test({
  name: "preserves identified nodes",
  fn() {
    const document =
      // deno-fmt-ignore
      html`<h1>Hello world!</h1><p id=foo123>Hell of a paragraph</p>`;
    const p = document.getElementById("foo123");
    const h1 = document.querySelector("h1");

    const patch =
      // deno-fmt-ignore
      html`<p id=foo123>Super paragraph</p><h1>Sup Gang!</h1><p>New random paragraph</p>`;

    morph(document, patch);

    assertStrictEquals(
      document.body.innerHTML,
      `<p id="foo123">Super paragraph</p><h1>Sup Gang!</h1><p>New random paragraph</p>`,
    );
    assertStrictEquals(
      document.body.childNodes[0],
      p,
      "p must have moved as identified",
    );
    assertStrictEquals(
      document.body.childNodes[1],
      h1,
      "h1 must be preserved",
    );
  },
});
