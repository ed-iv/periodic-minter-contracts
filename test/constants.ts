import { ethers } from "hardhat";

export const tokenSymbol = "LID";
export const tokenName = "Lorem ipsum dolor";
export const tokenId = 1;
export const nonce = ethers.utils.formatBytes32String("nonce");
export const baseTokenURI = "http://localhost:3011/metadata"; // no trailing slash

export const DEFAULT_ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000";
export const MINTER_ROLE = ethers.utils.id("MINTER_ROLE");

export const amount = 100000000000000;
