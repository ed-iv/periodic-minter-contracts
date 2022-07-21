// SPDX-License-Identifier: UNLICENSED

// Author: Gen4
// Email: gen4mail@gmail.com
// Website: https://bigday.art/

pragma solidity ^0.8.9;

contract LinkedBidsList {
  
  struct Bid {
    address bidder;
    uint256 amount;
  }

  uint256 constant MIN_BID_INCRESE_PERCENT = 500; // 5%

  mapping(uint256 => uint256) private _nextBidIDs;
  mapping(uint256 => uint256) private _prevBidIDs;
  mapping(uint256 => Bid) private _bids;

  uint256 public highestBidID;
  uint256 public listSize;

  constructor() {
  }

  function _addBid(uint256 bidID, uint256 value, address bidder) internal {
    require(!_ifBidExists(bidID), "Bid ID already exists");
    require(value > _bids[highestBidID].amount);
    if (_bids[highestBidID].amount > 0) {
      _prevBidIDs[highestBidID] = bidID;
      _nextBidIDs[bidID] = highestBidID;
      _prevBidIDs[bidID] = 0;
      highestBidID = bidID;
      _bids[bidID] = Bid(bidder, value);
      listSize = listSize + 1;
    }
  }

  function _updateBid(uint256 bidID, uint256 value) internal {
    require(_ifBidExists(bidID), "No such bid ID");
    uint256 newBidValue = _bids[bidID].amount + value;
    Bid memory highestBid = getHighestBid();
    require(newBidValue > highestBid.amount * MIN_BID_INCRESE_PERCENT / 100, "Not enough bid value");
    
    _nextBidIDs[_prevBidIDs[bidID]] = _nextBidIDs[bidID];
    _prevBidIDs[_nextBidIDs[bidID]] = _prevBidIDs[bidID];
    _prevBidIDs[bidID] = 0;
    _nextBidIDs[bidID] = highestBidID;
    highestBidID = bidID;
    _bids[bidID].amount = newBidValue;
  }

  function _removeBid(uint256 bidID) internal returns (uint256 amount){
    require(highestBidID != bidID);
    _prevBidIDs[_nextBidIDs[bidID]] = _prevBidIDs[bidID];
    _nextBidIDs[_prevBidIDs[bidID]] = _nextBidIDs[bidID];
    amount = _bids[bidID].amount;
    delete _bids[bidID];
    listSize--;
    return amount;
  }

  function _ifBidExists(uint256 bidID) internal view returns(bool){
    return _bids[bidID].bidder != address(0);
  }

  function getHighestBid() internal view returns(Bid memory){
    return _bids[highestBidID];
  }

  // function _verifyIndex(
  //   address prevBidder,
  //   uint256 newValue,
  //   address nextBidder
  // ) internal view returns (bool) {
  //   return
  //   (prevBidder == GUARD || balance[prevBidder] >= newValue) &&
  //   (nextBidder == GUARD || newValue > balance[nextBidder]);
  // }

  // function _findIndex(uint256 newValue) internal view returns (address candidateAddress) {
  //   candidateAddress = GUARD;
  //   while (true) {
  //     if (_verifyIndex(candidateAddress, newValue, _nextBidders[candidateAddress])) {
  //       return candidateAddress;
  //     }
  //     candidateAddress = _nextBidders[candidateAddress];
  //   }
  // }

  // function _isPrevBidder(address bidder, address prevBidder) internal view returns (bool) {
  //   return _nextBidders[prevBidder] == bidder;
  // }

  // function _findPrevBidder(address bidder) internal view returns (address currentAddress) {
  //   currentAddress = GUARD;
  //   while (_nextBidders[currentAddress] != GUARD) {
  //     if (_isPrevBidder(bidder, currentAddress)) {
  //       return currentAddress;
  //     }
  //     currentAddress = _nextBidders[currentAddress];
  //   }
  // }

  // function getTop(uint256 k) public view returns (address[] memory) {
  //   require(k <= listSize, "LinkedList: top is bigger then list");
  //   address[] memory bidderLists = new address[](k);
  //   address currentAddress = _nextBidders[GUARD];
  //   for (uint256 i = 0; i < k; ++i) {
  //     bidderLists[i] = currentAddress;
  //     currentAddress = _nextBidders[currentAddress];
  //   }
  //   return bidderLists;
  // }
}
