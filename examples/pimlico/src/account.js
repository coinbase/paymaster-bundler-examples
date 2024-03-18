
import { privateKeyToSimpleSmartAccount, signerToSafeSmartAccount, signerToEcdsaKernelSmartAccount } from "permissionless/accounts"
import { privateKeyToAccount } from "viem/accounts"
import { http, createPublicClient } from 'viem'
import config from '../../../config.js';

const publicClient = createPublicClient({
    transport: http(config.rpc_url),
});

// To customize the signer, see https://docs.pimlico.io/permissionless/reference/accounts/signerToSimpleSmartAccount
const signer = privateKeyToAccount(config.private_key)

// To use a different account, see https://docs.pimlico.io/permissionless/how-to/accounts/use-simple-account
export const getAccount = async (type) => {
    switch (type) {
        case "simple":
            // EOA signer (private key) and Simple Account
            const simpleAccount = await privateKeyToSimpleSmartAccount(publicClient, {
                privateKey: config.private_key,
                factoryAddress: "0x9406Cc6185a346906296840746125a0E44976454",
                entryPoint: config.entry_point,
            })
            return simpleAccount
        case "safe":
            // EOA signer (private key) and Safe
            const safeAccount = await signerToSafeSmartAccount(publicClient, {
                entryPoint: config.entry_point,
                signer: signer,
                safeVersion: "1.4.1",
                // index: 0n, // optional
                // address: "0x...", // optional, only if you are using an already created account
            })
            return safeAccount
        case "kernel":
             // EOA signer (private key) and Kernel
            const kernelAccount = await signerToEcdsaKernelSmartAccount(publicClient, {
                entryPoint: config.entry_point,
                signer: signer,
                // index: 0n, // optional
                // address: "0x...", // optional, only if you are using an already created account
            })
            return kernelAccount
        default:
            throw new Error("Invalid account type in config.json")
    }
}