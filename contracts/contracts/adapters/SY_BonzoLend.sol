// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IStandardizedYield.sol";

/// @title SY_BonzoLend — Standardized Yield wrapper for Bonzo Finance lending positions
/// @notice Wraps Bonzo's aToken-style receipt tokens (bTokens) into SY interface.
///         Exchange rate increases as lending interest accrues.
contract SY_BonzoLend is ERC20, IStandardizedYield {
    using SafeERC20 for IERC20;

    address public immutable override underlying; // Bonzo bToken (e.g. bUSDC)
    address public immutable bonzoPool;           // Bonzo lending pool
    address public immutable override yieldToken;

    uint256 private _totalUnderlying;
    uint256 private constant E18 = 1e18;

    constructor(
        string memory name_, string memory symbol_,
        address bToken_, address bonzoPool_
    ) ERC20(name_, symbol_) {
        underlying = bToken_;
        bonzoPool = bonzoPool_;
        yieldToken = address(0);
    }

    function deposit(address receiver, uint256 amount) external override returns (uint256 shares) {
        require(amount > 0, "SY: zero");
        IERC20(underlying).safeTransferFrom(msg.sender, address(this), amount);
        uint256 ts = totalSupply();
        shares = ts == 0 ? amount : (amount * ts) / _totalUnderlying;
        _totalUnderlying += amount;
        _mint(receiver, shares);
    }

    function redeem(address receiver, uint256 shares) external override returns (uint256 amount) {
        require(shares > 0, "SY: zero");
        amount = (shares * _totalUnderlying) / totalSupply();
        _burn(msg.sender, shares);
        _totalUnderlying -= amount;
        IERC20(underlying).safeTransfer(receiver, amount);
    }

    /// @dev On mainnet: reads Bonzo's lending rate via their Aave-fork interface
    function exchangeRate() external view override returns (uint256) {
        uint256 ts = totalSupply();
        if (ts == 0) return E18;
        return (_totalUnderlying * E18) / ts;
    }

    function sync() external {
        uint256 bal = IERC20(underlying).balanceOf(address(this));
        if (bal > _totalUnderlying) _totalUnderlying = bal;
    }

    function accruedRewards(address) external pure override returns (uint256) { return 0; }
    function claimRewards(address) external pure override returns (uint256) { return 0; }
}
