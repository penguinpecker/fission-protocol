import { type Abi } from "starknet";

// ═══ Deployed Mainnet Addresses ═══
export const CONTRACTS = {
  FISSION_CORE: "0x00373485f84822c3dcdfbfc273ab262f1ff529c81d5dfbe7115b3bd7489043d8",
  FISSION_AMM: "0x0777c8b2e7f0d9ca61a551e3c80f99583829541877af8ce8e2722f94914aa09a",
  SY_XSTRK: "0x047da6255df8fd148894bb3fcae5a224171233b269a282f58fc87f5832c48dd5",
  PT_XSTRK: "0x04281f4bc5d18c466ce802698164df38d98b0606ff0e96811af212e1c7861c39",
  YT_XSTRK: "0x03a3b605a66dbb9753142fe971423e480d61b6503aae8954d81c6344b3250f20",
} as const;

export const TOKENS = {
  XSTRK: "0x028d709c875c0ceac3dce7065bec5328186dc89fe254527084d1689910954b0a",
  STRK: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
  ETH: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
} as const;

// ═══ ABIs ═══

export const ERC20_ABI: Abi = [
  { type: "function", name: "balance_of", inputs: [{ name: "account", type: "core::starknet::contract_address::ContractAddress" }], outputs: [{ type: "core::integer::u256" }], state_mutability: "view" },
  { type: "function", name: "total_supply", inputs: [], outputs: [{ type: "core::integer::u256" }], state_mutability: "view" },
  { type: "function", name: "allowance", inputs: [{ name: "owner", type: "core::starknet::contract_address::ContractAddress" }, { name: "spender", type: "core::starknet::contract_address::ContractAddress" }], outputs: [{ type: "core::integer::u256" }], state_mutability: "view" },
  { type: "function", name: "approve", inputs: [{ name: "spender", type: "core::starknet::contract_address::ContractAddress" }, { name: "amount", type: "core::integer::u256" }], outputs: [{ type: "core::bool" }], state_mutability: "external" },
  { type: "function", name: "transfer", inputs: [{ name: "recipient", type: "core::starknet::contract_address::ContractAddress" }, { name: "amount", type: "core::integer::u256" }], outputs: [{ type: "core::bool" }], state_mutability: "external" },
  { type: "function", name: "transfer_from", inputs: [{ name: "sender", type: "core::starknet::contract_address::ContractAddress" }, { name: "recipient", type: "core::starknet::contract_address::ContractAddress" }, { name: "amount", type: "core::integer::u256" }], outputs: [{ type: "core::bool" }], state_mutability: "external" },
];

export const SY_ABI: Abi = [
  ...ERC20_ABI,
  { type: "function", name: "deposit", inputs: [{ name: "amount", type: "core::integer::u256" }], outputs: [{ type: "core::integer::u256" }], state_mutability: "external" },
  { type: "function", name: "redeem", inputs: [{ name: "shares", type: "core::integer::u256" }], outputs: [{ type: "core::integer::u256" }], state_mutability: "external" },
  { type: "function", name: "exchange_rate", inputs: [], outputs: [{ type: "core::integer::u256" }], state_mutability: "view" },
  { type: "function", name: "get_underlying", inputs: [], outputs: [{ type: "core::starknet::contract_address::ContractAddress" }], state_mutability: "view" },
];

export const CORE_ABI: Abi = [
  { type: "function", name: "create_market", inputs: [{ name: "sy", type: "core::starknet::contract_address::ContractAddress" }, { name: "pt", type: "core::starknet::contract_address::ContractAddress" }, { name: "yt", type: "core::starknet::contract_address::ContractAddress" }, { name: "maturity", type: "core::integer::u64" }], outputs: [{ type: "core::integer::u32" }], state_mutability: "external" },
  { type: "function", name: "split", inputs: [{ name: "market", type: "core::integer::u32" }, { name: "amount", type: "core::integer::u256" }], outputs: [], state_mutability: "external" },
  { type: "function", name: "merge", inputs: [{ name: "market", type: "core::integer::u32" }, { name: "amount", type: "core::integer::u256" }], outputs: [], state_mutability: "external" },
  { type: "function", name: "redeem_pt", inputs: [{ name: "market", type: "core::integer::u32" }, { name: "amount", type: "core::integer::u256" }], outputs: [], state_mutability: "external" },
  { type: "function", name: "claim_yield", inputs: [{ name: "market", type: "core::integer::u32" }], outputs: [{ type: "core::integer::u256" }], state_mutability: "external" },
  { type: "function", name: "update_yield_index", inputs: [{ name: "market", type: "core::integer::u32" }], outputs: [], state_mutability: "external" },
  { type: "function", name: "get_market_count", inputs: [], outputs: [{ type: "core::integer::u32" }], state_mutability: "view" },
  { type: "function", name: "get_sy", inputs: [{ name: "m", type: "core::integer::u32" }], outputs: [{ type: "core::starknet::contract_address::ContractAddress" }], state_mutability: "view" },
  { type: "function", name: "get_pt", inputs: [{ name: "m", type: "core::integer::u32" }], outputs: [{ type: "core::starknet::contract_address::ContractAddress" }], state_mutability: "view" },
  { type: "function", name: "get_yt", inputs: [{ name: "m", type: "core::integer::u32" }], outputs: [{ type: "core::starknet::contract_address::ContractAddress" }], state_mutability: "view" },
  { type: "function", name: "get_maturity", inputs: [{ name: "m", type: "core::integer::u32" }], outputs: [{ type: "core::integer::u64" }], state_mutability: "view" },
  { type: "function", name: "get_total_locked", inputs: [{ name: "m", type: "core::integer::u32" }], outputs: [{ type: "core::integer::u256" }], state_mutability: "view" },
  { type: "function", name: "get_yield_index", inputs: [{ name: "m", type: "core::integer::u32" }], outputs: [{ type: "core::integer::u256" }], state_mutability: "view" },
  { type: "function", name: "get_unclaimed", inputs: [{ name: "m", type: "core::integer::u32" }, { name: "u", type: "core::starknet::contract_address::ContractAddress" }], outputs: [{ type: "core::integer::u256" }], state_mutability: "view" },
  { type: "function", name: "is_matured", inputs: [{ name: "m", type: "core::integer::u32" }], outputs: [{ type: "core::bool" }], state_mutability: "view" },
];

export const AMM_ABI: Abi = [
  { type: "function", name: "add_liquidity", inputs: [{ name: "market", type: "core::integer::u32" }, { name: "sy_amt", type: "core::integer::u256" }, { name: "pt_amt", type: "core::integer::u256" }], outputs: [{ type: "core::integer::u256" }], state_mutability: "external" },
  { type: "function", name: "remove_liquidity", inputs: [{ name: "market", type: "core::integer::u32" }, { name: "lp_amt", type: "core::integer::u256" }], outputs: [{ type: "core::integer::u256" }, { type: "core::integer::u256" }], state_mutability: "external" },
  { type: "function", name: "swap_pt_for_sy", inputs: [{ name: "market", type: "core::integer::u32" }, { name: "pt_in", type: "core::integer::u256" }, { name: "min_sy_out", type: "core::integer::u256" }], outputs: [{ type: "core::integer::u256" }], state_mutability: "external" },
  { type: "function", name: "swap_sy_for_pt", inputs: [{ name: "market", type: "core::integer::u32" }, { name: "sy_in", type: "core::integer::u256" }, { name: "min_pt_out", type: "core::integer::u256" }], outputs: [{ type: "core::integer::u256" }], state_mutability: "external" },
  { type: "function", name: "get_reserves", inputs: [{ name: "market", type: "core::integer::u32" }], outputs: [{ type: "core::integer::u256" }, { type: "core::integer::u256" }], state_mutability: "view" },
  { type: "function", name: "get_lp_balance", inputs: [{ name: "market", type: "core::integer::u32" }, { name: "user", type: "core::starknet::contract_address::ContractAddress" }], outputs: [{ type: "core::integer::u256" }], state_mutability: "view" },
  { type: "function", name: "get_lp_supply", inputs: [{ name: "market", type: "core::integer::u32" }], outputs: [{ type: "core::integer::u256" }], state_mutability: "view" },
  { type: "function", name: "get_pt_price", inputs: [{ name: "market", type: "core::integer::u32" }], outputs: [{ type: "core::integer::u256" }], state_mutability: "view" },
  { type: "function", name: "get_implied_apy", inputs: [{ name: "market", type: "core::integer::u32" }], outputs: [{ type: "core::integer::u256" }], state_mutability: "view" },
  { type: "function", name: "get_fees", inputs: [{ name: "market", type: "core::integer::u32" }], outputs: [{ type: "core::integer::u256" }], state_mutability: "view" },
];
