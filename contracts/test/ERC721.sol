// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

import "../interfaces/IERC721Abstract.sol";

contract ERC721Test is AccessControl, ERC721, IERC721Abstract {
  using Counters for Counters.Counter;

  Counters.Counter internal _tokenIdTracker;

  bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

  constructor(string memory name, string memory symbol) ERC721(name, symbol) {
    _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
    _tokenIdTracker.increment();
  }

  function mint(address to, string memory url) public virtual onlyRole(MINTER_ROLE) {
    url; // to prevent warning
    _mint(to, _tokenIdTracker.current());
    _tokenIdTracker.increment();
  }

  function supportsInterface(bytes4 interfaceId) public view virtual override(AccessControl, ERC721) returns (bool) {
    return super.supportsInterface(interfaceId);
  }
}
