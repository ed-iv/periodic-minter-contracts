// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.9;

import "hardhat/console.sol";

import "./LinkedBidsList.sol";
// import "./SignatureValidator.sol";

contract Abstract is LinkedBidsList {
    
    constructor() {
       
    }

    function bid(uint256 bidID) external payable{
        if(_ifBidExists(bidID)){
            _updateBid(bidID, msg.value);
        } else {
            _addBid(bidID, msg.value,  msg.sender);
        }
    }

    function revokeBid(uint256 bidID) external {
            uint256 amount = _removeBid(bidID);
            (bool sent, ) = msg.sender.call{ value: amount, gas: 20317 }("");
            require(sent, "Exchange: Failed to send Ether");
    }
}
