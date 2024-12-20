import 'dotenv/config'
import { createSmartAccountClient } from "permissionless"
import { toSafeSmartAccount } from "permissionless/accounts"
import { createPimlicoClient } from "permissionless/clients/pimlico"
import { createPublicClient, getContract, http, parseEther } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { entryPoint07Address } from "viem/account-abstraction"
import { base } from "viem/chains"

const rpcUrl = process.env.RPC_URL;
const privateKey = process.env.PRIVATE_KEY;

export const publicClient = createPublicClient({
	chain: base,
	transport: http(rpcUrl),
})
 
export const paymasterClient = createPimlicoClient({
	transport: http(rpcUrl),
	entryPoint: {
		address: entryPoint07Address,
		version: "0.7",
	},
})

// The private key signer of your Safe wallet. Generate a new one using "cast wallet new"
const owner = privateKeyToAccount(privateKey)

const safeAccount = await toSafeSmartAccount({
	client: publicClient,
	entryPoint: {
		address: entryPoint07Address,
		version: "0.7",
	},
	owners: [owner],
	version: "1.4.1",
})

const smartAccountClient = createSmartAccountClient({
	account: safeAccount,
	chain: base,
	paymaster: paymasterClient,
	bundlerTransport: http(rpcUrl),
})

console.log(`🚀 Deploying your new Safe wallet to address: https://basescan.org/address/${smartAccountClient.account.address}`)

// This is a new wallet with nothing to send, so it just needs some dummy transaction data
const txHash = await smartAccountClient.sendTransaction({
	to: "0x0000000000000000000000000000000000000000",
	value: 0n,
	data: "0x0",
})

console.log(`✅ Wallet deploy completed: https://basescan.org/tx/${txHash}`)
process.exit(0)