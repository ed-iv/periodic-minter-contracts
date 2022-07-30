import { expect } from "chai";
import { ethers, web3 } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Network } from "@ethersproject/networks";
import { time } from "@openzeppelin/test-helpers";

import { AbstractNFT, ERC721Test } from "../../typechain-types";
import {
  amount,
  baseTokenURI,
  DEFAULT_ADMIN_ROLE,
  MINTER_ROLE,
  nonce,
  tokenId,
  tokenName,
  tokenSymbol,
} from "../constants";

describe("AbstractNFT", function () {
  let abstractInstance: AbstractNFT;
  let erc721Instance: ERC721Test;
  let owner: SignerWithAddress;
  let receiver: SignerWithAddress;
  let stranger: SignerWithAddress;
  let network: Network;

  const generateSignature = (account: SignerWithAddress, multiplier: number, customNonce = nonce) => {
    return owner._signTypedData(
      // Domain
      {
        name: tokenName,
        version: "1.0.0",
        chainId: network.chainId,
        verifyingContract: abstractInstance.address,
      },
      // Types
      {
        EIP712: [
          { name: "nonce", type: "bytes32" },
          { name: "account", type: "address" },
          { name: "url", type: "string" },
          { name: "price", type: "uint256" },
        ],
      },
      // Value
      {
        nonce: customNonce,
        account: account.address,
        url: baseTokenURI,
        price: amount * multiplier,
      },
    );
  };

  beforeEach(async function () {
    [owner, receiver, stranger] = await ethers.getSigners();

    const erc721Factory = await ethers.getContractFactory("ERC721Test");
    erc721Instance = await erc721Factory.deploy(tokenName, tokenSymbol);

    const abstractFactory = await ethers.getContractFactory("AbstractNFT");
    abstractInstance = await abstractFactory.deploy(tokenName);

    await abstractInstance.setFactory(erc721Instance.address);
    await erc721Instance.grantRole(MINTER_ROLE, abstractInstance.address);

    network = await ethers.provider.getNetwork();
  });

  describe("hasRole", function () {
    it("DEFAULT_ADMIN_ROLE", async function () {
      const isAdmin = await abstractInstance.hasRole(DEFAULT_ADMIN_ROLE, owner.address);
      expect(isAdmin).to.equal(true);
    });
  });

  describe("bid (new)", function () {
    it("should make first bid", async function () {
      const signature = await generateSignature(receiver, 2);

      const tx1 = abstractInstance
        .connect(receiver)
        .addBid(nonce, baseTokenURI, owner.address, signature, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(1, receiver.address, amount * 2);

      const highest = await abstractInstance.getHighestBid();
      expect(highest.bidder).to.equal(receiver.address);
      expect(highest.amount).to.equal(amount * 2);

      const queueSize = await abstractInstance.getQueueSize();
      expect(queueSize).to.equal(1);
    });

    it("should make second bid", async function () {
      const nonce1 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const nonce2 = ethers.utils.hexlify(ethers.utils.randomBytes(32));

      const signature1 = await generateSignature(receiver, 2, nonce1);

      const tx1 = abstractInstance
        .connect(receiver)
        .addBid(nonce1, baseTokenURI, owner.address, signature1, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(1, receiver.address, amount * 2);

      const signature2 = await generateSignature(stranger, 3, nonce2);

      const tx2 = abstractInstance
        .connect(stranger)
        .addBid(nonce2, baseTokenURI, owner.address, signature2, { value: amount * 3 });

      await expect(tx2)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(2, stranger.address, amount * 3);

      const highest = await abstractInstance.getHighestBid();
      expect(highest.bidder).to.equal(stranger.address);
      expect(highest.amount).to.equal(amount * 3);

      const queueSize = await abstractInstance.getQueueSize();
      expect(queueSize).to.equal(2);
    });

    it("should fail: Bid amount lower then highest (equal)", async function () {
      const nonce1 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const nonce2 = ethers.utils.hexlify(ethers.utils.randomBytes(32));

      const signature1 = await generateSignature(receiver, 2, nonce1);

      const tx1 = abstractInstance
        .connect(receiver)
        .addBid(nonce1, baseTokenURI, owner.address, signature1, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(1, receiver.address, amount * 2);

      const signature2 = await generateSignature(stranger, 2, nonce2);

      const tx2 = abstractInstance
        .connect(stranger)
        .addBid(nonce2, baseTokenURI, owner.address, signature2, { value: amount * 2 });

      await expect(tx2).to.be.revertedWith(`Bid amount lower then highest`);
    });

    it("should fail: Bid amount lower then highest (less)", async function () {
      const nonce1 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const nonce2 = ethers.utils.hexlify(ethers.utils.randomBytes(32));

      const signature1 = await generateSignature(receiver, 2, nonce1);

      const tx1 = abstractInstance
        .connect(receiver)
        .addBid(nonce1, baseTokenURI, owner.address, signature1, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(1, receiver.address, amount * 2);

      const signature2 = await generateSignature(stranger, 1, nonce2);

      const tx2 = abstractInstance
        .connect(stranger)
        .addBid(nonce2, baseTokenURI, owner.address, signature2, { value: amount });

      await expect(tx2).to.be.revertedWith(`Bid amount lower then highest`);
    });

    it("should fail: Expired signature", async function () {
      const signature = await generateSignature(receiver, 2);

      const tx1 = abstractInstance
        .connect(receiver)
        .addBid(nonce, baseTokenURI, owner.address, signature, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(1, receiver.address, amount * 2);

      const tx2 = abstractInstance
        .connect(stranger)
        .addBid(nonce, baseTokenURI, owner.address, signature, { value: amount * 2 });

      await expect(tx2).to.be.revertedWith(`SignatureValidator: Expired signature`);
    });

    it("should fail: Invalid signature", async function () {
      const signature = await generateSignature(receiver, 2);

      const tx1 = abstractInstance
        .connect(receiver)
        .addBid(nonce, baseTokenURI, owner.address, signature, { value: 0 });

      await expect(tx1).to.be.revertedWith(`SignatureValidator: Invalid signature`);
    });

    it("should fail: Value is too low", async function () {
      const signature = await generateSignature(receiver, 1 / 2);

      const tx1 = abstractInstance
        .connect(receiver)
        .addBid(nonce, baseTokenURI, owner.address, signature, { value: amount / 2 });

      await expect(tx1).to.be.revertedWith(`Bid amount is low`);
    });
  });

  describe("bid (old)", function () {
    it("should update bid", async function () {
      const nonce1 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const nonce2 = ethers.utils.hexlify(ethers.utils.randomBytes(32));

      const signature1 = await generateSignature(receiver, 2, nonce1);

      const tx1 = abstractInstance
        .connect(receiver)
        .addBid(nonce1, baseTokenURI, owner.address, signature1, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(1, receiver.address, amount * 2);

      const signature2 = await generateSignature(receiver, 10, nonce2);

      const tx2 = abstractInstance
        .connect(receiver)
        .addBid(nonce2, baseTokenURI, owner.address, signature2, { value: amount * 10 });

      await expect(tx2)
        .to.emit(abstractInstance, "UpdateBid")
        .withArgs(1, receiver.address, amount * 10);

      const highest = await abstractInstance.getHighestBid();
      expect(highest.bidder).to.equal(receiver.address);
      expect(highest.amount).to.equal(amount * 12);

      const queueSize = await abstractInstance.getQueueSize();
      expect(queueSize).to.equal(1);
    });

    it("should fail: Not enough bid value", async function () {
      const nonce1 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const nonce2 = ethers.utils.hexlify(ethers.utils.randomBytes(32));

      const signature1 = await generateSignature(receiver, 2, nonce1);

      const tx1 = abstractInstance
        .connect(receiver)
        .addBid(nonce1, baseTokenURI, owner.address, signature1, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(1, receiver.address, amount * 2);

      const signature2 = await generateSignature(stranger, 2, nonce2);

      const tx2 = abstractInstance
        .connect(stranger)
        .addBid(nonce2, baseTokenURI, owner.address, signature2, { value: amount * 2 });

      await expect(tx2).to.be.revertedWith(`Not enough bid value`);
    });
  });

  describe("revokeBid", function () {
    it("should revoke", async function () {
      const nonce1 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const nonce2 = ethers.utils.hexlify(ethers.utils.randomBytes(32));

      const signature1 = await generateSignature(receiver, 2, nonce1);

      const tx1 = abstractInstance
        .connect(receiver)
        .addBid(nonce1, baseTokenURI, owner.address, signature1, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(1, receiver.address, amount * 2);

      const signature2 = await generateSignature(stranger, 3, nonce2);

      const tx2 = abstractInstance
        .connect(stranger)
        .addBid(nonce2, baseTokenURI, owner.address, signature2, { value: amount * 3 });

      await expect(tx2)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(2, stranger.address, amount * 3);

      const tx3 = abstractInstance.connect(receiver).revokeBid(1);

      await expect(tx3)
        .to.emit(abstractInstance, "RevokeBid")
        .withArgs(1, receiver.address, amount * 2);

      const highest = await abstractInstance.getHighestBid();
      expect(highest.bidder).to.equal(stranger.address);
      expect(highest.amount).to.equal(amount * 3);

      const queueSize = await abstractInstance.getQueueSize();
      expect(queueSize).to.equal(1);
    });

    it("should revoke last bid after auction finished", async function () {
      const nonce1 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const nonce2 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const nonce3 = ethers.utils.hexlify(ethers.utils.randomBytes(32));

      const signature1 = await generateSignature(receiver, 2, nonce1);

      const tx1 = abstractInstance
        .connect(receiver)
        .addBid(nonce1, baseTokenURI, owner.address, signature1, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(1, receiver.address, amount * 2);

      const signature2 = await generateSignature(stranger, 3, nonce2);

      const tx2 = abstractInstance
        .connect(stranger)
        .addBid(nonce2, baseTokenURI, owner.address, signature2, { value: amount * 3 });

      await expect(tx2)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(2, stranger.address, amount * 3);

      const signature3 = await generateSignature(owner, 4, nonce3);

      const tx3 = abstractInstance
        .connect(owner)
        .addBid(nonce3, baseTokenURI, owner.address, signature3, { value: amount * 4 });

      await expect(tx3)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(3, owner.address, amount * 4);

      const current1 = await time.latest();
      await time.increaseTo(current1.add(web3.utils.toBN(86400)));

      const tx4 = abstractInstance.mint();

      await expect(tx4)
        .to.emit(erc721Instance, "Transfer")
        .withArgs(ethers.constants.AddressZero, owner.address, tokenId);

      const current2 = await time.latest();
      await time.increaseTo(current2.add(web3.utils.toBN(86400)));

      const tx5 = abstractInstance.mint();

      await expect(tx5).to.emit(erc721Instance, "Transfer").withArgs(ethers.constants.AddressZero, stranger.address, 2);

      const queueSize = await abstractInstance.getQueueSize();
      expect(queueSize).to.equal(1);

      const tx6 = abstractInstance.connect(receiver).revokeBid(1);

      await expect(tx6)
        .to.emit(abstractInstance, "RevokeBid")
        .withArgs(1, receiver.address, amount * 2);
    });

    it("should fail: Can't remove highest bid", async function () {
      const nonce1 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const nonce2 = ethers.utils.hexlify(ethers.utils.randomBytes(32));

      const signature1 = await generateSignature(receiver, 2, nonce1);

      const tx1 = abstractInstance
        .connect(receiver)
        .addBid(nonce1, baseTokenURI, owner.address, signature1, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(1, receiver.address, amount * 2);

      const signature2 = await generateSignature(stranger, 3, nonce2);

      const tx2 = abstractInstance
        .connect(stranger)
        .addBid(nonce2, baseTokenURI, owner.address, signature2, { value: amount * 3 });

      await expect(tx2)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(2, stranger.address, amount * 3);

      const tx3 = abstractInstance.connect(stranger).revokeBid(2);

      await expect(tx3).to.be.revertedWith(`Highest bid could not be removed`);
    });

    it("should fail: Not an owner", async function () {
      const nonce1 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const nonce2 = ethers.utils.hexlify(ethers.utils.randomBytes(32));

      const signature1 = await generateSignature(receiver, 2, nonce1);

      const tx1 = abstractInstance
        .connect(receiver)
        .addBid(nonce1, baseTokenURI, owner.address, signature1, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(1, receiver.address, amount * 2);

      const signature2 = await generateSignature(stranger, 3, nonce2);

      const tx2 = abstractInstance
        .connect(stranger)
        .addBid(nonce2, baseTokenURI, owner.address, signature2, { value: amount * 3 });

      await expect(tx2)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(2, stranger.address, amount * 3);

      const tx3 = abstractInstance.connect(stranger).revokeBid(1);

      await expect(tx3).to.be.revertedWith(`Exchange: Not an owner`);
    });
  });

  describe("mint", function () {
    it("should mint after first bid", async function () {
      const signature = await generateSignature(receiver, 2);

      const tx1 = abstractInstance
        .connect(receiver)
        .addBid(nonce, baseTokenURI, owner.address, signature, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(1, receiver.address, amount * 2);

      const current1 = await time.latest();
      await time.increaseTo(current1.add(web3.utils.toBN(86400)));

      const tx2 = abstractInstance.mint();

      await expect(tx2)
        .to.emit(erc721Instance, "Transfer")
        .withArgs(ethers.constants.AddressZero, receiver.address, tokenId);

      const highest = await abstractInstance.getHighestBid();
      expect(highest.bidder).to.equal(ethers.constants.AddressZero);
      expect(highest.amount).to.equal(0);

      const queueSize = await abstractInstance.getQueueSize();
      expect(queueSize).to.equal(0);
    });

    it("should mint after second bid", async function () {
      const nonce1 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const nonce2 = ethers.utils.hexlify(ethers.utils.randomBytes(32));

      const signature1 = await generateSignature(receiver, 2, nonce1);

      const tx1 = abstractInstance
        .connect(receiver)
        .addBid(nonce1, baseTokenURI, owner.address, signature1, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(1, receiver.address, amount * 2);

      const signature2 = await generateSignature(stranger, 3, nonce2);

      const tx2 = abstractInstance
        .connect(stranger)
        .addBid(nonce2, baseTokenURI, owner.address, signature2, { value: amount * 3 });

      await expect(tx2)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(2, stranger.address, amount * 3);

      const current1 = await time.latest();
      await time.increaseTo(current1.add(web3.utils.toBN(86400)));

      const tx3 = abstractInstance.mint();

      await expect(tx3)
        .to.emit(erc721Instance, "Transfer")
        .withArgs(ethers.constants.AddressZero, stranger.address, tokenId);

      const highest = await abstractInstance.getHighestBid();
      expect(highest.bidder).to.equal(receiver.address);
      expect(highest.amount).to.equal(amount * 2);

      const queueSize = await abstractInstance.getQueueSize();
      expect(queueSize).to.equal(1);
    });

    it("should mint twice after second bid", async function () {
      const nonce1 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const nonce2 = ethers.utils.hexlify(ethers.utils.randomBytes(32));

      const signature1 = await generateSignature(receiver, 2, nonce1);

      const tx1 = abstractInstance
        .connect(receiver)
        .addBid(nonce1, baseTokenURI, owner.address, signature1, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(1, receiver.address, amount * 2);

      const signature2 = await generateSignature(stranger, 3, nonce2);

      const tx2 = abstractInstance
        .connect(stranger)
        .addBid(nonce2, baseTokenURI, owner.address, signature2, { value: amount * 3 });

      await expect(tx2)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(2, stranger.address, amount * 3);

      const current1 = await time.latest();
      await time.increaseTo(current1.add(web3.utils.toBN(86400)));

      const tx3 = abstractInstance.mint();

      await expect(tx3)
        .to.emit(erc721Instance, "Transfer")
        .withArgs(ethers.constants.AddressZero, stranger.address, tokenId);

      const current2 = await time.latest();
      await time.increaseTo(current2.add(web3.utils.toBN(86400)));

      const tx4 = abstractInstance.mint();

      await expect(tx4).to.emit(erc721Instance, "Transfer").withArgs(ethers.constants.AddressZero, receiver.address, 2);

      const queueSize = await abstractInstance.getQueueSize();
      expect(queueSize).to.equal(0);
    });

    it("should fail: Not yet callable", async function () {
      const nonce1 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const nonce2 = ethers.utils.hexlify(ethers.utils.randomBytes(32));

      const signature1 = await generateSignature(receiver, 2, nonce1);

      const tx1 = abstractInstance
        .connect(receiver)
        .addBid(nonce1, baseTokenURI, owner.address, signature1, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(1, receiver.address, amount * 2);

      const signature2 = await generateSignature(stranger, 3, nonce2);

      const tx2 = abstractInstance
        .connect(stranger)
        .addBid(nonce2, baseTokenURI, owner.address, signature2, { value: amount * 3 });

      await expect(tx2)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(2, stranger.address, amount * 3);

      const tx3 = abstractInstance.mint();

      await expect(tx3).to.be.revertedWith(`Exchange: Not yet callable`);
    });

    it("should fail: Limit exceeded", async function () {
      const nonce1 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const nonce2 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const nonce3 = ethers.utils.hexlify(ethers.utils.randomBytes(32));

      const signature1 = await generateSignature(receiver, 2, nonce1);

      const tx1 = abstractInstance
        .connect(receiver)
        .addBid(nonce1, baseTokenURI, owner.address, signature1, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(1, receiver.address, amount * 2);

      const signature2 = await generateSignature(stranger, 3, nonce2);

      const tx2 = abstractInstance
        .connect(stranger)
        .addBid(nonce2, baseTokenURI, owner.address, signature2, { value: amount * 3 });

      await expect(tx2)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(2, stranger.address, amount * 3);

      const signature3 = await generateSignature(owner, 4, nonce3);

      const tx3 = abstractInstance
        .connect(owner)
        .addBid(nonce3, baseTokenURI, owner.address, signature3, { value: amount * 4 });

      await expect(tx3)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(3, owner.address, amount * 4);

      const current1 = await time.latest();
      await time.increaseTo(current1.add(web3.utils.toBN(86400)));

      const tx4 = abstractInstance.mint();

      await expect(tx4)
        .to.emit(erc721Instance, "Transfer")
        .withArgs(ethers.constants.AddressZero, owner.address, tokenId);

      const current2 = await time.latest();
      await time.increaseTo(current2.add(web3.utils.toBN(86400)));

      const tx5 = abstractInstance.mint();

      await expect(tx5).to.emit(erc721Instance, "Transfer").withArgs(ethers.constants.AddressZero, stranger.address, 2);

      const current3 = await time.latest();
      await time.increaseTo(current3.add(web3.utils.toBN(86400)));

      const tx6 = abstractInstance.mint();

      await expect(tx6).to.be.revertedWith(`Exchange: Limit exceeded`);
    });
  });

  describe("withdraw", function () {
    it("should fail: account is missing role", async function () {
      const tx = abstractInstance.connect(receiver).withdraw();
      await expect(tx).to.be.revertedWith(
        `AccessControl: account ${receiver.address.toLowerCase()} is missing role ${DEFAULT_ADMIN_ROLE}`,
      );
    });

    it("should withdraw", async function () {
      const signature = await generateSignature(receiver, 1);

      const tx1 = abstractInstance
        .connect(receiver)
        .addBid(nonce, baseTokenURI, owner.address, signature, { value: amount });

      await expect(tx1).to.emit(abstractInstance, "CreateBid").withArgs(1, receiver.address, amount);

      const tx = abstractInstance.withdraw();
      await expect(tx).to.emit(abstractInstance, "Withdrawn").withArgs(owner.address, amount);
      const balance = await abstractInstance.provider.getBalance(abstractInstance.address);
      expect(balance).to.equal(0);
    });
  });
});
