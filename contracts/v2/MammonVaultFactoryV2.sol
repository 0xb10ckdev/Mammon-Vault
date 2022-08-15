// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

import "./dependencies/openzeppelin/Ownable.sol";
import "./interfaces/IMammonVaultFactoryV2.sol";
import "./MammonVaultV2.sol";

/// @title Mammon Vault Factory.
contract MammonVaultFactoryV2 is IMammonVaultFactoryV2, Ownable {
    /// EVENTS ///

    /// @notice Emitted when the vault is created.
    /// @param vault Vault address.
    /// @param vaultParams Struct vault parameter.
    event VaultCreated(
        address vault,
        MammonVaultV2.NewVaultParams vaultParams
    );

    /// FUNCTIONS ///

    // solhint-disable no-empty-blocks
    constructor() {}

    /// @inheritdoc IMammonVaultFactoryV2
    function create(MammonVaultV2.NewVaultParams memory vaultParams)
        external
        override
        onlyOwner
    {
        MammonVaultV2 vault = new MammonVaultV2(vaultParams);

        // slither-disable-next-line reentrancy-events
        emit VaultCreated(address(vault), vaultParams);
    }
}
