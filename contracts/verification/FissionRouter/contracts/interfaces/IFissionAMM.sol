// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IFissionAMM {
    struct Pool {
        uint256 reserveSY;
        uint256 reservePT;
        uint256 lpSupply;
        uint256 scalarRoot;
        uint256 maturity;
        uint256 feeBps;
        uint256 totalFees;
        bool initialized;
    }

    event LiquidityAdded(address indexed provider, uint256 indexed marketId, uint256 sy, uint256 pt, uint256 lp);
    event LiquidityRemoved(address indexed provider, uint256 indexed marketId, uint256 lp, uint256 sy, uint256 pt);
    event Swap(address indexed user, uint256 indexed marketId, int256 syDelta, int256 ptDelta, uint256 impliedRate);

    function addLiquidity(uint256 marketId, uint256 syAmt, uint256 ptAmt, address receiver) external returns (uint256 lp);
    function removeLiquidity(uint256 marketId, uint256 lpAmt) external returns (uint256 syOut, uint256 ptOut);
    function swapPTForSY(uint256 marketId, uint256 ptIn, uint256 minSYOut) external returns (uint256);
    function swapSYForPT(uint256 marketId, uint256 syIn, uint256 minPTOut) external returns (uint256);
    function getPool(uint256 marketId) external view returns (Pool memory);
    function getPTPrice(uint256 marketId) external view returns (uint256);
    function getImpliedAPY(uint256 marketId) external view returns (uint256);
    function getLPBalance(uint256 marketId, address user) external view returns (uint256);
}
