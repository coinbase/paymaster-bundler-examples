# [Coinbase Developer Platform Paymaster & Bundler Examples](https://github.com/coinbase/paymaster-bundler-examples)

✨ Looking for frontend examples? Be sure to check out our **[Wagmi](https://github.com/coinbase/paymaster-bundler-examples/tree/master/examples/wagmi)** example for inspiration and guidance! ✨

This repo has code examples on how to sponsor a mint for a [Knight Warriors](https://sepolia.basescan.org/token/0x66519fcaee1ed65bc9e0acc25ccd900668d3ed49) NFT on Base Sepolia using Coinbase Developer Platform's Paymaster & Bundler. If you'd like to see a live demo app sponsoring NFT mints in action, check out ours [here](https://paymaster-demo-app.vercel.app/).

We currently have examples for the following SDKs, but contributions are always welcome! See [Contributing](https://github.com/coinbase/paymaster-bundler-examples/blob/master/CONTRIBUTING.md) for more details.

### Supported SDKs

- [Alchemy (aa-core)](https://github.com/coinbase/paymaster-bundler-examples/tree/master/examples/alchemy)
- [Pimlico (permissionless.js)](https://github.com/coinbase/paymaster-bundler-examples/tree/master/examples/pimlico)
- [ZeroDev (@zerodev/sdk)](https://github.com/coinbase/paymaster-bundler-examples/tree/master/examples/zerodev)
- [Wagmi (wevm/wagmi)](https://github.com/coinbase/paymaster-bundler-examples/tree/master/examples/wagmi)
- [Viem](https://github.com/coinbase/paymaster-bundler-examples/tree/master/examples/viem)

### Supported Account Types

- [SimpleAccount](https://github.com/eth-infinitism/account-abstraction/blob/develop/contracts/samples/SimpleAccount.sol) (default)
- [Safe](https://safe.global/)
- [Kernel](https://github.com/zerodevapp/kernel)
- [Coinbase Smart Account](https://github.com/coinbase/smart-wallet)

### Compatibility

| SDK               | Simple | Safe | Kernel | Coinbase |
| ----------------- | ------ | ---- | ------ | -------- |
| aa-core           | ✅     | ❌   | ❌     | ❌       |
| permissionless.js | ✅     | ✅   | ✅     | ✅       |
| @zerodev/sdk      | ❌     | ❌   | ✅     | ❌       |
| wevm/wagmi        | ❌     | ✅   | ❌     | ✅       |
| viem              | ✅     | ✅   | ✅     | ✅       |

## Getting Started

Prerequisites: you'll need to have [node](https://nodejs.org/en) and [yarn](https://yarnpkg.com/) installed.

### 1. Clone this repo locally

```
git clone https://github.com/coinbase/paymaster-bundler-examples.git
```

### 2. Set up environment variables

- ### Copy the env example

```
cp .env.example .env
```

- ### Install dotenv

```
yarn
```

- This will setup dotenv to load the env file for private values

- ### Get your Node RPC URL

  - Navigate to https://www.coinbase.com/developer-platform/products/base-node
  - Sign up for a Coinbase Developer Platform account, if you don't have one already.
  - Under the **Build Onchain** section in the Portal, select **Node**
  - In the dropdown on the top right of **Configuration**, select **Base Testnet (Sepolia)**
  - Copy your RPC endpoint, and paste it into `.env` as the `RPC_URL` variable.
    - The RPC URL should look like `https://api.developer.coinbase.com/rpc/v1/base-sepolia/<api_key>`

- ### Add a signer

  You'll need to add a private key to initialize and sign for your [ERC-4337](https://www.erc4337.io/) smart contract account

  - Since the NFT mint is free and gas will be sponsored by our Paymaster, you can use a new account without any funds
  - You can create a new private key with [Foundry](https://book.getfoundry.sh/reference/cast/cast-wallet-new)
    - To install Foundry, run `curl -L https://foundry.paradigm.xyz | bash`
    - To generate a new key pair, run `cast wallet new`
  - Copy your private key, and paste it into `.env` as the `PRIVATE_KEY` variable

- ### Optional: configure the smart account for Pimlico

  - If you're using Pimlico, you can use a different smart account type by changing the `account_type` variable in `.env`
    - Valid values: `simple`, `safe`, `kernel`
    - [pimlico/src/account.js](https://github.com/coinbase/paymaster-bundler-examples/blob/master/examples/pimlico/src/account.js) is a code example on how to configure a different smart account for SDKs that support this feature

### 3. Navigate to the directory of the SDK you want to run the example with.

Example for Alchemy

```
cd examples/alchemy
```

### 4. Install the dependencies with yarn

```
yarn
```

### 5. Run the example

```
yarn dev
```

### 6. See your sponsored transaction live!

You should receive an Etherscan link with your sponsored transaction in the terminal output. [Example](https://sepolia.basescan.org/tx/0xe51e9bf6fea0dfecfcbf7168bcc7da2c833ad0dcac5651940953a89857674885)

```
Minting to 0xF19CEA17462220437000F459f721e3e393bd1fc9
Waiting for transaction...
 ⛽ Successfully sponsored gas for mintTo transaction with Coinbase Developer Platform!
 🔍 View on Etherscan: https://sepolia.basescan.org/tx/0xe51e9bf6fea0dfecfcbf7168bcc7da2c833ad0dcac5651940953a89857674885
✨  Done in 5.66s.
```

### 7. Play around with our demo app

If you'd like to see an example of an app sponsoring NFT mints in action, check out our demo app [here](https://paymaster-demo-app.vercel.app/).
