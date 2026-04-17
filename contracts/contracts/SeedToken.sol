// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title SeedToken — simple mintable ERC20 for pool seeding
contract SeedToken is ERC20 {
    constructor() ERC20("Fission Seed USDC", "fUSDC") {
        _mint(msg.sender, 1000 * 1e18); // mint 1000 tokens to deployer
    }
}
