#!/bin/bash
# Fission Protocol - Starknet Deployment Script
# Usage: ./deploy.sh [mainnet|sepolia]

set -e

NETWORK=${1:-sepolia}

if [ "$NETWORK" = "mainnet" ]; then
    export STARKNET_RPC="https://starknet-mainnet.public.blastapi.io"
    echo "🚀 Deploying to MAINNET"
elif [ "$NETWORK" = "sepolia" ]; then
    export STARKNET_RPC="https://starknet-sepolia.public.blastapi.io/rpc/v0_7"
    echo "🧪 Deploying to SEPOLIA TESTNET"
else
    echo "Usage: ./deploy.sh [mainnet|sepolia]"
    exit 1
fi

echo ""
echo "📦 Building contracts..."
cd contracts
scarb build
echo "✅ Build complete"

echo ""
echo "📝 Declaring contracts..."

# Declare all contracts and capture class hashes
SY_HASH=$(starkli declare target/dev/fission_protocol_StandardizedYield.contract_class.json 2>&1 | grep "Class hash declared:" | awk '{print $4}')
echo "  SY class hash: $SY_HASH"

CORE_HASH=$(starkli declare target/dev/fission_protocol_FissionCore.contract_class.json 2>&1 | grep "Class hash declared:" | awk '{print $4}')
echo "  Core class hash: $CORE_HASH"

PT_HASH=$(starkli declare target/dev/fission_protocol_PrincipalToken.contract_class.json 2>&1 | grep "Class hash declared:" | awk '{print $4}')
echo "  PT class hash: $PT_HASH"

YT_HASH=$(starkli declare target/dev/fission_protocol_YieldToken.contract_class.json 2>&1 | grep "Class hash declared:" | awk '{print $4}')
echo "  YT class hash: $YT_HASH"

AMM_HASH=$(starkli declare target/dev/fission_protocol_FissionAMM.contract_class.json 2>&1 | grep "Class hash declared:" | awk '{print $4}')
echo "  AMM class hash: $AMM_HASH"

echo ""
echo "✅ All contracts declared!"
echo ""
echo "📋 Next steps:"
echo "  1. Deploy FissionCore: starkli deploy $CORE_HASH <OWNER> $PT_HASH $YT_HASH"
echo "  2. Deploy FissionAMM: starkli deploy $AMM_HASH <OWNER> <CORE_ADDR>"
echo "  3. Deploy SY for xSTRK: starkli deploy $SY_HASH <XSTRK_ADDR> 'SY-xSTRK' 'syxSTRK' <OWNER>"
echo "  4. Deploy SY for xLBTC: starkli deploy $SY_HASH <XLBTC_ADDR> 'SY-xLBTC' 'syxLBTC' <OWNER>"
echo "  5. Deploy PT/YT for each market via create_market() on Core"
echo "  6. Set market tokens via set_market_tokens() on Core"
echo "  7. Initialize AMM pools with add_liquidity()"
echo ""
echo "🔑 Key mainnet addresses:"
echo "  xSTRK: 0x028d709c875c0ceac3dce7065bec5328186dc89fe254527084d1689910954b0a"
echo "  STRK:  0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d"
echo "  ETH:   0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7"
