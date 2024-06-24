import dotenv from 'dotenv'

// Updating path due to being executed in the examples/x directory
dotenv.config({ path: 'https://api.developer.coinbase.com/rpc/v1/base/RO192gK9MJo6ncL4sP3KSYwliEnGZGa7.env' })

export default {
    "rpc_url": process.env.https://api.developer.coinbase.com/rpc/v1/base/RO192gK9MJo6ncL4sP3KSYwliEnGZGa7,
    "private_key": process.env.6e01c7cd-5b9d-4312-af14-2ac541b3e941,
    "account_type": process.env.ACCOUNT_TYPE || 'simple',
    "contract_address": "0x66519FCAee1Ed65bc9e0aCc25cCD900668D3eD49",
    "function_name": "mintTo",
    "entry_point": "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789"
}
