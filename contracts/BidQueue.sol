// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.9;
import "@openzeppelin/contracts/utils/Counters.sol";
import "hardhat/console.sol";

contract BidQueue {
  using Counters for Counters.Counter;

  modifier _ifBidExists(uint256 bidId){
    require(_indexes[bidId] > 0 && _bids[_indexes[bidId]].exists, "BidQueue: Bid not exists");
    _;
  }
  modifier _ifBidOwner(uint256 bidId) {
    require(_getBidById(bidId).bidder == msg.sender, "BidQueue: Restrict to bids owner only");
    _;
  }

  struct Bid {
        address bidder;
        uint256 id;
        string url;
        uint256 amount;
        bool valid;
        bool exists;
  }
  
  uint256 private _minBidIncrease = 500;
  uint256 private _minBid = 100000000000000; // 0.0001 eth

  Bid[] _bids;
  Counters.Counter private _bidsCounter;
  Counters.Counter private _bidsSize;
  mapping(uint256 => uint256) private  _indexes;
  mapping(address => uint256[]) private  _addressBids;
  uint256 private _highestBidId;

  constructor(){
    // add a empty bid to start with 1 index
    _bids.push(Bid(address(0), 0, "", 0, false, true));
    _bidsCounter.increment();
    _bids[0].valid = false;
  }

  function getHighestBid() public view returns (Bid memory){
    return _bids[_indexes[_highestBidId]];
  }

  function getQueueSize() public view returns(uint256) {
    return _bidsSize.current();
  }
  
  function getBidList() public view returns(uint256[] memory) {
    return _addressBids[msg.sender];
  }

  function getBidInfo(uint256 bidId) public view _ifBidOwner(bidId) returns(Bid memory bid) {
    bid = _getBidById(bidId);
  }
  // internals

  function _pushNewBid(uint256 amount, address bidder, string memory url) internal returns (uint256 id) {
    id = _addBid(amount, bidder, url);
    _bidsCounter.increment();
    _bidsSize.increment();
  }
  
  // internal 
  function _addBid(uint256 amount, address bidder, string memory url) internal returns (uint256) {
    uint256 id = _bidsCounter.current();
    Bid memory highestBid = getHighestBid();
    uint256 highestBidAmount = highestBid.amount;
    require(amount > _minBid, "BidQueue: Bid should be higher than minimum");
    require(amount >= highestBidAmount + highestBidAmount * _minBidIncrease / 10000, "BidQueueLib: Bid should be 5% higher");
    _addressBids[bidder].push(id);
    _highestBidId = id;
    _indexes[id] = _bidsCounter.current();
    // self._addressBidsCounter[bidder].increment();
    _bids.push(Bid(bidder, id, url, amount, true, true));
    return id;
  }

  function _revokeBid(uint256 bidId) internal _ifBidExists(bidId) returns(uint256 amount) {
    Bid storage bid = _getBidById(bidId);
    amount = bid.amount;
    _bidsSize.decrement();
    _removeBid(bidId);
    return amount;
  }

  function _popHighestBid() internal returns (Bid memory bid){
    require(_highestBidId > 0, "BidQueue: Highest bid could not be revoked");
    bid = _getBidById(_highestBidId);
    // bid.valid = false;
    delete _indexes[_highestBidId];
    _bidsSize.decrement();
    _highestBidId = _bids[_bidsSize.current()].id;
    _bids.pop();
  }

  function _updateBid(uint256 bidId, uint256 amount) internal  _ifBidExists(bidId) _ifBidOwner(bidId) returns(uint256) {
    Bid storage bid = _getBidById(bidId);
    _addBid(bid.amount + amount, bid.bidder, bid.url);
    _removeBid(bidId);
    return bid.amount + amount;
  }

  

  function _getBidById(uint256 bidId) internal view returns (Bid storage){
    return _bids[_indexes[bidId]];
  }

 
  
  function _removeBid(uint256 bidId) internal _ifBidExists(bidId) {
    require(bidId != _highestBidId, "BidQueue: Highest bid could not be revoked");
    Bid storage bid = _getBidById(bidId);
    bid.valid = false;
    delete _indexes[bidId];
  }

  // allow to revoke all bids including highest
  function _releaseBids() internal {
    _highestBidId = 0;
  }
  // function _bidExists(uint256 bidId) internal view returns (bool) {
  //   return _indexes[bidId] > 0 && _bids[_indexes[bidId]].exists;
  // }
} 