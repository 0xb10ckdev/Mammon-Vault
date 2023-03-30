import { AssetHelpers } from "@balancer-labs/balancer-js";
import { task, types } from "hardhat/config";
import { getConfig } from "../../scripts/config";

// https://github.com/balancer-labs/balancer-v2-monorepo/blob/master/pkg/balancer-js/test/tokens.test.ts
const wethAddress = "0x000000000000000000000000000000000000000F";
const assetHelpers = new AssetHelpers(wethAddress);

task("deploy:vault", "Deploys an Mammon vault with the given parameters")
  .addParam("factory", "Balancer Managed Pool Factory address")
  .addParam("name", "Pool Token's name")
  .addParam("symbol", "Pool Token's symbol")
  .addParam("tokens", "Tokens' addresses")
  .addParam("weights", "Tokens' weights")
  .addParam("swapFee", "Swap Fee Percentage")
  .addParam("guardian", "Guardian's address")
  .addParam("validator", "Validator's address")
  .addParam("noticePeriod", "Notice period in seconds")
  .addParam(
    "managementFee",
    "Management fee earned proportion per second(1e9 is maximum)",
  )
  .addParam(
    "description",
    "Vault text description. Keep it short and simple, please.",
  )
  .addOptionalParam(
    "silent",
    "Disable console log on deployment",
    false,
    types.boolean,
  )
  .addOptionalParam(
    "test",
    "Deploy Mammon Vault V1 Mock contract",
    false,
    types.boolean,
  )
  .addOptionalParam("gasPrice", "Set manual gas price", "", types.string)
  .addFlag("printTransactionData", "Get transaction data for deployment")
  .setAction(async (taskArgs, { deployments, ethers, network }) => {
    const configOptions = { gasPrice: undefined };
    if (taskArgs.gasPrice !== "") {
      configOptions.gasPrice = taskArgs.gasPrice;
    }
    const config = getConfig(network.config.chainId || 1, configOptions);

    const factory = taskArgs.factory;
    const name = taskArgs.name;
    const symbol = taskArgs.symbol;
    const tokens = taskArgs.tokens.split(",");
    const weights = taskArgs.weights.split(",");
    const swapFeePercentage = taskArgs.swapFee;
    const guardian = taskArgs.guardian;
    const validator = taskArgs.validator;
    const noticePeriod = taskArgs.noticePeriod;
    const managementFee = taskArgs.managementFee;
    const description = taskArgs.description;
    const merkleOrchard = config.merkleOrchard || ethers.constants.AddressZero;

    if (tokens.length < 2) {
      console.error("Number of Tokens should be at least two");
      return;
    }

    const [sortedTokens] = assetHelpers.sortTokens(tokens);
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i] !== sortedTokens[i]) {
        console.error("Tokens should be sorted by address in ascending order");
        return;
      }
    }

    const { admin } = await ethers.getNamedSigners();

    if (!taskArgs.silent) {
      console.log("Deploying vault with");
      console.log(`Factory: ${factory}`);
      console.log(`Name: ${name}`);
      console.log(`Symbol: ${symbol}`);
      console.log("Tokens:\n", tokens.join("\n"));
      console.log("Weights:\n", weights.join("\n"));
      console.log(`Swap Fee: ${swapFeePercentage}`);
      console.log(`Guardian: ${guardian}`);
      console.log(`Validator: ${validator}`);
      console.log(`Notice Period: ${noticePeriod}`);
      console.log(`Management Fee: ${managementFee}`);
      console.log(`Merkle Orchard: ${merkleOrchard}`);
      console.log(`Description: ${description}`);
      console.log(`Gas Price: ${config.gasPrice}`);
    }

    const contractName = taskArgs.test ? "MammonVaultV1Mock" : "MammonVaultV1";

    const vaultFactory = await ethers.getContractFactory(contractName);

    const deployArgs = {
      factory,
      name,
      symbol,
      tokens,
      weights,
      swapFeePercentage,
      guardian,
      validator,
      noticePeriod,
      managementFee,
      merkleOrchard,
      description,
    };

    if (taskArgs.printTransactionData) {
      const calldata = vaultFactory.getDeployTransaction(deployArgs).data;
      console.log("Deployment Transaction Data:", calldata);
      return;
    }

    const deployedVault = await deployments.deploy(contractName, {
      contract: contractName,
      args: [deployArgs],
      from: admin.address,
      log: true,
      gasPrice: config.gasPrice,
    });
    if (!taskArgs.silent) {
      console.log("Vault is deployed to:", deployedVault.address);
    }
    return await vaultFactory.attach(deployedVault.address);
  });
