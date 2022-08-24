// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;
import "@openzeppelin/contracts/utils/Counters.sol";
import "hardhat/console.sol";

contract BidStack {
  using Counters for Counters.Counter;

  struct Bid {
      address bidder;
      uint256 id;
      string url;
      uint256 amount;
      bool valid;
  }

  uint256 private _minBidIncrease = 500;
  uint256 private _minBid = 100000000000000; // 0.0001 eth

  Bid[] _bids;
  uint256 private _nextBidId = 1;
  mapping(uint256 => uint256) private  _bidIndexes;
  uint256 private _highestBidId;

  modifier _ifBidExists(uint256 bidId){
    require(_bids[_bidIndexes[bidId]].bidder != address(0), "BidStack: Bid not exists");
    _;
  }
  modifier _ifBidOwner(uint256 bidId) {
    require(_getBidById(bidId).bidder != address(0), "BidStack: Wrong bid ID");
    require(_getBidById(bidId).bidder == msg.sender, "BidStack: Restrict to bids owner only");
    _;
  }

  constructor(){
    // add a empty bid to start with 1 index
    _bids.push(Bid(address(0), 0, "", 0, false));
    _bids[0].valid = false;
  }

  function getHighestBid() public view returns (Bid memory){
    return _bids[_bids.length-1];
  }

  /**
   * @dev Because of how invalid bids are popped off, a couple invariants should hold at all times:
   *     (a) The highest bid in the stack will be valid
   *     (b) if there are no valid bids, there are also be no invalid bids.
   * Frob (b) we know that if the bid stack size > 1 (has more than just the dummy bid) there MUST be
   * a valid bid in the stack.
   */
  function hasValidBids() public view returns(bool) {
    return _bids.length > 1;
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
  function _getMinBid() internal view returns(uint256 minBid){
    Bid memory highestBid = getHighestBid();
    uint256 highestBidAmount = highestBid.amount;
    minBid = highestBidAmount + highestBidAmount * _minBidIncrease / 10000;
  }

  function _getMaxBid() internal view returns(uint256 maxBid){
    Bid memory highestBid = getHighestBid();
    maxBid = highestBid.amount;
  }

  function _pushNewBid(uint256 amount, address bidder, string memory url) internal returns (uint256 id) {
    uint256 minBid = _getMinBid();
    require(amount >= _minBid, "BidStack: Bid should be higher than minimum");
    require(amount >= minBid, "BidStack: Bid should be 5% higher");
    id = _createBid(amount, bidder, url);
  }

  function _createBid(uint256 amount, address bidder, string memory url) internal returns (uint256) {
    uint256 bidId = _nextBidId++;
    _bids.push(Bid(bidder, bidId, url, amount, true));
    _bidIndexes[bidId] = _bids.length - 1;
    return bidId;
  }

  // TODO - need to return funds associated with this bid to user
  function _cancelBid(uint256 bidId) internal _ifBidExists(bidId) returns(uint256 amount) {
    Bid storage bid = _getBidById(bidId);
    amount = bid.amount;
    _removeBid(bidId);
    return amount;
  }

  function _popHighestBid() internal returns (Bid memory){
    Bid memory bid = getHighestBid();
    delete _bidIndexes[bid.id];
    _bids.pop();
    // Pop invalid bids off of the top of the stack
    while (_bids.length > 1 && _bids[_bids.length-1].valid == false) {
      _bids.pop();
    }
    return bid;
  }

  function _updateBid(uint256 bidId, uint256 amount) internal  _ifBidExists(bidId) _ifBidOwner(bidId) returns(uint256) {
    Bid storage bid = _getBidById(bidId);
    _pushNewBid(bid.amount + amount, bid.bidder, bid.url);
    _cancelBid(bidId);
    return bid.amount + amount;
  }

  function _getBidById(uint256 bidId) internal view returns (Bid storage){
    return _bids[_bidIndexes[bidId]];
  }

    function _removeBid(uint256 bidId) internal _ifBidExists(bidId) {
        require(bidId != _highestBidId, "BidStack: Highest bid could not be revoked");
        Bid storage bid = _getBidById(bidId);
        bid.valid = false;
        delete _bidIndexes[bidId];
    }

    // allow to revoke all bids including highest
    function _releaseBids() internal {
        _highestBidId = 0;
    }

    function _getHighestBidId() internal view returns (uint256 bidId) {
        return _bids[_bids.length-1].id;
    }

  // function _printBids(string memory title) internal view {
  //   console.log("\n--------", title);
  //   for(uint i = 0; i< _bids.length; i++ ){
  //     console.log("BID:",_bids[i].id, " - ", _bids[i].valid);
  //   }
  // }
}
