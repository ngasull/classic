# @classic/element - Practical Web Components

[![JSR](https://jsr.io/badges/@classic/element)](https://jsr.io/@classic/element)

Aims to be the thinnest practical layer over custom elements / web components.

## Background

### Why custom elements?

JS and CSS can natively be associated to custom element tags. This way, SSR is
solved by default:

- Custom elements are rendered in real time. No
  [FOUC](https://en.wikipedia.org/wiki/Flash_of_unstyled_content)!
- The page contains all SEO information without executing JS

> [!NOTE]
> **This implies much simpler development stacks, only requiring backends to
> produce classic HTML**.
>
> In most cases, custom elements are ideally bundled together and inlined into
> the first download of a page. Subsequent navigation may be further sped up by
> dynamically fetching content.

Thanks to
[CSS parts](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_shadow_parts)
and
[variables](https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties),
custom elements solve known issues with nesting and precedence.

Likewise, custom elements rely on
[Shadow DOM](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM)
to sandbox and control their rendering.

### Why Classic?

We loved component frameworks like react to solve dynamic web application
development. Today, we've got native standards instead to build upon: custom
elements. However, while their native API allows as much flexibility as
possible, it's not systematized enough to be practical.

Classic provides:

- Simplicity
- Small bundle size
- Low memory footprint
- Signal-based reactivity
- JSX = reactive DOM
- CSS in JS, convenient and optimized
- TypeScript-first attribute to property synchronization
- Creation of form-accessible elements through
  [ElementInternals](https://developer.mozilla.org/en-US/docs/Web/API/ElementInternals)
- Compressible event helpers in JSX and aside
- SSR-ready API using
  [declarative shadow DOM](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM#declaratively_with_html)
  (for complex components)
- Cross-framework reusability

The native API is very verbose, which has an impact on the size of the JS bundle
sent over the network. This size is critical to good user experience. Not only
Classic compiles down below 2KB gzipped and is designed to let developers write
concise and highly compressible code (avoiding tokens that minifiers can't
mangle).

Classic aims to be the thinnest layer to efficiently guide developers in their
custom elements journey. Note that Classic elements are native custom elements.

### When should I use custom elements?

For any web **page**.

### When should I use a component library? (react, vue...)

For complex **components**: rich text editors, interactive graphs, games... They
can be embedded and loaded into a web page that use custom elements or use
custom elements themselves.

## Learn by example

### Self-incrementing counter

```tsx
import { define, signal } from "classic/element";

define("x-counter", {
  css: {
    "": { // Same as ":host"
      color: "red",
    },
  },
  js(dom) {
    const [count, setCount] = signal(0);

    const root = dom(<>Counting {count}</>);

    const t = setInterval(() => setCount(count() + 1), 1000);
    onDisconnect(root, () => clearInterval(t));
  },
});
```

### Custom button with SVG icon

```tsx
define("x-button", {
  css: {
    "": {
      color: "red",
    },
    svg: {
      width: 30,
      height: 30,
    },
  },
  props: { circle: Boolean },
  js(dom, { circle, type }) {

    const root = dom(
      <button type={type} onClick={}>
        {svgns(() => (
          <svg>
            {circle()
            ? <circle r="15" fill="blue" cx={15} cy={15} />
            : <rect cx={15} cy={15} />}
          </svg>
        ))}
        <slot />
      </button>,
    );
  },
});
```

## Signals

Classic signals are mutable values that can be tracked over time. Native
functions are read-only signals that can use other signals.

Classic JSX accepts signals:

```tsx
import { signal } from "classic/element";

const [hover, setHover] = signal(false); // Initial value: false

const button = (
  <span
    onMouseOver={() => setHover(true)}
    onMouseOut={() => setHover(false)}
    data-hover={hover}
  >
    {() => hover() ? "Use CSS for hovers!" : "Hover me"}
  </span>
);
```

> [!IMPORTANT]
> Classic JSX requires explicit signals:
>
> ```tsx
> const [value, setValue] = signal(false);
>
> // 🛑 Not reactive
> <input disabled={value()} />
>
> // ✅ Reactive
> <input disabled={value} />
> <input disabled={() => !value()} />
> ```
>
> This allows Classic to work as a regular library. No need for bundler plugins,
> like SolidJS does for example.

Signal values can be manually tracked:

```ts
import { on, signal } from "classic/element";

const [clicks, setClicks] = signal(0);
const [overs, setOvers] = signal(0);

on(clicks, (n) => alert(`${n} clicks`));

on(
  // Functions are read-only signals
  () => clicks() + overs(),
  (sum, prev) => alert(`${sum} interactions, previously ${prev}`),
);

setClicks(1); // Calls alert(1);
```

Signals are lazy when initialized with a function. This avoids unneeded
computations and allows lazy use.

```ts
const [sig, setSig] = signal(() => throw "Never called!");
setSig(42);
assertEquals(sig(), 42); // 👍
```

> [!IMPORTANT]
> **About laziness**: `on` eagerly evaluates the signals it depends on.
> Otherwise, we couldn't know what to watch.
>
> ```ts
> const [sig, setSig] = signal(() => throw "Oh noes");
> on(sig, (v) => alert(v)) // 💥
> ```

## About SSR

At first, Classic aimed SSR as a prime priority goal. Then came the realization
that no backend pre-processing is needed for an optimal experience if custom
elements are loaded synchronously, just like regular native elements. This way,
**SSR is solved by default**.

SEO also works well with custom elements: they semantically contain all the
required information and are even executed by SEO engines. Google themselves
promote the use of custom elements (Lit, Polymer,
[web.dev](https://web.dev/articles/web-components)...)

Classic kept the design of SSR-ready components, which will allow complex and
heavy components to be server-rendered as declarative shadow DOM and hydrated
asynchronously. This however **shouldn't be the default**.
