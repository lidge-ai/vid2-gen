import { Vid2Error } from "../shared/index.ts";
import { createFileProvider } from "./file.ts";
import { createIma2Provider } from "./ima2.ts";
import type { AssetProvider, ProviderContext } from "./provider.ts";

export const ASSET_PROVIDER_IDS = ["file", "ima2"] as const;

export function providerById(id: string, ctx: ProviderContext = {}): AssetProvider {
  if (id === "file") return createFileProvider();
  if (id === "ima2") return createIma2Provider(ctx);
  throw new Vid2Error("E_INPUT", `unknown asset provider: ${id}`, {
    details: { providers: ASSET_PROVIDER_IDS }, fix: `Use one of: ${ASSET_PROVIDER_IDS.join(", ")}` });
}
