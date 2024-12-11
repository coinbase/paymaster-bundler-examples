import dotenv from 'dotenv'

// Updating path due to being executed in the examples/x directory
dotenv.config({ path: '../../.env' })

export default {
    "rpc_url": process.env.RPC_URL,
    "private_key": process.env.PRIVATE_KEY,
    "account_type": process.env.ACCOUNT_TYPE || 'simple',
    "contract_address": "0x7d662A03CC7f493D447EB8b499cF4533f5B640E2",
    "function_name": "click",
    "entry_point": "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
    "entry_point_version": "0.7"
}