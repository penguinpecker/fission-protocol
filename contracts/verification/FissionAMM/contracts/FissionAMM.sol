// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./interfaces/IFissionAMM.sol";
import "./interfaces/IFissionCore.sol";
import "./libs/MathLib.sol";

/// @title FissionAMM — Production time-decay AMM
/// @notice Fixed: addLiquidity uses receiver param so LP goes to actual user.
///         removeLiquidity uses msg.sender — users call AMM directly.
contract FissionAMM is IFissionAMM, Ownable2Step, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    uint256 private constant E18 = 1e18;
    uint256 public constant MIN_LIQUIDITY = 1000;
    uint256 public constant MAX_FEE_BPS = 100;
    uint256 public constant DEFAULT_FEE_BPS = 30;

    IFissionCore public immutable core;
    address public guardian;

    mapping(uint256 => Pool) public pools;
    mapping(uint256 => mapping(address => uint256)) public lpBalances;

    error PoolNotInit();
    error PoolAlreadyInit();
    error ZeroAmount();
    error SlippageExceeded();
    error Matured();
    error InsufficientLP();
    error DeadlineExpired();
    error FeeTooHigh();
    error NotGuardianOrOwner();
    error ZeroAddress();

    event PoolInitialized(uint256 indexed marketId, uint256 sy, uint256 pt, uint256 lp);
    event FeeUpdated(uint256 indexed marketId, uint256 oldFee, uint256 newFee);
    event EmergencyWithdraw(address indexed token, address indexed to, uint256 amount);

    modifier guardianOrOwner() { if (msg.sender != guardian && msg.sender != owner()) revert NotGuardianOrOwner(); _; }

    constructor(address core_, address guardian_) Ownable(msg.sender) {
        if (core_ == address(0) || guardian_ == address(0)) revert ZeroAddress();
        core = IFissionCore(core_);
        guardian = guardian_;
    }

    function setGuardian(address g) external onlyOwner {
        if (g == address(0)) revert ZeroAddress();
        guardian = g;
    }

    function pause() external guardianOrOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function emergencyWithdraw(address token, address to, uint256 amt) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        IERC20(token).safeTransfer(to, amt);
        emit EmergencyWithdraw(token, to, amt);
    }

    function updateFee(uint256 marketId, uint256 newFeeBps) external onlyOwner {
        if (newFeeBps > MAX_FEE_BPS) revert FeeTooHigh();
        Pool storage p = pools[marketId];
        if (!p.initialized) revert PoolNotInit();
        uint256 old = p.feeBps;
        p.feeBps = newFeeBps;
        emit FeeUpdated(marketId, old, newFeeBps);
    }

    // ═══════════════════ POOL INIT ═══════════════════

    function initializePool(
        uint256 marketId, uint256 syAmt, uint256 ptAmt, uint256 feeBps
    ) external onlyOwner whenNotPaused returns (uint256 lp) {
        if (pools[marketId].initialized) revert PoolAlreadyInit();
        if (syAmt == 0 || ptAmt == 0) revert ZeroAmount();
        if (feeBps > MAX_FEE_BPS) revert FeeTooHigh();

        IFissionCore.Market memory m = core.getMarket(marketId);
        require(m.initialized, "AMM: market DNE");

        IERC20(m.sy).safeTransferFrom(msg.sender, address(this), syAmt);
        IERC20(m.pt).safeTransferFrom(msg.sender, address(this), ptAmt);

        lp = (syAmt + ptAmt) / 2;
        require(lp > MIN_LIQUIDITY, "AMM: initial liq too low");

        pools[marketId] = Pool({
            reserveSY: syAmt, reservePT: ptAmt,
            lpSupply: lp,
            scalarRoot: m.scalarRoot, maturity: m.maturity,
            feeBps: feeBps > 0 ? feeBps : DEFAULT_FEE_BPS,
            totalFees: 0, initialized: true
        });

        lpBalances[marketId][address(1)] = MIN_LIQUIDITY;
        lpBalances[marketId][msg.sender] = lp - MIN_LIQUIDITY;

        emit PoolInitialized(marketId, syAmt, ptAmt, lp);
        emit LiquidityAdded(msg.sender, marketId, syAmt, ptAmt, lp - MIN_LIQUIDITY);
    }

    // ═══════════════════ LIQUIDITY ═══════════════════

    /// @notice Add liquidity — LP tokens go to `receiver`, not msg.sender
    /// @dev This allows Router to call on behalf of users correctly
    function addLiquidity(uint256 marketId, uint256 syAmt, uint256 ptAmt, address receiver)
        external override nonReentrant whenNotPaused returns (uint256 lp)
    {
        Pool storage p = pools[marketId];
        if (!p.initialized) revert PoolNotInit();
        if (syAmt == 0 || ptAmt == 0) revert ZeroAmount();
        if (receiver == address(0)) revert ZeroAddress();

        IFissionCore.Market memory m = core.getMarket(marketId);
        IERC20(m.sy).safeTransferFrom(msg.sender, address(this), syAmt);
        IERC20(m.pt).safeTransferFrom(msg.sender, address(this), ptAmt);

        uint256 lpSY = (syAmt * p.lpSupply) / p.reserveSY;
        uint256 lpPT = (ptAmt * p.lpSupply) / p.reservePT;
        lp = lpSY < lpPT ? lpSY : lpPT;
        require(lp > 0, "AMM: zero LP");

        p.reserveSY += syAmt;
        p.reservePT += ptAmt;
        p.lpSupply += lp;
        lpBalances[marketId][receiver] += lp;  // LP goes to receiver, not msg.sender

        emit LiquidityAdded(receiver, marketId, syAmt, ptAmt, lp);
    }

    /// @notice Remove liquidity — caller gets their own LP back
    /// @dev Users call this directly, NOT through Router
    function removeLiquidity(uint256 marketId, uint256 lpAmt)
        external override nonReentrant whenNotPaused returns (uint256 syOut, uint256 ptOut)
    {
        Pool storage p = pools[marketId];
        if (!p.initialized) revert PoolNotInit();
        if (lpAmt == 0) revert ZeroAmount();
        if (lpBalances[marketId][msg.sender] < lpAmt) revert InsufficientLP();

        syOut = (lpAmt * p.reserveSY) / p.lpSupply;
        ptOut = (lpAmt * p.reservePT) / p.lpSupply;

        p.reserveSY -= syOut;
        p.reservePT -= ptOut;
        p.lpSupply -= lpAmt;
        lpBalances[marketId][msg.sender] -= lpAmt;

        IFissionCore.Market memory m = core.getMarket(marketId);
        IERC20(m.sy).safeTransfer(msg.sender, syOut);
        IERC20(m.pt).safeTransfer(msg.sender, ptOut);

        emit LiquidityRemoved(msg.sender, marketId, lpAmt, syOut, ptOut);
    }

    // ═══════════════════ SWAPS ═══════════════════

    function swapPTForSY(uint256 marketId, uint256 ptIn, uint256 minSYOut)
        external override nonReentrant whenNotPaused returns (uint256 syOut)
    {
        return _swapPTForSY(marketId, ptIn, minSYOut);
    }

    function swapPTForSYWithDeadline(
        uint256 marketId, uint256 ptIn, uint256 minSYOut, uint256 deadline
    ) external nonReentrant whenNotPaused returns (uint256 syOut) {
        if (block.timestamp > deadline) revert DeadlineExpired();
        return _swapPTForSY(marketId, ptIn, minSYOut);
    }

    function swapSYForPT(uint256 marketId, uint256 syIn, uint256 minPTOut)
        external override nonReentrant whenNotPaused returns (uint256 ptOut)
    {
        return _swapSYForPT(marketId, syIn, minPTOut);
    }

    function swapSYForPTWithDeadline(
        uint256 marketId, uint256 syIn, uint256 minPTOut, uint256 deadline
    ) external nonReentrant whenNotPaused returns (uint256 ptOut) {
        if (block.timestamp > deadline) revert DeadlineExpired();
        return _swapSYForPT(marketId, syIn, minPTOut);
    }

    // ═══════════════════ VIEWS ═══════════════════

    function getPool(uint256 marketId) external view override returns (Pool memory) { return pools[marketId]; }

    function getPTPrice(uint256 marketId) external view override returns (uint256) {
        Pool storage p = pools[marketId];
        if (!p.initialized || p.reservePT == 0 || block.timestamp >= p.maturity) return E18;
        uint256 total = p.reserveSY + p.reservePT;
        uint256 prop = (p.reservePT * E18) / total;
        if (prop == 0 || prop >= E18) return E18;
        uint256 ttx = p.maturity - block.timestamp;
        return MathLib.getPTPrice(MathLib.getImpliedRate(prop, p.scalarRoot, ttx), ttx);
    }

    function getImpliedAPY(uint256 marketId) external view override returns (uint256) {
        Pool storage p = pools[marketId];
        if (!p.initialized || block.timestamp >= p.maturity) return 0;
        uint256 total = p.reserveSY + p.reservePT;
        uint256 prop = (p.reservePT * E18) / total;
        if (prop == 0 || prop >= E18) return 0;
        return MathLib.getImpliedRate(prop, p.scalarRoot, p.maturity - block.timestamp);
    }

    function getLPBalance(uint256 marketId, address user) external view override returns (uint256) {
        return lpBalances[marketId][user];
    }

    function quotePTForSY(uint256 marketId, uint256 ptIn) external view returns (uint256) {
        Pool storage p = pools[marketId];
        if (!p.initialized || block.timestamp >= p.maturity) return 0;
        (uint256 out,,) = MathLib.swapExactPTForSY(p.reserveSY, p.reservePT, ptIn, p.scalarRoot, p.maturity - block.timestamp, p.feeBps);
        return out;
    }

    function quoteSYForPT(uint256 marketId, uint256 syIn) external view returns (uint256) {
        Pool storage p = pools[marketId];
        if (!p.initialized || block.timestamp >= p.maturity) return 0;
        (uint256 out,,) = MathLib.swapExactSYForPT(p.reserveSY, p.reservePT, syIn, p.scalarRoot, p.maturity - block.timestamp, p.feeBps);
        return out;
    }

    // ═══════════════════ INTERNAL ═══════════════════

    function _swapPTForSY(uint256 marketId, uint256 ptIn, uint256 minSYOut) internal returns (uint256 syOut) {
        Pool storage p = pools[marketId];
        if (!p.initialized) revert PoolNotInit();
        if (ptIn == 0) revert ZeroAmount();
        if (block.timestamp >= p.maturity) revert Matured();

        uint256 ttx = p.maturity - block.timestamp;
        uint256 fee; uint256 newRate;
        (syOut, fee, newRate) = MathLib.swapExactPTForSY(p.reserveSY, p.reservePT, ptIn, p.scalarRoot, ttx, p.feeBps);
        if (syOut < minSYOut) revert SlippageExceeded();

        IFissionCore.Market memory m = core.getMarket(marketId);
        IERC20(m.pt).safeTransferFrom(msg.sender, address(this), ptIn);
        IERC20(m.sy).safeTransfer(msg.sender, syOut);

        p.reservePT += ptIn;
        p.reserveSY -= syOut;
        p.totalFees += fee;
        emit Swap(msg.sender, marketId, -int256(syOut), int256(ptIn), newRate);
    }

    function _swapSYForPT(uint256 marketId, uint256 syIn, uint256 minPTOut) internal returns (uint256 ptOut) {
        Pool storage p = pools[marketId];
        if (!p.initialized) revert PoolNotInit();
        if (syIn == 0) revert ZeroAmount();
        if (block.timestamp >= p.maturity) revert Matured();

        uint256 ttx = p.maturity - block.timestamp;
        uint256 fee; uint256 newRate;
        (ptOut, fee, newRate) = MathLib.swapExactSYForPT(p.reserveSY, p.reservePT, syIn, p.scalarRoot, ttx, p.feeBps);
        if (ptOut < minPTOut) revert SlippageExceeded();

        IFissionCore.Market memory m = core.getMarket(marketId);
        IERC20(m.sy).safeTransferFrom(msg.sender, address(this), syIn);
        IERC20(m.pt).safeTransfer(msg.sender, ptOut);

        p.reserveSY += syIn;
        p.reservePT -= ptOut;
        p.totalFees += fee;
        emit Swap(msg.sender, marketId, int256(syIn), -int256(ptOut), newRate);
    }
}
