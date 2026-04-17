// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title IStandardizedYield — Wrapper interface for yield-bearing tokens
interface IStandardizedYield is IERC20 {
    function deposit(address receiver, uint256 amountUnderlying) external returns (uint256 sharesOut);
    function redeem(address receiver, uint256 shares) external returns (uint256 amountOut);
    function exchangeRate() external view returns (uint256);
    function underlying() external view returns (address);
    function yieldToken() external view returns (address);
    function accruedRewards(address user) external view returns (uint256);
    function claimRewards(address user) external returns (uint256);
}
