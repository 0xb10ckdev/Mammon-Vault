import { expect } from "chai";
import { ethers } from "hardhat";
import { ONE } from "../../constants";
import {
  normalizeWeights,
  toWei,
  tokenValueArray,
  tokenWithValues,
  valueArray,
} from "../../utils";

export function testFunctionCallsWhenNotInitialized(): void {
  beforeEach(async function () {
    for (let i = 0; i < this.numTokens; i++) {
      await this.tokens[i].approve(this.vault.address, toWei(2));
    }
  });

  it("when call deposit", async function () {
    await expect(
      this.vault.deposit(
        tokenValueArray(this.tokenAddresses, ONE, this.numTokens),
      ),
    ).to.be.revertedWith("Mammon__VaultNotInitialized");
  });

  it("when call depositIfBalanceUnchanged", async function () {
    await expect(
      this.vault.depositIfBalanceUnchanged(
        tokenValueArray(this.tokenAddresses, ONE, this.numTokens),
      ),
    ).to.be.revertedWith("Mammon__VaultNotInitialized");
  });

  it("when call depositRiskingArbitrage", async function () {
    await expect(
      this.vault.depositRiskingArbitrage(
        tokenValueArray(this.tokenAddresses, ONE, this.numTokens),
      ),
    ).to.be.revertedWith("Mammon__VaultNotInitialized");
  });

  it("when call depositRiskingArbitrageIfBalanceUnchanged", async function () {
    await expect(
      this.vault.depositRiskingArbitrageIfBalanceUnchanged(
        tokenValueArray(this.tokenAddresses, ONE, this.numTokens),
      ),
    ).to.be.revertedWith("Mammon__VaultNotInitialized");
  });

  it("when call withdraw", async function () {
    await expect(
      this.vault.withdraw(
        tokenValueArray(this.tokenAddresses, ONE, this.numTokens),
      ),
    ).to.be.revertedWith("Mammon__VaultNotInitialized");
  });

  it("when call withdrawIfBalanceUnchanged", async function () {
    await expect(
      this.vault.withdrawIfBalanceUnchanged(
        tokenValueArray(this.tokenAddresses, ONE, this.numTokens),
      ),
    ).to.be.revertedWith("Mammon__VaultNotInitialized");
  });

  it("when call updateWeightsGradually", async function () {
    const blocknumber = await ethers.provider.getBlockNumber();
    await expect(
      this.vault
        .connect(this.signers.guardian)
        .updateWeightsGradually(
          tokenWithValues(
            this.tokenAddresses,
            normalizeWeights(valueArray(ONE, this.numTokens)),
          ),
          blocknumber + 1,
          blocknumber + 1000,
        ),
    ).to.be.revertedWith("Mammon__VaultNotInitialized");
  });

  it("when call cancelWeightUpdates", async function () {
    await expect(
      this.vault.connect(this.signers.guardian).cancelWeightUpdates(),
    ).to.be.revertedWith("Mammon__VaultNotInitialized");
  });

  it("when call claimGuardianFees", async function () {
    await expect(
      this.vault.connect(this.signers.guardian).claimGuardianFees(),
    ).to.be.revertedWith("Mammon__VaultNotInitialized");
  });

  it("when call finalize", async function () {
    await expect(this.vault.finalize()).to.be.revertedWith(
      "Mammon__VaultNotInitialized",
    );
  });
}
