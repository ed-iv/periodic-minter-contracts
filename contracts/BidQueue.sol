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
    require(_getBidById(bidId).bidder != address(0), "BidQueue: Wrong bid ID");
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
  Counters.Counter private _queueSize;
  mapping(uint256 => uint256) private  _indexes;
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
    return _queueSize.current();
  }

  function getBidInfo(uint256 bidId) public view _ifBidOwner(bidId) returns(Bid memory bid) {
    bid = _getBidById(bidId);
  }

  function getMyBids() public view returns(uint256[] memory results) {
    uint256 myBidsAmount = 0;
    for(uint i = 0; i < _bids.length; i++){
      Bid memory bid = _bids[i];
      if(bid.bidder == msg.sender && bid.valid){
        myBidsAmount++;
      }
    }
    results = new uint256[](myBidsAmount);
    uint256 index = 0;
    for(uint i = 0; i < _bids.length; i++){
      Bid memory bid = _bids[i];
      if(bid.bidder == msg.sender && bid.valid){
        results[index] = i;
        index++;
      }
    }
  }

  // internals
  function _getMinBid() internal view returns(uint256 minBet){
    Bid memory highestBid = getHighestBid();
    uint256 highestBidAmount = highestBid.amount;
    minBet = highestBidAmount + highestBidAmount * _minBidIncrease / 10000;
  }

  function _getMaxBid() internal view returns(uint256 maxBid){
    Bid memory highestBid = getHighestBid();
    maxBid = highestBid.amount;
  }

  function _pushNewBid(uint256 amount, address bidder, string memory url) internal returns (uint256 id) {
    // _printBids("PUSH");
    uint256 minBet = _getMinBid();
    require(amount >= _minBid, "BidQueue: Bid should be higher than minimum");
    require(amount >= minBet, "BidQueue: Bid should be 5% higher");
    id = _createBid(amount, bidder, url);
    _bidsCounter.increment();
    _queueSize.increment();
    // _printBids("AFTER PUSH");
  }
  
  function _createBid(uint256 amount, address bidder, string memory url) internal returns (uint256) {
    uint256 id = _bidsCounter.current();
    _highestBidId = id;
    _indexes[id] = _bidsCounter.current();
    _bids.push(Bid(bidder, id, url, amount, true, true));
    return id;
  }

  function _revokeBid(uint256 bidId) internal _ifBidExists(bidId) returns(uint256 amount) {
    // _printBids("REVOKE");
    Bid storage bid = _getBidById(bidId);
    amount = bid.amount;
    _queueSize.decrement();
    _removeBid(bidId);
    // _printBids("AFTER REVOKE");
    return amount; 
  }
  
  function _popHighestBid() internal returns (Bid memory bid){
    // _printBids("POP");
    Bid storage bidStorage = _getBidById(_highestBidId);
    bid = bidStorage;
    bidStorage.valid = false;
    delete _indexes[_highestBidId];
    _queueSize.decrement();
    _bids.pop();
    _bidsCounter.decrement();
    // _printBids("AFTER POP");

    
    // 
    bool newBidFound = false;
    uint256 _highestBidIndex = _bidsCounter.current() - 1;
    
    while(!newBidFound){
      Bid memory newBid = _bids[_highestBidIndex];
    
      if(_highestBidIndex<=0){
        return bid;
      }
      if(newBid.valid){
        newBidFound = true;
        _highestBidId = newBid.id;
      } else { 
        unchecked {
          _highestBidIndex--;
        }
      }      
      // newBid = _bids[_highestBidIndex];
      // console.log("T++", _highestBidIndex, newBid.valid);
    }
    return bid;
  }

  function _updateBid(uint256 bidId, uint256 amount) internal  _ifBidExists(bidId) _ifBidOwner(bidId) returns(uint256) {
    // _printBids("UPDATE");
    Bid storage bid = _getBidById(bidId);
    _pushNewBid(bid.amount + amount, bid.bidder, bid.url);
    _revokeBid(bidId);
    // _printBids("AFTER UPDATE");
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

  // function _printBids(string memory title) internal view {
  //   console.log("\n--------", title);
  //   for(uint i = 0; i< _bids.length; i++ ){
  //     console.log("BID:",_bids[i].id, " - ", _bids[i].valid);
  //   }
  // }
} 