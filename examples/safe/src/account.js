import { Safe4337Pack } from '@safe-global/relay-kit'
import { privateKeyToAccount } from 'viem/accounts'
import config from '../../../config.js'

// To deploy a new Safe Smart Account
const signer = privateKeyToAccount(config.private_key)
const safeAccountOptions = {
  owners: [signer.address],
  threshold: 1
}

// To use a Safe Smart Account that already exists
// const safeAccountOptions = {
//   safeAddress: '0x...'
// }

export const account = await Safe4337Pack.init({
  provider: config.rpc_url,
  signer: config.private_key,
  rpcUrl: config.rpc_url,
  bundlerUrl: config.rpc_url,
  options: safeAccountOptions,
  paymasterOptions: {
    isSponsored: true,
    paymasterAddress: '0xc484bcd10ab8ad132843872deb1a0adc1473189c' // Sepolia
  }
})

export const safeAddress = await account.protocolKit.getAddress()

const isSafeDeployed = await account.protocolKit.isSafeDeployed()
