// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Address.sol";

import "./BidQueue.sol";
import "./SignatureValidator.sol";
import "./interfaces/IERC721Abstract.sol";

contract AbstractNFT is AccessControl, Pausable, ReentrancyGuard, BidQueue, SignatureValidator {
  using Address for address;

  IERC721Abstract _factory;
  uint256 private _total = 500;
  uint256 private _timestamp;
  // mapping(uint256 => string) private _urls;

  event CreateBid(uint256 bidId, address indexed account, uint256 amount);
  event UpdateBid(uint256 bidId, address indexed account, uint256 amount);
  event RevokeBid(uint256 bidId, address indexed account, uint256 amount);
  event Withdrawn(address indexed account, uint256 amount);

  constructor(string memory name) SignatureValidator(name) {
    _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
  }

  function setFactory(address factory) external onlyRole(DEFAULT_ADMIN_ROLE) {
    require(factory.isContract(), "Exchange: the factory must be a deployed contract");
    _factory = IERC721Abstract(factory);
  }

  function addBid(
    bytes32 nonce,
    string memory url,
    address signer,
    bytes calldata signature
  ) external payable whenNotPaused {
    require(hasRole(DEFAULT_ADMIN_ROLE, signer), "Exchange: Wrong signer");

    address account = _msgSender();

    _verifySignature(nonce, account, url, msg.value, signer, signature);

    if (getQueueSize() == 0) {
      _timestamp = block.timestamp + 86400;
    }

    uint256 bidId = _addBid(msg.value, account, url);
    emit CreateBid(bidId, account, msg.value);
  }

  function mint() public {
    require(_timestamp < block.timestamp, "Not yet callable");
    require(_total > 0, "Limit exceeded");

    BidQueue.Bid memory topBid = _popHighestBid();

    // BidQueue.Bid bid = _popHighestBid();
    _total = _total - 1;

    if (getQueueSize() > 0) {
      _timestamp = block.timestamp + 86400;
    }
    _factory.mint(topBid.bidder, topBid.url);
  }

  function revokeBid(uint256 bidId) external _ifBidExists(bidId) {
    address account = _msgSender();
    require(_getBidById(bidId).bidder == account, "Exchange: Not an owner");
    uint256 amount = _revokeBid(bidId);
    emit RevokeBid(bidId, account, amount);
    (bool sent, ) = account.call{ value: amount, gas: 20317 }("");
    require(sent, "Exchange: Failed to send Ether");
  }

  function pause() public virtual onlyRole(DEFAULT_ADMIN_ROLE) {
    _pause();
  }

  function unpause() public virtual onlyRole(DEFAULT_ADMIN_ROLE) {
    _unpause();
  }

  function withdraw() public onlyRole(DEFAULT_ADMIN_ROLE) returns (bool success) {
    uint256 amount = payable(address(this)).balance;
    address account = _msgSender();
    (bool sent, ) = account.call{ value: amount, gas: 20317 }("");
    require(sent, "Exchange: Failed to send Ether");
    emit Withdrawn(account, amount);
    return true;
  }
}
