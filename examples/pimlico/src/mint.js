import { encodeFunctionData, http } from 'viem'
import { sepolia } from 'viem/chains'
import { createSmartAccountClient } from 'permissionless'
import { createPimlicoPaymasterClient } from "permissionless/clients/pimlico.js";
import { simpleAccount } from './account.js';
import { abi } from './abi.js';
import config from '../config.json' with { type: 'json' };

// Get yours at https://www.coinbase.com/cloud/products/base/rpc
const rpcUrl = config.rpc_url
const contractAddress = config.contract_address;

console.log("\x1b[33m%s\x1b[0m", `Minting to ${simpleAccount.address}`);

// Create the Cloud Paymaster
const cloudPaymaster = createPimlicoPaymasterClient({
    chain: sepolia,
    transport: http(rpcUrl)
})

// Create the smart account for the user
const smartAccountClient = createSmartAccountClient({
    account: simpleAccount,
    chain: sepolia,
    transport: http(rpcUrl),
    // IMPORTANT: Set up the Cloud Paymaster to sponsor your transaction
    sponsorUserOperation: cloudPaymaster.sponsorUserOperation,
});

// Encode the calldata
const callData = encodeFunctionData({
    abi: abi,
    functionName: config.function_name,
    args: [smartAccountClient.account.address, 0],
});

let ms = 0;
let timer = setInterval(() => {
    ms++;
}, 1);

console.log("Waiting for transaction...")

// Send the sponsored transaction!
const txHash = await smartAccountClient.sendTransaction({
    account: smartAccountClient.account,
    to: contractAddress,
    data: callData,
    value: BigInt(0),
});
clearInterval(timer);

console.log("\x1b[32m", `✨ Done in ${(ms / 1000).toFixed(2)}s.`);
console.log("\x1b[36m", `🔍 View on Etherscan: https://sepolia.basescan.org/tx/${txHash}`);