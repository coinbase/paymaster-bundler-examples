import { createPimlicoPaymasterClient } from "permissionless/clients/pimlico"
import { baseSepolia } from "viem/chains"
import { transport } from "./account.js";

// Create the Cloud Paymaster
export const cloudPaymaster = createPimlicoPaymasterClient({
    chain: baseSepolia,
    transport
})