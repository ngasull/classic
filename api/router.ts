import { WebBundle } from "../js/web.ts";

export const makeWebModuleHandler = (webBundle: WebBundle) => {
  const outputMap = Object.fromEntries(
    webBundle.outputFiles.map((f) => [f.publicPath, f]),
  );

  return (req: Request) => {
    const bundle = outputMap[new URL(req.url).pathname];
    if (!bundle) return null;

    const { contents } = bundle;
    return new Response(contents, {
      headers: { "Content-Type": "text/javascript; charset=UTF-8" },
    });
  };
};
