
import { privateKeyToSimpleSmartAccount } from "permissionless/accounts"
import { http, createPublicClient } from 'viem'
import config from '../../../config.json' assert { type: 'json' };

const publicClient = createPublicClient({
    transport: http(config.rpc_url),
});

// We use an EOA signer (private key) and a Simple Account for this example.
// To customize the signer, see https://docs.pimlico.io/permissionless/reference/accounts/signerToSimpleSmartAccount
// To use a different account, see https://docs.pimlico.io/permissionless/how-to/accounts/use-simple-account
export const simpleAccount = await privateKeyToSimpleSmartAccount(publicClient, {
    privateKey: config.private_key,
    factoryAddress: "0x9406Cc6185a346906296840746125a0E44976454",
    entryPoint: config.entry_point,
})