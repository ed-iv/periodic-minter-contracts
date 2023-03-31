# Abstract Browsing Contract Overview
Abstract Browsing enables users to create "abstracted" renderings of webpages. Users can then place a bid in order to mint the image of their composition as an NFT. Periodically (every 24 hours), the highest bid is minted. All other bids remain in the queue for the next auction. These periodic auctions will continue until the max number of mints allocated has been reached. See below for additional details on each contract.

## `PeriodicMinter.sol`

Contains logic for periodic auctions. This is the main contract that the front-end will interact with to allow users to create, update, and cancel bids. This contract also defines the default auction period (24 hours) and the maximum number of NFTs that can be minted.

Includes `mint` function that can be called at the end of each auction period to mint an NFT from the highest bid. This function is permissionless so it could be called by bidders themselves, but the greater Abstract Browsing project automates this to provide a more fluid bidding & minting cycle. Will revert if the provided input parameters do not identify a valid bid or if the auction is still in progress.

The `_factory` state variable should be set to the address of the ERC721 contract that NFTs should be minted from. The provided ERC721 contract should also implement access controls that grant minting rights to `PeriodicMinter`
___
## `BidManager.sol`
This contract contains implementation details for how bids and the collection of bids within the auction system are represented. The collection of bids is represented as a linked-list of `Bid` structs stored in a the `Bids` mapping indexed by `BidId`.

The `BidId` is computed by taking the `keccak256` hash of the account that created the bid (`bidder`), the url (`url`) of the website that the abstracted artwork was sourced from, and the desired token URI (`tokenUri`) which points to the rendered image, i.e. `keccak256(abi.encodePacked(bidder, url, tokenUri ))`.
___
## `BidVerifier.sol`
Contains logic responsible for verifying that incoming bids can be trusted as originating from our back-end.

Each bid includes a token URI that points to the NFT metadata to be used in the case that the bid wins the auction and is minted. The `image` property in this metadata points to an image that is rendered on our back-end and persisted to IPFS. To prevent URIs pointing to arbitrary metadata from being accepted when a new bid is made, we need to verify that the metadata (and the included image) were generated on our back-end.

To accomplish this, bids are packaged up and cryptographically signed using EIP712 on our back-end using a trusted private-key.
