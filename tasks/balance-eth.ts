import { task } from "hardhat/config";
import "@nomiclabs/hardhat-web3";

task("balance-eth", "Prints an ETH balance")
  .addParam("account", "The account's address")
  .setAction(async (args, hre) => {
    const { account } = args;

    const balance = await hre.web3.eth.getBalance(account);
    console.info("ETH Balance:", hre.web3.utils.fromWei(balance, "ether"), "ETH");
  });
