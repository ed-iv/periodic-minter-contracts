// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;
import "hardhat/console.sol";
import "./BidVerifier.sol";

error CannotCancelHighBid();
error Unauthorized();

contract BidManager is BidVerifier {
    struct Bid {
        address bidder;
        uint256 id;
        string url;
        uint256 amount;
    }

    uint256 private _minBidIncrease = 500;
    uint256 private _minBid = 100000000000000; // 0.0001 eth

    Bid[] _bids;
    uint256 private _nextBidId = 1;
    mapping(uint256 => uint256) internal _bidIndexes;

    modifier _ifBidExists(uint256 bidId){
        require(_bids[_bidIndexes[bidId]].bidder != address(0), "BidStack: Bid not exists");
        _;
    }

    constructor(string memory name) BidVerifier(name){
        // add a empty bid to start with 1 index
        _bids.push(Bid(address(0), 0, "", 0));
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

    function getMyBids() public view returns(uint256[] memory results) {
        uint256 myBidsAmount = 0;
        for(uint i = 0; i < _bids.length; i++){
            Bid memory bid = _bids[i];
            if(bid.bidder == msg.sender){
                myBidsAmount++;
            }
        }
        results = new uint256[](myBidsAmount);
        uint256 index = 0;
        for(uint i = 0; i < _bids.length; i++){
            Bid memory bid = _bids[i];
            if(bid.bidder == msg.sender){
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

    function _createBid(uint256 amount, address bidder, string memory url) internal returns (uint256) {
        uint256 bidId = _nextBidId++;
        _bids.push(Bid(bidder, bidId, url, amount));
        _bidIndexes[bidId] = _bids.length - 1;
        return bidId;
    }

    function _pushNewBid(uint256 amount, address bidder, string memory url) internal returns (uint256 id) {
        uint256 minBid = _getMinBid();
        require(amount >= _minBid, "BidStack: Bid should be higher than minimum");
        require(amount >= minBid, "BidStack: Bid should be 5% higher");
        id = _createBid(amount, bidder, url);
    }

    function _popHighestBid() internal returns (Bid memory){
        Bid memory bid = getHighestBid();
        delete _bidIndexes[bid.id];
        _bids.pop();
        // Pop invalid bids off of the top of the stack
        while (_bids.length > 1 && !_isValid(_bids[_bids.length-1])) {
          _bids.pop();
        }
        return bid;
    }

    // TODO - Verify case where bidId is invalid
    function _updateBid(uint256 bidId, uint256 amount) internal returns(uint256) {
        uint256 bidIndex = _bidIndexes[bidId];
        Bid memory bid = _bids[bidIndex];
        require(bid.bidder == msg.sender, "BidStack: Restrict to bids owner only");
        bid.amount += amount;
        _pushNewBid(bid.amount, bid.bidder, bid.url);
        delete _bids[bidIndex];
        // _cancelBid(bidId);
        return bid.amount;
    }

    function _getBidById(uint256 bidId) internal view returns (Bid storage){
        return _bids[_bidIndexes[bidId]];
    }

    function _getHighestBidId() internal view returns (uint256 bidId) {
        return _bids[_bids.length-1].id;
    }

    function _isValid(Bid memory bid) internal pure returns (bool) {
        return bid.bidder != address(0);
    }
}
