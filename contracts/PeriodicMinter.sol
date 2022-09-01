// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Address.sol";

import "./BidManager.sol";
import "./interfaces/IERC721Abstract.sol";

contract PeriodicMinter is AccessControl, Pausable, ReentrancyGuard, BidManager {
  using Address for address;

  IERC721Abstract _factory;
  // TODO figure out better way
  uint256 private _total = 2;
  uint256 private _auctionEndTime;
  address private _owner;

  event CreateBid(uint256 bidId, address indexed account, uint256 amount);
  event UpdateBid(uint256 bidId, address indexed account, uint256 newAmount, uint256 addition);
  event CancelBid(uint256 bidId, address indexed account, uint256 amount);
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
  ) external payable whenNotPaused returns (uint256 bidId){
    _verifySignature(url, tokenUri, _owner, signature);
    bool auctionInProgress = hasValidBids();
    bidId = _pushNewBid(msg.value, _msgSender(), url);
    if (!auctionInProgress) _auctionEndTime = block.timestamp + 86400;
    emit CreateBid(bidId, _msgSender(), msg.value);
  }

  // TODO - Test that sender must be bidder
  function updateBid(uint256 bidId) external payable whenNotPaused {
    uint256 newAmount = _updateBid(bidId, msg.value);
    emit UpdateBid(bidId, msg.sender, newAmount, msg.value);
  }

  function cancelBid(uint256 bidId) external _ifBidExists(bidId) nonReentrant {
    if (bidId == _getHighestBidId()) revert CannotCancelHighBid();
    address bidder = _msgSender();
    uint256 bidIndex = _bidIndexes[bidId];
    Bid memory bid = _bids[bidIndex];
    require(bid.bidder == bidder, "Exchange: Not an owner");
    (bool sent, ) = bidder.call{ value: bid.amount }("");
    delete _bids[bidIndex];
    require(sent, "Exchange: Failed to send Ether");
    emit CancelBid(bidId, bidder, bid.amount);
  }

  function mint() public {
    require(_auctionEndTime < block.timestamp, "Not yet callable");
    require(_total > 0, "Limit exceeded");
    Bid memory topBid = _popHighestBid();
    _total = _total - 1;
    if (hasValidBids()) _auctionEndTime = block.timestamp + 86400;
    _factory.mint(topBid.bidder, topBid.url);
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
