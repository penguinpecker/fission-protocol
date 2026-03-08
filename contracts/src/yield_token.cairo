/// YT — Yield Token. Tracks per-user yield index for distribution.
#[starknet::interface]
pub trait IYieldToken<T> {
    fn balance_of(self: @T, account: starknet::ContractAddress) -> u256;
    fn total_supply(self: @T) -> u256;
    fn get_maturity(self: @T) -> u64;
    fn get_user_yield_index(self: @T, user: starknet::ContractAddress) -> u256;
    fn transfer(ref self: T, to: starknet::ContractAddress, amount: u256) -> bool;
    fn transfer_from(ref self: T, from: starknet::ContractAddress, to: starknet::ContractAddress, amount: u256) -> bool;
    fn approve(ref self: T, spender: starknet::ContractAddress, amount: u256) -> bool;
    fn mint(ref self: T, to: starknet::ContractAddress, amount: u256);
    fn burn(ref self: T, from: starknet::ContractAddress, amount: u256);
    fn set_user_yield_index(ref self: T, user: starknet::ContractAddress, index: u256);
}

#[starknet::contract]
pub mod YieldToken {
    use starknet::{ContractAddress, get_caller_address};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess, Map, StorageMapReadAccess, StorageMapWriteAccess};

    #[storage]
    struct Storage {
        name: felt252, symbol: felt252, total_supply: u256,
        balances: Map::<ContractAddress, u256>,
        allowances: Map::<(ContractAddress, ContractAddress), u256>,
        core: ContractAddress, maturity: u64, market_id: u32,
        user_yield_index: Map::<ContractAddress, u256>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event { Transfer: Transfer }
    #[derive(Drop, starknet::Event)]
    struct Transfer { #[key] from: ContractAddress, #[key] to: ContractAddress, value: u256 }

    #[constructor]
    fn constructor(ref self: ContractState, name: felt252, symbol: felt252, core: ContractAddress, maturity: u64, market_id: u32) {
        self.name.write(name); self.symbol.write(symbol);
        self.core.write(core); self.maturity.write(maturity); self.market_id.write(market_id);
    }

    #[abi(embed_v0)]
    impl YTImpl of super::IYieldToken<ContractState> {
        fn balance_of(self: @ContractState, account: ContractAddress) -> u256 { self.balances.read(account) }
        fn total_supply(self: @ContractState) -> u256 { self.total_supply.read() }
        fn get_maturity(self: @ContractState) -> u64 { self.maturity.read() }
        fn get_user_yield_index(self: @ContractState, user: ContractAddress) -> u256 { self.user_yield_index.read(user) }
        fn transfer(ref self: ContractState, to: ContractAddress, amount: u256) -> bool {
            let from = get_caller_address();
            let b = self.balances.read(from); assert(b >= amount, 'YT: low bal');
            self.balances.write(from, b - amount); self.balances.write(to, self.balances.read(to) + amount);
            self.emit(Transfer { from, to, value: amount }); true
        }
        fn transfer_from(ref self: ContractState, from: ContractAddress, to: ContractAddress, amount: u256) -> bool {
            let c = get_caller_address();
            let a = self.allowances.read((from, c)); assert(a >= amount, 'YT: low allow');
            self.allowances.write((from, c), a - amount);
            let b = self.balances.read(from); assert(b >= amount, 'YT: low bal');
            self.balances.write(from, b - amount); self.balances.write(to, self.balances.read(to) + amount);
            self.emit(Transfer { from, to, value: amount }); true
        }
        fn approve(ref self: ContractState, spender: ContractAddress, amount: u256) -> bool {
            self.allowances.write((get_caller_address(), spender), amount); true
        }
        fn mint(ref self: ContractState, to: ContractAddress, amount: u256) {
            assert(get_caller_address() == self.core.read(), 'YT: only core');
            self.total_supply.write(self.total_supply.read() + amount);
            self.balances.write(to, self.balances.read(to) + amount);
            self.emit(Transfer { from: core::num::traits::Zero::zero(), to, value: amount });
        }
        fn burn(ref self: ContractState, from: ContractAddress, amount: u256) {
            assert(get_caller_address() == self.core.read(), 'YT: only core');
            let b = self.balances.read(from); assert(b >= amount, 'YT: low bal');
            self.balances.write(from, b - amount);
            self.total_supply.write(self.total_supply.read() - amount);
            self.emit(Transfer { from, to: core::num::traits::Zero::zero(), value: amount });
        }
        fn set_user_yield_index(ref self: ContractState, user: ContractAddress, index: u256) {
            assert(get_caller_address() == self.core.read(), 'YT: only core');
            self.user_yield_index.write(user, index);
        }
    }
}
