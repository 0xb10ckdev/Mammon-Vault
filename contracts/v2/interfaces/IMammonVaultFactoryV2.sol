// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "./IMammonVaultV2.sol";

/// @title Interface for v2 vault factory.
interface IMammonVaultFactoryV2 {
    /// @notice Create v2 vault.
    /// @param vaultParams Struct vault parameter.
    function create(IMammonVaultV2.NewVaultParams memory vaultParams) external;
}
