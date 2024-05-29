import { createSmartAccountClient } from "@alchemy/aa-core";
import { baseSepolia } from 'viem/chains';
import { encodeFunctionData } from "viem";
import { sponsorUserOperation, updateUserOpGasFields } from "./paymaster.js";
import { abi } from "./abi.js";
import { account } from "./account.js"
import { extractHashFromError, transport } from "./utils.js"
import config from '../../../config.js';

// Create the smart account for the user
const smartAccountClient = createSmartAccountClient({
    transport: transport,
    chain: baseSepolia,
    account: account,
    gasEstimator: async (struct) => ({
        ...struct,
        callGasLimit: 0n,
        preVerificationGas: 0n,
        verificationGasLimit: 0n,
    }),
    paymasterAndData: {
        paymasterAndData: async (userop, opts) => {
            // request sponsorship
            const paymasterResp = await sponsorUserOperation(userop, opts)
            // replace the gas fields
            const updatedUserOp = await updateUserOpGasFields(userop, paymasterResp)
            return {
                ...updatedUserOp,
                paymasterAndData: paymasterResp.paymasterAndData
            }
        },
        dummyPaymasterAndData: () => "0x",
    },
});
console.log("\x1b[33m%s\x1b[0m", `Minting to ${smartAccountClient.account.address} (Account type: ${config.account_type})`);

// Encode the calldata
const callData = encodeFunctionData({
    abi: abi,
    functionName: config.function_name,
    args: [smartAccountClient.account.address, 0],
});
const contractAddress = config.contract_address;
console.log("Waiting for transaction...")

// Send the sponsored transaction!
const uo = await smartAccountClient.sendUserOperation({
    uo: { target: contractAddress, data: callData, value: BigInt(0) },
    //uo: { target: '0x0000000000000000000000000000000000000000', data: '0x', value: BigInt(0) },
});
try {
    const tx = await smartAccountClient.waitForUserOperationTransaction(uo);
    console.log(tx)
} catch (error) {
    // There's currently an issue with viem not being able to find the transaction hash, but it does exist
    const txHash = extractHashFromError(error.toString())
    console.log("\x1b[32m", `⛽ Successfully sponsored gas for ${config.function_name} transaction with Coinbase Developer Platform!`);
    console.log("\x1b[36m", `🔍 View on Etherscan: https://sepolia.basescan.org/tx/${txHash}`);
}