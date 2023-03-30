import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { MammonMedian } from "../../../typechain";
import { ONE } from "../../v1/constants";
import { toWei } from "../utils";

describe("ChainLink Median Functionality", function () {
  let admin: SignerWithAddress;
  let mamonMedian: MammonMedian;
  let snapshot: unknown;
  let testList: number[];
  const testWeights: { [index: number]: BigNumber[] } = {};
  const gasEstimation: { [index: number]: { [method: string]: number } } = {};

  const getMedian = (list: number[]) => {
    const len = list.length;

    const pivot = Math.floor(len / 2);
    list.sort((a: number, b: number) => a - b);
    const listMedian =
      len % 2 == 0
        ? Math.floor((Number(list[pivot - 1]) + Number(list[pivot])) / 2)
        : list[pivot];

    return listMedian;
  };

  const getWeightedMedian = (list: number[], weights: BigNumber[]) => {
    const len = list.length;
    for (let j = 0; j < len; j++) {
      for (let k = len - 1; k > j; k--) {
        if (list[k] < list[k - 1]) {
          const tempNum: number = list[k];
          list[k] = list[k - 1];
          list[k - 1] = tempNum;
          const tempWeight: BigNumber = weights[k];
          weights[k] = weights[k - 1];
          weights[k - 1] = tempWeight;
        }
      }
    }

    let loSum = weights[0];
    let hiSum = toWei("0");
    let index = 0;
    while (loSum.lt(ONE.div(2))) {
      index++;
      loSum = loSum.add(weights[index]);
    }

    hiSum = ONE.sub(loSum);
    loSum = loSum.sub(weights[index]);

    while (loSum.gt(ONE.div(2)) || hiSum.gt(ONE.div(2))) {
      loSum = loSum.add(weights[index]);
      index++;
      hiSum = hiSum.sub(weights[index]);
    }

    return list[index];
  };

  const getSortedLinkedMedian = (list: number[]) => {
    const len = list.length;

    const pivot = Math.floor(len / 2);
    list.sort((a: number, b: number) => a - b);

    return list[pivot];
  };

  beforeEach(async function () {
    snapshot = await ethers.provider.send("evm_snapshot", []);

    const signers = await ethers.getSigners();
    admin = signers[0];

    const contractFactory = await ethers.getContractFactory("MammonMedian");

    mamonMedian = (await contractFactory
      .connect(admin)
      .deploy()) as MammonMedian;
  });

  afterEach(async () => {
    await ethers.provider.send("evm_revert", [snapshot]);
  });

  this.beforeAll(() => {
    testList = Array.from({ length: 20 }, () =>
      Math.floor(Math.random() * 10000),
    );

    for (let i = 3; i <= 20; i++) {
      gasEstimation[i] = {};

      const weights = [];
      let totalShare = i;
      Array.from(Array(i).keys()).forEach(n => (totalShare += n));

      let weightSum = toWei("0");
      for (let j = 0; j < i - 1; j++) {
        weights.push(toWei((j + 1) / totalShare));
        weightSum = weightSum.add(weights[j]);
      }
      weights[i - 1] = toWei("1").sub(weightSum);

      testWeights[i] = weights;
    }
  });

  this.afterAll(() => {
    console.log("Gas Estimation");
    console.table(gasEstimation);
  });

  describe("chainlink median", () => {
    for (let i = 3; i <= 20; i++) {
      it(`should be possible to calculate with ${i} submitters`, async () => {
        const list = Array.from({ length: i }, () =>
          Math.floor(Math.random() * 10000),
        );

        gasEstimation[i]["Chainlink"] = (
          await mamonMedian.estimateGas.calculateWithChainlinkMedian(list)
        ).toNumber();

        expect(
          await mamonMedian.calculateWithChainlinkMedian(list),
        ).to.be.equal(getMedian(list));
      });
    }
  });

  describe("chainlink weighted median", async () => {
    for (let i = 3; i <= 20; i++) {
      it(`should be possible to calculate with ${i} submitters`, async () => {
        const list = testList.slice(0, i);
        const weights = testWeights[i];

        gasEstimation[i]["Chainlink Weighted Median"] = (
          await mamonMedian.estimateGas.calculateWithChainlinkWeightedMedian(
            list,
            weights,
          )
        ).toNumber();

        expect(
          await mamonMedian.calculateWithChainlinkWeightedMedian(
            list,
            weights,
          ),
        ).to.be.equal(getWeightedMedian(list, weights));
      });
    }
  });

  describe("uint median", () => {
    for (let i = 3; i <= 20; i++) {
      it(`should be possible to calculate with ${i} submitters`, async () => {
        const list = testList.slice(0, i);

        gasEstimation[i]["Uint Median"] = (
          await mamonMedian.estimateGas.calculateWithUintMedian(list)
        ).toNumber();

        expect(await mamonMedian.calculateWithUintMedian(list)).to.be.equal(
          getMedian(list),
        );
      });
    }
  });

  describe("uint weighted median", async () => {
    for (let i = 3; i <= 20; i++) {
      it(`should be possible to calculate with ${i} submitters`, async () => {
        const list = testList.slice(0, i);
        const weights = testWeights[i];

        gasEstimation[i]["Uint Weighted Median"] = (
          await mamonMedian.estimateGas.calculateWithUintWeightedMedian(
            list,
            weights,
          )
        ).toNumber();

        expect(
          await mamonMedian.calculateWithUintWeightedMedian(list, weights),
        ).to.be.equal(getWeightedMedian(list, weights));
      });
    }
  });

  describe("sorted linked median", () => {
    for (let i = 3; i <= 20; i++) {
      it(`should be possible to calculate with ${i} submitters`, async () => {
        const list = testList.slice(0, i);

        const gasCost = (
          await mamonMedian.estimateGas.updateList(list)
        ).toNumber();

        await mamonMedian.updateList(list);

        gasEstimation[i]["Sorted Linked Median"] =
          gasCost +
          (
            await mamonMedian.estimateGas.calculateWithSortedLinkedMedian()
          ).toNumber();

        expect(
          await mamonMedian.calculateWithSortedLinkedMedian(),
        ).to.be.equal(getSortedLinkedMedian(list));
      });
    }
  });
});
