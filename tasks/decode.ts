import { task } from "hardhat/config";
import "@nomiclabs/hardhat-web3";

task("decode", "Decode error message")
  .addParam("data", "encoded data")
  .setAction(async (args, hre) => {
    const { data } = args;

    // dummy
    await Promise.resolve();

    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    console.info(hre.ethers.utils.toUtf8String(`0x${data.substr(138)}`));
  });
