import { http } from "viem";
import { baseSepolia } from "viem/chains";
import { createBundlerClient } from "viem/account-abstraction";
import { account } from "./account.js";
import config from "../../../config.js";
import { abi } from "./abi.js";
import { client } from "./viem_client.js";

export const bundlerClient = createBundlerClient({
  account,
  client,
  transport: http(config.rpc_url),
  chain: baseSepolia,
});
