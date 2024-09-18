import { http, createPublicClient, parseAbi } from 'viem'
import { baseSepolia } from 'viem/chains'
import { createSmartAccountClient } from 'permissionless'
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { getAccount } from './account.js';
import { abi } from './abi.js';
import config from '../../../config.js';
// Get yours at https://www.coinbase.com/developer-platform/products/paymaster
const rpcUrl = config.rpc_url
const contractAddress = config.contract_address;
const usdcAddress = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
const paymasterAddress = "0xf58a1ae03da9bcf16c2729ce22cebcf96da1046e"
const supportsERC20 = false; // enable to do ERC20 approval checks

export const cdpPaymasterBundler = createPimlicoClient({
    chain: baseSepolia,
    transport: http(rpcUrl)
})

// Standard RPC client 
const publicClient = createPublicClient({
	chain: baseSepolia,
	transport: http(rpcUrl),
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
    userOperation: {
		estimateFeesPerGas: async () => {
            // Can set up higher prio fees using viem's chain configurations 
            const gas = await publicClient.estimateFeesPerGas()
			return gas;
		},
	},
    paymaster: {
        async getPaymasterStubData(parameters) {
            const paymasterAndDataStub  = await cdpPaymasterBundler.paymaster.getPaymasterStubData(parameters)
			return {
				paymasterAndData : paymasterAndDataStub
			}
		},
		async getPaymasterAndData(parameters) {
			const gasEstimates = await cdpPaymasterBundler.estimateUserOperationGas({
				...parameters
			})

            // update PVG 
            gasEstimates.preVerificationGas = gasEstimates.preVerificationGas * 2
            
            // Update the userOp with our gas fields 
            updatedParams = {...parameters}
            updatedParams[0] = {...updatedParams[0], 
                preVerificationGas: gasEstimates.preVerificationGas,
                verificationGasLimit: gasEstimates.verificationGasLimit,
                callGasLimit: gasEstimates.callGasLimit
            }
            
            // get the final payMasterAndData fields 
            const paymasterAndData = await cdpPaymasterBundler.paymaster.getPaymasterAndData(updatedParams)

            // Pimlico requires return that includes the gas estimate updates 
			return {
				paymasterAndData: paymasterAndData,
                preVerificationGas: gasEstimates.preVerificationGas,
                verificationGasLimit: gasEstimates.verificationGasLimit,
                callGasLimit: gasEstimates.callGasLimit
			}
		},
	},
});

// Prepare nft mint call
const calls = [
    {
        to: contractAddress,
        abi: abi,
        functionName: config.function_name,
        args: [smartAccountClient.account.address, 0],
    },
]

// Optional: Check sender USDC balance for erc20 payments
if (supportsERC20) {
    const senderPaymasterUSDCApprovalAmount = await publicClient.readContract({
        abi: parseAbi(["function allowance(address owner, address spender) returns (uint256)"]),
        address: usdcAddress,
        functionName: "allowance",
        args: [account.address, paymasterAddress],
    })

    // If under $5 add new approval (mainnet can be much lower than 5$ but there can be gas spikes on Sepolia)
    console.log("Sender has approved paymaster to spend: " + senderPaymasterUSDCApprovalAmount + " USDC ");
    if (senderPaymasterUSDCApprovalAmount < 5_000_000n) {
        console.log("Including new paymaster USDC approval in calls.")
        calls.push({
            to: usdcAddress,
            abi: parseAbi(["function approve(address,uint)"]),
            functionName: "approve",
            args: [paymasterAddress, 10_000_000], // approve $10 USDC (~1000tx)
        })
    }
}

console.log("\x1b[33m%s\x1b[0m", `Minting to ${account.address} (Account type: ${config.account_type})`);
console.log("Waiting for transaction...")

// Send the sponsored transaction!
const txHash = await smartAccountClient.sendTransaction({
    calls
});

console.log("\x1b[32m", `⛽ Successfully sponsored gas for ${config.function_name} transaction with Coinbase Developer Platform!`);
console.log("\x1b[36m", `🔍 View on Etherscan: https://sepolia.basescan.org/tx/${txHash}`);
process.exit(0);