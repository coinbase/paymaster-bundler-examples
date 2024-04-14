import dotenv from 'dotenv'

// Updating path due to being executed in the examples/x directory
dotenv.config({ path: '../../.env' })

export default {
    "rpc_url": process.env.RPC_URL,
    "private_key": process.env.PRIVATE_KEY,
    "account_type": process.env.ACCOUNT_TYPE || 'simple',
    "contract_address": "0x49345182D578B1b3c7Ed4B2e6eCD8Aef63DD2CA3",
    "function_name": "mintTo",
    "entry_point": "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789"
}
