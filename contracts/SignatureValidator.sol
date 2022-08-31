// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

contract SignatureValidator is EIP712 {
  using Address for address;

  bytes32 private constant PERMIT_SIGNATURE = keccak256("createBid(string url,string tokenUri)");
  constructor(string memory name) EIP712(name, "1.0.0") {}

  function _verifySignature(string calldata url, string calldata tokenUri, address signer, bytes calldata signature) internal view {
    bool isVerified = _verify(signer, _hash(url, tokenUri), signature);
    require(isVerified, "SignatureValidator: Invalid signature");
  }

  function _hash(string calldata url, string calldata tokenUri) private view returns (bytes32) {
    return _hashTypedDataV4(keccak256(abi.encode(PERMIT_SIGNATURE, keccak256(bytes(url)), keccak256(bytes(tokenUri)))));
  }

  function _verify(address signer, bytes32 digest, bytes calldata signature) private view returns (bool) {
    return SignatureChecker.isValidSignatureNow(signer, digest, signature);
  }
}
