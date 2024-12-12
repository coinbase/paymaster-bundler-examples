import { createKernelAccount, createKernelAccountClient } from "@zerodev/sdk"
import { KERNEL_V3_1, getEntryPoint } from "@zerodev/sdk/constants"
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator"
import { createPimlicoClient } from "permissionless/clients/pimlico"
import { http, createPublicClient, encodeFunctionData } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { baseSepolia } from "viem/chains"
import { abi } from "./abi.js"
import config from '../../../config.js';


const transport = http(config.rpc_url)
const entryPoint = getEntryPoint(config.entry_point_version)
const privateKey = config.private_key
const chain = baseSepolia
const kernelVersion = KERNEL_V3_1

// Create public client
const publicClient = createPublicClient({
    transport,
    chain
});

// Create signer and validator
const signer = privateKeyToAccount(privateKey)
const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer,
    entryPoint,
    kernelVersion
})

// Create a Kernel account
const account = await createKernelAccount(publicClient, {
    plugins: {
        sudo: ecdsaValidator,
    },
    entryPoint,
    kernelVersion,
})

// Create a paymaster client
const cloudPaymaster = createPimlicoClient({
    transport,
    chain,
    entryPoint: {
      address: config.entry_point,
      version: config.entry_point_version,
    },
})

// Construct a Kernel account client
const kernelClient = createKernelAccountClient({
    account,
    chain,
    bundlerTransport: transport,
    paymaster: cloudPaymaster
})

const accountAddress = kernelClient.account.address
console.log("My account:", accountAddress)

// Send a UserOp
const userOpHash = await kernelClient.sendUserOperation({
    callData: await kernelClient.account.encodeCalls([{
        to: config.contract_address,
        value: BigInt(0),
        data: encodeFunctionData({
            abi,
            functionName: config.function_name,
            args: [account.address, 0],
        }),
    }]),
})

console.log("UserOp hash:", userOpHash)
console.log("Waiting for UserOp to complete...")

await kernelClient.waitForUserOperationReceipt({
  hash: userOpHash,
})

console.log("View completed UserOp here: https://jiffyscan.xyz/userOpHash/" + userOpHash)