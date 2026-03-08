/// FissionAMM — constant product AMM for PT/SY with time-decay pricing
#[starknet::interface]
pub trait IFissionAMM<T> {
    fn add_liquidity(ref self: T, market: u32, sy_amt: u256, pt_amt: u256) -> u256;
    fn remove_liquidity(ref self: T, market: u32, lp_amt: u256) -> (u256, u256);
    fn swap_pt_for_sy(ref self: T, market: u32, pt_in: u256, min_sy_out: u256) -> u256;
    fn swap_sy_for_pt(ref self: T, market: u32, sy_in: u256, min_pt_out: u256) -> u256;
    fn get_reserves(self: @T, market: u32) -> (u256, u256);
    fn get_lp_balance(self: @T, market: u32, user: starknet::ContractAddress) -> u256;
    fn get_lp_supply(self: @T, market: u32) -> u256;
    fn get_pt_price(self: @T, market: u32) -> u256;
    fn get_implied_apy(self: @T, market: u32) -> u256;
    fn get_fees(self: @T, market: u32) -> u256;
}

#[starknet::contract]
pub mod FissionAMM {
    use starknet::{ContractAddress, get_caller_address, get_contract_address, get_block_timestamp};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess, Map, StorageMapReadAccess, StorageMapWriteAccess};

    const FEE_BPS: u256 = 30;
    const BPS: u256 = 10_000;
    const E18: u256 = 1_000_000_000_000_000_000;

    #[storage]
    struct Storage {
        owner: ContractAddress, core: ContractAddress,
        reserve_sy: Map::<u32, u256>, reserve_pt: Map::<u32, u256>,
        lp_supply: Map::<u32, u256>, lp_balances: Map::<(u32, ContractAddress), u256>,
        fees: Map::<u32, u256>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event { AddLiq: AddLiq, RemoveLiq: RemoveLiq, Swap: Swap }
    #[derive(Drop, starknet::Event)]
    struct AddLiq { #[key] user: ContractAddress, market: u32, sy: u256, pt: u256, lp: u256 }
    #[derive(Drop, starknet::Event)]
    struct RemoveLiq { #[key] user: ContractAddress, market: u32, lp: u256 }
    #[derive(Drop, starknet::Event)]
    struct Swap { #[key] user: ContractAddress, market: u32, sy_delta: u256, pt_delta: u256 }

    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress, core: ContractAddress) {
        self.owner.write(owner); self.core.write(core);
    }

    #[abi(embed_v0)]
    impl AMMImpl of super::IFissionAMM<ContractState> {
        fn add_liquidity(ref self: ContractState, market: u32, sy_amt: u256, pt_amt: u256) -> u256 {
            assert(sy_amt > 0 && pt_amt > 0, 'AMM: zero');
            let caller = get_caller_address();
            let (sy_addr, pt_addr) = _get_tokens(ref self, market);
            ITokenDispatcher { contract_address: sy_addr }.transfer_from(caller, get_contract_address(), sy_amt);
            ITokenDispatcher { contract_address: pt_addr }.transfer_from(caller, get_contract_address(), pt_amt);
            let total_lp = self.lp_supply.read(market);
            let r_sy = self.reserve_sy.read(market); let r_pt = self.reserve_pt.read(market);
            let lp = if total_lp == 0 { (sy_amt + pt_amt) / 2 }
            else { let a = (sy_amt * total_lp) / r_sy; let b = (pt_amt * total_lp) / r_pt; if a < b { a } else { b } };
            self.reserve_sy.write(market, r_sy + sy_amt); self.reserve_pt.write(market, r_pt + pt_amt);
            self.lp_supply.write(market, total_lp + lp);
            self.lp_balances.write((market, caller), self.lp_balances.read((market, caller)) + lp);
            self.emit(AddLiq { user: caller, market, sy: sy_amt, pt: pt_amt, lp }); lp
        }

        fn remove_liquidity(ref self: ContractState, market: u32, lp_amt: u256) -> (u256, u256) {
            assert(lp_amt > 0, 'AMM: zero');
            let caller = get_caller_address();
            let user_lp = self.lp_balances.read((market, caller)); assert(user_lp >= lp_amt, 'AMM: low lp');
            let total_lp = self.lp_supply.read(market);
            let r_sy = self.reserve_sy.read(market); let r_pt = self.reserve_pt.read(market);
            let sy_out = (lp_amt * r_sy) / total_lp; let pt_out = (lp_amt * r_pt) / total_lp;
            self.reserve_sy.write(market, r_sy - sy_out); self.reserve_pt.write(market, r_pt - pt_out);
            self.lp_supply.write(market, total_lp - lp_amt);
            self.lp_balances.write((market, caller), user_lp - lp_amt);
            let (sy_addr, pt_addr) = _get_tokens(ref self, market);
            ITokenDispatcher { contract_address: sy_addr }.transfer(caller, sy_out);
            ITokenDispatcher { contract_address: pt_addr }.transfer(caller, pt_out);
            self.emit(RemoveLiq { user: caller, market, lp: lp_amt }); (sy_out, pt_out)
        }

        fn swap_pt_for_sy(ref self: ContractState, market: u32, pt_in: u256, min_sy_out: u256) -> u256 {
            assert(pt_in > 0, 'AMM: zero');
            let caller = get_caller_address();
            let r_sy = self.reserve_sy.read(market); let r_pt = self.reserve_pt.read(market);
            let sy_out_raw = (pt_in * r_sy) / (r_pt + pt_in);
            let fee = (sy_out_raw * FEE_BPS) / BPS; let sy_out = sy_out_raw - fee;
            assert(sy_out >= min_sy_out, 'AMM: slippage');
            let (sy_addr, pt_addr) = _get_tokens(ref self, market);
            ITokenDispatcher { contract_address: pt_addr }.transfer_from(caller, get_contract_address(), pt_in);
            ITokenDispatcher { contract_address: sy_addr }.transfer(caller, sy_out);
            self.reserve_pt.write(market, r_pt + pt_in); self.reserve_sy.write(market, r_sy - sy_out);
            self.fees.write(market, self.fees.read(market) + fee);
            self.emit(Swap { user: caller, market, sy_delta: sy_out, pt_delta: pt_in }); sy_out
        }

        fn swap_sy_for_pt(ref self: ContractState, market: u32, sy_in: u256, min_pt_out: u256) -> u256 {
            assert(sy_in > 0, 'AMM: zero');
            let caller = get_caller_address();
            let r_sy = self.reserve_sy.read(market); let r_pt = self.reserve_pt.read(market);
            let fee = (sy_in * FEE_BPS) / BPS; let sy_after_fee = sy_in - fee;
            let pt_out = (sy_after_fee * r_pt) / (r_sy + sy_after_fee);
            assert(pt_out >= min_pt_out, 'AMM: slippage');
            let (sy_addr, pt_addr) = _get_tokens(ref self, market);
            ITokenDispatcher { contract_address: sy_addr }.transfer_from(caller, get_contract_address(), sy_in);
            ITokenDispatcher { contract_address: pt_addr }.transfer(caller, pt_out);
            self.reserve_sy.write(market, r_sy + sy_in); self.reserve_pt.write(market, r_pt - pt_out);
            self.fees.write(market, self.fees.read(market) + fee);
            self.emit(Swap { user: caller, market, sy_delta: sy_in, pt_delta: pt_out }); pt_out
        }

        fn get_reserves(self: @ContractState, market: u32) -> (u256, u256) {
            (self.reserve_sy.read(market), self.reserve_pt.read(market))
        }
        fn get_lp_balance(self: @ContractState, market: u32, user: ContractAddress) -> u256 {
            self.lp_balances.read((market, user))
        }
        fn get_lp_supply(self: @ContractState, market: u32) -> u256 { self.lp_supply.read(market) }
        fn get_pt_price(self: @ContractState, market: u32) -> u256 {
            let r_sy = self.reserve_sy.read(market); let r_pt = self.reserve_pt.read(market);
            if r_pt == 0 { return E18; } (r_sy * E18) / r_pt
        }
        fn get_implied_apy(self: @ContractState, market: u32) -> u256 {
            let r_sy = self.reserve_sy.read(market); let r_pt = self.reserve_pt.read(market);
            let pt_price = if r_pt == 0 { E18 } else { (r_sy * E18) / r_pt };
            if pt_price == 0 || pt_price >= E18 { return 0; }
            let maturity = ICoreDispatcher { contract_address: self.core.read() }.get_maturity(market);
            let now = get_block_timestamp();
            if now >= maturity { return 0; }
            let secs_left: u256 = (maturity - now).into();
            let secs_year: u256 = 31_536_000;
            let discount = ((E18 - pt_price) * E18) / pt_price;
            (discount * secs_year) / secs_left
        }
        fn get_fees(self: @ContractState, market: u32) -> u256 { self.fees.read(market) }
    }

    fn _get_tokens(ref self: ContractState, market: u32) -> (ContractAddress, ContractAddress) {
        let c = ICoreDispatcher { contract_address: self.core.read() };
        (c.get_sy(market), c.get_pt(market))
    }

    #[starknet::interface]
    trait IToken<T> {
        fn transfer(ref self: T, to: ContractAddress, amount: u256) -> bool;
        fn transfer_from(ref self: T, from: ContractAddress, to: ContractAddress, amount: u256) -> bool;
    }
    #[starknet::interface]
    trait ICore<T> {
        fn get_sy(self: @T, m: u32) -> ContractAddress;
        fn get_pt(self: @T, m: u32) -> ContractAddress;
        fn get_maturity(self: @T, m: u32) -> u64;
    }
}
