import { createKernelAccountClient } from "@zerodev/sdk"
import { baseSepolia } from "viem/chains"
import { account, transport } from "./account.js";
import { encodeFunctionData } from "viem"
import { abi } from "./abi.js"
import { cloudPaymaster } from "./paymaster.js";
import config from '../../../config.json' assert { type: 'json' }; 

// Construct a Kernel account client
const kernelClient = createKernelAccountClient({
    account,
    chain: baseSepolia,
    transport,
    sponsorUserOperation: async ({ userOperation }) => {
      console.log("Sponsoring user operation", userOperation)
      return cloudPaymaster.sponsorUserOperation({
        userOperation,
        entryPoint: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789"
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

console.log("\x1b[32m", `⛽ Successfully sponsored gas for ${config.function_name} transaction with Coinbase Cloud!`);
console.log("\x1b[36m", `🔍 View on Etherscan: https://sepolia.basescan.org/tx/${txHash}`);