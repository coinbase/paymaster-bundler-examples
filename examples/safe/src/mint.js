import { encodeFunctionData } from 'viem'
import config from '../../../config.js'
import { abi } from './abi.js'
import { account, safeAddress } from './account.js'
 
// Encode the calldata
const callData = encodeFunctionData({
  abi: abi,
  functionName: config.function_name,
  args: [safeAddress, 0]
})

// Build the transaction
const transactions = [{
  to: config.contract_address,
  value: 0n,
  data: callData
}]

// Create the Safe Operation
const safeOperation = await account.createTransaction({
  transactions
})

// Sign the Safe Operation
const signedSafeOperation = await account.signSafeOperation(safeOperation)

console.log("\x1b[33m%s\x1b[0m", `Minting to ${safeAddress} (Account type: Safe)`)
console.log("Waiting for transaction...")

// Execute the Safe Operation
const txHash = await account.executeTransaction({
  executable: signedSafeOperation
})

console.log("\x1b[32m", `⛽ Successfully sponsored gas for ${config.function_name} transaction with Coinbase Cloud!`)
console.log("\x1b[36m", `🔍 View on Etherscan: https://sepolia.basescan.org/tx/${txHash}`)
