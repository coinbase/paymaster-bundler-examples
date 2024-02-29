# [Coinbase Cloud Paymaster & Bundler Examples](https://github.com/coinbase/paymaster-bundler-examples)

This repo has code examples on how to sponsor a mint for a [Knight Warriors](https://sepolia.basescan.org/token/0x66519fcaee1ed65bc9e0acc25ccd900668d3ed49) NFT on Base Sepolia using Coinbase Cloud's Paymaster & Bundler. If you'd like to see a live demo app sponsoring NFT mints in action, check out ours [here](https://buildonchainapps.xyz/paymaster-bundler).

We currently have examples for the following SDKs, but contributions are always welcome! See [Contributing](https://github.com/coinbase/paymaster-bundler-examples/blob/master/CONTRIBUTING.md) for more details.

- [Alchemy (aa-core)](https://github.com/coinbase/paymaster-bundler-examples/tree/master/examples/alchemy)
- [Pimlico (permissionless.js)](https://github.com/coinbase/paymaster-bundler-examples/tree/master/examples/pimlico)

## Getting Started

Prerequisites: you'll need to have [node](https://nodejs.org/en) and [yarn](https://yarnpkg.com/) installed.

### 1. Clone this repo locally

```
git clone https://github.com/coinbase/paymaster-bundler-examples.git
```

### 2. Set up environment variables

- ### Create your Base Node RPC URL

  - Navigate to https://coinbase.com/cloud/products/base/rpc
  - Sign up for a Coinbase Cloud account, if you don't have one already
  - Create a project, and select **Base Sepolia**
  - Click "**Activate**" on the Paymaster & Bundler modal
  - Copy your RPC endpoint, and paste it into `config.json` as the `rpc_url` variable.

- ### Add a signer
  You'll need to add a private key to initialize and sign for your [ERC-4337](https://www.erc4337.io/) smart contract account.
  - Since the NFT mint is free and gas will be sponsored by our Paymaster, you can use a new account without any funds.
  - You can create a new private key with [Foundry](https://book.getfoundry.sh/reference/cast/cast-wallet-new)
    - To install Foundry, run `curl -L https://foundry.paradigm.xyz | bash`
    - To generate a new key pair, run `cast wallet new`
  - Copy your private key, and paste it into `config.json` as the `private_key` variable

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
 ⛽ Successfully sponsored gas for mintTo transaction with Coinbase Cloud!
 🔍 View on Etherscan: https://sepolia.basescan.org/tx/0xe51e9bf6fea0dfecfcbf7168bcc7da2c833ad0dcac5651940953a89857674885
✨  Done in 5.66s.
```

### 7. Play around with our demo app
If you'd like to see an example of an app sponsoring NFT mints in action, check out our demo app [here](https://buildonchainapps.xyz/paymaster-bundler).
