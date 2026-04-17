// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "../interfaces/IStandardizedYield.sol";

/// @title SY_HBARX — Standardized Yield wrapper for Stader HBARX
/// @notice HBARX exchange rate = Total HBAR in pool / Total HBARX circulating.
///         Stader updates this daily as staking rewards accrue (~2.5-5.6% APY).
///         Our keeper reads Stader's rate and posts it here.
contract SY_HBARX is ERC20, IStandardizedYield, Ownable2Step {
    using SafeERC20 for IERC20;

    address public immutable override underlying; // HBARX token
    address public immutable staderContract;
    address public immutable override yieldToken;
    address public keeper;

    uint256 private _totalUnderlying;
    uint256 private _exchangeRate;
    uint256 private constant E18 = 1e18;

    uint256 public constant MAX_RATE_CHANGE_BPS = 200;   // 2% max per update (HBARX moves slowly)
    uint256 public constant MIN_UPDATE_INTERVAL = 4 hours; // Stader updates daily, we check 4x/day
    uint256 public lastRateUpdate;

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
        address hbarx_, address stader_, address keeper_
    ) ERC20("Fission SY-HBARX", "fSY-HBARX") Ownable(msg.sender) {
        if (hbarx_ == address(0)) revert ZeroAddress();
        underlying = hbarx_;
        staderContract = stader_;
        yieldToken = address(0);
        keeper = keeper_;
        _exchangeRate = E18;
        lastRateUpdate = block.timestamp;
    }

    function setKeeper(address newKeeper) external onlyOwner {
        if (newKeeper == address(0)) revert ZeroAddress();
        emit KeeperUpdated(keeper, newKeeper);
        keeper = newKeeper;
    }

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
        shares = ts == 0 ? amount : (amount * E18) / _exchangeRate;
        require(shares > 0, "SY: zero shares");

        _totalUnderlying += amount;
        _mint(receiver, shares);
    }

    function redeem(address receiver, uint256 shares) external override returns (uint256 amount) {
        require(shares > 0, "SY: zero");
        amount = (shares * _exchangeRate) / E18;

        uint256 available = IERC20(underlying).balanceOf(address(this));
        if (amount > available) amount = available;

        _burn(msg.sender, shares);
        if (_totalUnderlying >= amount) _totalUnderlying -= amount;
        else _totalUnderlying = 0;
        IERC20(underlying).safeTransfer(receiver, amount);
    }

    function exchangeRate() external view override returns (uint256) {
        return _exchangeRate;
    }

    function accruedRewards(address) external pure override returns (uint256) { return 0; }
    function claimRewards(address) external pure override returns (uint256) { return 0; }
}
