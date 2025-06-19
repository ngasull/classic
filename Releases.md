### 2025.06.19

#### @classic/build 0.1.0 (minor)

- feat(build,compile): rename build package into the more accurate compile

#### @classic/context 0.1.1 (patch)

- feat(context): remove classic/context/option
- feat(context)!: implement async hooks as main context method
- chore(context): disable doc tests in old context API

#### @classic/element 0.1.7 (patch)

- fix(element): fix TS following deno upgrade

#### @classic/html 0.1.1 (patch)

- feat(html,js): rely on context hooks to empower API

#### @classic/js 0.1.12 (patch)

- feat(js): [stringify] support Uint8Array
- feat(js): allow stringifiable objects
- feat(html,js): rely on context hooks to empower API
- fix(js): omit decoding for empty byte arrays
- fix(js): fix and check stringification for every possible byte

#### @classic/morph 0.1.1 (patch)

- chore(*): specify workspace dependencies, ready to bump

#### @classic/router 0.1.1 (patch)

- feat(router,server): roll out eventual buildable server API
- feat(router,server): simplify stylesheet creation and refactor it in a
  separate server package
- feat(router,server): differentiate declarations from uses and sort out
  useRedirect in server
- feat(server,router)!: leverage async context to rework API to its ideal form
- chore(router): fix doc tests following layout API change

#### @classic/server 0.1.3 (patch)

- feat(router,server): roll out eventual buildable server API
- feat(router,server): simplify stylesheet creation and refactor it in a
  separate server package
- feat(router,server): differentiate declarations from uses and sort out
  useRedirect in server
- feat(server,router)!: leverage async context to rework API to its ideal form
- chore(server): expect a function as restoration logic instead of array

#### @classic/util 0.1.2 (patch)

- chore(*): specify workspace dependencies, ready to bump
