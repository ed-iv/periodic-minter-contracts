import { ethers } from "hardhat";

import { tokenName } from "../test/constants";

async function main() {
  const coinFactory = await ethers.getContractFactory("Val");
  const coinInstance = await coinFactory.deploy(tokenName, 2);
  console.info(`VAL_ADDR=${coinInstance.address.toLowerCase()}`);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
