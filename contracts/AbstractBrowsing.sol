// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Address.sol";

import "./BidStack.sol";
import "./SignatureValidator.sol";
import "./interfaces/IERC721Abstract.sol";

contract AbstractBrowsing is AccessControl, Pausable, ReentrancyGuard, BidStack, SignatureValidator {
  using Address for address;

  IERC721Abstract _factory;
  uint256 private _total = 500;
  uint256 private _timestamp;
  address private _owner;

  event CreateBid(uint256 bidId, address indexed account, uint256 amount);
  event UpdateBid(uint256 bidId, address indexed account, uint256 newAmount, uint256 addition);
  event CancelBid(uint256 bidId, address indexed account, uint256 amount);
  event Withdrawn(address indexed account, uint256 amount);

  constructor(string memory name) SignatureValidator(name) {
    _owner = _msgSender();
    _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
  }

  function setFactory(address factory) external onlyRole(DEFAULT_ADMIN_ROLE) {
    require(factory.isContract(), "Exchange: the factory must be a deployed contract");
    _factory = IERC721Abstract(factory);
  }
  function createBid(
    bytes32 nonce,
    string memory url,
    bytes calldata signature
  ) external payable whenNotPaused returns (uint256 bidId){
    _verifySignature(nonce, _msgSender(), url, msg.value, _owner, signature);
    if (getStackSize() == 0) {
      _timestamp = block.timestamp + 86400;
    }
    bidId = _pushNewBid(msg.value, _msgSender(), url);
    emit CreateBid(bidId, _msgSender(), msg.value);
  }

  function updateBid(
    bytes32 nonce,
    uint256 bidId,
    bytes calldata signature
  ) external payable whenNotPaused {
    _verifySignatureUpdateRevoke(nonce, bidId,  _owner, signature);
    uint256 newAmount = _updateBid(bidId, msg.value);
    emit UpdateBid(bidId, msg.sender, newAmount, msg.value);
  }

  function cancelBid(
    bytes32 nonce,
    uint256 bidId,
    bytes calldata signature
  ) external _ifBidExists(bidId) {
    _verifySignatureUpdateRevoke(nonce, bidId,  _owner, signature);
    address account = _msgSender();
    require(_getBidById(bidId).bidder == account, "Exchange: Not an owner");
    uint256 amount = _cancelBid(bidId);
    emit CancelBid(bidId, account, amount);
    (bool sent, ) = account.call{ value: amount, gas: 20317 }("");
    require(sent, "Exchange: Failed to send Ether");
  }


  function mint() public {
    require(_timestamp < block.timestamp, "Not yet callable");
    require(_total > 0, "Limit exceeded");

    BidStack.Bid memory topBid = _popHighestBid();

    _total = _total - 1;

    if (getStackSize() > 0) {
      _timestamp = block.timestamp + 86400;
    }
    // console.log(">>", topBid.bidder);
    _factory.mint(topBid.bidder, topBid.url);

    if(_total == 0){
      _releaseBids();
    }
  }

  function getStackInfo() external view returns (uint256 minBid, uint256 maxBid, uint256 timestamp, uint256 stackSize, uint256 total){
    minBid = _getMinBid();
    maxBid = _getMaxBid();
    timestamp = _timestamp;
    stackSize = getStackSize();
    total = _total;
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
