/// SY wraps yield-bearing tokens (xSTRK, xLBTC) into standardized shares
#[starknet::contract]
pub mod StandardizedYield {
    use starknet::{ContractAddress, get_caller_address, get_contract_address};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess, Map, StorageMapReadAccess, StorageMapWriteAccess};

    #[storage]
    struct Storage {
        name: felt252,
        symbol: felt252,
        total_supply: u256,
        balances: Map::<ContractAddress, u256>,
        allowances: Map::<(ContractAddress, ContractAddress), u256>,
        underlying: ContractAddress,
        total_underlying: u256,
        owner: ContractAddress,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event { Deposit: Deposit, Redeem: Redeem, Transfer: Transfer, Approval: Approval }

    #[derive(Drop, starknet::Event)]
    struct Deposit { #[key] user: ContractAddress, underlying_in: u256, shares_out: u256 }
    #[derive(Drop, starknet::Event)]
    struct Redeem { #[key] user: ContractAddress, shares_in: u256, underlying_out: u256 }
    #[derive(Drop, starknet::Event)]
    struct Transfer { #[key] from: ContractAddress, #[key] to: ContractAddress, value: u256 }
    #[derive(Drop, starknet::Event)]
    struct Approval { #[key] owner: ContractAddress, #[key] spender: ContractAddress, value: u256 }

    #[constructor]
    fn constructor(ref self: ContractState, name: felt252, symbol: felt252, underlying: ContractAddress, owner: ContractAddress) {
        self.name.write(name); self.symbol.write(symbol);
        self.underlying.write(underlying); self.owner.write(owner);
    }

    // ── ERC20 standard functions ──
    #[abi(embed_v0)]
    fn balance_of(self: @ContractState, account: ContractAddress) -> u256 { self.balances.read(account) }
    #[abi(embed_v0)]
    fn total_supply(self: @ContractState) -> u256 { self.total_supply.read() }
    #[abi(embed_v0)]
    fn transfer(ref self: ContractState, to: ContractAddress, amount: u256) -> bool {
        let from = get_caller_address();
        let bal = self.balances.read(from); assert(bal >= amount, 'SY: low bal');
        self.balances.write(from, bal - amount);
        self.balances.write(to, self.balances.read(to) + amount);
        self.emit(Transfer { from, to, value: amount }); true
    }
    #[abi(embed_v0)]
    fn transfer_from(ref self: ContractState, from: ContractAddress, to: ContractAddress, amount: u256) -> bool {
        let caller = get_caller_address();
        let a = self.allowances.read((from, caller)); assert(a >= amount, 'SY: low allow');
        self.allowances.write((from, caller), a - amount);
        let bal = self.balances.read(from); assert(bal >= amount, 'SY: low bal');
        self.balances.write(from, bal - amount);
        self.balances.write(to, self.balances.read(to) + amount);
        self.emit(Transfer { from, to, value: amount }); true
    }
    #[abi(embed_v0)]
    fn approve(ref self: ContractState, spender: ContractAddress, amount: u256) -> bool {
        let owner = get_caller_address();
        self.allowances.write((owner, spender), amount);
        self.emit(Approval { owner, spender, value: amount }); true
    }

    // ── SY-specific ──
    #[abi(embed_v0)]
    fn deposit(ref self: ContractState, amount: u256) -> u256 {
        assert(amount > 0, 'SY: zero');
        let caller = get_caller_address();
        // Pull underlying from caller
        let ul = ITokenDispatcher { contract_address: self.underlying.read() };
        ul.transfer_from(caller, get_contract_address(), amount);
        // Calculate shares
        let ts = self.total_supply.read();
        let tu = self.total_underlying.read();
        let shares = if ts == 0 { amount } else { (amount * ts) / tu };
        assert(shares > 0, 'SY: zero shares');
        // Mint
        self.total_supply.write(ts + shares);
        self.total_underlying.write(tu + amount);
        self.balances.write(caller, self.balances.read(caller) + shares);
        self.emit(Deposit { user: caller, underlying_in: amount, shares_out: shares });
        shares
    }

    #[abi(embed_v0)]
    fn redeem(ref self: ContractState, shares: u256) -> u256 {
        assert(shares > 0, 'SY: zero');
        let caller = get_caller_address();
        let ts = self.total_supply.read();
        let tu = self.total_underlying.read();
        let amount = (shares * tu) / ts;
        // Burn shares
        let bal = self.balances.read(caller); assert(bal >= shares, 'SY: low bal');
        self.balances.write(caller, bal - shares);
        self.total_supply.write(ts - shares);
        self.total_underlying.write(tu - amount);
        // Return underlying
        let ul = ITokenDispatcher { contract_address: self.underlying.read() };
        ul.transfer(caller, amount);
        self.emit(Redeem { user: caller, shares_in: shares, underlying_out: amount });
        amount
    }

    #[abi(embed_v0)]
    fn exchange_rate(self: @ContractState) -> u256 {
        let ts = self.total_supply.read();
        if ts == 0 { 1_000_000_000_000_000_000 }
        else { (self.total_underlying.read() * 1_000_000_000_000_000_000) / ts }
    }

    #[abi(embed_v0)]
    fn get_underlying(self: @ContractState) -> ContractAddress { self.underlying.read() }

    #[abi(embed_v0)]
    fn sync(ref self: ContractState) {
        let ul = ITokenDispatcher { contract_address: self.underlying.read() };
        self.total_underlying.write(ul.balance_of(get_contract_address()));
    }

    #[starknet::interface]
    trait IToken<T> {
        fn transfer(ref self: T, to: ContractAddress, amount: u256) -> bool;
        fn transfer_from(ref self: T, from: ContractAddress, to: ContractAddress, amount: u256) -> bool;
        fn balance_of(self: @T, account: ContractAddress) -> u256;
    }
}
