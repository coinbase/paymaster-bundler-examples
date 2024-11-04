import { useAccount } from "wagmi";
import { useCapabilities, useWriteContracts } from "wagmi/experimental";
import { useMemo } from "react";
import { abi } from "../abi.js";
import { useState } from "react";

export default function MintButton() {
  const account = useAccount();
  const [success, setSuccess] = useState(false);

  const { writeContracts } = useWriteContracts({
    mutation: {
      onSuccess: () => {
        setSuccess(true);
      },
    },
  });
  const { data: availableCapabilities } = useCapabilities({
    account: account.address,
  });

  const capabilities = useMemo(() => {
    if (!availableCapabilities || !account.chainId) return {};
    const capabilitiesForChain = availableCapabilities[account.chainId];
    if (
      capabilitiesForChain["paymasterService"] &&
      capabilitiesForChain["paymasterService"].supported
    ) {
      return {
        paymasterService: {
          url: import.meta.env.VITE_RPC_URL,
        },
      };
    }
    return {};
  }, [availableCapabilities, account.chainId]);
  return (
    <button
      style={{ width: "100px", borderRadius: "10px", background: "gray" }}
      onClick={() => {
        writeContracts({
          contracts: [
            {
              address: import.meta.env.VITE_CONTRACT_ADDRESS as `0x${string}`,
              abi: abi,
              functionName: "mintTo",
              args: [account.address, 1],
            },
          ],
          capabilities,
        });
      }}
      disabled={success}
    >
      {success ? "Minted!" : "Mint"}
    </button>
  );
}
