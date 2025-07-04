import { RequestContext } from "@classic/server";

type DB = {
  hello: string;
  multiverseNo: number;
};

export const dbContext = new RequestContext<DB>(() => ({
  hello: "hi",
  multiverseNo: 42,
}));
