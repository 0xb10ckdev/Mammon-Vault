import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import hre, { deployments, ethers } from "hardhat";
import { DEFAULT_NOTICE_PERIOD, getConfig } from "../../../scripts/config";
import {
  MammonVaultV1Mock,
  BaseManagedPoolFactory__factory,
  IERC20,
  ManagedPoolFactory,
  ManagedPoolFactory__factory,
  WithdrawalValidatorMock,
  WithdrawalValidatorMock__factory,
} from "../../../typechain";
import { baseContext } from "../../common/contexts";
import {
  BALANCER_ERRORS,
  DEVIATION,
  MAXIMUM_SWAP_FEE_PERCENT_CHANGE,
  MAX_MANAGEMENT_FEE,
  MAX_NOTICE_PERIOD,
  MAX_SWAP_FEE,
  MAX_WEIGHT_CHANGE_RATIO,
  MINIMUM_WEIGHT_CHANGE_DURATION,
  MIN_SWAP_FEE,
  MIN_WEIGHT,
  NOTICE_PERIOD,
  ONE,
  SWAP_FEE_COOLDOWN_PERIOD,
  ZERO_ADDRESS,
} from "../constants";
import { deployToken, setupTokens } from "../fixtures";
import {
  deployFactory,
  deployVault,
  getCurrentTime,
  getTimestamp,
  increaseTime,
  tokenValueArray,
  tokenWithValues,
  toWei,
  valueArray,
  VaultParams,
} from "../utils";

describe("Mammon Vault V1 Mainnet Deployment", function () {
  let admin: SignerWithAddress;
  let guardian: SignerWithAddress;
  let validator: WithdrawalValidatorMock;
  let factory: ManagedPoolFactory;
  let tokens: IERC20[];
  let sortedTokens: string[];
  let unsortedTokens: string[];
  let snapshot: unknown;
  let validWeights: string[];
  let validParams: VaultParams;

  describe("should be reverted to deploy vault", async () => {
    before(async function () {
      snapshot = await ethers.provider.send("evm_snapshot", []);
      ({ admin, guardian } = await ethers.getNamedSigners());

      ({ tokens, sortedTokens, unsortedTokens } = await setupTokens());
      validWeights = valueArray(ONE.div(tokens.length), tokens.length);

      await deployments.deploy("Validator", {
        contract: "WithdrawalValidatorMock",
        args: [tokens.length],
        from: admin.address,
        log: true,
      });
      validator = WithdrawalValidatorMock__factory.connect(
        (await deployments.get("Validator")).address,
        admin,
      );

      await deployments.deploy("InvalidValidator", {
        contract: "InvalidValidatorMock",
        from: admin.address,
        log: true,
      });

      factory = await deployFactory(admin);
    });

    beforeEach(async function () {
      const config = getConfig(hre.network.config.chainId || 1);

      validParams = {
        signer: admin,
        factory: factory.address,
        name: "Test",
        symbol: "TEST",
        tokens: sortedTokens,
        weights: validWeights,
        swapFeePercentage: MIN_SWAP_FEE,
        guardian: guardian.address,
        validator: validator.address,
        noticePeriod: MAX_NOTICE_PERIOD,
        managementFee: MAX_MANAGEMENT_FEE,
        merkleOrchard: config.merkleOrchard,
        description: "Test Vault",
      };
    });

    after(async () => {
      await ethers.provider.send("evm_revert", [snapshot]);
    });

    it("when token and weight length is not same", async () => {
      validParams.tokens = [...sortedTokens, tokens[0].address];
      await expect(deployVault(validParams)).to.be.revertedWith(
        "Mammon__ValueLengthIsNotSame",
      );
    });

    it("when management fee is greater than maximum", async () => {
      validParams.managementFee = MAX_MANAGEMENT_FEE.add(1);
      await expect(deployVault(validParams)).to.be.revertedWith(
        "Mammon__ManagementFeeIsAboveMax",
      );
    });

    it("when notice period is greater than maximum", async () => {
      validParams.noticePeriod = MAX_NOTICE_PERIOD + 1;
      await expect(deployVault(validParams)).to.be.revertedWith(
        "Mammon__NoticePeriodIsAboveMax",
      );
    });

    it("when validator is not valid", async () => {
      validParams.validator = guardian.address;
      await expect(deployVault(validParams)).to.be.revertedWith(
        "Mammon__ValidatorIsNotValid",
      );

      validParams.validator = (
        await deployments.get("InvalidValidator")
      ).address;
      await expect(deployVault(validParams)).to.be.revertedWith(
        "Mammon__ValidatorIsNotValid",
      );
    });

    it("when validator is not matched", async () => {
      const validatorMock =
        await ethers.getContractFactory<WithdrawalValidatorMock__factory>(
          "WithdrawalValidatorMock",
        );
      const mismatchedValidator = await validatorMock
        .connect(admin)
        .deploy(tokens.length - 1);
      validParams.validator = mismatchedValidator.address;
      await expect(deployVault(validParams)).to.be.revertedWith(
        "Mammon__ValidatorIsNotMatched",
      );
    });

    it("when token is not sorted in ascending order", async () => {
      validParams.tokens = unsortedTokens;
      await expect(deployVault(validParams)).to.be.revertedWith(
        BALANCER_ERRORS.UNSORTED_ARRAY,
      );
    });

    it("when token is duplicated", async () => {
      validParams.tokens = [sortedTokens[0], ...sortedTokens.slice(0, -1)];
      await expect(deployVault(validParams)).to.be.revertedWith(
        BALANCER_ERRORS.UNSORTED_ARRAY,
      );
    });

    it("when swap fee is greater than maximum", async () => {
      validParams.swapFeePercentage = MAX_SWAP_FEE.add(1);
      await expect(deployVault(validParams)).to.be.revertedWith(
        BALANCER_ERRORS.MAX_SWAP_FEE_PERCENTAGE,
      );
    });

    it("when swap fee is less than minimum", async () => {
      validParams.swapFeePercentage = MIN_SWAP_FEE.sub(1);
      await expect(deployVault(validParams)).to.be.revertedWith(
        BALANCER_ERRORS.MIN_SWAP_FEE_PERCENTAGE,
      );
    });

    it("when total sum of weights is not one", async () => {
      validParams.weights = valueArray(MIN_WEIGHT, tokens.length);
      await expect(deployVault(validParams)).to.be.revertedWith(
        BALANCER_ERRORS.NORMALIZED_WEIGHT_INVARIANT,
      );
    });

    it("when guardian is zero address", async () => {
      validParams.guardian = ZERO_ADDRESS;
      await expect(deployVault(validParams)).to.be.revertedWith(
        "Mammon__GuardianIsZeroAddress",
      );
    });

    it("when guardian is deployer", async () => {
      validParams.guardian = admin.address;
      await expect(deployVault(validParams)).to.be.revertedWith(
        "Mammon__GuardianIsOwner",
      );
    });

    it("when description is empty", async () => {
      validParams.description = "";
      await expect(deployVault(validParams)).to.be.revertedWith(
        "Mammon__DescriptionIsEmpty",
      );
    });
  });
});

baseContext("Mammon Vault V1 Mainnet Functionality", function () {
  let admin: SignerWithAddress;
  let guardian: SignerWithAddress;
  let user: SignerWithAddress;
  let vault: MammonVaultV1Mock;
  let validator: WithdrawalValidatorMock;
  let tokens: IERC20[];
  let sortedTokens: string[];
  let unsortedTokens: string[];

  const getUserBalances = async (address: string) => {
    const balances = await Promise.all(
      tokens.map(token => token.balanceOf(address)),
    );
    return balances;
  };

  const getGuardiansFeeTotal = async () => {
    const guardiansFeeTotal = await Promise.all(
      Array.from(Array(tokens.length).keys()).map(index =>
        vault.guardiansFeeTotal(index),
      ),
    );
    return guardiansFeeTotal;
  };

  const getState = async (
    guardianAddress: string | null = null,
    adminAddress: string | null = null,
  ) => {
    const [holdings, adminBalances, guardianBalances] = await Promise.all([
      vault.getHoldings(),
      getUserBalances(adminAddress || admin.address),
      getUserBalances(guardianAddress || guardian.address),
    ]);

    return {
      holdings,
      adminBalances,
      guardianBalances,
    };
  };

  async function forkTestFixture() {
    const config = getConfig(hre.network.config.chainId || 1);
    const { tokens, sortedTokens, unsortedTokens } = await setupTokens();

    const validatorMock =
      await ethers.getContractFactory<WithdrawalValidatorMock__factory>(
        "WithdrawalValidatorMock",
      );

    const validator = await validatorMock.connect(admin).deploy(tokens.length);

    const baseManagedPoolFactoryContract =
      await ethers.getContractFactory<BaseManagedPoolFactory__factory>(
        "BaseManagedPoolFactory",
      );
    const baseManagedPoolFactory = await baseManagedPoolFactoryContract
      .connect(admin)
      .deploy(config.bVault);

    const managedPoolFactoryContract =
      await ethers.getContractFactory<ManagedPoolFactory__factory>(
        "ManagedPoolFactory",
      );
    const factory = await managedPoolFactoryContract
      .connect(admin)
      .deploy(baseManagedPoolFactory.address);

    const validWeights = valueArray(ONE.div(tokens.length), tokens.length);

    const vault = await hre.run("deploy:vault", {
      factory: factory.address,
      name: "Test",
      symbol: "TEST",
      tokens: sortedTokens.join(","),
      weights: validWeights.join(","),
      swapFee: MIN_SWAP_FEE.toString(),
      guardian: guardian.address,
      validator: validator.address,
      noticePeriod: DEFAULT_NOTICE_PERIOD.toString(),
      managementFee: MAX_MANAGEMENT_FEE.toString(),
      description: "Test vault description",
      silent: true,
      test: true,
    });
    return { tokens, sortedTokens, vault, validator, unsortedTokens };
  }

  beforeEach(async function () {
    ({ admin, guardian, user } = this.signers);

    ({ vault, validator, tokens, sortedTokens, unsortedTokens } =
      await this.loadFixture(forkTestFixture));
  });

  describe("when Vault not initialized", () => {
    beforeEach(async () => {
      for (let i = 0; i < tokens.length; i++) {
        await tokens[i].approve(vault.address, toWei(2));
      }
    });

    describe("should be reverted to call functions", async () => {
      it("when call deposit", async () => {
        await expect(
          vault.deposit(tokenValueArray(sortedTokens, ONE, tokens.length)),
        ).to.be.revertedWith("Mammon__VaultNotInitialized");
      });

      it("when call depositIfBalanceUnchanged", async () => {
        await expect(
          vault.depositIfBalanceUnchanged(
            tokenValueArray(sortedTokens, ONE, tokens.length),
          ),
        ).to.be.revertedWith("Mammon__VaultNotInitialized");
      });

      it("when call withdraw", async () => {
        await expect(
          vault.withdraw(tokenValueArray(sortedTokens, ONE, tokens.length)),
        ).to.be.revertedWith("Mammon__VaultNotInitialized");
      });

      it("when call withdrawIfBalanceUnchanged", async () => {
        await expect(
          vault.withdrawIfBalanceUnchanged(
            tokenValueArray(sortedTokens, ONE, tokens.length),
          ),
        ).to.be.revertedWith("Mammon__VaultNotInitialized");
      });

      it("when call updateWeightsGradually", async () => {
        const blocknumber = await ethers.provider.getBlockNumber();
        await expect(
          vault
            .connect(guardian)
            .updateWeightsGradually(
              tokenValueArray(
                sortedTokens,
                ONE.div(tokens.length),
                tokens.length,
              ),
              blocknumber + 1,
              blocknumber + 1000,
            ),
        ).to.be.revertedWith("Mammon__VaultNotInitialized");
      });

      it("when call cancelWeightUpdates", async () => {
        await expect(
          vault.connect(guardian).cancelWeightUpdates(),
        ).to.be.revertedWith("Mammon__VaultNotInitialized");
      });

      it("when call claimGuardianFees", async () => {
        await expect(
          vault.connect(guardian).claimGuardianFees(),
        ).to.be.revertedWith("Mammon__VaultNotInitialized");
      });

      it("when call initiateFinalization", async () => {
        await expect(vault.initiateFinalization()).to.be.revertedWith(
          "Mammon__VaultNotInitialized",
        );
      });

      it("when call finalize", async () => {
        await expect(vault.finalize()).to.be.revertedWith(
          "Mammon__VaultNotInitialized",
        );
      });
    });

    describe("should be reverted to initialize the vault", async () => {
      it("when token and amount length is not same", async () => {
        await expect(
          vault.initialDeposit(
            tokenValueArray(sortedTokens, ONE, tokens.length + 1),
          ),
        ).to.be.revertedWith("Mammon__ValueLengthIsNotSame");
      });

      it("when token is not sorted", async () => {
        await expect(
          vault.initialDeposit(
            tokenValueArray(unsortedTokens, ONE, tokens.length),
          ),
        ).to.be.revertedWith("Mammon__DifferentTokensInPosition");
      });

      it("when amount exceeds allowance", async () => {
        const validAmounts = tokenValueArray(sortedTokens, ONE, tokens.length);

        await expect(
          vault.initialDeposit([
            {
              token: sortedTokens[0],
              value: toWei(3),
            },
            ...validAmounts.slice(1),
          ]),
        ).to.be.revertedWith("ERC20: insufficient allowance");

        await expect(
          vault.initialDeposit([
            ...validAmounts.slice(0, -1),
            {
              token: sortedTokens[tokens.length - 1],
              value: toWei(3),
            },
          ]),
        ).to.be.revertedWith("ERC20: insufficient allowance");
      });

      it("when amount is zero", async () => {
        const validAmounts = tokenValueArray(sortedTokens, ONE, tokens.length);

        await expect(
          vault.initialDeposit([
            {
              token: sortedTokens[0],
              value: 0,
            },
            ...validAmounts.slice(1),
          ]),
        ).to.be.revertedWith(BALANCER_ERRORS.ZERO_INVARIANT);

        await expect(
          vault.initialDeposit([
            ...validAmounts.slice(0, -1),
            {
              token: sortedTokens[tokens.length - 1],
              value: 0,
            },
          ]),
        ).to.be.revertedWith(BALANCER_ERRORS.ZERO_INVARIANT);
      });
    });

    it("should be possible to initialize the vault", async () => {
      const balances = await getUserBalances(admin.address);

      await vault.initialDeposit(
        tokenValueArray(sortedTokens, ONE, tokens.length),
      );

      const { holdings, adminBalances: newAdminBalances } = await getState();
      for (let i = 0; i < tokens.length; i++) {
        expect(newAdminBalances[i]).to.equal(balances[i].sub(ONE));
        expect(holdings[i]).to.equal(ONE);
      }
    });
  });

  describe("when Vault is initialized", () => {
    beforeEach(async () => {
      for (let i = 0; i < tokens.length; i++) {
        await tokens[i].approve(vault.address, toWei(100));
      }
      await vault.initialDeposit(
        tokenValueArray(sortedTokens, ONE, tokens.length),
      );
    });

    it("should be reverted to initialize the vault again", async () => {
      await expect(
        vault.initialDeposit(
          tokenValueArray(sortedTokens, ONE, tokens.length),
        ),
      ).to.be.revertedWith("Mammon__VaultIsAlreadyInitialized");
    });

    describe("when depositing to Vault", () => {
      describe("should be reverted to deposit tokens", async () => {
        it("when called from non-owner", async () => {
          await expect(
            vault
              .connect(user)
              .deposit(tokenValueArray(sortedTokens, ONE, tokens.length)),
          ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("when token and amount length is not same", async () => {
          await expect(
            vault.deposit(
              tokenValueArray(sortedTokens, ONE, tokens.length + 1),
            ),
          ).to.be.revertedWith("Mammon__ValueLengthIsNotSame");
        });

        it("when token is not sorted", async () => {
          await expect(
            vault.deposit(tokenValueArray(unsortedTokens, ONE, tokens.length)),
          ).to.be.revertedWith("Mammon__DifferentTokensInPosition");
        });

        it("when amount exceeds allowance", async () => {
          await expect(
            vault.deposit(
              tokenValueArray(sortedTokens, toWei(100), tokens.length),
            ),
          ).to.be.revertedWith("ERC20: insufficient allowance");
        });

        it("when balance is changed in the same block", async () => {
          const amounts = tokens.map(_ =>
            toWei(Math.floor(Math.random() * 100)),
          );

          for (let i = 0; i < tokens.length; i++) {
            await tokens[i].approve(vault.address, amounts[i].mul(2));
          }

          await ethers.provider.send("evm_setAutomine", [false]);
          await ethers.provider.send("evm_setIntervalMining", [0]);

          const trx1 = await vault.deposit(
            tokenWithValues(sortedTokens, amounts),
          );
          const trx2 = await vault.depositIfBalanceUnchanged(
            tokenWithValues(sortedTokens, amounts),
          );

          await ethers.provider.send("evm_mine", []);

          try {
            await trx1.wait();
            await trx2.wait();
          } catch {
            // empty
          }

          const receipt1 = await ethers.provider.getTransactionReceipt(
            trx1.hash,
          );
          const receipt2 = await ethers.provider.getTransactionReceipt(
            trx2.hash,
          );

          expect(receipt1.status).to.equal(1);
          expect(receipt2.status).to.equal(0);

          await ethers.provider.send("evm_setAutomine", [true]);
          await ethers.provider.send("evm_setIntervalMining", [0]);
        });
      });

      describe("should be possible to deposit tokens", async () => {
        it("when depositing one token", async () => {
          let { holdings, adminBalances } = await getState();
          let guardiansFeeTotal = await getGuardiansFeeTotal();

          for (let i = 0; i < tokens.length; i++) {
            const amounts = new Array(tokens.length).fill(0);
            amounts[i] = toWei(5);

            const spotPrices = await vault.getSpotPrices(tokens[i].address);

            await vault.deposit(tokenWithValues(sortedTokens, amounts));
            const newGuardiansFeeTotal = await getGuardiansFeeTotal();

            const newSpotPrices = await vault.getSpotPrices(tokens[i].address);
            const { holdings: newHoldings, adminBalances: newAdminBalances } =
              await getState();

            for (let j = 0; j < tokens.length; j++) {
              expect(newSpotPrices[j]).to.closeTo(spotPrices[j], DEVIATION);
              expect(newHoldings[j]).to.equal(
                holdings[j]
                  .add(amounts[j])
                  .sub(newGuardiansFeeTotal[j])
                  .add(guardiansFeeTotal[j]),
              );
              expect(newAdminBalances[j]).to.equal(
                adminBalances[j].sub(amounts[j]),
              );
            }

            holdings = newHoldings;
            adminBalances = newAdminBalances;
            guardiansFeeTotal = newGuardiansFeeTotal;
          }
        });

        it("when depositing tokens", async () => {
          const { holdings, adminBalances } = await getState();

          const amounts = tokens.map(_ =>
            toWei(Math.floor(50 + Math.random() * 10)),
          );

          const spotPrices = [];
          for (let i = 0; i < tokens.length; i++) {
            await tokens[i].approve(vault.address, amounts[i]);
            spotPrices.push(await vault.getSpotPrices(tokens[i].address));
          }

          await vault.deposit(tokenWithValues(sortedTokens, amounts));
          const guardiansFeeTotal = await getGuardiansFeeTotal();

          const { holdings: newHoldings, adminBalances: newAdminBalances } =
            await getState();

          for (let i = 0; i < tokens.length; i++) {
            const newSpotPrices = await vault.getSpotPrices(tokens[i].address);

            expect(
              await vault.getSpotPrice(
                tokens[i].address,
                tokens[(i + 1) % tokens.length].address,
              ),
            ).to.equal(newSpotPrices[(i + 1) % tokens.length]);

            for (let j = 0; j < tokens.length; j++) {
              expect(newSpotPrices[j]).to.be.closeTo(
                spotPrices[i][j],
                DEVIATION,
              );
            }

            expect(await vault.holding(i)).to.equal(newHoldings[i]);
            expect(newHoldings[i]).to.equal(
              holdings[i].add(amounts[i]).sub(guardiansFeeTotal[i]),
            );
            expect(newAdminBalances[i]).to.equal(
              adminBalances[i].sub(amounts[i]),
            );
          }
        });
      });
    });

    describe("when withdrawing from Vault", () => {
      describe("when allowance on validator is invalid", () => {
        it("should revert to withdraw tokens", async () => {
          await expect(
            vault.withdraw(
              tokenValueArray(sortedTokens, toWei(5), tokens.length),
            ),
          ).to.be.revertedWith("Mammon__AmountExceedAvailable");
        });
      });

      describe("when allowance on validator is valid", () => {
        beforeEach(async () => {
          await validator.setAllowances(
            valueArray(toWei(100000), tokens.length),
          );
        });

        describe("should be reverted to withdraw tokens", async () => {
          it("when called from non-owner", async () => {
            await expect(
              vault
                .connect(user)
                .withdraw(tokenValueArray(sortedTokens, ONE, tokens.length)),
            ).to.be.revertedWith("Ownable: caller is not the owner");
          });

          it("when token and amount length is not same", async () => {
            await expect(
              vault.withdraw(
                tokenValueArray(sortedTokens, ONE, tokens.length + 1),
              ),
            ).to.be.revertedWith("Mammon__ValueLengthIsNotSame");
          });

          it("when token is not sorted", async () => {
            await expect(
              vault.withdraw(
                tokenValueArray(unsortedTokens, ONE, tokens.length),
              ),
            ).to.be.revertedWith("Mammon__DifferentTokensInPosition");
          });

          it("when amount exceeds holdings", async () => {
            const { holdings } = await getState();
            await expect(
              vault.withdraw([
                {
                  token: sortedTokens[0],
                  value: holdings[0].add(1),
                },
                ...tokenValueArray(
                  sortedTokens.slice(1),
                  ONE,
                  tokens.length - 1,
                ),
              ]),
            ).to.be.revertedWith("Mammon__AmountExceedAvailable");
          });

          it("when balance is changed in the same block", async () => {
            for (let i = 0; i < tokens.length; i++) {
              await tokens[i].approve(vault.address, toWei(100000));
            }
            await vault.deposit(
              tokenValueArray(sortedTokens, toWei(10000), tokens.length),
            );

            const amounts = tokens.map(_ =>
              toWei(Math.floor(Math.random() * 100)),
            );

            await ethers.provider.send("evm_setAutomine", [false]);
            await ethers.provider.send("evm_setIntervalMining", [0]);

            const trx1 = await vault.withdraw(
              tokenWithValues(sortedTokens, amounts),
            );
            const trx2 = await vault.withdrawIfBalanceUnchanged(
              tokenWithValues(sortedTokens, amounts),
            );

            await ethers.provider.send("evm_mine", []);

            try {
              await trx1.wait();
              await trx2.wait();
            } catch {
              // empty
            }

            const receipt1 = await ethers.provider.getTransactionReceipt(
              trx1.hash,
            );
            const receipt2 = await ethers.provider.getTransactionReceipt(
              trx2.hash,
            );

            expect(receipt1.status).to.equal(1);
            expect(receipt2.status).to.equal(0);

            await ethers.provider.send("evm_setAutomine", [true]);
            await ethers.provider.send("evm_setIntervalMining", [0]);
          });
        });

        describe("should be possible to withdraw ", async () => {
          it("when withdrawing one token", async () => {
            await vault.deposit(
              tokenValueArray(sortedTokens, toWei(5), tokens.length),
            );
            let { holdings, adminBalances } = await getState();
            let guardiansFeeTotal = await getGuardiansFeeTotal();

            for (let i = 0; i < tokens.length; i++) {
              const amounts = new Array(tokens.length).fill(0);
              amounts[i] = toWei(5);

              const spotPrices = await vault.getSpotPrices(tokens[i].address);

              await vault.withdraw(tokenWithValues(sortedTokens, amounts));
              const newGuardiansFeeTotal = await getGuardiansFeeTotal();

              const newSpotPrices = await vault.getSpotPrices(
                tokens[i].address,
              );
              const {
                holdings: newHoldings,
                adminBalances: newAdminBalances,
              } = await getState();

              for (let j = 0; j < tokens.length; j++) {
                expect(newSpotPrices[j]).to.closeTo(spotPrices[j], DEVIATION);
                expect(newHoldings[j]).to.equal(
                  holdings[j]
                    .sub(amounts[j])
                    .sub(newGuardiansFeeTotal[j])
                    .add(guardiansFeeTotal[j]),
                );
                expect(newAdminBalances[j]).to.equal(
                  adminBalances[j].add(amounts[j]),
                );
              }

              holdings = newHoldings;
              adminBalances = newAdminBalances;
              guardiansFeeTotal = newGuardiansFeeTotal;
            }
          });

          it("when withdrawing tokens", async () => {
            for (let i = 0; i < tokens.length; i++) {
              await tokens[i].approve(vault.address, toWei(100000));
            }
            await vault.deposit(
              tokenValueArray(sortedTokens, toWei(10000), tokens.length),
            );

            const { holdings, adminBalances } = await getState();
            const guardiansFeeTotal = await getGuardiansFeeTotal();

            const amounts = tokens.map(_ =>
              toWei(Math.floor(50 + Math.random() * 10)),
            );

            const spotPrices = [];
            for (let i = 0; i < tokens.length; i++) {
              spotPrices.push(await vault.getSpotPrices(tokens[i].address));
            }

            await vault.withdraw(tokenWithValues(sortedTokens, amounts));
            const newGuardiansFeeTotal = await getGuardiansFeeTotal();

            const { holdings: newHoldings, adminBalances: newAdminBalances } =
              await getState();

            for (let i = 0; i < tokens.length; i++) {
              const newSpotPrices = await vault.getSpotPrices(
                tokens[i].address,
              );

              expect(
                await vault.getSpotPrice(
                  tokens[i].address,
                  tokens[(i + 1) % tokens.length].address,
                ),
              ).to.equal(newSpotPrices[(i + 1) % tokens.length]);

              for (let j = 0; j < tokens.length; j++) {
                expect(newSpotPrices[j]).to.be.closeTo(
                  spotPrices[i][j],
                  DEVIATION,
                );
              }

              expect(await vault.holding(i)).to.equal(newHoldings[i]);
              expect(newHoldings[i]).to.equal(
                holdings[i]
                  .sub(amounts[i])
                  .sub(newGuardiansFeeTotal[i])
                  .add(guardiansFeeTotal[i]),
              );
              expect(newAdminBalances[i]).to.equal(
                adminBalances[i].add(amounts[i]),
              );
            }
          });
        });
      });
    });

    describe("when depositing and withdrawing", () => {
      beforeEach(async () => {
        await validator.setAllowances(
          valueArray(toWei(100000), tokens.length),
        );
      });

      it("should be possible to deposit and withdraw one token", async () => {
        let { holdings, adminBalances } = await getState();
        let guardiansFeeTotal = await getGuardiansFeeTotal();

        for (let i = 0; i < tokens.length; i++) {
          const amounts = new Array(tokens.length).fill(0);
          amounts[i] = toWei(5);

          const spotPrices = await vault.getSpotPrices(tokens[i].address);

          await vault.deposit(tokenWithValues(sortedTokens, amounts));
          await vault.withdraw(tokenWithValues(sortedTokens, amounts));
          const newGuardiansFeeTotal = await getGuardiansFeeTotal();

          const newSpotPrices = await vault.getSpotPrices(tokens[i].address);
          const { holdings: newHoldings, adminBalances: newAdminBalances } =
            await getState();

          for (let j = 0; j < tokens.length; j++) {
            expect(newSpotPrices[j]).to.closeTo(spotPrices[j], DEVIATION);
            expect(newHoldings[j]).to.equal(
              holdings[j]
                .sub(newGuardiansFeeTotal[j])
                .add(guardiansFeeTotal[j]),
            );
            expect(newAdminBalances[j]).to.equal(adminBalances[j]);
          }

          holdings = newHoldings;
          adminBalances = newAdminBalances;
          guardiansFeeTotal = newGuardiansFeeTotal;
        }
      });

      it("should be possible to deposit and withdraw tokens", async () => {
        const { holdings, adminBalances } = await getState();

        const amounts = tokens.map(_ =>
          toWei(Math.floor(50 + Math.random() * 10)),
        );

        const spotPrices = [];
        for (let i = 0; i < tokens.length; i++) {
          await tokens[i].approve(vault.address, amounts[i]);
          spotPrices.push(await vault.getSpotPrices(tokens[i].address));
        }

        await vault.deposit(tokenWithValues(sortedTokens, amounts));
        await vault.withdraw(tokenWithValues(sortedTokens, amounts));
        const guardiansFeeTotal = await getGuardiansFeeTotal();

        const { holdings: newHoldings, adminBalances: newAdminBalances } =
          await getState();

        for (let i = 0; i < tokens.length; i++) {
          const newSpotPrices = await vault.getSpotPrices(tokens[i].address);

          expect(
            await vault.getSpotPrice(
              tokens[i].address,
              tokens[(i + 1) % tokens.length].address,
            ),
          ).to.equal(newSpotPrices[(i + 1) % tokens.length]);

          for (let j = 0; j < tokens.length; j++) {
            expect(newSpotPrices[j]).to.be.closeTo(
              spotPrices[i][j],
              DEVIATION,
            );
          }

          expect(await vault.holding(i)).to.equal(newHoldings[i]);
          expect(newHoldings[i]).to.equal(
            holdings[i].sub(guardiansFeeTotal[i]),
          );
          expect(newAdminBalances[i]).to.equal(adminBalances[i]);
        }
      });
    });

    describe("when calling updateWeightsGradually()", () => {
      describe("should be reverted to call updateWeightsGradually", async () => {
        it("when called from non-guardian", async () => {
          await expect(
            vault.updateWeightsGradually(
              tokenValueArray(
                sortedTokens,
                ONE.div(tokens.length),
                tokens.length,
              ),
              0,
              1,
            ),
          ).to.be.revertedWith("Mammon__CallerIsNotGuardian");
        });

        it("when token is not sorted", async () => {
          const timestamp = await getCurrentTime();
          await expect(
            vault
              .connect(guardian)
              .updateWeightsGradually(
                tokenValueArray(
                  unsortedTokens,
                  ONE.div(tokens.length),
                  tokens.length,
                ),
                timestamp + 10,
                timestamp + MINIMUM_WEIGHT_CHANGE_DURATION + 10,
              ),
          ).to.be.revertedWith("Mammon__DifferentTokensInPosition");
        });

        it("when start time is greater than maximum", async () => {
          const timestamp = await getCurrentTime();
          await expect(
            vault
              .connect(guardian)
              .updateWeightsGradually(
                tokenValueArray(
                  sortedTokens,
                  ONE.div(tokens.length),
                  tokens.length,
                ),
                2 ** 32,
                timestamp,
              ),
          ).to.be.revertedWith("Mammon__WeightChangeStartTimeIsAboveMax");
        });

        it("when end time is greater than maximum", async () => {
          const timestamp = await getCurrentTime();
          await expect(
            vault
              .connect(guardian)
              .updateWeightsGradually(
                tokenValueArray(
                  sortedTokens,
                  ONE.div(tokens.length),
                  tokens.length,
                ),
                timestamp,
                2 ** 32,
              ),
          ).to.be.revertedWith("Mammon__WeightChangeEndTimeIsAboveMax");
        });

        it("when end time is earlier than start time", async () => {
          const timestamp = await getCurrentTime();
          await expect(
            vault
              .connect(guardian)
              .updateWeightsGradually(
                tokenValueArray(
                  sortedTokens,
                  ONE.div(tokens.length),
                  tokens.length,
                ),
                timestamp - 2,
                timestamp - 1,
              ),
          ).to.be.revertedWith("Mammon__WeightChangeEndBeforeStart");
        });

        it("when duration is less than minimum", async () => {
          const timestamp = await getCurrentTime();
          await expect(
            vault
              .connect(guardian)
              .updateWeightsGradually(
                tokenValueArray(
                  sortedTokens,
                  ONE.div(tokens.length),
                  tokens.length,
                ),
                timestamp,
                timestamp + 1,
              ),
          ).to.be.revertedWith("Mammon__WeightChangeDurationIsBelowMin");
        });

        it("when actual duration is less than minimum", async () => {
          const timestamp = await getCurrentTime();
          await expect(
            vault
              .connect(guardian)
              .updateWeightsGradually(
                tokenValueArray(
                  sortedTokens,
                  ONE.div(tokens.length),
                  tokens.length,
                ),
                timestamp - 2,
                timestamp + MINIMUM_WEIGHT_CHANGE_DURATION - 1,
              ),
          ).to.be.revertedWith("Mammon__WeightChangeDurationIsBelowMin");
        });

        it("when total sum of weights is not one", async () => {
          const timestamp = await getCurrentTime();
          await expect(
            vault
              .connect(guardian)
              .updateWeightsGradually(
                tokenValueArray(
                  sortedTokens,
                  ONE.div(tokens.length).sub(1),
                  tokens.length,
                ),
                timestamp,
                timestamp + MINIMUM_WEIGHT_CHANGE_DURATION + 1,
              ),
          ).to.be.revertedWith(BALANCER_ERRORS.NORMALIZED_WEIGHT_INVARIANT);
        });

        it("when change ratio is greater than maximum", async () => {
          const timestamp = await getCurrentTime();
          const startWeights = await vault.getNormalizedWeights();
          const targetWeight0 = startWeights[0]
            .mul(ONE)
            .div(MAX_WEIGHT_CHANGE_RATIO + 2)
            .div(MINIMUM_WEIGHT_CHANGE_DURATION + 1);
          const targetWeights = [
            targetWeight0,
            ...valueArray(
              ONE.sub(targetWeight0).div(tokens.length - 1),
              tokens.length - 1,
            ),
          ];

          let weightSum = toWei(0);
          for (let i = 0; i < tokens.length; i++) {
            weightSum = weightSum.add(targetWeights[i]);
          }

          targetWeights[tokens.length - 1] = ONE.sub(weightSum).add(
            targetWeights[tokens.length - 1],
          );

          await expect(
            vault
              .connect(guardian)
              .updateWeightsGradually(
                tokenWithValues(sortedTokens, targetWeights),
                timestamp,
                timestamp + MINIMUM_WEIGHT_CHANGE_DURATION + 1,
              ),
          ).to.be.revertedWith("Mammon__WeightChangeRatioIsAboveMax");
        });

        it("when weight is less than minimum", async () => {
          const timestamp = await getCurrentTime();
          const token0TargetWeight = toWei(0.009);
          const validDuration = ONE.mul(ONE)
            .div(tokens.length)
            .div(token0TargetWeight)
            .div(MAX_WEIGHT_CHANGE_RATIO)
            .add(1);
          await expect(
            vault.connect(guardian).updateWeightsGradually(
              [
                {
                  token: sortedTokens[0],
                  value: token0TargetWeight,
                },
                ...tokenValueArray(
                  sortedTokens.slice(1),
                  ONE.sub(token0TargetWeight).div(tokens.length - 1),
                  tokens.length - 1,
                ),
              ],
              timestamp,
              timestamp + validDuration.toNumber() + 1,
            ),
          ).to.be.revertedWith(BALANCER_ERRORS.MIN_WEIGHT);
        });
      });

      it("should be possible to call updateWeightsGradually", async () => {
        const startWeights = await vault.getNormalizedWeights();
        const timestamp = await getCurrentTime();
        const endWeights = [];
        const avgWeights = ONE.div(tokens.length);
        const startTime = timestamp + 10;
        const endTime = timestamp + MINIMUM_WEIGHT_CHANGE_DURATION + 1000;
        for (let i = 0; i < tokens.length; i += 2) {
          if (i < tokens.length - 1) {
            endWeights.push(avgWeights.add(toWei((i + 1) / 100)));
            endWeights.push(avgWeights.sub(toWei((i + 1) / 100)));
          } else {
            endWeights.push(avgWeights);
          }
        }

        await vault
          .connect(guardian)
          .updateWeightsGradually(
            tokenWithValues(sortedTokens, endWeights),
            startTime,
            endTime,
          );

        await increaseTime(MINIMUM_WEIGHT_CHANGE_DURATION);

        const currentWeights = await vault.getNormalizedWeights();

        const currentTime = await getCurrentTime();
        const ptcProgress = ONE.mul(currentTime - startTime).div(
          endTime - startTime,
        );

        for (let i = 0; i < tokens.length; i++) {
          const weightDelta = endWeights[i]
            .sub(startWeights[i])
            .mul(ptcProgress)
            .div(ONE);
          expect(startWeights[i].add(weightDelta)).to.be.closeTo(
            currentWeights[i],
            DEVIATION,
          );
        }
      });

      describe("should cancel current weight update", async () => {
        it("when deposit tokens", async () => {
          const timestamp = await getCurrentTime();
          const endWeights = [];
          const avgWeights = ONE.div(tokens.length);
          const startTime = timestamp + 10;
          const endTime = timestamp + MINIMUM_WEIGHT_CHANGE_DURATION + 1000;
          for (let i = 0; i < tokens.length; i += 2) {
            if (i < tokens.length - 1) {
              endWeights.push(avgWeights.add(toWei((i + 1) / 100)));
              endWeights.push(avgWeights.sub(toWei((i + 1) / 100)));
            } else {
              endWeights.push(avgWeights);
            }
          }

          await vault
            .connect(guardian)
            .updateWeightsGradually(
              tokenWithValues(sortedTokens, endWeights),
              startTime,
              endTime,
            );

          await vault.deposit(
            tokenValueArray(sortedTokens, toWei(50), tokens.length),
          );

          const newWeights = await vault.getNormalizedWeights();

          for (let i = 0; i < 1000; i++) {
            await ethers.provider.send("evm_mine", []);
          }

          const currentWeights = await vault.getNormalizedWeights();

          for (let i = 0; i < tokens.length; i++) {
            expect(newWeights[i]).to.equal(currentWeights[i]);
          }
        });

        it("when withdraw tokens", async () => {
          await validator.setAllowances(
            valueArray(toWei(100000), tokens.length),
          );
          await vault.deposit(
            tokenValueArray(sortedTokens, toWei(50), tokens.length),
          );

          const timestamp = await getCurrentTime();
          const endWeights = [];
          const avgWeights = ONE.div(tokens.length);
          const startTime = timestamp + 10;
          const endTime = timestamp + MINIMUM_WEIGHT_CHANGE_DURATION + 1000;
          for (let i = 0; i < tokens.length; i += 2) {
            if (i < tokens.length - 1) {
              endWeights.push(avgWeights.add(toWei((i + 1) / 100)));
              endWeights.push(avgWeights.sub(toWei((i + 1) / 100)));
            } else {
              endWeights.push(avgWeights);
            }
          }

          await vault
            .connect(guardian)
            .updateWeightsGradually(
              tokenWithValues(sortedTokens, endWeights),
              startTime,
              endTime,
            );

          await vault.withdraw(
            tokenValueArray(sortedTokens, toWei(50), tokens.length),
          );

          const newWeights = await vault.getNormalizedWeights();

          for (let i = 0; i < 1000; i++) {
            await ethers.provider.send("evm_mine", []);
          }

          const currentWeights = await vault.getNormalizedWeights();

          for (let i = 0; i < tokens.length; i++) {
            expect(newWeights[i]).to.equal(currentWeights[i]);
          }
        });
      });
    });

    describe("when calling cancelWeightUpdates()", () => {
      it("should be reverted when called from non-guardian", async () => {
        await expect(vault.cancelWeightUpdates()).to.be.revertedWith(
          "Mammon__CallerIsNotGuardian",
        );
      });

      it("should be possible to call cancelWeightUpdates", async () => {
        const timestamp = await getCurrentTime();
        const endWeights = [];
        const avgWeights = ONE.div(tokens.length);
        const startTime = timestamp + 10;
        const endTime = timestamp + MINIMUM_WEIGHT_CHANGE_DURATION + 1000;
        for (let i = 0; i < tokens.length; i += 2) {
          if (i < tokens.length - 1) {
            endWeights.push(avgWeights.add(toWei((i + 1) / 100)));
            endWeights.push(avgWeights.sub(toWei((i + 1) / 100)));
          } else {
            endWeights.push(avgWeights);
          }
        }

        await vault
          .connect(guardian)
          .updateWeightsGradually(
            tokenWithValues(sortedTokens, endWeights),
            startTime,
            endTime,
          );

        await increaseTime(MINIMUM_WEIGHT_CHANGE_DURATION / 2);

        await vault.connect(guardian).cancelWeightUpdates();

        const newWeights = await vault.getNormalizedWeights();

        await increaseTime(MINIMUM_WEIGHT_CHANGE_DURATION / 2);

        const currentWeights = await vault.getNormalizedWeights();

        for (let i = 0; i < tokens.length; i++) {
          expect(newWeights[i]).to.equal(currentWeights[i]);
        }
      });
    });

    describe("when finalizing", () => {
      describe("should be reverted to call initiateFinalization", async () => {
        it("when called from non-owner", async () => {
          await expect(
            vault.connect(guardian).initiateFinalization(),
          ).to.be.revertedWith("Ownable: caller is not the owner");
        });
      });

      describe("should be reverted to call finalize", async () => {
        it("when called from non-owner", async () => {
          await expect(vault.connect(user).finalize()).to.be.revertedWith(
            "Ownable: caller is not the owner",
          );
        });

        it("when finalization is not initiated", async () => {
          await expect(vault.finalize()).to.be.revertedWith(
            "Mammon__FinalizationNotInitiated",
          );
        });

        it("when noticeTimeout is not elapsed", async () => {
          await vault.initiateFinalization();
          const noticeTimeoutAt = await vault.noticeTimeoutAt();

          await expect(vault.finalize()).to.be.revertedWith(
            `Mammon__NoticeTimeoutNotElapsed(${noticeTimeoutAt})`,
          );
        });

        it("when already finalized", async () => {
          await vault.initiateFinalization();
          await ethers.provider.send("evm_increaseTime", [NOTICE_PERIOD + 1]);

          await vault.finalize();
          await expect(vault.finalize()).to.be.revertedWith(
            "Mammon__VaultIsAlreadyFinalized",
          );
        });
      });

      describe("should be reverted to call functions when finalizing", async () => {
        beforeEach(async () => {
          await vault.initiateFinalization();
        });

        it("when call deposit", async () => {
          await expect(
            vault.deposit(tokenValueArray(sortedTokens, ONE, tokens.length)),
          ).to.be.revertedWith("Mammon__VaultIsFinalizing");
        });

        it("when call withdraw", async () => {
          await expect(
            vault.withdraw(tokenValueArray(sortedTokens, ONE, tokens.length)),
          ).to.be.revertedWith("Mammon__VaultIsFinalizing");
        });

        it("when call updateWeightsGradually", async () => {
          const blocknumber = await ethers.provider.getBlockNumber();
          await expect(
            vault
              .connect(guardian)
              .updateWeightsGradually(
                tokenValueArray(sortedTokens, MIN_WEIGHT, tokens.length),
                blocknumber + 1,
                blocknumber + 1000,
              ),
          ).to.be.revertedWith("Mammon__VaultIsFinalizing");
        });

        it("when call cancelWeightUpdates", async () => {
          await expect(
            vault.connect(guardian).cancelWeightUpdates(),
          ).to.be.revertedWith("Mammon__VaultIsFinalizing");
        });

        it("when call claimGuardianFees", async () => {
          await expect(
            vault.connect(guardian).claimGuardianFees(),
          ).to.be.revertedWith("Mammon__VaultIsFinalizing");
        });

        it("when call initiateFinalization", async () => {
          await expect(vault.initiateFinalization()).to.be.revertedWith(
            "Mammon__VaultIsFinalizing",
          );
        });
      });

      it("should be possible to finalize", async () => {
        const adminBalances = await getUserBalances(admin.address);

        await vault.initiateFinalization();
        expect(await vault.isSwapEnabled()).to.equal(false);

        const { holdings: newHoldings } = await getState();

        await increaseTime(NOTICE_PERIOD + 1);

        await vault.finalize();

        const newAdminBalances = await getUserBalances(admin.address);

        for (let i = 0; i < tokens.length; i++) {
          expect(newAdminBalances[i]).to.equal(
            adminBalances[i].add(newHoldings[i]),
          );
        }
      });
    });
  });

  describe("Get Spot Prices", () => {
    let TOKEN: IERC20;
    beforeEach(async () => {
      ({ TOKEN } = await deployToken());
      for (let i = 0; i < tokens.length; i++) {
        await tokens[i].approve(vault.address, ONE);
      }
      await vault.initialDeposit(
        tokenValueArray(sortedTokens, ONE, tokens.length),
      );
    });

    it("should return zero for invalid token", async () => {
      const spotPrices = await vault.getSpotPrices(TOKEN.address);

      for (let i = 0; i < tokens.length; i++) {
        expect(spotPrices[i]).to.equal(toWei(0));
        expect(
          await vault.getSpotPrice(TOKEN.address, tokens[i].address),
        ).to.equal(toWei(0));
        expect(
          await vault.getSpotPrice(tokens[i].address, TOKEN.address),
        ).to.equal(toWei(0));
      }
    });
  });

  describe("Sweep", () => {
    let TOKEN: IERC20;
    beforeEach(async () => {
      ({ TOKEN } = await deployToken());
    });

    describe("should be reverted to withdraw token", async () => {
      beforeEach(async () => {
        await TOKEN.transfer(vault.address, toWei(1000));
      });

      it("when called from non-owner", async () => {
        await expect(
          vault.connect(guardian).sweep(TOKEN.address, toWei(1001)),
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("when token is pool token", async () => {
        const poolToken = await vault.pool();
        await expect(vault.sweep(poolToken, toWei(1))).to.be.revertedWith(
          "Mammon__CannotSweepPoolToken",
        );
      });

      it("when amount exceeds balance", async () => {
        await expect(
          vault.sweep(TOKEN.address, toWei(1001)),
        ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
      });
    });

    it("should be possible to withdraw token", async () => {
      const balance = await TOKEN.balanceOf(admin.address);
      await TOKEN.transfer(vault.address, toWei(1000));

      expect(
        await vault.estimateGas.sweep(TOKEN.address, toWei(1000)),
      ).to.below(70000);
      await vault.sweep(TOKEN.address, toWei(1000));

      expect(await TOKEN.balanceOf(vault.address)).to.equal(toWei(0));

      expect(await TOKEN.balanceOf(admin.address)).to.equal(balance);
    });
  });

  describe("Claim Guardian Fees", () => {
    beforeEach(async () => {
      for (let i = 0; i < tokens.length; i++) {
        await tokens[i].approve(vault.address, ONE);
      }
      await vault.initialDeposit(
        tokenValueArray(sortedTokens, ONE, tokens.length),
      );
    });

    it("should be reverted to claim guardian fees when no available fee", async () => {
      for (let i = 0; i < tokens.length; i++) {
        await tokens[i].approve(vault.address, toWei(100000));
      }
      await vault.deposit(
        tokenValueArray(sortedTokens, toWei(10000), tokens.length),
      );

      await expect(vault.claimGuardianFees()).to.be.revertedWith(
        "Mammon__NoAvailableFeeForCaller",
      );
    });

    describe("should be possible to claim guardian fees", async () => {
      it("when called from current guardian", async () => {
        for (let i = 0; i < tokens.length; i++) {
          await tokens[i].approve(vault.address, toWei(100000));
        }

        let lastFeeCheckpoint = (await vault.lastFeeCheckpoint()).toNumber();
        let holdings = await vault.getHoldings();
        const guardianBalances = await getUserBalances(guardian.address);
        const depositTrx = await vault.deposit(
          tokenValueArray(sortedTokens, toWei(10000), tokens.length),
        );

        let currentTime = await getTimestamp(depositTrx.blockNumber);
        const guardianFee = holdings.map((holding: BigNumber) =>
          holding
            .mul(currentTime - lastFeeCheckpoint)
            .mul(MAX_MANAGEMENT_FEE)
            .div(ONE),
        );
        lastFeeCheckpoint = currentTime;

        holdings = await vault.getHoldings();

        const trx = await vault.connect(guardian).claimGuardianFees();

        const newGuardianBalances = await getUserBalances(guardian.address);

        currentTime = await getTimestamp(trx.blockNumber);
        holdings.forEach((holding: BigNumber, index: number) => {
          guardianFee[index] = guardianFee[index].add(
            holding
              .mul(currentTime - lastFeeCheckpoint)
              .mul(MAX_MANAGEMENT_FEE)
              .div(ONE),
          );
          expect(newGuardianBalances[index]).to.equal(
            guardianBalances[index].add(guardianFee[index]),
          );
        });
      });

      it("when called from old guardian", async () => {
        for (let i = 0; i < tokens.length; i++) {
          await tokens[i].approve(vault.address, toWei(100000));
        }

        let lastFeeCheckpoint = (await vault.lastFeeCheckpoint()).toNumber();
        let holdings = await vault.getHoldings();
        const guardianBalances = await getUserBalances(guardian.address);
        const depositTrx = await vault.deposit(
          tokenValueArray(sortedTokens, toWei(10000), tokens.length),
        );

        let currentTime = await getTimestamp(depositTrx.blockNumber);
        const guardianFee = holdings.map((holding: BigNumber) =>
          holding
            .mul(currentTime - lastFeeCheckpoint)
            .mul(MAX_MANAGEMENT_FEE)
            .div(ONE),
        );
        lastFeeCheckpoint = currentTime;

        holdings = (await getState()).holdings;
        const setGuardianTrx = await vault.setGuardian(user.address);

        currentTime = await getTimestamp(setGuardianTrx.blockNumber);
        holdings.forEach((holding: BigNumber, index: number) => {
          guardianFee[index] = guardianFee[index].add(
            holding
              .mul(currentTime - lastFeeCheckpoint)
              .mul(MAX_MANAGEMENT_FEE)
              .div(ONE),
          );
        });

        await vault.connect(guardian).claimGuardianFees();

        const newGuardianBalances = await getUserBalances(guardian.address);

        newGuardianBalances.forEach(
          (guardianBalance: BigNumber, index: number) => {
            expect(guardianBalance).to.equal(
              guardianBalances[index].add(guardianFee[index]),
            );
          },
        );
      });
    });
  });

  describe("Update Elements", () => {
    describe("Update Guardian", () => {
      describe("should be reverted to change guardian", async () => {
        it("when called from non-owner", async () => {
          await expect(
            vault.connect(guardian).setGuardian(ZERO_ADDRESS),
          ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("when parameter(new guardian) is zero address", async () => {
          await expect(vault.setGuardian(ZERO_ADDRESS)).to.be.revertedWith(
            "Mammon__GuardianIsZeroAddress",
          );
        });

        it("when parameter(new guardian) is owner", async () => {
          await expect(vault.setGuardian(admin.address)).to.be.revertedWith(
            "Mammon__GuardianIsOwner",
          );
        });
      });

      it("should be possible to change guardian", async () => {
        expect(await vault.guardian()).to.equal(guardian.address);
        await vault.setGuardian(user.address);
        expect(await vault.guardian()).to.equal(user.address);
      });
    });

    describe("Enable Trading", () => {
      beforeEach(async () => {
        for (let i = 0; i < tokens.length; i++) {
          await tokens[i].approve(vault.address, ONE);
        }
        await vault.initialDeposit(
          tokenValueArray(sortedTokens, ONE, tokens.length),
        );
      });

      describe("with enableTradingRiskingArbitrage function", () => {
        it("should be reverted to enable trading when called from non-owner", async () => {
          await expect(
            vault.connect(guardian).enableTradingRiskingArbitrage(),
          ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("should be possible to enable trading", async () => {
          const weights = await vault.getNormalizedWeights();

          await vault.enableTradingRiskingArbitrage();

          const currentWeights = await vault.getNormalizedWeights();

          expect(await vault.isSwapEnabled()).to.equal(true);
          for (let i = 0; i < tokens.length; i++) {
            expect(weights[i]).to.equal(currentWeights[i]);
          }
        });
      });

      describe("with enableTradingWithWeights function", () => {
        describe("should be reverted to enable trading", () => {
          it("when called from non-owner", async () => {
            await expect(
              vault
                .connect(guardian)
                .enableTradingWithWeights(
                  tokenValueArray(
                    sortedTokens,
                    ONE.div(tokens.length),
                    tokens.length,
                  ),
                ),
            ).to.be.revertedWith("Ownable: caller is not the owner");
          });

          it("when token is not sorted", async () => {
            await vault.disableTrading();

            await expect(
              vault.enableTradingWithWeights(
                tokenValueArray(
                  unsortedTokens,
                  ONE.div(tokens.length),
                  tokens.length,
                ),
              ),
            ).to.be.revertedWith("Mammon__DifferentTokensInPosition");
          });

          it("when total sum of weights is not one", async () => {
            await vault.disableTrading();

            await expect(
              vault.enableTradingWithWeights(
                tokenValueArray(
                  sortedTokens,
                  ONE.div(tokens.length).sub(1),
                  tokens.length,
                ),
              ),
            ).to.be.revertedWith(BALANCER_ERRORS.NORMALIZED_WEIGHT_INVARIANT);
          });

          it("when swap is already enabled", async () => {
            await expect(
              vault.enableTradingWithWeights(
                tokenValueArray(
                  sortedTokens,
                  ONE.div(tokens.length),
                  tokens.length,
                ),
              ),
            ).to.be.revertedWith("Mammon__PoolSwapIsAlreadyEnabled");
          });
        });

        it("should be possible to enable trading", async () => {
          await vault.disableTrading();

          const newWeights = [];
          const avgWeights = ONE.div(tokens.length);
          for (let i = 0; i < tokens.length; i += 2) {
            if (i < tokens.length - 1) {
              newWeights.push(avgWeights.add(toWei((i + 1) / 100)));
              newWeights.push(avgWeights.sub(toWei((i + 1) / 100)));
            } else {
              newWeights.push(avgWeights);
            }
          }

          await vault.enableTradingWithWeights(
            tokenWithValues(sortedTokens, newWeights),
          );

          const currentWeights = await vault.getNormalizedWeights();

          expect(await vault.isSwapEnabled()).to.equal(true);
          for (let i = 0; i < tokens.length; i++) {
            expect(newWeights[i]).to.be.closeTo(currentWeights[i], DEVIATION);
          }
        });
      });
    });

    describe("Disable Trading", () => {
      beforeEach(async () => {
        for (let i = 0; i < tokens.length; i++) {
          await tokens[i].approve(vault.address, ONE);
        }
        await vault.initialDeposit(
          tokenValueArray(sortedTokens, ONE, tokens.length),
        );
      });

      it("should be reverted to disable trading", async () => {
        await expect(vault.connect(user).disableTrading()).to.be.revertedWith(
          "Mammon__CallerIsNotOwnerOrGuardian",
        );
      });

      it("should be possible to disable trading", async () => {
        expect(await vault.isSwapEnabled()).to.equal(true);

        expect(await vault.estimateGas.disableTrading()).to.below(52000);
        await vault.connect(guardian).disableTrading();

        expect(await vault.isSwapEnabled()).to.equal(false);
      });
    });

    describe("Set Swap Fee", () => {
      describe("should be reverted to set swap fee", async () => {
        it("when called from non-guardian", async () => {
          await expect(vault.setSwapFee(toWei(3))).to.be.revertedWith(
            "Mammon__CallerIsNotGuardian()",
          );
        });

        it("when swap fee is greater than balancer maximum", async () => {
          let newFee = await vault.getSwapFee();
          while (newFee.lte(MAX_SWAP_FEE)) {
            await vault.connect(guardian).setSwapFee(newFee);
            await increaseTime(SWAP_FEE_COOLDOWN_PERIOD);
            newFee = newFee.add(MAXIMUM_SWAP_FEE_PERCENT_CHANGE);
          }
          await expect(
            vault.connect(guardian).setSwapFee(MAX_SWAP_FEE.add(1)),
          ).to.be.revertedWith(BALANCER_ERRORS.MAX_SWAP_FEE_PERCENTAGE);
        });

        it("when swap fee is less than balancer minimum", async () => {
          let newFee = await vault.getSwapFee();
          while (newFee.gte(MIN_SWAP_FEE)) {
            await vault.connect(guardian).setSwapFee(newFee);
            await increaseTime(SWAP_FEE_COOLDOWN_PERIOD);
            newFee = newFee.sub(MAXIMUM_SWAP_FEE_PERCENT_CHANGE);
          }
          await expect(
            vault.connect(guardian).setSwapFee(MIN_SWAP_FEE.sub(1)),
          ).to.be.revertedWith(BALANCER_ERRORS.MIN_SWAP_FEE_PERCENTAGE);
        });
      });

      it("should be possible to set swap fee", async () => {
        const fee = await vault.getSwapFee();
        const newFee = fee.add(MAXIMUM_SWAP_FEE_PERCENT_CHANGE);
        expect(
          await vault.connect(guardian).estimateGas.setSwapFee(newFee),
        ).to.below(90000);
        await vault.connect(guardian).setSwapFee(newFee);

        expect(await vault.getSwapFee()).to.equal(newFee);
      });
    });

    describe("Ownership", () => {
      describe("Renounce Ownership", () => {
        describe("should be reverted", () => {
          it("when called from non-owner", async () => {
            await expect(
              vault.connect(user).renounceOwnership(),
            ).to.be.revertedWith("Ownable: caller is not the owner");
          });

          it("when called from owner", async () => {
            await expect(vault.renounceOwnership()).to.be.revertedWith(
              "Mammon__VaultIsNotRenounceable",
            );
          });
        });
      });

      describe("Offer Ownership Transfer", () => {
        describe("should be reverted", () => {
          it("when called from non-owner", async () => {
            await expect(
              vault.connect(user).transferOwnership(admin.address),
            ).to.be.revertedWith("Ownable: caller is not the owner");
          });

          it("when called from not accepted owner", async () => {
            await vault.transferOwnership(user.address);
            await expect(
              vault.connect(user).transferOwnership(admin.address),
            ).to.be.revertedWith("Ownable: caller is not the owner");
          });

          it("when transferred ownership", async () => {
            await vault.transferOwnership(user.address);
            await vault.connect(user).acceptOwnership();
            await expect(
              vault.transferOwnership(user.address),
            ).to.be.revertedWith("Ownable: caller is not the owner");
          });

          it("when new owner is zero address", async () => {
            await expect(
              vault.transferOwnership(ZERO_ADDRESS),
            ).to.be.revertedWith("Mammon__OwnerIsZeroAddress");
          });
        });

        it("should be possible to call", async () => {
          expect(await vault.pendingOwner()).to.equal(ZERO_ADDRESS);
          await vault.transferOwnership(user.address);
          expect(await vault.pendingOwner()).to.equal(user.address);
        });
      });

      describe("Cancel Ownership Transfer", () => {
        describe("should be reverted", () => {
          it("when called from non-owner", async () => {
            await expect(
              vault.connect(user).cancelOwnershipTransfer(),
            ).to.be.revertedWith("Ownable: caller is not the owner");
          });

          it("when there is no pending ownership transfer", async () => {
            await expect(vault.cancelOwnershipTransfer()).to.be.revertedWith(
              "Mammon__NoPendingOwnershipTransfer",
            );
          });
        });

        it("should be possible to cancel", async () => {
          await vault.transferOwnership(user.address);
          expect(await vault.pendingOwner()).to.equal(user.address);
          await vault.cancelOwnershipTransfer();
          expect(await vault.pendingOwner()).to.equal(ZERO_ADDRESS);
          await expect(
            vault.connect(user).acceptOwnership(),
          ).to.be.revertedWith("Mammon__NotPendingOwner");
        });
      });

      describe("Accept Ownership", () => {
        describe("should be reverted", () => {
          it("when called from not pending owner", async () => {
            await vault.transferOwnership(user.address);
            await expect(vault.acceptOwnership()).to.be.revertedWith(
              "Mammon__NotPendingOwner",
            );
          });
        });

        it("should be possible to accept", async () => {
          await vault.transferOwnership(user.address);
          expect(await vault.owner()).to.equal(admin.address);
          expect(await vault.pendingOwner()).to.equal(user.address);
          await vault.connect(user).acceptOwnership();
          expect(await vault.owner()).to.equal(user.address);
          await vault.connect(user).transferOwnership(admin.address);
        });
      });
    });
  });
});
