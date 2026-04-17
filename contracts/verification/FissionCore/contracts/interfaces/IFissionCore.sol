// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IFissionCore {
    struct Market {
        address sy;
        address pt;
        address yt;
        uint256 maturity;
        uint256 scalarRoot;
        uint256 totalSYLocked;
        uint256 yieldIndex;
        bool initialized;
    }

    event MarketCreated(uint256 indexed marketId, address sy, address pt, address yt, uint256 maturity);
    event Split(address indexed user, uint256 indexed marketId, uint256 amount);
    event Merge(address indexed user, uint256 indexed marketId, uint256 amount);
    event RedeemPT(address indexed user, uint256 indexed marketId, uint256 amount);
    event YieldClaimed(address indexed user, uint256 indexed marketId, uint256 amount);

    function createMarket(address sy, uint256 maturity, uint256 scalarRoot) external returns (uint256);
    function split(uint256 marketId, uint256 amount) external;
    function merge(uint256 marketId, uint256 amount) external;
    function redeemPT(uint256 marketId, uint256 amount) external;
    function claimYield(uint256 marketId) external returns (uint256);
    function updateYieldIndex(uint256 marketId) external;
    function getMarket(uint256 marketId) external view returns (Market memory);
    function isMatured(uint256 marketId) external view returns (bool);
    function marketCount() external view returns (uint256);
}
