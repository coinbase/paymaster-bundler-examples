## Getting Started

This example uses Alchemy's Account Kit [aa-core](https://accountkit.alchemy.com/packages/aa-core/) to create a [ERC-4337](https://www.erc4337.io/) smart contract account and send a sponsored transaction.

We'll be minting a [Knight Warriors](https://sepolia.basescan.org/token/0x66519fcaee1ed65bc9e0acc25ccd900668d3ed49) NFT on Base Sepolia using Coinbase Cloud's Paymaster & Bundler.

### 1. Setup

Ensure you have the `rpc_url` and `private_key` variables set in the `config.json`.

### 2. Install dependencies
```
yarn
```

### 3. Run the example
```
yarn dev
```