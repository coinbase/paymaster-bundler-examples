import { createKernelAccount } from "@zerodev/sdk"
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator"
import { privateKeyToAccount } from "viem/accounts"
import { http, createPublicClient } from 'viem'
import config from '../../../config.js'; 

export const transport = http(config.rpc_url)

const publicClient = createPublicClient({
  transport,
});
 
const signer = privateKeyToAccount(config.private_key)

const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer,
  })

export const account = await createKernelAccount(publicClient, {
  plugins: {
    sudo: ecdsaValidator,
  },
})