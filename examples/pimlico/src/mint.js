import { encodeFunctionData, http } from 'viem'
import { baseSepolia } from 'viem/chains'
import { createSmartAccountClient } from 'permissionless'
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { getAccount } from './account.js';
import { abi } from './abi.js';
import config from '../../../config.js';

// Get yours at https://www.coinbase.com/cloud/products/base/rpc
const rpcUrl = config.rpc_url
const contractAddress = config.contract_address;

// Create the Cloud Paymaster
const cloudPaymaster = createPimlicoClient({
    chain: baseSepolia,
    transport: http(rpcUrl)
})

// Get the account
const account = await getAccount(config.account_type).catch((error) => {
    console.error("\x1b[31m", `❌ ${error.message}`);
    process.exit(1);
});

// Create the smart account for the user
const smartAccountClient = createSmartAccountClient({
    account,
    chain: baseSepolia,
    bundlerTransport: http(rpcUrl),
    // IMPORTANT: Set up the Cloud Paymaster to sponsor your transaction
    paymaster: cloudPaymaster
});

// Encode the calldata
const callData = encodeFunctionData({
    abi: abi,
    functionName: config.function_name,
    args: [smartAccountClient.account.address, 0],
});
console.log("\x1b[33m%s\x1b[0m", `Minting to ${account.address} (Account type: ${config.account_type})`);
console.log("Waiting for transaction...")

// Send the sponsored transaction!
const txHash = await smartAccountClient.sendTransaction({
    account: smartAccountClient.account,
    to: contractAddress,
    data: callData,
    value: BigInt(0),
});

console.log("\x1b[32m", `⛽ Successfully sponsored gas for ${config.function_name} transaction with Coinbase Developer Platform!`);
console.log("\x1b[36m", `🔍 View on Etherscan: https://sepolia.basescan.org/tx/${txHash}`);
process.exit(0)