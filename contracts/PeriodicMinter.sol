// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "hardhat/console.sol";

import "./BidManager.sol";
import "./interfaces/IERC721Abstract.sol";

error InvalidBidId();

contract PeriodicMinter is AccessControl, Pausable, ReentrancyGuard, BidManager {
  using Address for address;

  IERC721Abstract _factory;
  // TODO figure out better way
  uint256 private _total = 2;
  uint256 private _auctionEndTime;
  address private _owner;

  event CreateBid(bytes32 bidId, address indexed account, uint256 amount);
  event UpdateBid(bytes32 bidId, address indexed account, uint256 newAmount, uint256 addition);
  event CancelBid(bytes32 bidId, address indexed account, uint256 amount);
  event Withdrawn(address indexed account, uint256 amount);

  constructor(string memory name) BidManager(name) {
    _owner = _msgSender();
    _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
  }

  function setFactory(address factory) external onlyRole(DEFAULT_ADMIN_ROLE) {
    require(factory.isContract(), "Exchange: the factory must be a deployed contract");
    _factory = IERC721Abstract(factory);
  }

  function createBid(
    string calldata url,
    string calldata tokenUri,
    bytes calldata signature
  ) external payable whenNotPaused {
    _verifySignature(url, tokenUri, _owner, signature);
    bytes32 bidId = _getBidId(_msgSender(), url, tokenUri);
    if (!hasValidBids()) _auctionEndTime = block.timestamp + 86400;
    _createBid(bidId, msg.value);
    emit CreateBid(bidId, _msgSender(), msg.value);
  }

  // // TODO - Test that sender must be bidder
  function updateBid(string calldata url, string calldata tokenUri) external payable whenNotPaused {
    bytes32 bidId = _getBidId(_msgSender(), url, tokenUri);
    uint256 currAmount = _bids[bidId];
    require(currAmount > 0, "Bid does not exist");
    _createBid(bidId, msg.value);
    emit UpdateBid(bidId, msg.sender, currAmount + msg.value, msg.value);
  }

  // TODO - replace _ifbidexists
  function cancelBid(string calldata url, string calldata tokenUri) external nonReentrant {
    address bidder = _msgSender();
    bytes32 bidId = _getBidId(bidder, url, tokenUri);
    if (bidId == _getHighestBidId()) revert CannotCancelHighBid();
    uint256 bidAmount = _bids[bidId];
    if (bidAmount == 0) revert InvalidBidId();
    delete _bids[bidId];

    (bool sent, ) = bidder.call{ value: bidAmount }("");
    require(sent, "Exchange: Failed to send Ether");

    emit CancelBid(bidId, bidder, bidAmount);
  }

  function mint(address bidder, string calldata url, string calldata tokenUri) public {
    require(_auctionEndTime < block.timestamp, "Not yet callable");
    require(_total > 0, "Limit exceeded");
    bytes32 bidId = _getBidId(bidder, url, tokenUri);
    bytes32 highestBidId = _getHighestBidId();
    if (bidId != highestBidId) revert InvalidBidId();
    _total = _total - 1;
    delete _bids[bidId];
    _popBidStack();
    if (hasValidBids()) _auctionEndTime = block.timestamp + 86400;
    _factory.mint(bidder, tokenUri);
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
