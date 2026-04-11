// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./interfaces/IFissionCore.sol";
import "./interfaces/IStandardizedYield.sol";
import "./PrincipalToken.sol";
import "./YieldToken.sol";

/// @title FissionCore — Production-grade yield tokenization engine
/// @notice Hardened with: Pausable (global + per-market), rate caps on yield index,
///         cooldown on market creation, 2-step ownership, emergency withdraw,
///         dust protection, reentrancy guards, guardian role, max market cap.
contract FissionCore is IFissionCore, Ownable2Step, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    uint256 private constant E18 = 1e18;
    uint256 public constant MAX_RATE_CHANGE_BPS = 1000;  // 10% max index move per update
    uint256 public constant MIN_SPLIT_AMOUNT = 1000;      // dust protection
    uint256 public constant MARKET_COOLDOWN = 1 hours;
    uint256 public constant MAX_MARKETS = 50;
    uint256 public constant MAX_MATURITY_DURATION = 365 days;

    uint256 public override marketCount;
    uint256 public lastMarketCreation;
    address public guardian;

    mapping(uint256 => Market) public markets;
    mapping(uint256 => mapping(address => uint256)) public userLastIndex;
    mapping(uint256 => mapping(address => uint256)) public unclaimedYield;
    mapping(uint256 => uint256) public lastIndexUpdate;
    mapping(uint256 => bool) public marketPaused;

    error MarketNotInitialized();
    error MarketAlreadyMatured();
    error MarketNotMatured();
    error ZeroAmount();
    error DustAmount();
    error CooldownActive();
    error TooManyMarkets();
    error InvalidMaturity();
    error InvalidSY();
    error InvalidScalarRoot();
    error MarketPausedErr();
    error NotGuardianOrOwner();
    error ZeroAddress();
    error InsufficientSY();

    event GuardianUpdated(address indexed prev, address indexed next_);
    event MarketPauseToggled(uint256 indexed marketId, bool paused);
    event YieldIndexUpdated(uint256 indexed marketId, uint256 oldIdx, uint256 newIdx);
    event EmergencyWithdraw(address indexed token, address indexed to, uint256 amount);

    modifier mExists(uint256 id) { if (!markets[id].initialized) revert MarketNotInitialized(); _; }
    modifier mNotPaused(uint256 id) { if (marketPaused[id]) revert MarketPausedErr(); _; }
    modifier guardianOrOwner() { if (msg.sender != guardian && msg.sender != owner()) revert NotGuardianOrOwner(); _; }

    constructor(address guardian_) Ownable(msg.sender) {
        if (guardian_ == address(0)) revert ZeroAddress();
        guardian = guardian_;
    }

    // ═══════════════════ ADMIN ═══════════════════

    function setGuardian(address g) external onlyOwner {
        if (g == address(0)) revert ZeroAddress();
        emit GuardianUpdated(guardian, g);
        guardian = g;
    }

    function pause() external guardianOrOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function toggleMarketPause(uint256 id, bool p) external guardianOrOwner {
        marketPaused[id] = p;
        emit MarketPauseToggled(id, p);
    }

    function emergencyWithdraw(address token, address to, uint256 amt) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        IERC20(token).safeTransfer(to, amt);
        emit EmergencyWithdraw(token, to, amt);
    }

    function createMarket(
        address sy, uint256 maturity, uint256 scalarRoot
    ) external override onlyOwner whenNotPaused returns (uint256 id) {
        if (sy == address(0)) revert InvalidSY();
        if (maturity <= block.timestamp) revert InvalidMaturity();
        if (maturity > block.timestamp + MAX_MATURITY_DURATION) revert InvalidMaturity();
        if (scalarRoot == 0 || scalarRoot > 1000) revert InvalidScalarRoot();
        if (marketCount >= MAX_MARKETS) revert TooManyMarkets();
        if (block.timestamp < lastMarketCreation + MARKET_COOLDOWN) revert CooldownActive();

        id = marketCount++;
        lastMarketCreation = block.timestamp;

        string memory sfx = _u2s(id);
        PrincipalToken pt = new PrincipalToken(
            string.concat("Fission PT-", sfx), string.concat("fPT-", sfx),
            sy, maturity, address(this)
        );
        YieldToken yt = new YieldToken(
            string.concat("Fission YT-", sfx), string.concat("fYT-", sfx),
            sy, maturity, address(this)
        );
        pt.setCore(address(this));
        yt.setCore(address(this));

        markets[id] = Market({
            sy: sy, pt: address(pt), yt: address(yt),
            maturity: maturity, scalarRoot: scalarRoot,
            totalSYLocked: 0, yieldIndex: E18, initialized: true
        });
        lastIndexUpdate[id] = block.timestamp;
        emit MarketCreated(id, sy, address(pt), address(yt), maturity);
    }

    // ═══════════════════ SPLIT / MERGE / REDEEM ═══════════════════

    function split(uint256 id, uint256 amt)
        external override nonReentrant whenNotPaused mExists(id) mNotPaused(id)
    {
        if (amt == 0) revert ZeroAmount();
        if (amt < MIN_SPLIT_AMOUNT) revert DustAmount();
        Market storage m = markets[id];
        if (block.timestamp >= m.maturity) revert MarketAlreadyMatured();

        _accrueYield(id, msg.sender);
        IERC20(m.sy).safeTransferFrom(msg.sender, address(this), amt);
        PrincipalToken(m.pt).mint(msg.sender, amt);
        YieldToken(m.yt).mint(msg.sender, amt);
        m.totalSYLocked += amt;
        emit Split(msg.sender, id, amt);
    }

    function merge(uint256 id, uint256 amt)
        external override nonReentrant whenNotPaused mExists(id) mNotPaused(id)
    {
        if (amt == 0) revert ZeroAmount();
        Market storage m = markets[id];
        _accrueYield(id, msg.sender);

        PrincipalToken(m.pt).burn(msg.sender, amt);
        YieldToken(m.yt).burn(msg.sender, amt);
        IERC20(m.sy).safeTransfer(msg.sender, amt);
        m.totalSYLocked -= amt;
        emit Merge(msg.sender, id, amt);
    }

    function redeemPT(uint256 id, uint256 amt)
        external override nonReentrant whenNotPaused mExists(id)
    {
        Market storage m = markets[id];
        if (block.timestamp < m.maturity) revert MarketNotMatured();
        if (amt == 0) revert ZeroAmount();

        PrincipalToken(m.pt).burn(msg.sender, amt);
        uint256 available = IERC20(m.sy).balanceOf(address(this));
        if (amt > available) revert InsufficientSY();
        IERC20(m.sy).safeTransfer(msg.sender, amt);
        m.totalSYLocked -= amt;
        emit RedeemPT(msg.sender, id, amt);
    }

    // ═══════════════════ YIELD ═══════════════════

    function updateYieldIndex(uint256 id) external override mExists(id) {
        Market storage m = markets[id];
        // Minimum 30 minutes between updates to prevent gaming
        require(block.timestamp >= lastIndexUpdate[id] + 30 minutes, "Core: too frequent");
        
        uint256 newRate = IStandardizedYield(m.sy).exchangeRate();
        uint256 oldRate = m.yieldIndex;
        if (newRate <= oldRate) return;

        uint256 maxAllowed = oldRate + (oldRate * MAX_RATE_CHANGE_BPS) / 10000;
        if (newRate > maxAllowed) newRate = maxAllowed;

        m.yieldIndex = newRate;
        lastIndexUpdate[id] = block.timestamp;
        emit YieldIndexUpdated(id, oldRate, newRate);
    }

    function claimYield(uint256 id)
        external override nonReentrant whenNotPaused mExists(id) returns (uint256)
    {
        _accrueYield(id, msg.sender);
        uint256 y = unclaimedYield[id][msg.sender];
        if (y == 0) revert ZeroAmount();
        unclaimedYield[id][msg.sender] = 0;

        Market storage m = markets[id];
        uint256 available = IERC20(m.sy).balanceOf(address(this));
        if (y > available) y = available;

        IERC20(m.sy).safeTransfer(msg.sender, y);
        emit YieldClaimed(msg.sender, id, y);
        return y;
    }

    // ═══════════════════ VIEWS ═══════════════════

    function getMarket(uint256 id) external view override returns (Market memory) { return markets[id]; }
    function isMatured(uint256 id) external view override returns (bool) { return block.timestamp >= markets[id].maturity; }
    function getUnclaimed(uint256 id, address u) external view returns (uint256) { return unclaimedYield[id][u]; }

    // ═══════════════════ INTERNAL ═══════════════════

    function _accrueYield(uint256 id, address user) internal {
        Market storage m = markets[id];
        uint256 cIdx = m.yieldIndex;
        uint256 uIdx = userLastIndex[id][user];
        if (uIdx == 0) { userLastIndex[id][user] = cIdx; return; }
        if (cIdx > uIdx) {
            uint256 ytBal = IERC20(m.yt).balanceOf(user);
            if (ytBal > 0) {
                uint256 earned = (ytBal * (cIdx - uIdx)) / E18;
                if (earned > 0) unclaimedYield[id][user] += earned;
            }
        }
        userLastIndex[id][user] = cIdx;
    }

    function _u2s(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 t = v; uint256 d;
        while (t != 0) { d++; t /= 10; }
        bytes memory b = new bytes(d);
        while (v != 0) { d--; b[d] = bytes1(uint8(48 + v % 10)); v /= 10; }
        return string(b);
    }
}
