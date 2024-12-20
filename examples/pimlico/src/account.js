
import { toSimpleSmartAccount, toSafeSmartAccount, toEcdsaKernelSmartAccount } from "permissionless/accounts"
import { privateKeyToAccount } from "viem/accounts"
import { http, createPublicClient } from 'viem'
import config from '../../../config.js';
import { baseSepolia } from "viem/chains";

const client = createPublicClient({
    chain: baseSepolia,
    transport: http(config.rpc_url),
});

// To customize the signer, see https://docs.pimlico.io/permissionless/reference/accounts/signerToSimpleSmartAccount
const owner = privateKeyToAccount(config.private_key)

// To use a different account, see https://docs.pimlico.io/permissionless/how-to/accounts/use-simple-account
export const getAccount = async (type) => {
    switch (type) {
        case "simple":
            // EOA signer (private key) and Simple Account
            const simpleAccount = await toSimpleSmartAccount({
                owner,
                client,
                entryPoint: {
                    address: config.entry_point,
                    version: config.entry_point_version,
                },
            })
            return simpleAccount
        case "safe":
            // EOA signer (private key) and Safe
            const safeAccount = await toSafeSmartAccount({
                owners: [owner],
                client,
                entryPoint: {
                    address: config.entry_point,
                    version: config.entry_point_version
                },
                version: "1.4.1",
                // index: 0n, // optional
                // address: "0x...", // optional, only if you are using an already created account
            })
            return safeAccount
        case "kernel":
             // EOA signer (private key) and Kernel
            const kernelAccount = await toEcdsaKernelSmartAccount({
                owners: [owner],
                client,
                entryPoint: {
                    address: config.entry_point,
                    version: config.entry_point_version
                },
                // index: 0n, // optional
                // address: "0x...", // optional, only if you are using an already created account
            })
            return kernelAccount
        default:
            throw new Error("Invalid account type in config.json")
    }
}