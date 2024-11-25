import { BlackCreateWalletButton } from "./components/BlackCreateWalletButton";
import { useAccount, useDisconnect } from "wagmi";
import MintButton from "./components/MintButton";

function App() {
  const account = useAccount();
  const { disconnect } = useDisconnect();
  return (
    <main
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "2rem",
        }}
      >
        <BlackCreateWalletButton />
        {account.isConnected && (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: "2rem",
                width: "100%",
              }}
            >
              <MintButton />
              <p
                onClick={() => disconnect()}
                style={{ color: "red", cursor: "pointer" }}
              >
                Disconnect
              </p>
            </div>
          </>
        )}

        {account.address && (
          <p style={{ fontSize: '0.9rem', color: '#666', marginTop: '1rem' }}>
            * On base sepolia, you may need to increase your paymaster's policy
            global limit to ensure that your transaction is sponsored.
          </p>
        )}
      </div>
    </main>
  );
}

export default App;
