// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "../MammonVaultV2.sol";

/**
 * @dev Mock MammonVaultV3 with functions for gas estimation.
 *      THIS CONTRACT IS FOR TESTING PURPOSES ONLY. DO NOT USE IN PRODUCTION.
 */
contract MammonVaultV3Mock is MammonVaultV2 {
    // solhint-disable no-empty-blocks
    constructor(NewVaultParams memory vaultParams)
        MammonVaultV2(vaultParams)
    {}

    function depositAndBindTokens(IERC20[] memory tokens) external {
        uint256 numAmounts = numPoolTokens;
        uint256[] memory depositAmounts;

        for (uint256 i = 0; i < tokens.length; i++) {
            pool.addToken(tokens[i], address(this), 1e17, 1, address(this));

            numAmounts++;

            depositAmounts = new uint256[](numAmounts);

            depositAmounts[numAmounts - 1] = ONE;

            depositToPool(depositAmounts);
        }
    }

    function unbindAndWithdrawTokens(IERC20[] memory tokens) external {
        uint256[] memory weights = pool.getNormalizedWeights();
        uint256[] memory withdrawAmounts = new uint256[](weights.length);

        for (uint256 i = 0; i < tokens.length; i++) {
            withdrawAmounts[i] = ONE;

            withdrawFromPool(withdrawAmounts);

            withdrawAmounts[i] = 0;

            pool.removeToken(tokens[i], 1, address(this));
        }
    }
}
