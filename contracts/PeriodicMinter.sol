// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "hardhat/console.sol";

import "./BidManager.sol";
import "./BidVerifier.sol";
import "./interfaces/IERC721Abstract.sol";

error InvalidBidId();
error AlreadyMinted(string url);

contract PeriodicMinter is AccessControl, Pausable, ReentrancyGuard, BidManager, BidVerifier {
  using Address for address;

  IERC721Abstract _factory;
  uint256 private _mintsRemaining = 2; // TODO - Find better way to test
  uint256 private _auctionEndTime;
  address private _owner;
  uint256 public mintedBalance;
  mapping(bytes32 => bool) private _mintedUrls;

  event CreateBid(BidId bidId, address indexed account, uint256 amount);
  event UpdateBid(BidId bidId, address indexed account, uint256 newAmount, uint256 addition);
  event CancelBid(BidId bidId, address indexed account, uint256 amount);
  event Withdrawn(address indexed account, uint256 amount);

  constructor(string memory name) BidVerifier(name) {
      _owner = _msgSender();
      _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
  }

  function setFactory(address factory) external onlyRole(DEFAULT_ADMIN_ROLE) {
      require(factory.isContract(), "Exchange: the factory must be a deployed contract");
      _factory = IERC721Abstract(factory);
  }

  /// @notice Create a new bid. Must be higher than the current high bid by the minimum bid increment.
  function createBid(
      string calldata url,
      string calldata tokenUri,
      bytes calldata signature
  ) external payable whenNotPaused {
      if (_mintedUrls[keccak256(abi.encodePacked(url))]) revert AlreadyMinted(url);
      _verifySignature(url, tokenUri, _owner, signature);
      BidId bidId = _getBidId(_msgSender(), url, tokenUri);
      if (!hasValidBids()) _auctionEndTime = block.timestamp + 86400;
      _createBid(bidId, msg.value);
      emit CreateBid(bidId, _msgSender(), msg.value);
  }

  function updateBid(string calldata url, string calldata tokenUri) external payable whenNotPaused {
      BidId bidId = _getBidId(_msgSender(), url, tokenUri);
      uint256 currAmount = _bids[bidId].amount;
      require(currAmount > 0, "Bid does not exist");
      _createBid(bidId, msg.value);
      emit UpdateBid(bidId, msg.sender, currAmount + msg.value, msg.value);
  }

  function cancelBid(string calldata url, string calldata tokenUri) external nonReentrant {
      address bidder = _msgSender();
      BidId bidId = _getBidId(bidder, url, tokenUri);
      if (BidId.unwrap(bidId) == BidId.unwrap(_highBidId)) revert CannotCancelHighBid();
      uint256 bidAmount = _bids[bidId].amount;
      if (bidAmount == 0) revert InvalidBidId();
      _removeBid(bidId);
      (bool sent, ) = bidder.call{ value: bidAmount }("");
      require(sent, "Exchange: Failed to send Ether");

      emit CancelBid(bidId, bidder, bidAmount);
  }

  function mint(address bidder, string calldata url, string calldata tokenUri) public {
      require(_auctionEndTime < block.timestamp, "Not yet callable");
      require(_mintsRemaining > 0, "Limit exceeded");
      BidId bidId = _getBidId(bidder, url, tokenUri);
      if (BidId.unwrap(bidId) != BidId.unwrap(_highBidId)) revert InvalidBidId();
      _mintsRemaining = _mintsRemaining - 1;
      uint256 bidAmount = _removeBid(bidId);
      if (hasValidBids()) _auctionEndTime = block.timestamp + 86400;
      _factory.mint(bidder, tokenUri);
      _mintedUrls[keccak256(abi.encodePacked(url))] = true;
      mintedBalance += bidAmount;
  }

  function pause() public virtual onlyRole(DEFAULT_ADMIN_ROLE) {
      _pause();
  }

  function unpause() public virtual onlyRole(DEFAULT_ADMIN_ROLE) {
      _unpause();
  }

  function withdraw(address to) public onlyRole(DEFAULT_ADMIN_ROLE) {
      (bool sent, ) = to.call{ value: mintedBalance, gas: 20317 }("");
      require(sent, "Exchange: Failed to send Ether");
      emit Withdrawn(to, mintedBalance);
  }
}
