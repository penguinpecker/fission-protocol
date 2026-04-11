// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "./interfaces/IFissionCore.sol";
import "./interfaces/IFissionAMM.sol";
import "./interfaces/IStandardizedYield.sol";

/// @title FissionRouter — User-facing entry for split/swap flows
/// @notice Handles multi-step operations in single transactions.
///         LP operations (add/remove) go directly to AMM — not through Router.
///         Yield claims go directly to Core — not through Router.
///         This avoids the msg.sender proxy issue.
contract FissionRouter is ReentrancyGuard, Pausable, Ownable2Step {
    using SafeERC20 for IERC20;

    IFissionCore public immutable core;
    IFissionAMM public immutable amm;

    error ZeroAmount();
    error SlippageExceeded();
    error DeadlineExpired();
    error ZeroAddress();

    modifier checkDeadline(uint256 deadline) {
        if (deadline != 0 && block.timestamp > deadline) revert DeadlineExpired();
        _;
    }

    constructor(address core_, address amm_) Ownable(msg.sender) {
        if (core_ == address(0) || amm_ == address(0)) revert ZeroAddress();
        core = IFissionCore(core_);
        amm = IFissionAMM(amm_);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ═══════════════ SPLIT & MERGE ═══════════════

    /// @notice Deposit underlying → SY → split into PT + YT
    function depositAndSplit(
        uint256 marketId, uint256 underlyingAmount, uint256 deadline
    ) external nonReentrant whenNotPaused checkDeadline(deadline)
      returns (uint256 ptAmount, uint256 ytAmount)
    {
        if (underlyingAmount == 0) revert ZeroAmount();
        IFissionCore.Market memory m = core.getMarket(marketId);
        address ul = IStandardizedYield(m.sy).underlying();

        IERC20(ul).safeTransferFrom(msg.sender, address(this), underlyingAmount);
        IERC20(ul).safeIncreaseAllowance(m.sy, underlyingAmount);
        uint256 syAmt = IStandardizedYield(m.sy).deposit(address(this), underlyingAmount);

        IERC20(m.sy).safeIncreaseAllowance(address(core), syAmt);
        core.split(marketId, syAmt);

        ptAmount = IERC20(m.pt).balanceOf(address(this));
        ytAmount = IERC20(m.yt).balanceOf(address(this));
        IERC20(m.pt).safeTransfer(msg.sender, ptAmount);
        IERC20(m.yt).safeTransfer(msg.sender, ytAmount);
    }

    // ═══════════════ SWAP FLOWS ═══════════════

    /// @notice Buy PT with SY (lock in fixed yield)
    function buyPT(
        uint256 marketId, uint256 syAmount, uint256 minPTOut, uint256 deadline
    ) external nonReentrant whenNotPaused checkDeadline(deadline) returns (uint256 ptOut) {
        if (syAmount == 0) revert ZeroAmount();
        IFissionCore.Market memory m = core.getMarket(marketId);

        IERC20(m.sy).safeTransferFrom(msg.sender, address(this), syAmount);
        IERC20(m.sy).safeIncreaseAllowance(address(amm), syAmount);
        ptOut = amm.swapSYForPT(marketId, syAmount, minPTOut);
        // PT was sent to Router by AMM, forward to user
        IERC20(m.pt).safeTransfer(msg.sender, ptOut);
    }

    /// @notice Buy YT: split SY, sell the PT side, keep YT
    function buyYT(
        uint256 marketId, uint256 syAmount, uint256 minYTOut, uint256 deadline
    ) external nonReentrant whenNotPaused checkDeadline(deadline) returns (uint256 ytOut) {
        if (syAmount == 0) revert ZeroAmount();
        IFissionCore.Market memory m = core.getMarket(marketId);

        IERC20(m.sy).safeTransferFrom(msg.sender, address(this), syAmount);
        IERC20(m.sy).safeIncreaseAllowance(address(core), syAmount);
        core.split(marketId, syAmount);

        ytOut = IERC20(m.yt).balanceOf(address(this));
        if (ytOut < minYTOut) revert SlippageExceeded();

        // Sell all PT back for SY and return to user
        uint256 ptBal = IERC20(m.pt).balanceOf(address(this));
        if (ptBal > 0) {
            IERC20(m.pt).safeIncreaseAllowance(address(amm), ptBal);
            uint256 syRecovered = amm.swapPTForSY(marketId, ptBal, 0);
            if (syRecovered > 0) {
                IERC20(m.sy).safeTransfer(msg.sender, syRecovered);
            }
        }
        IERC20(m.yt).safeTransfer(msg.sender, ytOut);
    }

    // ═══════════════ LP FLOW (via Router) ═══════════════

    /// @notice Add liquidity — LP tokens go directly to the user (receiver param)
    function addLiquidity(
        uint256 marketId, uint256 syAmt, uint256 ptAmt, uint256 deadline
    ) external nonReentrant whenNotPaused checkDeadline(deadline) returns (uint256 lp) {
        if (syAmt == 0 || ptAmt == 0) revert ZeroAmount();
        IFissionCore.Market memory m = core.getMarket(marketId);

        IERC20(m.sy).safeTransferFrom(msg.sender, address(this), syAmt);
        IERC20(m.pt).safeTransferFrom(msg.sender, address(this), ptAmt);
        IERC20(m.sy).safeIncreaseAllowance(address(amm), syAmt);
        IERC20(m.pt).safeIncreaseAllowance(address(amm), ptAmt);

        // Pass msg.sender as receiver — LP goes to user, not Router
        lp = amm.addLiquidity(marketId, syAmt, ptAmt, msg.sender);
    }

    // ═══════════════ REDEEM ═══════════════

    /// @notice After maturity: redeem PT → SY → underlying
    function redeemAndWithdraw(
        uint256 marketId, uint256 ptAmount, uint256 deadline
    ) external nonReentrant whenNotPaused checkDeadline(deadline) returns (uint256 underlyingOut) {
        if (ptAmount == 0) revert ZeroAmount();
        IFissionCore.Market memory m = core.getMarket(marketId);

        IERC20(m.pt).safeTransferFrom(msg.sender, address(this), ptAmount);
        IERC20(m.pt).safeIncreaseAllowance(address(core), ptAmount);
        core.redeemPT(marketId, ptAmount);

        uint256 syBal = IERC20(m.sy).balanceOf(address(this));
        underlyingOut = IStandardizedYield(m.sy).redeem(msg.sender, syBal);
    }

    // NOTE: For these operations, users call the contract directly:
    // - Remove liquidity: call AMM.removeLiquidity() directly (LP is in user's name)
    // - Claim yield: call Core.claimYield() directly (yield is in user's name)
    // - Merge PT+YT: call Core.merge() directly
}
