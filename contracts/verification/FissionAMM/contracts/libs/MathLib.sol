// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title MathLib — Pendle V2 style time-decay AMM math for Fission Protocol
/// @notice Fixed-point math with 18 decimals. Logit curve blends constant-product
///         toward constant-sum as maturity approaches.
library MathLib {
    uint256 internal constant E18 = 1e18;
    int256  internal constant iE18 = 1e18;
    uint256 internal constant YEAR = 365.25 days;
    uint256 internal constant MAX_RATE = 10e18; // 1000% cap

    error PropOutOfBounds();
    error Expired();
    error InsufficientReserve();
    error PTSaturated();

    // ═══════════════════ CORE MATH ═══════════════════

    /// @notice ln(x) for x in 1e18 fixed point. Adapted from Solady/solmate.
    function lnWad(int256 x) internal pure returns (int256 r) {
        require(x > 0);
        unchecked {
            assembly {
                r := shl(7, lt(0xffffffffffffffffffffffffffffffff, x))
                r := or(r, shl(6, lt(0xffffffffffffffff, shr(r, x))))
                r := or(r, shl(5, lt(0xffffffff, shr(r, x))))
                r := or(r, shl(4, lt(0xffff, shr(r, x))))
                r := or(r, shl(3, lt(0xff, shr(r, x))))
                r := or(r, shl(2, lt(0xf, shr(r, x))))
                r := or(r, shl(1, lt(0x3, shr(r, x))))
                r := or(r, lt(0x1, shr(r, x)))
            }
            int256 k = r - 96;
            x = int256(uint256(x) << uint256(159 - uint256(r)));
            x = int256(uint256(x) >> 159);
            int256 p = x + 3273285459638523848632254066296;
            p = ((p * x) >> 96) + 24828157081833163892658089445524;
            p = ((p * x) >> 96) + 43456485725739037958740375743393;
            p = ((p * x) >> 96) - 11111509109440967052023855526967;
            p = ((p * x) >> 96) - 45023709667254063763336534515857;
            p = ((p * x) >> 96) - 14706773417378608786704636184526;
            p = p * x - (795164235651350426258249787498 << 96);
            int256 q = x + 5765692634032170674564426709910;
            q = ((q * x) >> 96) + 13998134659998709944011938770520;
            q = ((q * x) >> 96) + 10002402012660646083498498699423;
            q = ((q * x) >> 96) + 2159771709072398689498567872354;
            q = ((q * x) >> 96) + 131581316521600352466890992;
            assembly { r := sdiv(p, q) }
            r = r * 1677202110996718588342820267708681601
              + k * 16597577552685614221487285958193947469193820559219878177908093499208371;
            r = r >> 174;
        }
    }

    /// @notice e^x for x in 1e18 fixed point
    function expWad(int256 x) internal pure returns (int256 r) {
        unchecked {
            if (x <= -42139678854452767551) return 0;
            if (x >= 135305999368893231589) revert("overflow");
            x = (x << 78) / 5670722649466954195297570287366;
            int256 k = ((x << 96) / 54916777467707473351141471128 + (1 << 95)) >> 96;
            x = x - k * 54916777467707473351141471128;
            int256 y = x + 1346386616545796478920950773328;
            y = ((y * x) >> 96) + 57155421227422021928505568069216;
            int256 p = y + x - 94201549194550492254356042504812;
            p = ((p * y) >> 96) + 28719021644029726153956944680412240;
            p = p * x + (4385272521454847904659076985693276 << 96);
            int256 q = x - 2855989394907223263936484059900;
            q = ((q * x) >> 96) + 50020603652535783019961831881945;
            q = ((q * x) >> 96) - 533845033583426703283633433725380;
            q = ((q * x) >> 96) + 3604857256930695427073651918091429;
            q = ((q * x) >> 96) - 14423608567350463180887372962807573;
            q = ((q * x) >> 96) + 26449188498355588339934803723976023;
            assembly { r := sdiv(p, q) }
            r = int256(
                uint256(r) * 3822833074963236453042738258902158003155416615667
                    >> uint256(195 - uint256(k))
            );
        }
    }

    // ═══════════════════ AMM PRICING ═══════════════════

    /// @notice Implied annual rate from pool proportion + time remaining
    function getImpliedRate(
        uint256 proportion, // PT/(PT+SY) in 1e18
        uint256 scalarRoot, // curve sensitivity (typ 50-200)
        uint256 timeToExpiry // seconds
    ) internal pure returns (uint256) {
        if (proportion == 0 || proportion >= E18) revert PropOutOfBounds();
        if (timeToExpiry == 0) revert Expired();

        int256 logitP = lnWad(int256(proportion)) - lnWad(int256(E18 - proportion));
        int256 timeYears = int256((timeToExpiry * E18) / YEAR);

        int256 rateExp = (logitP * iE18) / ((int256(scalarRoot) * timeYears) / iE18);
        int256 rate = expWad(rateExp) - iE18;

        if (rate < 0) return 0;
        if (uint256(rate) > MAX_RATE) return MAX_RATE;
        return uint256(rate);
    }

    /// @notice PT price given implied rate and time to maturity
    /// @return price in 1e18 (e.g. 0.97e18 = $0.97)
    function getPTPrice(uint256 impliedRate, uint256 timeToExpiry) internal pure returns (uint256) {
        if (timeToExpiry == 0) return E18;
        int256 timeYears = int256((timeToExpiry * E18) / YEAR);
        int256 exponent = -(int256(impliedRate) * timeYears / iE18);
        int256 discount = expWad(exponent);
        if (discount <= 0) return E18;
        return uint256(discount) > E18 ? E18 : uint256(discount);
    }

    // ═══════════════════ SWAP MATH ═══════════════════

    /// @notice Sell PT, receive SY
    function swapExactPTForSY(
        uint256 rSY, uint256 rPT, uint256 ptIn,
        uint256 scalarRoot, uint256 timeToExpiry, uint256 feeBps
    ) internal pure returns (uint256 syOut, uint256 fee, uint256 newImpliedRate) {
        uint256 total = rSY + rPT;
        uint256 newPT = rPT + ptIn;
        uint256 newProp = (newPT * E18) / (total + ptIn);
        if (newProp >= 0.95e18) revert PTSaturated();

        newImpliedRate = getImpliedRate(newProp, scalarRoot, timeToExpiry);
        uint256 ptPrice = getPTPrice(newImpliedRate, timeToExpiry);

        uint256 rawOut = (ptIn * ptPrice) / E18;
        fee = (rawOut * feeBps) / 10000;
        syOut = rawOut - fee;
        if (syOut > rSY) revert InsufficientReserve();
    }

    /// @notice Sell SY, receive PT
    function swapExactSYForPT(
        uint256 rSY, uint256 rPT, uint256 syIn,
        uint256 scalarRoot, uint256 timeToExpiry, uint256 feeBps
    ) internal pure returns (uint256 ptOut, uint256 fee, uint256 newImpliedRate) {
        fee = (syIn * feeBps) / 10000;
        uint256 syNet = syIn - fee;

        uint256 total = rSY + rPT;
        uint256 oldProp = (rPT * E18) / total;
        uint256 oldRate = getImpliedRate(oldProp, scalarRoot, timeToExpiry);
        uint256 ptPrice = getPTPrice(oldRate, timeToExpiry);

        ptOut = (syNet * E18) / ptPrice;
        if (ptOut > rPT) revert InsufficientReserve();

        uint256 newPT = rPT - ptOut;
        uint256 newProp = (newPT * E18) / (total + syIn - ptOut);
        newImpliedRate = newProp > 0 && newProp < E18
            ? getImpliedRate(newProp, scalarRoot, timeToExpiry)
            : oldRate;
    }
}
