/// FissionCore — splits SY into PT+YT, merges, redeems, distributes yield
#[starknet::interface]
pub trait IFissionCore<TContractState> {
    fn create_market(ref self: TContractState, sy: starknet::ContractAddress, pt: starknet::ContractAddress, yt: starknet::ContractAddress, maturity: u64) -> u32;
    fn split(ref self: TContractState, market: u32, amount: u256);
    fn merge(ref self: TContractState, market: u32, amount: u256);
    fn redeem_pt(ref self: TContractState, market: u32, amount: u256);
    fn claim_yield(ref self: TContractState, market: u32) -> u256;
    fn update_yield_index(ref self: TContractState, market: u32);
    fn get_market_count(self: @TContractState) -> u32;
    fn get_sy(self: @TContractState, m: u32) -> starknet::ContractAddress;
    fn get_pt(self: @TContractState, m: u32) -> starknet::ContractAddress;
    fn get_yt(self: @TContractState, m: u32) -> starknet::ContractAddress;
    fn get_maturity(self: @TContractState, m: u32) -> u64;
    fn get_total_locked(self: @TContractState, m: u32) -> u256;
    fn get_yield_index(self: @TContractState, m: u32) -> u256;
    fn get_unclaimed(self: @TContractState, m: u32, u: starknet::ContractAddress) -> u256;
    fn is_matured(self: @TContractState, m: u32) -> bool;
}

#[starknet::contract]
pub mod FissionCore {
    use starknet::{ContractAddress, get_caller_address, get_contract_address, get_block_timestamp};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess, Map, StorageMapReadAccess, StorageMapWriteAccess};

    #[storage]
    struct Storage {
        owner: ContractAddress,
        market_count: u32,
        sy_tokens: Map::<u32, ContractAddress>,
        pt_tokens: Map::<u32, ContractAddress>,
        yt_tokens: Map::<u32, ContractAddress>,
        maturities: Map::<u32, u64>,
        total_sy_locked: Map::<u32, u256>,
        yield_index: Map::<u32, u256>,
        user_last_index: Map::<(u32, ContractAddress), u256>,
        unclaimed_yield: Map::<(u32, ContractAddress), u256>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event { Split: Split, Merge: Merge, RedeemPT: RedeemPT, YieldClaimed: YieldClaimed, MarketCreated: MarketCreated }
    #[derive(Drop, starknet::Event)]
    struct Split { #[key] user: ContractAddress, market: u32, amount: u256 }
    #[derive(Drop, starknet::Event)]
    struct Merge { #[key] user: ContractAddress, market: u32, amount: u256 }
    #[derive(Drop, starknet::Event)]
    struct RedeemPT { #[key] user: ContractAddress, market: u32, amount: u256 }
    #[derive(Drop, starknet::Event)]
    struct YieldClaimed { #[key] user: ContractAddress, market: u32, amount: u256 }
    #[derive(Drop, starknet::Event)]
    struct MarketCreated { market: u32, sy: ContractAddress, pt: ContractAddress, yt: ContractAddress, maturity: u64 }

    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress) {
        self.owner.write(owner);
    }

    #[abi(embed_v0)]
    impl FissionCoreImpl of super::IFissionCore<ContractState> {
        fn create_market(ref self: ContractState, sy: ContractAddress, pt: ContractAddress, yt: ContractAddress, maturity: u64) -> u32 {
            assert(get_caller_address() == self.owner.read(), 'Core: only owner');
            let id = self.market_count.read();
            self.sy_tokens.write(id, sy);
            self.pt_tokens.write(id, pt);
            self.yt_tokens.write(id, yt);
            self.maturities.write(id, maturity);
            self.yield_index.write(id, 1_000_000_000_000_000_000);
            self.market_count.write(id + 1);
            self.emit(MarketCreated { market: id, sy, pt, yt, maturity });
            id
        }

        fn split(ref self: ContractState, market: u32, amount: u256) {
            assert(amount > 0, 'Core: zero');
            assert(get_block_timestamp() < self.maturities.read(market), 'Core: matured');
            let caller = get_caller_address();
            _accrue(ref self, market, caller);
            let sy = ISYDispatcher { contract_address: self.sy_tokens.read(market) };
            sy.transfer_from(caller, get_contract_address(), amount);
            let pt = IMintDispatcher { contract_address: self.pt_tokens.read(market) };
            let yt = IMintDispatcher { contract_address: self.yt_tokens.read(market) };
            pt.mint(caller, amount);
            yt.mint(caller, amount);
            self.total_sy_locked.write(market, self.total_sy_locked.read(market) + amount);
            self.emit(Split { user: caller, market, amount });
        }

        fn merge(ref self: ContractState, market: u32, amount: u256) {
            assert(amount > 0, 'Core: zero');
            let caller = get_caller_address();
            _accrue(ref self, market, caller);
            let pt = IMintDispatcher { contract_address: self.pt_tokens.read(market) };
            let yt = IMintDispatcher { contract_address: self.yt_tokens.read(market) };
            pt.burn(caller, amount);
            yt.burn(caller, amount);
            let sy = ISYDispatcher { contract_address: self.sy_tokens.read(market) };
            sy.transfer(caller, amount);
            self.total_sy_locked.write(market, self.total_sy_locked.read(market) - amount);
            self.emit(Merge { user: caller, market, amount });
        }

        fn redeem_pt(ref self: ContractState, market: u32, amount: u256) {
            assert(amount > 0, 'Core: zero');
            assert(get_block_timestamp() >= self.maturities.read(market), 'Core: not matured');
            let caller = get_caller_address();
            let pt = IMintDispatcher { contract_address: self.pt_tokens.read(market) };
            pt.burn(caller, amount);
            let sy = ISYDispatcher { contract_address: self.sy_tokens.read(market) };
            sy.transfer(caller, amount);
            self.total_sy_locked.write(market, self.total_sy_locked.read(market) - amount);
            self.emit(RedeemPT { user: caller, market, amount });
        }

        fn claim_yield(ref self: ContractState, market: u32) -> u256 {
            let caller = get_caller_address();
            _accrue(ref self, market, caller);
            let y = self.unclaimed_yield.read((market, caller));
            assert(y > 0, 'Core: no yield');
            self.unclaimed_yield.write((market, caller), 0);
            let sy = ISYDispatcher { contract_address: self.sy_tokens.read(market) };
            sy.transfer(caller, y);
            self.emit(YieldClaimed { user: caller, market, amount: y });
            y
        }

        fn update_yield_index(ref self: ContractState, market: u32) {
            let sy = ISYDispatcher { contract_address: self.sy_tokens.read(market) };
            let rate = sy.exchange_rate();
            let current = self.yield_index.read(market);
            if rate > current { self.yield_index.write(market, rate); }
        }

        fn get_market_count(self: @ContractState) -> u32 { self.market_count.read() }
        fn get_sy(self: @ContractState, m: u32) -> ContractAddress { self.sy_tokens.read(m) }
        fn get_pt(self: @ContractState, m: u32) -> ContractAddress { self.pt_tokens.read(m) }
        fn get_yt(self: @ContractState, m: u32) -> ContractAddress { self.yt_tokens.read(m) }
        fn get_maturity(self: @ContractState, m: u32) -> u64 { self.maturities.read(m) }
        fn get_total_locked(self: @ContractState, m: u32) -> u256 { self.total_sy_locked.read(m) }
        fn get_yield_index(self: @ContractState, m: u32) -> u256 { self.yield_index.read(m) }
        fn get_unclaimed(self: @ContractState, m: u32, u: ContractAddress) -> u256 { self.unclaimed_yield.read((m, u)) }
        fn is_matured(self: @ContractState, m: u32) -> bool { get_block_timestamp() >= self.maturities.read(m) }
    }

    fn _accrue(ref self: ContractState, market: u32, user: ContractAddress) {
        let idx = self.yield_index.read(market);
        let user_idx = self.user_last_index.read((market, user));
        if user_idx == 0 { self.user_last_index.write((market, user), idx); return; }
        if idx > user_idx {
            let yt = ISYDispatcher { contract_address: self.yt_tokens.read(market) };
            let bal = yt.balance_of(user);
            if bal > 0 {
                let delta = idx - user_idx;
                let earned = (bal * delta) / 1_000_000_000_000_000_000;
                let prev = self.unclaimed_yield.read((market, user));
                self.unclaimed_yield.write((market, user), prev + earned);
            }
        }
        self.user_last_index.write((market, user), idx);
    }

    #[starknet::interface]
    trait ISY<T> {
        fn transfer(ref self: T, to: ContractAddress, amount: u256) -> bool;
        fn transfer_from(ref self: T, from: ContractAddress, to: ContractAddress, amount: u256) -> bool;
        fn balance_of(self: @T, account: ContractAddress) -> u256;
        fn exchange_rate(self: @T) -> u256;
    }
    #[starknet::interface]
    trait IMint<T> {
        fn mint(ref self: T, to: ContractAddress, amount: u256);
        fn burn(ref self: T, from: ContractAddress, amount: u256);
    }
}
