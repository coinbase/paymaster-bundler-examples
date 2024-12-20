# Sponsored transactions with Safe wallet

The code example in send.js shows you how to send eth from your Safe wallet to any address completely gasless using the Coinbase Developer Platform.

## Prerequisites

1. Create a Coinbase Developer Platform (CDP) account - https://portal.cdp.coinbase.com/
2. Fetch your RPC URL from Onchain Tools -> Paymaster -> Configuration. RPC URL should look something like `https://api.developer.coinbase.com/rpc/v1/base/<some_token_id>`
3. Have a Safe wallet (must be version 1.4.1+) - https://app.safe.global/


## Deploying a new Safe wallet

Unfortunately the Safe wallet UI does not allow you to create a wallet with the ability to have sponsored gas. Instead you'll need to create the wallet from the command line.

1. Generate a new private key
```
cast wallet new
```

2. Update .env file
```
RPC_URL='https://api.developer.coinbase.com/rpc/v1/base/<some_token_id>'
PRIVATE_KEY='0xabcd1123........'
```

3. Run deployment script
```
node deploy.js
```

Note - you didn't need to pay gas for this wallet deployment! The CDP paymaster also sponsors the wallet creation.


4. (Optional) Add the newly deployed wallet to your Safe wallet UI (using Add Existing Safe Account). You have both the Safe wallet address and private key signer of the newly deployed Safe wallet.


## Configure an existing Safe wallet

If you already have an existing Safe wallet, you'll need to configure it to add the ERC-4337 module and fallback. You can read more [about it here.](https://docs.safe.global/advanced/erc-4337/4337-safe)

1. Add a private key signer to your Safe wallet (you can skip this step if you already have a private key signer).
2. Add the ERC-4337 module
    - Apps -> Transaction Builder -> New Transaction
    - Address: `0x29fcB43b46531BcA003ddC8FCB67FFE91900C762` (this is actually just used to autofill the ABI for you)
    - ABI: (let it auto fill)
    - To Address: your Safe wallet address
    - Contract Method Selector: `enableModule`
    - Module: `0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226`
3. Add the ERC-4337 fallback
    - Apps -> Transaction Builder -> New Transaction
    - Address: `0x29fcB43b46531BcA003ddC8FCB67FFE91900C762` (this is actually just used to autofill the ABI for you)
    - ABI: (let it auto fill)
    - To Address: your Safe wallet address
    - Contract Method Selector: `setFallBackHandler`
    - Handler: `0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226`

Note - You can batch these two transactions together

Finally, update your .env file in this directory
```
RPC_URL='https://api.developer.coinbase.com/rpc/v1/base/<some_token_id>'
PRIVATE_KEY='0xabcd1123........'
```

## Profit!

Next time you need to send eth, usdc, or make any other contract call, you can do it completely gasless using

```
node send.js --currency USDC --from <yourSafeWalletAddress> --to <yourDestination> --amount <amount>
```

By default the code in send.js just does a simple eth transfer. You'll have to edit it to suit your needs.