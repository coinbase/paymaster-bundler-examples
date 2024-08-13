import { createKernelAccountClient } from "@zerodev/sdk"
import { baseSepolia } from "viem/chains"
import { account, transport } from "./account.js";
import { encodeFunctionData } from "viem"
import { abi } from "./abi.js"
import { cloudPaymaster } from "./paymaster.js";
import config from '../../../config.js'; 

// Construct a Kernel account client
const kernelClient = createKernelAccountClient({
    account,
    chain: baseSepolia,
    transport,
    sponsorUserOperation: async ({ userOperation }) => {
      return cloudPaymaster.sponsorUserOperation({
        userOperation,
        entryPoint: config.entry_point
      })
    },
  })

console.log("\x1b[33m%s\x1b[0m", `Minting to ${account.address} (Account type: ${config.account_type})`);
console.log("Waiting for transaction...")

// Send the sponsored transaction!
const txHash = await kernelClient.sendTransaction({
  to: config.contract_address,
  value: BigInt(0),
  data: encodeFunctionData({
    abi,
    functionName: config.function_name,
    args: [account.address, 0],
  }),
})

console.log("\x1b[32m", `⛽ Successfully sponsored gas for ${config.function_name} transaction with Coinbase Developer Platform!`);
console.log("\x1b[36m", `🔍 View on Etherscan: https://sepolia.basescan.org/tx/${txHash}`);