// SPDX-License-Identifier: UNLICENSED

import "hardhat/console.sol";
pragma solidity ^0.8.9;

contract LinkedBidsList {
  
  struct Bid {
    address bidder;
    uint256 amount;
  }

  uint256 constant MIN_BID_INCRESE_PERCENT = 500; // 5%
  uint256 constant MIN_BID_AMOUNT = 100000000000000; // 0.001 ETH

  mapping(uint256 => uint256) private _nextBidIDs;
  mapping(uint256 => uint256) private _prevBidIDs;
  mapping(uint256 => Bid) private _bids;

  uint256 private highestBidID;
  uint256 public queueSize;



  // TODO 
  // constructor(_MIN_BID_INCRESE_PERCENT, _MIN_BID_AMOUNT) {
  //   MIN_BID_INCRESE_PERCENT = _MIN_BID_INCRESE_PERCENT;
  //   MIN_BID_AMOUNT = _MIN_BID_AMOUNT;
  // }

  function _addBid(uint256 bidID, uint256 value, address bidder) internal {
    require(!_ifBidExists(bidID), "Bid ID already exists");
    require(value > _bids[highestBidID].amount, "Bid amount lower then highest");
    require(value > MIN_BID_AMOUNT, "Bid amount is low");
    if (_bids[highestBidID].amount > 0) {
      _prevBidIDs[highestBidID] = bidID; 
    }
    _nextBidIDs[bidID] = highestBidID;
    _prevBidIDs[bidID] = 0;
    highestBidID = bidID;
    _bids[bidID] = Bid(bidder, value);
    queueSize = queueSize + 1;
  }

  function _updateBid(uint256 bidID, uint256 value) internal {
    console.log('>upd');
    require(_ifBidExists(bidID), "No such bid ID");
    uint256 newBidValue = _bids[bidID].amount + value;
    Bid memory highestBid = getHighestBid();
    require(newBidValue > highestBid.amount * MIN_BID_INCRESE_PERCENT / 100, "Not enough bid value");
    
    _nextBidIDs[_prevBidIDs[bidID]] = _nextBidIDs[bidID];
    _prevBidIDs[_nextBidIDs[bidID]] = _prevBidIDs[bidID];
    _prevBidIDs[bidID] = 0;
    _nextBidIDs[bidID] = highestBidID;
    
    _bids[bidID].amount = newBidValue;

    highestBidID = bidID;
  }

  function _removeBid(uint256 bidID) internal returns (uint256 amount){
    require(highestBidID != bidID, "Highest bid could not be removed");
    _prevBidIDs[_nextBidIDs[bidID]] = _prevBidIDs[bidID];
    _nextBidIDs[_prevBidIDs[bidID]] = _nextBidIDs[bidID];
    amount = _bids[bidID].amount;
    delete _bids[bidID];
    queueSize--;
    return amount;
  }

  function _ifBidExists(uint256 bidID) internal view returns(bool){
    return _bids[bidID].bidder != address(0);
  }

  function getHighestBid() public view returns(Bid memory){
    return _bids[highestBidID];
  }

  // TEST PURPOSES
  function getFullQueue() public view returns(uint256[4] memory results) {
    // uint256[] storage _results;
    uint256 i = 0;
    results[i] = highestBidID;
    uint256 nextId = _nextBidIDs[highestBidID];
    while(nextId>0){
      i = i + 1;
      results[i] = nextId;
      nextId = _nextBidIDs[nextId];
    }
  }
}
