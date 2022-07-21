// SPDX-License-Identifier: UNLICENSED

// Author: TrejGun
// Email: trejgun+gemunion@gmail.com
// Website: https://gemunion.io/

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

contract SignatureValidator is EIP712 {
  using Address for address;

  mapping(bytes32 => bool) private _expired;

  bytes32 private constant PERMIT_SIGNATURE = keccak256("EIP712(bytes32 nonce,address account,string url,uint256 price)");

  constructor(string memory name) EIP712(name, "1.0.0") {}

  function _verifySignature(
    bytes32 nonce,
    address account,
    string memory url,
    uint256 price,
    address signer,
    bytes calldata signature
  ) internal {
    require(!_expired[nonce], "SignatureValidator: Expired signature");
    _expired[nonce] = true;

    bool isVerified = _verify(signer, _hash(nonce, account, url, price), signature);
    require(isVerified, "SignatureValidator: Invalid signature");
  }

  function _hash(
    bytes32 nonce,
    address account,
    string memory url,
    uint256 price
  ) private view returns (bytes32) {
    return _hashTypedDataV4(keccak256(abi.encode(PERMIT_SIGNATURE, nonce, account, keccak256(bytes(url)), price)));
  }

  function _verify(
    address signer,
    bytes32 digest,
    bytes memory signature
  ) private view returns (bool) {
    return SignatureChecker.isValidSignatureNow(signer, digest, signature);
  }
}
