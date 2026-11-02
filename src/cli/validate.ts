import { parseArgs } from "node:util";
import { validateRepository } from "../data/validate-repository.ts";
import { REPOSITORY_ROOT, runMain, todayInJapan } from "./args.ts";

runMain(async () => {
  const { values } = parseArgs({ options: { "as-of": { type: "string" } } });
  const asOf = values["as-of"] ?? todayInJapan();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error(`Invalid --as-of: ${asOf}`);
  const { errors, warnings } = await validateRepository(REPOSITORY_ROOT, { asOf });
  for (const warning of warnings) console.warn(`warning: ${warning}`);
  for (const error of errors) console.error(`error: ${error}`);
  console.log(JSON.stringify({ status: errors.length ? "error" : "clean", as_of: asOf, errors: errors.length, warnings: warnings.length }));
  return errors.length ? 1 : 0;
});
