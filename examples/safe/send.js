import 'dotenv/config'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { createSmartAccountClient } from "permissionless"
import { toSafeSmartAccount } from "permissionless/accounts"
import { createPimlicoClient } from "permissionless/clients/pimlico"
import { createPublicClient, getContract, http, isAddress, parseEther } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { entryPoint07Address } from "viem/account-abstraction"
import { base } from "viem/chains"

const rpcUrl = process.env.RPC_URL;
const privateKey = process.env.PRIVATE_KEY;
const supportedCurrencies = ['ETH', 'USDC']

const argv = yargs(hideBin(process.argv))
  .option('currency', {
    description: 'Token currency (ETH, USDC, etc)',
    type: 'string',
    demandOption: true,
  })
  .option('from', {
    description: 'Address of your Safe wallet',
    type: 'string',
    demandOption: true,
  })
  .option('to', {
    description: 'Address to send currency to',
    type: 'string',
    demandOption: true,
  })
  .option('amount', {
    description: 'Amount of currency to send',
    type: 'number',
    demandOption: true,
  })
  .check((argv) => {
    if (!isAddress(argv.to)) {
        throw new Error(`Error: "${argv.to}" is not a valid Ethereum address`)
    }
    if (!isAddress(argv.from)) {
        throw new Error(`Error: "${argv.from}" is not a valid Ethereum address`)
    }
    if (!supportedCurrencies.includes(argv.currency.toUpperCase())) {
        throw new Error(`Error: "${argv.currency} is not supported`)
    }
    return true
  })
  .argv

const {currency, to, from, amount} = argv


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

const owner = privateKeyToAccount(privateKey)

const safeAccount = await toSafeSmartAccount({
	client: publicClient,
	entryPoint: {
		address: entryPoint07Address,
		version: "0.7",
	},
	owners: [owner],
	version: "1.4.1",
    address: from
})

const smartAccountClient = createSmartAccountClient({
	account: safeAccount,
	chain: base,
	paymaster: paymasterClient,
	bundlerTransport: http(rpcUrl),
})

console.log(`🚀 Sending ${argv.currency} to address: https://basescan.org/address/${smartAccountClient.account.address}`)

if (currency.toUpperCase() == 'ETH') {
    const amountInWei = amount * 10**18
    const txHash = await smartAccountClient.sendTransaction({
        to: to,
        value: amountInWei,
    })
    console.log(`✅ Eth sent: https://basescan.org/tx/${txHash}`)
}

if (currency.toUpperCase() == 'USDC') {
    // USDC has 6 decimals
    const amountInDecimals = amount * 10**6
    const usdcAddress = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
    const usdcABI = [{
        "name": "transfer",
        "type": "function",
        "inputs": [
            {"name": "to", "type": "address"},
            {"name": "amount", "type": "uint256"}
        ],
        "outputs": [{"type": "bool"}]
    }]

    const txHash = await smartAccountClient.sendTransaction({
        calls: [
            {
                abi: usdcABI,
                functionName: "transfer",
                to: usdcAddress,
                args: [to, amountInDecimals]
            }
        ]
    })

    console.log(`✅ USDC sent: https://basescan.org/tx/${txHash}`)
}


process.exit(0)

