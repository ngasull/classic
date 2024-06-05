import type { OnChange } from "../dom/element.ts";
import { js } from "../js.ts";
import type { JS } from "../js/types.ts";

type ClassicDef = void;

const { define: defineDOM, ids } = js.module<
  typeof import("../dom/element.ts")
>(
  import.meta.resolve("../dom/element.ts"),
);

export const defineElement = async <
  Props extends Record<string, string | null>,
  Inter,
>(
  { name, defaultProps, render, serverAdapter, domAdapter, connect }: {
    name: string;
    defaultProps?: Props;
    render: JS<(props: Props) => Inter>;
    serverAdapter: (intermediate: Inter) => string;
    domAdapter: JS<(root: ShadowRoot, intermediate: Inter) => void>;
    connect: JS<
      (
        root: ShadowRoot,
        props: Props,
        onChange: OnChange<Props>,
      ) => (() => void) | void
    >;
  },
): Promise<ClassicDef> => {
  const toHTML = async (props: Props) => {
    tracked.unshift(props);
    const html = serverAdapter(await js.eval(render(props)));
    tracked.shift();
    return html;
  };

  const j = defineDOM(
    name,
    defaultProps,
    (root, props) => domAdapter(root, render(props)),
    connect,
    {},
  );
};

const tracked: Record<string, string | null>[] = [];

{
  type Props = { foo: string };

  const toHTML = js.fn((vdom: JS<unknown>) => vdom as JS<string>);

  const render = js.fn((props: JS<Props>) => {
    return js<unknown>`poulet`;
  });

  const serverAdapter = async (props: Props) =>
    await js.eval(toHTML(render(props)));

  const domAdapter = js.fn((el: JS<ShadowRoot>, props: JS<Props>) => [
    js`${el}.innerHTML=${toHTML(render(props))}`,
  ]);

  const connect = js.fn((root, props, onChange) => {
    const { foo } = ids<{ foo: HTMLFormElement }>(root);
    return [
      js`${foo}.onsubmit = () => alert("OOkkay")`,
    ];
  });
}

{
  const [ids, refs] = defineRefs<{ foorm: HTMLFormElement }>();

  const custom = {
    render(props: unknown) {
      return null as unknown;
    },
    connect(root: ShadowRoot, props: unknown) {
      const { foorm } = refs(root);
      foorm.onsubmit = () => alert("OOKAY");
    },
  };
}
