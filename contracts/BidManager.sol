// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;
import "hardhat/console.sol";

error CannotCancelHighBid();
error Unauthorized();

contract BidManager {
    uint256 private _minBidIncrease = 500;
    uint256 private _minBid = 100000000000000; // 0.0001 eth
    BidId internal _highBidId = BidId.wrap(0x0);

    type BidId is bytes32;

    struct Bid {
        BidId next;
        BidId prev;
        uint256 amount;
    }

    mapping(BidId => Bid) internal _bids;

    constructor() {}

    function getHighestBidAmount() public view returns (uint256){
        return _bids[_highBidId].amount;
    }

    /**
    * @dev Because of how invalid bids are popped off, a couple invariants should hold at all times:
    *     (a) The highest bid in the stack will be valid
    *     (b) if there are no valid bids, there are also be no invalid bids.
    * Frob (b) we know that if the bid stack size > 1 (has more than just the dummy bid) there MUST be
    * a valid bid in the stack.
    */
    function hasValidBids() public view returns(bool) {
        return BidId.unwrap(_highBidId) != 0x0;
    }

    // internals
    function _getMinBid() internal view returns(uint256 minBid){
        uint256 highestBidAmount = getHighestBidAmount();
        minBid = highestBidAmount + highestBidAmount * _minBidIncrease / 10000;
    }

    function _createBid(BidId bidId, uint256 amount) internal {
        uint256 minBid = _getMinBid();
        require(amount >= _minBid, "BidStack: Bid should be higher than minimum");
        require(amount >= minBid, "BidStack: Bid should be 5% higher");

        // Position new bid
        Bid memory newBid = _bids[bidId];
        newBid.next = BidId.wrap(0x0);
        newBid.prev = _highBidId;
        newBid.amount += amount;
        _bids[bidId] = newBid;

        // Adjust previous highest bid
        _bids[_highBidId].next = bidId;
        _highBidId = bidId;
    }

    function _removeBid(BidId bidId) internal returns (uint256) {
        Bid memory bid = _bids[bidId];
        delete _bids[bidId];
        _bids[bid.prev].next = bid.next;
        _bids[bid.next].prev = bid.prev;

        if (BidId.unwrap(bidId) == BidId.unwrap(_highBidId)) {
          _highBidId = bid.prev;
        }
        return bid.amount;
    }

    /// @notice Hash the provided params to computer the bidId.
    function _getBidId(
        address bidder,
        string calldata url,
        string calldata tokenUri
    ) internal pure returns (BidId) {
        return BidId.wrap(keccak256(abi.encodePacked(bidder, url, tokenUri )));
    }

    /// @notice Test if a given bidId represents a valid bid.
    function _isValidBid(BidId bidId) internal view returns (bool) {
        return _bids[bidId].amount > 0;
    }
}
