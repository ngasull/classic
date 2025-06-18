import { assertEquals } from "@std/assert";
import { assertSpyCallArgs, assertSpyCalls, spy } from "@std/testing/mock";
import { FakeTime } from "@std/testing/time";
import { config, configWith, Option, runConfig } from "./mod.ts";

const list = new Option<number>();

Deno.test({
  name: "options resolve in the same order tasks were written with",
  async fn() {
    using time = new FakeTime();

    const useList = spy();

    const { options } = await runConfig(async () => {
      configWith([list], useList);

      config(async () => {
        list.add(1);

        config(async () => {
          await new Promise((resolve) => setTimeout(resolve, 200));
          list.add(2);
        });

        await new Promise((resolve) => setTimeout(resolve, 100));
        list.add(3);
      });

      config(async () => {
        list.add(4);
      });

      configWith([list], useList);

      time.tick(1000);
    });

    assertSpyCallArgs(useList, 0, [[1, 2, 3, 4]]);
    assertSpyCallArgs(useList, 1, [[1, 2, 3, 4]]);
    assertEquals(options.get(list), [1, 2, 3, 4]);
  },
});

Deno.test({
  name: "options are usable at top level",
  async fn() {
    const $opt = new Option<number>();

    const { options } = await runConfig(async () => {
      $opt.add(1);
    });

    assertEquals([...options], [[$opt, [1]]]);
  },
});

Deno.test({
  name: "options that never reveive additions resolve to empty list",
  async fn() {
    const useList = spy((used) => {
      assertEquals(used, []);
    });

    await runConfig(() => {
      configWith([list], useList);
    });

    assertSpyCalls(useList, 1);
  },
});

Deno.test({
  name: "options should be resolved in dependency order when possible",
  async fn() {
    const option2 = new Option();
    const listSpy = spy();

    await runConfig(async () => {
      configWith([option2, list], listSpy);
      list.add(1);
    });

    assertSpyCallArgs(listSpy, 0, [[], [1]]);
  },
});
