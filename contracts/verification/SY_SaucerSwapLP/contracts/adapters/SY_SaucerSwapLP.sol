// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "../interfaces/IStandardizedYield.sol";

/// @title SY_SaucerSwapLP — Standardized Yield wrapper for SaucerSwap V2 LP
/// @notice Exchange rate is fed by an oracle/keeper that reads LP value off-chain
///         and posts it on-chain. Rate-capped to prevent manipulation.
/// @dev SaucerSwap V2 uses NFT positions (Uni V3 style). LP "value" = principal + 
///      uncollected fees. A keeper reads this from the pool contract off-chain,
///      computes the rate, and calls postRate(). This is the same pattern HBARX uses —
///      Stader's contract sets the rate from an off-chain rewards calculation.
contract SY_SaucerSwapLP is ERC20, IStandardizedYield, Ownable2Step {
    using SafeERC20 for IERC20;

    address public immutable override underlying;
    address public immutable pool;
    address public immutable override yieldToken;
    address public keeper;

    uint256 private _totalUnderlying;
    uint256 private _exchangeRate;
    uint256 private constant E18 = 1e18;

    // Rate update controls
    uint256 public constant MAX_RATE_CHANGE_BPS = 500;   // 5% max per update
    uint256 public constant MIN_UPDATE_INTERVAL = 1 hours;
    uint256 public lastRateUpdate;

    event Deposited(address indexed user, uint256 underlying, uint256 shares);
    event Redeemed(address indexed user, uint256 shares, uint256 underlying);
    event RateUpdated(uint256 oldRate, uint256 newRate, address indexed updater);
    event KeeperUpdated(address indexed oldKeeper, address indexed newKeeper);

    error OnlyKeeper();
    error RateChangeTooLarge();
    error UpdateTooFrequent();
    error RateCannotDecrease();
    error ZeroAddress();

    modifier onlyKeeperOrOwner() {
        if (msg.sender != keeper && msg.sender != owner()) revert OnlyKeeper();
        _;
    }

    constructor(
        string memory name_, string memory symbol_,
        address lpToken_, address pool_, address keeper_
    ) ERC20(name_, symbol_) Ownable(msg.sender) {
        if (lpToken_ == address(0)) revert ZeroAddress();
        underlying = lpToken_;
        pool = pool_;
        yieldToken = address(0);
        keeper = keeper_;
        _exchangeRate = E18;  // starts at 1:1
        lastRateUpdate = block.timestamp;
    }

    function setKeeper(address newKeeper) external onlyOwner {
        if (newKeeper == address(0)) revert ZeroAddress();
        emit KeeperUpdated(keeper, newKeeper);
        keeper = newKeeper;
    }

    /// @notice Keeper posts new exchange rate after reading LP value off-chain
    /// @dev Rate-capped and time-gated to prevent manipulation
    function postRate(uint256 newRate) external onlyKeeperOrOwner {
        if (block.timestamp < lastRateUpdate + MIN_UPDATE_INTERVAL) revert UpdateTooFrequent();
        if (newRate < _exchangeRate) revert RateCannotDecrease();

        uint256 maxAllowed = _exchangeRate + (_exchangeRate * MAX_RATE_CHANGE_BPS) / 10000;
        if (newRate > maxAllowed) revert RateChangeTooLarge();

        uint256 oldRate = _exchangeRate;
        _exchangeRate = newRate;
        lastRateUpdate = block.timestamp;

        emit RateUpdated(oldRate, newRate, msg.sender);
    }

    function deposit(address receiver, uint256 amount) external override returns (uint256 shares) {
        require(amount > 0, "SY: zero");
        IERC20(underlying).safeTransferFrom(msg.sender, address(this), amount);

        uint256 ts = totalSupply();
        if (ts == 0) {
            shares = amount;
        } else {
            // shares = amount * totalSupply / totalValue
            // where totalValue = totalSupply * exchangeRate / E18
            shares = (amount * E18) / _exchangeRate;
        }
        require(shares > 0, "SY: zero shares");

        _totalUnderlying += amount;
        _mint(receiver, shares);
        emit Deposited(receiver, amount, shares);
    }

    function redeem(address receiver, uint256 shares) external override returns (uint256 amount) {
        require(shares > 0, "SY: zero");
        // amount = shares * exchangeRate / E18
        amount = (shares * _exchangeRate) / E18;

        uint256 available = IERC20(underlying).balanceOf(address(this));
        if (amount > available) amount = available;  // safety cap

        _burn(msg.sender, shares);
        if (_totalUnderlying >= amount) {
            _totalUnderlying -= amount;
        } else {
            _totalUnderlying = 0;
        }
        IERC20(underlying).safeTransfer(receiver, amount);
        emit Redeemed(receiver, shares, amount);
    }

    /// @notice Returns the current exchange rate (set by keeper)
    /// @dev This is what FissionCore reads via updateYieldIndex
    function exchangeRate() external view override returns (uint256) {
        return _exchangeRate;
    }

    function accruedRewards(address) external pure override returns (uint256) { return 0; }
    function claimRewards(address) external pure override returns (uint256) { return 0; }
}
