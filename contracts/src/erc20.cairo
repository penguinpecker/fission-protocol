#[starknet::contract]
pub mod ERC20 {
    use starknet::{ContractAddress, get_caller_address};
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess,
        StoragePointerReadAccess, StoragePointerWriteAccess,
    };

    #[storage]
    struct Storage {
        name: felt252,
        symbol: felt252,
        decimals: u8,
        total_supply: u256,
        balances: Map::<ContractAddress, u256>,
        allowances: Map::<(ContractAddress, ContractAddress), u256>,
        owner: ContractAddress,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        Transfer: Transfer,
        Approval: Approval,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Transfer {
        #[key]
        pub from: ContractAddress,
        #[key]
        pub to: ContractAddress,
        pub value: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Approval {
        #[key]
        pub owner: ContractAddress,
        #[key]
        pub spender: ContractAddress,
        pub value: u256,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        name: felt252,
        symbol: felt252,
        decimals: u8,
        owner: ContractAddress,
    ) {
        self.name.write(name);
        self.symbol.write(symbol);
        self.decimals.write(decimals);
        self.owner.write(owner);
    }

    #[abi(embed_v0)]
    fn get_name(self: @ContractState) -> felt252 { self.name.read() }

    #[abi(embed_v0)]
    fn get_symbol(self: @ContractState) -> felt252 { self.symbol.read() }

    #[abi(embed_v0)]
    fn get_decimals(self: @ContractState) -> u8 { self.decimals.read() }

    #[abi(embed_v0)]
    fn total_supply(self: @ContractState) -> u256 { self.total_supply.read() }

    #[abi(embed_v0)]
    fn balance_of(self: @ContractState, account: ContractAddress) -> u256 {
        self.balances.read(account)
    }

    #[abi(embed_v0)]
    fn allowance(self: @ContractState, owner: ContractAddress, spender: ContractAddress) -> u256 {
        self.allowances.read((owner, spender))
    }

    #[abi(embed_v0)]
    fn transfer(ref self: ContractState, recipient: ContractAddress, amount: u256) -> bool {
        let sender = get_caller_address();
        _transfer(ref self, sender, recipient, amount);
        true
    }

    #[abi(embed_v0)]
    fn transfer_from(
        ref self: ContractState,
        sender: ContractAddress,
        recipient: ContractAddress,
        amount: u256,
    ) -> bool {
        let caller = get_caller_address();
        let current_allowance = self.allowances.read((sender, caller));
        assert(current_allowance >= amount, 'ERC20: insufficient allowance');
        self.allowances.write((sender, caller), current_allowance - amount);
        _transfer(ref self, sender, recipient, amount);
        true
    }

    #[abi(embed_v0)]
    fn approve(ref self: ContractState, spender: ContractAddress, amount: u256) -> bool {
        let owner = get_caller_address();
        self.allowances.write((owner, spender), amount);
        self.emit(Approval { owner, spender, value: amount });
        true
    }

    // ── Internal mint/burn callable by owner ──
    #[abi(embed_v0)]
    fn mint(ref self: ContractState, to: ContractAddress, amount: u256) {
        assert(get_caller_address() == self.owner.read(), 'ERC20: only owner');
        self.total_supply.write(self.total_supply.read() + amount);
        self.balances.write(to, self.balances.read(to) + amount);
        self.emit(Transfer { from: core::num::traits::Zero::zero(), to, value: amount });
    }

    #[abi(embed_v0)]
    fn burn(ref self: ContractState, from: ContractAddress, amount: u256) {
        assert(get_caller_address() == self.owner.read(), 'ERC20: only owner');
        let bal = self.balances.read(from);
        assert(bal >= amount, 'ERC20: burn exceeds balance');
        self.balances.write(from, bal - amount);
        self.total_supply.write(self.total_supply.read() - amount);
        self.emit(Transfer { from, to: core::num::traits::Zero::zero(), value: amount });
    }

    fn _transfer(ref self: ContractState, from: ContractAddress, to: ContractAddress, amount: u256) {
        let from_bal = self.balances.read(from);
        assert(from_bal >= amount, 'ERC20: insufficient balance');
        self.balances.write(from, from_bal - amount);
        self.balances.write(to, self.balances.read(to) + amount);
        self.emit(Transfer { from, to, value: amount });
    }
}
