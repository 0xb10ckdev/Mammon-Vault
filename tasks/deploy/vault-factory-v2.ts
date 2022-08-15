import { task, types } from "hardhat/config";

task("deploy:vaultFactoryV2", "Deploys a Mammon vault factory v2")
  .addOptionalParam(
    "silent",
    "Disable console log on deployment",
    false,
    types.boolean,
  )
  .setAction(async (taskArgs, { deployments, ethers }) => {
    const { admin } = await ethers.getNamedSigners();

    if (!taskArgs.silent) {
      console.log("Deploying factory");
    }

    const mammonVaultFactoryV2Contract = "MammonVaultFactoryV2";
    const mammonVaultFactoryV2 = await deployments.deploy(
      mammonVaultFactoryV2Contract,
      {
        contract: mammonVaultFactoryV2Contract,
        from: admin.address,
        log: true,
      },
    );

    if (!taskArgs.silent) {
      console.log("Factory is deployed to:", mammonVaultFactoryV2.address);
    }
  });
