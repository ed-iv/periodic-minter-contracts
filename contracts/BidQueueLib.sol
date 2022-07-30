// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/Counters.sol";

library BidQueueLib {
    using BidQueueLib for Bids;
    using Counters for Counters.Counter;
    struct Bid {
        address bidder;
        uint256 id;
        uint256 amount;
        bool valid;
        bool exists;
    }
    
    struct Bids {
      Bid[] _items;
      Counters.Counter _bidsCounter;
      mapping(uint256 => uint256) _indexes;
      mapping(address => uint256[]) _addressBids;
      // mapping(address => Counters.Counter) _addressBidsCounter;
    }

    function pushBid(Bids storage self, uint256 amount, address bidder) internal {
      uint256 minBidIncreace = 500;
      uint256 minBid = 1000000000000000; // 0.001 eth
      uint256 id = self._bidsCounter.current();
      Bid storage highestBid = self.getHighestBid();
      uint256 highestBidAmount = highestBid.amount;
      require(amount > minBid, "BidQueueLib: Bid should be higher than minimum");
      require(amount >= highestBidAmount * minBidIncreace / 10000, "BidQueueLib: Bid should be 5% higher");
      self._addressBids[bidder].push(id);
      // self._addressBidsCounter[bidder].increment();
      self._items.push(Bid(bidder, id, amount, true, true));
      self._bidsCounter.increment();
    }

    function removeBid(Bids storage self, Bid memory element) internal {
      require(!exists(self, element), "StructArrayLib: Element already exists");
      self._items[element.id].valid = false;
      // self._addressBidsCounter[element.bidder].decrement();
      delete self._indexes[element.id];
    }

    function updateBid(Bids storage self, Bid memory element, uint256 amount) internal {
      pushBid(self, element.amount + amount, element.bidder);
      removeBid(self, element);
    }

    function getHighestBid(Bids storage self) internal view returns (Bid storage){
      return self._items[self._bidsCounter.current()-1];
    }
    // function getBidAtIndex(Bids storage self, uint256 index) internal view returns (Bid memory) {
    //     require(index < size(self), "the index is out of bounds");
    //     return self._items[index];
    // }

    // function size(Bids storage self) internal view returns (uint256) {
    //   return self._items.length;
    // }

    function exists(Bids storage self, Bid memory element) internal view returns (bool) {
      return self._indexes[element.id]>0 || self._items[0].id == element.id;
    }

    function getAllBids(Bids storage self) internal view returns(Bid[] memory) {
      return self._items;
    }

    function getAllBidsByAddress(Bids storage self, address bidder) internal view returns(uint256[] memory results) {
      uint256[] storage addressBids = self._addressBids[bidder];
      uint j = 0;
      for(uint i = 0; i < addressBids.length; i = i + 1) {
        if(self._items[self._indexes[addressBids[i]]].valid){
          results[j]=addressBids[i];
          j = j + 1;
        }
      }
      return addressBids; 
    }

}