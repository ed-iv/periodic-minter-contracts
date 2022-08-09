/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable no-console */
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
        ADDBID: [
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
  const generateSignatureUpdateRevoke = (bidId: number, customNonce = nonce) => {
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
        UPDATEREVOKE: [
          { name: "nonce", type: "bytes32" },
          { name: "bidId", type: "uint256" },
        ],
      },
      // Value
      {
        nonce: customNonce,
        bidId,
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

  describe("bid (create)", function () {
    it("should make first bid", async function () {
      const nonce1 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const signature = await generateSignature(receiver, 2, nonce1);

      const tx1 = abstractInstance.connect(receiver).addBid(nonce1, baseTokenURI, signature, { value: amount * 2 });

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

      const tx1 = abstractInstance.connect(receiver).addBid(nonce1, baseTokenURI, signature1, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(1, receiver.address, amount * 2);

      const signature2 = await generateSignature(stranger, 3, nonce2);

      const tx2 = abstractInstance.connect(stranger).addBid(nonce2, baseTokenURI, signature2, { value: amount * 3 });

      await expect(tx2)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(2, stranger.address, amount * 3);

      const highest = await abstractInstance.getHighestBid();
      expect(highest.bidder).to.equal(stranger.address);
      expect(highest.amount).to.equal(amount * 3);

      const queueSize = await abstractInstance.getQueueSize();
      expect(queueSize).to.equal(2);

      const bidList = await abstractInstance.connect(receiver).getBidList();
      expect(bidList.map(n => n.toNumber())).to.deep.equal([1]);

      const bidList2 = await abstractInstance.connect(stranger).getBidList();
      expect(bidList2.map(n => n.toNumber())).to.deep.equal([2]);
    });

    it("should fail: Bid amount lower then highest (equal)", async function () {
      const nonce1 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const nonce2 = ethers.utils.hexlify(ethers.utils.randomBytes(32));

      const signature1 = await generateSignature(receiver, 2, nonce1);

      const tx1 = abstractInstance.connect(receiver).addBid(nonce1, baseTokenURI, signature1, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(1, receiver.address, amount * 2);

      const signature2 = await generateSignature(stranger, 2, nonce2);

      const tx2 = abstractInstance.connect(stranger).addBid(nonce2, baseTokenURI, signature2, { value: amount * 2 });

      await expect(tx2).to.be.revertedWith(`BidQueue: Bid should be 5% higher`);
    });

    it("should fail: Bid amount lower then highest (less)", async function () {
      const nonce1 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const nonce2 = ethers.utils.hexlify(ethers.utils.randomBytes(32));

      const signature1 = await generateSignature(receiver, 2, nonce1);

      const tx1 = abstractInstance.connect(receiver).addBid(nonce1, baseTokenURI, signature1, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(1, receiver.address, amount * 2);

      const signature2 = await generateSignature(stranger, 1, nonce2);

      const tx2 = abstractInstance.connect(stranger).addBid(nonce2, baseTokenURI, signature2, { value: amount });

      await expect(tx2).to.be.revertedWith(`BidQueue: Bid should be 5% higher`);
    });

    it("should fail: Expired signature", async function () {
      const signature = await generateSignature(receiver, 2);

      const tx1 = abstractInstance.connect(receiver).addBid(nonce, baseTokenURI, signature, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(1, receiver.address, amount * 2);

      const tx2 = abstractInstance.connect(stranger).addBid(nonce, baseTokenURI, signature, { value: amount * 2 });

      await expect(tx2).to.be.revertedWith(`SignatureValidator: Expired signature`);
    });

    it("should fail: Invalid signature", async function () {
      const signature = await generateSignature(receiver, 2);

      const tx1 = abstractInstance.connect(receiver).addBid(nonce, baseTokenURI, signature, { value: 0 });

      await expect(tx1).to.be.revertedWith(`SignatureValidator: Invalid signature`);
    });

    it("should fail: Value is too low", async function () {
      const signature = await generateSignature(receiver, 1 / 2);

      const tx1 = abstractInstance.connect(receiver).addBid(nonce, baseTokenURI, signature, { value: amount / 2 });

      await expect(tx1).to.be.revertedWith(`BidQueue: Bid should be higher than minimum`);
    });
  });

  describe("bid (update)", function () {
    it("should update bid", async function () {
      const nonce1 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const nonce2 = ethers.utils.hexlify(ethers.utils.randomBytes(32));

      const signature1 = await generateSignature(receiver, 2, nonce1);
      const tx1 = abstractInstance.connect(receiver).addBid(nonce1, baseTokenURI, signature1, { value: amount * 2 });

      const bidId = 1;
      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(bidId, receiver.address, amount * 2);

      const signature2 = await generateSignatureUpdateRevoke(bidId, nonce2);

      const tx2 = abstractInstance.connect(receiver).updateBid(nonce2, bidId, signature2, { value: amount * 10 });
      await expect(tx2)
        .to.emit(abstractInstance, "UpdateBid")
        .withArgs(bidId, await receiver.getAddress(), amount * 12, amount * 10);

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

      const tx1 = abstractInstance.connect(receiver).addBid(nonce1, baseTokenURI, signature1, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(1, receiver.address, amount * 2);

      const signature2 = await generateSignature(stranger, 2, nonce2);

      const tx2 = abstractInstance.connect(stranger).addBid(nonce2, baseTokenURI, signature2, { value: amount * 2 });

      await expect(tx2).to.be.revertedWith(`BidQueue: Bid should be 5% higher`);
    });
  });

  describe("revokeBid", function () {
    it("should revoke", async function () {
      const nonce1 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const nonce2 = ethers.utils.hexlify(ethers.utils.randomBytes(32));

      const signature1 = await generateSignature(receiver, 2, nonce1);

      const tx1 = abstractInstance.connect(receiver).addBid(nonce1, baseTokenURI, signature1, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(1, receiver.address, amount * 2);

      const signature2 = await generateSignature(stranger, 3, nonce2);

      const tx2 = abstractInstance.connect(stranger).addBid(nonce2, baseTokenURI, signature2, { value: amount * 3 });

      await expect(tx2)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(2, stranger.address, amount * 3);
      const bidList1 = await abstractInstance.connect(receiver).getBidList();
      expect(bidList1.map(n => n.toNumber())).to.deep.equal([1]);

      const nonce3 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const signature3 = await generateSignatureUpdateRevoke(1, nonce3);
      const tx3 = abstractInstance.connect(receiver).revokeBid(nonce3, 1, signature3);

      await expect(tx3)
        .to.emit(abstractInstance, "RevokeBid")
        .withArgs(1, receiver.address, amount * 2);

      const highest = await abstractInstance.getHighestBid();
      expect(highest.bidder).to.equal(stranger.address);
      expect(highest.amount).to.equal(amount * 3);

      const queueSize = await abstractInstance.getQueueSize();
      expect(queueSize).to.equal(1);

      const bidList2 = await abstractInstance.connect(receiver).getBidList();
      expect(bidList2.map(n => n.toNumber())).to.deep.equal([]);
    });

    // it("should revoke last bid after auction finished", async function () {
    //   const nonce1 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
    //   const nonce2 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
    //   const nonce3 = ethers.utils.hexlify(ethers.utils.randomBytes(32));

    //   const signature1 = await generateSignature(receiver, 2, nonce1);

    //   const tx1 = abstractInstance.connect(receiver).addBid(nonce1, baseTokenURI, signature1, { value: amount * 2 });

    //   await expect(tx1)
    //     .to.emit(abstractInstance, "CreateBid")
    //     .withArgs(1, receiver.address, amount * 2);

    //   const signature2 = await generateSignature(stranger, 3, nonce2);

    //   const tx2 = abstractInstance.connect(stranger).addBid(nonce2, baseTokenURI, signature2, { value: amount * 3 });

    //   await expect(tx2)
    //     .to.emit(abstractInstance, "CreateBid")
    //     .withArgs(2, stranger.address, amount * 3);

    //   const signature3 = await generateSignature(owner, 4, nonce3);

    //   const tx3 = abstractInstance.connect(owner).addBid(nonce3, baseTokenURI, signature3, { value: amount * 4 });
    //   console.log("_3");
    //   await expect(tx3)
    //     .to.emit(abstractInstance, "CreateBid")
    //     .withArgs(3, owner.address, amount * 4);

    //   const current1 = await time.latest();
    //   await time.increaseTo(current1.add(web3.utils.toBN(86400)));

    //   const tx4 = abstractInstance.mint();
    //   console.log("_4");
    //   await expect(tx4)
    //     .to.emit(erc721Instance, "Transfer")
    //     .withArgs(ethers.constants.AddressZero, owner.address, tokenId);

    //   const current2 = await time.latest();
    //   await time.increaseTo(current2.add(web3.utils.toBN(86400)));

    //   const tx5 = abstractInstance.mint();
    //   console.log("_5");
    //   await expect(tx5).to.emit(erc721Instance, "Transfer").withArgs(ethers.constants.AddressZero, stranger.address, 2);

    //   const queueSize = await abstractInstance.getQueueSize();
    //   expect(queueSize).to.equal(1);

    //   const tx6 = abstractInstance.connect(receiver).revokeBid(1);
    //   console.log("_6");
    //   await expect(tx6)
    //     .to.emit(abstractInstance, "RevokeBid")
    //     .withArgs(1, receiver.address, amount * 2);
    // });

    it("should fail: Can't remove highest bid", async function () {
      const nonce1 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const nonce2 = ethers.utils.hexlify(ethers.utils.randomBytes(32));

      const signature1 = await generateSignature(receiver, 2, nonce1);

      const tx1 = abstractInstance.connect(receiver).addBid(nonce1, baseTokenURI, signature1, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(1, receiver.address, amount * 2);

      const signature2 = await generateSignature(stranger, 3, nonce2);

      const tx2 = abstractInstance.connect(stranger).addBid(nonce2, baseTokenURI, signature2, { value: amount * 3 });

      await expect(tx2)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(2, stranger.address, amount * 3);

      const nonce3 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const signature3 = await generateSignatureUpdateRevoke(2, nonce3);
      const tx3 = abstractInstance.connect(stranger).revokeBid(nonce3, 2, signature3);

      await expect(tx3).to.be.revertedWith(`BidQueue: Highest bid could not be revoked`);
    });

    it("should fail: Not an owner", async function () {
      const nonce1 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const nonce2 = ethers.utils.hexlify(ethers.utils.randomBytes(32));

      const signature1 = await generateSignature(receiver, 2, nonce1);

      const tx1 = abstractInstance.connect(receiver).addBid(nonce1, baseTokenURI, signature1, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(1, receiver.address, amount * 2);

      const signature2 = await generateSignature(stranger, 3, nonce2);

      const tx2 = abstractInstance.connect(stranger).addBid(nonce2, baseTokenURI, signature2, { value: amount * 3 });

      await expect(tx2)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(2, stranger.address, amount * 3);

      const nonce3 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const signature3 = await generateSignatureUpdateRevoke(1, nonce3);
      const tx3 = abstractInstance.connect(stranger).revokeBid(nonce3, 1, signature3);

      await expect(tx3).to.be.revertedWith(`Exchange: Not an owner`);
    });
  });

  describe("mint", function () {
    it("should mint after first bid", async function () {
      const signature = await generateSignature(receiver, 2);

      const tx1 = abstractInstance.connect(receiver).addBid(nonce, baseTokenURI, signature, { value: amount * 2 });

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

      const tx1 = abstractInstance.connect(receiver).addBid(nonce1, baseTokenURI, signature1, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(1, receiver.address, amount * 2);

      const signature2 = await generateSignature(stranger, 3, nonce2);

      const tx2 = abstractInstance.connect(stranger).addBid(nonce2, baseTokenURI, signature2, { value: amount * 3 });

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

      const tx1 = abstractInstance.connect(receiver).addBid(nonce1, baseTokenURI, signature1, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(1, receiver.address, amount * 2);

      const signature2 = await generateSignature(stranger, 3, nonce2);

      const tx2 = abstractInstance.connect(stranger).addBid(nonce2, baseTokenURI, signature2, { value: amount * 3 });

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

      const tx1 = abstractInstance.connect(receiver).addBid(nonce1, baseTokenURI, signature1, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(1, receiver.address, amount * 2);

      const signature2 = await generateSignature(stranger, 3, nonce2);

      const tx2 = abstractInstance.connect(stranger).addBid(nonce2, baseTokenURI, signature2, { value: amount * 3 });

      await expect(tx2)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(2, stranger.address, amount * 3);

      const tx3 = abstractInstance.mint();

      await expect(tx3).to.be.revertedWith(`Not yet callable`);
    });

    it("should fail: Limit exceeded", async function () {
      const nonce1 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const nonce2 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const nonce3 = ethers.utils.hexlify(ethers.utils.randomBytes(32));

      const signature1 = await generateSignature(receiver, 2, nonce1);

      const tx1 = abstractInstance.connect(receiver).addBid(nonce1, baseTokenURI, signature1, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(1, receiver.address, amount * 2);

      const signature2 = await generateSignature(stranger, 3, nonce2);

      const tx2 = abstractInstance.connect(stranger).addBid(nonce2, baseTokenURI, signature2, { value: amount * 3 });

      await expect(tx2)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(2, stranger.address, amount * 3);

      const signature3 = await generateSignature(owner, 4, nonce3);

      const tx3 = abstractInstance.connect(owner).addBid(nonce3, baseTokenURI, signature3, { value: amount * 4 });

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

      const tx1 = abstractInstance.connect(receiver).addBid(nonce, baseTokenURI, signature, { value: amount });

      await expect(tx1).to.emit(abstractInstance, "CreateBid").withArgs(1, receiver.address, amount);

      const tx = abstractInstance.withdraw();
      await expect(tx).to.emit(abstractInstance, "Withdrawn").withArgs(owner.address, amount);
      const balance = await abstractInstance.provider.getBalance(abstractInstance.address);
      expect(balance).to.equal(0);
    });
  });
});
