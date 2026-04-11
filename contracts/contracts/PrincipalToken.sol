// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/// @title PrincipalToken — Redeemable 1:1 for SY at maturity
/// @notice Minting/burning restricted to FissionCore. Transfers blocked when paused.
contract PrincipalToken is ERC20, Ownable, Pausable {
    uint256 public immutable maturity;
    address public immutable sy;
    address public core;

    error OnlyCore();
    error CoreAlreadySet();
    error ZeroAddress();

    modifier onlyCore() { if (msg.sender != core) revert OnlyCore(); _; }

    constructor(
        string memory name_, string memory symbol_,
        address sy_, uint256 maturity_, address owner_
    ) ERC20(name_, symbol_) Ownable(owner_) {
        if (sy_ == address(0)) revert ZeroAddress();
        sy = sy_;
        maturity = maturity_;
    }

    /// @notice One-time core assignment — cannot be changed after set
    function setCore(address core_) external onlyOwner {
        if (core != address(0)) revert CoreAlreadySet();
        if (core_ == address(0)) revert ZeroAddress();
        core = core_;
    }

    function mint(address to, uint256 amount) external onlyCore { _mint(to, amount); }
    function burn(address from, uint256 amount) external onlyCore { _burn(from, amount); }
    function isMatured() public view returns (bool) { return block.timestamp >= maturity; }
    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    /// @dev Block transfers when paused
    function _update(address from, address to, uint256 value) internal override whenNotPaused {
        super._update(from, to, value);
    }
}
