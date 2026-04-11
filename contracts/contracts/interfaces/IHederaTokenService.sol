// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

/// @title IHederaTokenService — Hedera Token Service precompile at 0x167
/// @notice Subset of HIP-206/218/376 interface for fungible token operations
interface IHederaTokenService {
    struct HederaToken {
        string name;
        string symbol;
        address treasury;
        string memo;
        bool tokenSupplyType; // false = INFINITE, true = FINITE
        int64 maxSupply;
        bool freezeDefault;
        TokenKey[] tokenKeys;
        Expiry expiry;
    }

    struct TokenKey {
        uint256 keyType; // 1=admin, 2=kyc, 4=freeze, 8=wipe, 16=supply, 32=feeSchedule, 64=pause
        KeyValue key;
    }

    struct KeyValue {
        bool inheritAccountKey;
        address contractId;
        bytes ed25519;
        bytes ECDSA_secp256k1;
        address delegatableContractId;
    }

    struct Expiry {
        int64 second;
        address autoRenewAccount;
        int64 autoRenewPeriod;
    }

    function createFungibleToken(
        HederaToken memory token,
        int64 initialTotalSupply,
        int32 decimals
    ) external payable returns (int64 responseCode, address tokenAddress);

    function mintToken(
        address token,
        int64 amount,
        bytes[] memory metadata
    ) external returns (int64 responseCode, int64 newTotalSupply, int64[] memory serialNumbers);

    function burnToken(
        address token,
        int64 amount,
        int64[] memory serialNumbers
    ) external returns (int64 responseCode, int64 newTotalSupply);

    function associateToken(
        address account,
        address token
    ) external returns (int64 responseCode);

    function transferToken(
        address token,
        address sender,
        address receiver,
        int64 amount
    ) external returns (int64 responseCode);
}
