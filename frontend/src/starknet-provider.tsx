import { sepolia, mainnet } from "@starknet-react/chains";
import { StarknetConfig, publicProvider, argent, braavos } from "@starknet-react/core";
import type { ReactNode } from "react";

const chains = [mainnet, sepolia];
const connectors = [braavos(), argent()];

export function StarknetProvider({ children }: { children: ReactNode }) {
  return (
    <StarknetConfig
      chains={chains}
      provider={publicProvider()}
      connectors={connectors}
      autoConnect
    >
      {children}
    </StarknetConfig>
  );
}
