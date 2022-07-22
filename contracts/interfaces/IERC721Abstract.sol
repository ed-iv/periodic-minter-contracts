// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.9;


interface IERC721Abstract {
  function mint(address to, string memory url) external;
}
