import { Vid2Error } from "../shared/errors.ts";
import { wantsJson } from "./args.ts";
import { renderFailure } from "./output.ts";
import { main } from "./main.ts";

const argv = process.argv.slice(2);
process.once("SIGINT", () => {
  const json = wantsJson(argv);
  const failure = renderFailure(new Vid2Error("E_INTERRUPTED", "interrupted"), json);
  (json ? process.stdout : process.stderr).write(`${failure.text}\n`);
  process.exit(failure.exit);
});

process.exitCode = await main(argv);
