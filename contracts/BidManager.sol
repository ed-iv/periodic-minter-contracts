// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;
import "hardhat/console.sol";

error CannotCancelHighBid();
error Unauthorized();

contract BidManager {
    uint256 private _minBidIncrease = 500;
    uint256 private _minBid = 100000000000000; // 0.0001 eth

    mapping(bytes32 => uint256) internal _bids;
    bytes32[] internal _bidStack;

    constructor() {
        // add a empty bid to start with 1 index
        _bidStack.push(0x0);
    }

    function getHighestBidAmount() public view returns (uint256){
        bytes32 bidId = _bidStack[_bidStack.length-1];
        return _bids[bidId];
    }

    /**
    * @dev Because of how invalid bids are popped off, a couple invariants should hold at all times:
    *     (a) The highest bid in the stack will be valid
    *     (b) if there are no valid bids, there are also be no invalid bids.
    * Frob (b) we know that if the bid stack size > 1 (has more than just the dummy bid) there MUST be
    * a valid bid in the stack.
    */
    function hasValidBids() public view returns(bool) {
        return _bidStack.length > 1;
    }

    // internals
    function _getMinBid() internal view returns(uint256 minBid){
        uint256 highestBidAmount = getHighestBidAmount();
        minBid = highestBidAmount + highestBidAmount * _minBidIncrease / 10000;
    }

    function _createBid(bytes32 bidId, uint256 amount) internal {
        uint256 minBid = _getMinBid();
        require(amount >= _minBid, "BidStack: Bid should be higher than minimum");
        require(amount >= minBid, "BidStack: Bid should be 5% higher");
        _bids[bidId] += amount;
        _bidStack.push(bidId);
    }

    /// @notice Pop bidIds off of the top of the stack until we either reach one that is valid
    /// or no bids are left (except for dummy bid).
    function _popBidStack() internal {
        while (_bidStack.length > 1 && !_isValidBid(_bidStack[_bidStack.length-1])) {
            _bidStack.pop();
        }
    }

    /// @notice Hash the provided params to computer the bidId.
    function _getBidId(
        address bidder,
        string calldata url,
        string calldata tokenUri
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(bidder, url, tokenUri ));
    }

    function _getHighestBidId() internal view returns (bytes32 bidId) {
        return _bidStack[_bidStack.length-1];
    }

    /// @notice Test if a given bidId represents a valid bid.
    function _isValidBid(bytes32 bidId) internal view returns (bool) {
        return _bids[bidId] > 0;
    }
}
