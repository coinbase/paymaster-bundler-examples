import { bundlerClient } from "./paymaster.js";
import { account } from "./account.js";
import { abi } from "./abi.js";
import config from "../../../config.js";
const nftContractAddress = config.contract_address;

account.userOperation = {
  estimateGas: async (userOperation) => {
    const estimate = await bundlerClient.estimateUserOperationGas(
      userOperation
    );
    estimate.preVerificationGas = estimate.preVerificationGas * 2n;
    return estimate;
  },
};

try {
  const userOpHash = await bundlerClient.sendUserOperation({
    account,
    calls: [
      {
        abi: abi,
        functionName: "mintTo",
        to: nftContractAddress,
        args: [account.address, 1],
      },
    ],
    paymaster: true,
  });

  const receipt = await bundlerClient.waitForUserOperationReceipt({
    hash: userOpHash,
  });

  console.log("✅ Transaction successfully sponsored!");
  console.log(
    `⛽ View sponsored UserOperation on blockscout: https://base-sepolia.blockscout.com/op/${receipt.userOpHash}`
  );
  console.log(
    `🔍 View NFT mint on basescan: https://sepolia.basescan.org/address/${account.address}`
  );
  process.exit();
} catch (error) {
  console.log("Error sending trasnaction: ", error);
  process.exit(1);
}
