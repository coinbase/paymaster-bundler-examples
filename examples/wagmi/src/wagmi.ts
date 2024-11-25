import { http, createConfig } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { coinbaseWallet } from "wagmi/connectors";

export const config = createConfig({
  chains: [baseSepolia],
  connectors: [
    coinbaseWallet({
      appName: "Base Paymaster Examples",
      preference: "smartWalletOnly",
      version: "4",
    }),
  ],
  transports: {
    [baseSepolia.id]: http(import.meta.env.VITE_RPC_URL),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
