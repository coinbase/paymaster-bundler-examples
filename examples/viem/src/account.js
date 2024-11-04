import { toCoinbaseSmartAccount } from "viem/account-abstraction";
import { privateKeyToAccount } from "viem/accounts";
import { client } from "./viem_client.js ";
import config from "../../../config.js";

const owner = privateKeyToAccount(config.private_key);
export const account = await toCoinbaseSmartAccount({
  client,
  owners: [owner],
});
