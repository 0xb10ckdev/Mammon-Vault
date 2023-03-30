import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import {
  DEVIATION,
  MIN_SWAP_FEE,
  MINIMUM_WEIGHT_CHANGE_DURATION,
  ONE,
  PRICE_DEVIATION,
} from "../../constants";
import {
  getCurrentTime,
  increaseTime,
  normalizeWeights,
  tokenValueArray,
  tokenWithValues,
  toUnit,
  toWei,
  valueArray,
} from "../../utils";

export function testMulticall(): void {
  const ABI = [
    "function depositRiskingArbitrage(tuple(address token, uint256 value)[])",
    "function withdraw(tuple(address token, uint256 value)[])",
    "function updateWeightsGradually(tuple(address token, uint256 value)[], uint256 startTime, uint256 endTime)",
    "function disableTrading()",
    "function enableTradingRiskingArbitrage()",
    "function setSwapFee(uint256 newSwapFee)",
  ];
  const iface = new ethers.utils.Interface(ABI);

  describe("should be reverted", async function () {
    it("when data is invalid", async function () {
      await expect(this.vault.multicall(["0x"])).to.be.revertedWith(
        "Address: low-level delegate call failed",
      );
    });

    it("when vault not initialized", async function () {
      await expect(
        this.vault.multicall([iface.encodeFunctionData("disableTrading", [])]),
      ).to.be.revertedWith("Mammon__VaultNotInitialized()");
    });

    it("when multicall ownable functions from non-owner", async function () {
      await expect(
        this.vault
          .connect(this.signers.user)
          .multicall([iface.encodeFunctionData("disableTrading", [])]),
      ).to.be.revertedWith("Mammon__CallerIsNotOwnerOrGuardian()");
    });
  });

  describe("should be possible to multicall", async function () {
    beforeEach(async function () {
      for (let i = 0; i < this.numTokens; i++) {
        await this.tokens[i].approve(this.vault.address, toWei(100000));
      }

      for (let i = 1; i < this.numPoolTokens; i++) {
        await this.oracles[i].setLatestAnswer(toUnit(1, 8));
      }

      await this.vault.initialDeposit(
        tokenValueArray(this.tokenAddresses, ONE, this.numTokens),
        tokenWithValues(
          this.tokenAddresses,
          normalizeWeights(valueArray(ONE, this.numTokens)),
        ),
      );
    });

    it("when disable trading, deposit and enable trading", async function () {
      const { holdings, adminBalances } = await this.getState();

      const amounts = this.tokens.map(() =>
        toWei(Math.floor(10 + Math.random() * 10)),
      );

      const spotPrices = [];
      for (let i = 0; i < this.numPoolTokens; i++) {
        spotPrices.push(await this.vault.getSpotPrices(this.sortedTokens[i]));
      }

      const trx = await this.vault.multicall([
        iface.encodeFunctionData("disableTrading", []),
        iface.encodeFunctionData("depositRiskingArbitrage", [
          tokenWithValues(this.tokenAddresses, amounts),
        ]),
        iface.encodeFunctionData("enableTradingRiskingArbitrage", []),
      ]);

      const weights = await this.vault.getNormalizedWeights();

      await expect(trx)
        .to.emit(this.vault, "SetSwapEnabled")
        .withArgs(false)
        .to.emit(this.vault, "Deposit")
        .withArgs(amounts, amounts, weights)
        .to.emit(this.vault, "SetSwapEnabled")
        .withArgs(true);

      expect(await this.vault.isSwapEnabled()).to.equal(true);

      const guardiansFeeTotal = await this.getGuardiansFeeTotal();

      const { holdings: newHoldings, adminBalances: newAdminBalances } =
        await this.getState();

      for (let i = 0; i < this.numPoolTokens; i++) {
        const newSpotPrices = await this.vault.getSpotPrices(
          this.sortedTokens[i],
        );

        expect(
          await this.vault.getSpotPrice(
            this.sortedTokens[i],
            this.sortedTokens[(i + 1) % this.numPoolTokens],
          ),
        ).to.equal(newSpotPrices[(i + 1) % this.numPoolTokens]);

        for (let j = 0; j < this.numPoolTokens; j++) {
          expect(newSpotPrices[j]).to.be.closeTo(spotPrices[i][j], DEVIATION);
        }
      }
      for (let i = 0; i < this.numTokens; i++) {
        expect(await this.vault.holding(i)).to.equal(newHoldings[i]);
        expect(newHoldings[i]).to.equal(
          holdings[i].add(amounts[i]).sub(guardiansFeeTotal[i]),
        );
        expect(newAdminBalances[i]).to.equal(adminBalances[i].sub(amounts[i]));
      }
    });

    it("when set swap fees and update weights", async function () {
      const newFee = MIN_SWAP_FEE.add(1);
      const timestamp = await getCurrentTime();
      const endWeights = [];
      const avgWeights = ONE.div(this.numTokens);
      const startTime = timestamp + 10;
      const endTime = timestamp + MINIMUM_WEIGHT_CHANGE_DURATION + 1000;
      for (let i = 0; i < this.numTokens; i += 2) {
        if (i < this.numTokens - 1) {
          endWeights.push(avgWeights.add(toWei((i + 1) / 100)));
          endWeights.push(avgWeights.sub(toWei((i + 1) / 100)));
        } else {
          endWeights.push(avgWeights);
        }
      }

      await expect(
        this.vault
          .connect(this.signers.guardian)
          .multicall([
            iface.encodeFunctionData("setSwapFee", [newFee]),
            iface.encodeFunctionData("updateWeightsGradually", [
              tokenWithValues(
                this.tokenAddresses,
                normalizeWeights(endWeights),
              ),
              startTime,
              endTime,
            ]),
          ]),
      )
        .to.emit(this.vault, "SetSwapFee")
        .withArgs(newFee)
        .to.emit(this.vault, "UpdateWeightsGradually")
        .withArgs(startTime, endTime, normalizeWeights(endWeights));

      expect(
        await this.vault.connect(this.signers.guardian).getSwapFee(),
      ).to.equal(newFee);

      await increaseTime(endTime - (await getCurrentTime()));

      const newWeights = await this.vault.getNormalizedWeights();

      for (let i = 0; i < this.numTokens; i++) {
        expect(endWeights[i]).to.be.closeTo(newWeights[i], DEVIATION);
      }
    });

    it("when disable trading, withdraw and enable trading", async function () {
      await this.vault.depositRiskingArbitrage(
        tokenValueArray(this.tokenAddresses, toWei(10000), this.numTokens),
      );

      const { holdings, adminBalances } = await this.getState();
      const guardiansFeeTotal = await this.getGuardiansFeeTotal();

      const amounts = this.tokens.map(() =>
        toWei(Math.floor(10 + Math.random() * 10)),
      );

      const spotPrices = [];
      for (let i = 0; i < this.numPoolTokens; i++) {
        spotPrices.push(await this.vault.getSpotPrices(this.sortedTokens[i]));
      }

      const trx = await this.vault.multicall([
        iface.encodeFunctionData("disableTrading", []),
        iface.encodeFunctionData("withdraw", [
          tokenWithValues(this.tokenAddresses, amounts),
        ]),
        iface.encodeFunctionData("enableTradingRiskingArbitrage", []),
      ]);

      const weights = await this.vault.getNormalizedWeights();

      await expect(trx)
        .to.emit(this.vault, "SetSwapEnabled")
        .withArgs(false)
        .to.emit(this.vault, "Withdraw")
        .withArgs(amounts, amounts, weights)
        .to.emit(this.vault, "SetSwapEnabled")
        .withArgs(true);

      expect(await this.vault.isSwapEnabled()).to.equal(true);

      const newGuardiansFeeTotal = await this.getGuardiansFeeTotal();

      const { holdings: newHoldings, adminBalances: newAdminBalances } =
        await this.getState();

      for (let i = 0; i < this.numPoolTokens; i++) {
        const newSpotPrices = await this.vault.getSpotPrices(
          this.sortedTokens[i],
        );

        expect(
          await this.vault.getSpotPrice(
            this.sortedTokens[i],
            this.sortedTokens[(i + 1) % this.numPoolTokens],
          ),
        ).to.equal(newSpotPrices[(i + 1) % this.numPoolTokens]);

        for (let j = 0; j < this.numPoolTokens; j++) {
          expect(newSpotPrices[j]).to.be.closeTo(
            spotPrices[i][j],
            spotPrices[i][j].mul(PRICE_DEVIATION).div(ONE).toNumber(),
          );
        }
      }
      for (let i = 0; i < this.numTokens; i++) {
        expect(await this.vault.holding(i)).to.equal(newHoldings[i]);
        expect(newHoldings[i]).to.equal(
          holdings[i]
            .sub(amounts[i])
            .sub(newGuardiansFeeTotal[i])
            .add(guardiansFeeTotal[i]),
        );
        if (i < this.numPoolTokens) {
          let poolTokenWithdrawnAmount = BigNumber.from(0);
          for (let j = 0; j < this.numYieldTokens; j++) {
            if (this.underlyingIndexes[j] == i && !this.isWithdrawable[j]) {
              poolTokenWithdrawnAmount = poolTokenWithdrawnAmount.add(
                amounts[j + this.numPoolTokens],
              );
            }
          }
          expect(newAdminBalances[i]).to.equal(
            adminBalances[i].add(amounts[i]).add(poolTokenWithdrawnAmount),
          );
        } else if (this.isWithdrawable[i - this.numPoolTokens]) {
          expect(newAdminBalances[i]).to.equal(
            adminBalances[i].add(amounts[i]),
          );
        } else {
          expect(newAdminBalances[i]).to.equal(adminBalances[i]);
        }
      }
    });
  });
}
