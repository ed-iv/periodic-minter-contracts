/* eslint-disable @typescript-eslint/no-unused-vars */
import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Network } from "@ethersproject/networks";

import { amount, baseTokenURI, DEFAULT_ADMIN_ROLE, MINTER_ROLE, tokenId, tokenName, tokenSymbol } from "../constants";

describe("PeriodicMinter", function () {
  async function deployAbstractBrowsingFixture() {
    const [owner, receiver, stranger] = await ethers.getSigners();

    const erc721Factory = await ethers.getContractFactory("ERC721Test");
    const erc721Instance = await erc721Factory.deploy(tokenName, tokenSymbol);

    const abstractFactory = await ethers.getContractFactory("PeriodicMinter");
    const abstractInstance = await abstractFactory.deploy(tokenName);

    await abstractInstance.setFactory(erc721Instance.address);
    await erc721Instance.grantRole(MINTER_ROLE, abstractInstance.address);

    const network = await ethers.provider.getNetwork();

    return { owner, receiver, stranger, erc721Instance, abstractInstance, network };
  }

  const getBidId = (address: string, url: string, tokenUri: string): string => {
    return ethers.utils.solidityKeccak256(["address", "string", "string"], [address, url, tokenUri]);
  };
  const generateSignature = (network: Network, verifierAddress: string, owner: SignerWithAddress) => {
    return owner._signTypedData(
      // Domain
      {
        name: tokenName,
        version: "1.0.0",
        verifyingContract: verifierAddress,
        chainId: network.chainId,
      },
      // Types
      {
        createBid: [
          { name: "url", type: "string" },
          { name: "tokenUri", type: "string" },
        ],
      },
      // Value
      {
        url: baseTokenURI,
        tokenUri: baseTokenURI,
      },
    );
  };

  describe("hasRole", function () {
    it("DEFAULT_ADMIN_ROLE", async function () {
      const { abstractInstance, owner } = await loadFixture(deployAbstractBrowsingFixture);
      const isAdmin = await abstractInstance.hasRole(DEFAULT_ADMIN_ROLE, owner.address);
      expect(isAdmin).to.equal(true);
    });
  });

  describe("bid (create)", function () {
    it("foo should make first bid", async function () {
      const { abstractInstance, owner, receiver, network } = await loadFixture(deployAbstractBrowsingFixture);
      const signature = await generateSignature(network, abstractInstance.address, owner);
      const bidId = getBidId(receiver.address, baseTokenURI, baseTokenURI);
      const tx1 = abstractInstance
        .connect(receiver)
        .createBid(baseTokenURI, baseTokenURI, signature, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(bidId, receiver.address, amount * 2, baseTokenURI);

      const highest = await abstractInstance.getHighestBidAmount();
      expect(highest).to.equal(amount * 2);
    });

    it("should make second bid", async function () {
      const { abstractInstance, owner, receiver, stranger, network } = await loadFixture(deployAbstractBrowsingFixture);
      const signature1 = await generateSignature(network, abstractInstance.address, owner);

      const bidId1 = getBidId(receiver.address, baseTokenURI, baseTokenURI);
      const tx1 = abstractInstance
        .connect(receiver)
        .createBid(baseTokenURI, baseTokenURI, signature1, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(bidId1, receiver.address, amount * 2, baseTokenURI);

      const signature2 = await generateSignature(network, abstractInstance.address, owner);

      const bidId2 = getBidId(stranger.address, baseTokenURI, baseTokenURI);
      const tx2 = abstractInstance
        .connect(stranger)
        .createBid(baseTokenURI, baseTokenURI, signature2, { value: amount * 3 });

      await expect(tx2)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(bidId2, stranger.address, amount * 3, baseTokenURI);

      const highest = await abstractInstance.getHighestBidAmount();
      expect(highest).to.equal(amount * 3);
    });

    it("should fail: Bid amount lower then highest (equal)", async function () {
      const { abstractInstance, owner, receiver, stranger, network } = await loadFixture(deployAbstractBrowsingFixture);
      const signature1 = await generateSignature(network, abstractInstance.address, owner);

      const bidId = getBidId(receiver.address, baseTokenURI, baseTokenURI);
      const tx1 = abstractInstance
        .connect(receiver)
        .createBid(baseTokenURI, baseTokenURI, signature1, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(bidId, receiver.address, amount * 2, baseTokenURI);

      const signature2 = await generateSignature(network, abstractInstance.address, owner);
      const tx2 = abstractInstance
        .connect(stranger)
        .createBid(baseTokenURI, baseTokenURI, signature2, { value: amount * 2 });

      await expect(tx2).to.be.revertedWith(`BidStack: Bid should be 5% higher`);
    });

    it("should fail: Bid amount lower then highest (less)", async function () {
      const { abstractInstance, owner, receiver, stranger, network } = await loadFixture(deployAbstractBrowsingFixture);
      const signature1 = await generateSignature(network, abstractInstance.address, owner);

      const bidId = getBidId(receiver.address, baseTokenURI, baseTokenURI);
      const tx1 = abstractInstance
        .connect(receiver)
        .createBid(baseTokenURI, baseTokenURI, signature1, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(bidId, receiver.address, amount * 2, baseTokenURI);

      const signature2 = await generateSignature(network, abstractInstance.address, owner);

      const tx2 = abstractInstance
        .connect(stranger)
        .createBid(baseTokenURI, baseTokenURI, signature2, { value: amount });

      await expect(tx2).to.be.revertedWith(`BidStack: Bid should be 5% higher`);
    });

    it("should fail: Invalid signature", async function () {
      const { abstractInstance, owner, receiver, network } = await loadFixture(deployAbstractBrowsingFixture);
      const signature = await generateSignature(network, abstractInstance.address, owner);

      const tx1 = abstractInstance.connect(receiver).createBid(baseTokenURI, "meh", signature, { value: 0 });

      await expect(tx1).to.be.revertedWith(`SignatureValidator: Invalid signature`);
    });

    it("should fail: Value is too low", async function () {
      const { abstractInstance, owner, receiver, network } = await loadFixture(deployAbstractBrowsingFixture);
      const signature = await generateSignature(network, abstractInstance.address, owner);

      const tx1 = abstractInstance
        .connect(receiver)
        .createBid(baseTokenURI, baseTokenURI, signature, { value: amount / 2 });

      await expect(tx1).to.be.revertedWith(`BidStack: Bid should be higher than minimum`);
    });
  });

  describe("bid (update)", function () {
    it("should update bid", async function () {
      const { abstractInstance, owner, receiver, network } = await loadFixture(deployAbstractBrowsingFixture);
      const signature = await generateSignature(network, abstractInstance.address, owner);

      const bidId = getBidId(receiver.address, baseTokenURI, baseTokenURI);
      const tx1 = abstractInstance
        .connect(receiver)
        .createBid(baseTokenURI, baseTokenURI, signature, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(bidId, receiver.address, amount * 2, baseTokenURI);

      const tx2 = abstractInstance.connect(receiver).updateBid(baseTokenURI, baseTokenURI, { value: amount * 10 });
      await expect(tx2)
        .to.emit(abstractInstance, "UpdateBid")
        .withArgs(bidId, await receiver.getAddress(), amount * 12, amount * 10);

      const highest = await abstractInstance.getHighestBidAmount();
      expect(highest).to.equal(amount * 12);
    });

    it("should fail: Not enough bid value", async function () {
      const { abstractInstance, owner, receiver, stranger, network } = await loadFixture(deployAbstractBrowsingFixture);
      const signature = await generateSignature(network, abstractInstance.address, owner);

      const bidId = getBidId(receiver.address, baseTokenURI, baseTokenURI);
      const tx1 = abstractInstance
        .connect(receiver)
        .createBid(baseTokenURI, baseTokenURI, signature, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(bidId, receiver.address, amount * 2, baseTokenURI);

      const signature2 = await generateSignature(network, abstractInstance.address, owner);

      const tx2 = abstractInstance
        .connect(stranger)
        .createBid(baseTokenURI, baseTokenURI, signature2, { value: amount * 2 });

      await expect(tx2).to.be.revertedWith(`BidStack: Bid should be 5% higher`);
    });
  });

  describe("cancelBid", function () {
    it("should revoke", async function () {
      const { abstractInstance, owner, receiver, stranger, network } = await loadFixture(deployAbstractBrowsingFixture);

      const signature1 = await generateSignature(network, abstractInstance.address, owner);
      const bidId1 = getBidId(receiver.address, baseTokenURI, baseTokenURI);
      const tx1 = abstractInstance
        .connect(receiver)
        .createBid(baseTokenURI, baseTokenURI, signature1, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(bidId1, receiver.address, amount * 2, baseTokenURI);

      const signature2 = await generateSignature(network, abstractInstance.address, owner);
      const bidId2 = getBidId(stranger.address, baseTokenURI, baseTokenURI);
      const tx2 = abstractInstance
        .connect(stranger)
        .createBid(baseTokenURI, baseTokenURI, signature2, { value: amount * 3 });

      await expect(tx2)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(bidId2, stranger.address, amount * 3, baseTokenURI);

      // TODO - Test that funds are returned correctly
      const tx3 = abstractInstance.connect(receiver).cancelBid(baseTokenURI, baseTokenURI);
      await expect(tx3)
        .to.emit(abstractInstance, "CancelBid")
        .withArgs(bidId1, receiver.address, amount * 2);

      const highest = await abstractInstance.getHighestBidAmount();
      expect(highest).to.equal(amount * 3);
    });

    it("should fail: Can't remove highest bid", async function () {
      const { abstractInstance, owner, receiver, stranger, network } = await loadFixture(deployAbstractBrowsingFixture);

      const signature1 = await generateSignature(network, abstractInstance.address, owner);
      const bidId1 = getBidId(receiver.address, baseTokenURI, baseTokenURI);
      const tx1 = abstractInstance
        .connect(receiver)
        .createBid(baseTokenURI, baseTokenURI, signature1, { value: amount * 2 });
      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(bidId1, receiver.address, amount * 2, baseTokenURI);

      const signature2 = await generateSignature(network, abstractInstance.address, owner);
      const bidId2 = getBidId(stranger.address, baseTokenURI, baseTokenURI);
      const tx2 = abstractInstance
        .connect(stranger)
        .createBid(baseTokenURI, baseTokenURI, signature2, { value: amount * 3 });
      await expect(tx2)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(bidId2, stranger.address, amount * 3, baseTokenURI);

      const tx3 = abstractInstance.connect(stranger).cancelBid(baseTokenURI, baseTokenURI);
      await expect(tx3).to.be.revertedWithCustomError(abstractInstance, "CannotCancelHighBid");
    });

    it("should fail: Not an owner", async function () {
      const { abstractInstance, owner, receiver, stranger, network } = await loadFixture(deployAbstractBrowsingFixture);

      const signature1 = await generateSignature(network, abstractInstance.address, owner);
      const bidId1 = getBidId(receiver.address, baseTokenURI, baseTokenURI);
      const tx1 = abstractInstance
        .connect(receiver)
        .createBid(baseTokenURI, baseTokenURI, signature1, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(bidId1, receiver.address, amount * 2, baseTokenURI);

      const signature2 = await generateSignature(network, abstractInstance.address, owner);
      const bidId2 = getBidId(stranger.address, baseTokenURI, baseTokenURI);
      const tx2 = abstractInstance
        .connect(stranger)
        .createBid(baseTokenURI, baseTokenURI, signature2, { value: amount * 3 });

      await expect(tx2)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(bidId2, stranger.address, amount * 3, baseTokenURI);

      const tx3 = abstractInstance.connect(stranger).cancelBid(baseTokenURI, "bogus");
      await expect(tx3).to.be.revertedWithCustomError(abstractInstance, "InvalidBidId");
    });

    // TODO - Need to update tests to use different urls & tokenUris
  });

  describe("mint", function () {
    it("should mint after first bid", async function () {
      const { abstractInstance, owner, receiver, erc721Instance, network } = await loadFixture(
        deployAbstractBrowsingFixture,
      );

      const signature = await generateSignature(network, abstractInstance.address, owner);
      const bidId1 = getBidId(receiver.address, baseTokenURI, baseTokenURI);
      const tx1 = abstractInstance
        .connect(receiver)
        .createBid(baseTokenURI, baseTokenURI, signature, { value: amount * 2 });
      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(bidId1, receiver.address, amount * 2, baseTokenURI);

      await time.increase(86400);

      const tx2 = abstractInstance.mint(receiver.address, baseTokenURI, baseTokenURI);
      await expect(tx2)
        .to.emit(erc721Instance, "Transfer")
        .withArgs(ethers.constants.AddressZero, receiver.address, tokenId);
      const highest = await abstractInstance.getHighestBidAmount();
      expect(highest).to.equal(0);
    });

    it("should mint after second bid", async function () {
      const { abstractInstance, erc721Instance, owner, receiver, stranger, network } = await loadFixture(
        deployAbstractBrowsingFixture,
      );

      const signature1 = await generateSignature(network, abstractInstance.address, owner);
      const bidId1 = getBidId(receiver.address, baseTokenURI, baseTokenURI);
      const tx1 = abstractInstance
        .connect(receiver)
        .createBid(baseTokenURI, baseTokenURI, signature1, { value: amount * 2 });
      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(bidId1, receiver.address, amount * 2, baseTokenURI);

      const signature2 = await generateSignature(network, abstractInstance.address, owner);
      const bidId2 = getBidId(stranger.address, baseTokenURI, baseTokenURI);
      const tx2 = abstractInstance
        .connect(stranger)
        .createBid(baseTokenURI, baseTokenURI, signature2, { value: amount * 3 });
      await expect(tx2)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(bidId2, stranger.address, amount * 3, baseTokenURI);

      await time.increase(86400);

      const tx3 = abstractInstance.mint(stranger.address, baseTokenURI, baseTokenURI);
      await expect(tx3)
        .to.emit(erc721Instance, "Transfer")
        .withArgs(ethers.constants.AddressZero, stranger.address, tokenId);

      const highest = await abstractInstance.getHighestBidAmount();
      expect(highest).to.equal(amount * 2);
    });

    it("should mint twice after second bid", async function () {
      const { abstractInstance, erc721Instance, owner, receiver, stranger, network } = await loadFixture(
        deployAbstractBrowsingFixture,
      );

      const signature1 = await generateSignature(network, abstractInstance.address, owner);
      const bidId1 = getBidId(receiver.address, baseTokenURI, baseTokenURI);
      const tx1 = abstractInstance
        .connect(receiver)
        .createBid(baseTokenURI, baseTokenURI, signature1, { value: amount * 2 });
      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(bidId1, receiver.address, amount * 2, baseTokenURI);

      const signature2 = await generateSignature(network, abstractInstance.address, owner);
      const bidId2 = getBidId(stranger.address, baseTokenURI, baseTokenURI);
      const tx2 = abstractInstance
        .connect(stranger)
        .createBid(baseTokenURI, baseTokenURI, signature2, { value: amount * 3 });
      await expect(tx2)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(bidId2, stranger.address, amount * 3, baseTokenURI);

      await time.increase(86400);

      const tx3 = abstractInstance.mint(stranger.address, baseTokenURI, baseTokenURI);
      await expect(tx3)
        .to.emit(erc721Instance, "Transfer")
        .withArgs(ethers.constants.AddressZero, stranger.address, tokenId);

      await time.increase(86400);

      const tx4 = abstractInstance.mint(receiver.address, baseTokenURI, baseTokenURI);
      await expect(tx4).to.emit(erc721Instance, "Transfer").withArgs(ethers.constants.AddressZero, receiver.address, 2);
    });

    it("should mint correctly after update", async function () {
      const { abstractInstance, erc721Instance, owner, receiver, stranger, network } = await loadFixture(
        deployAbstractBrowsingFixture,
      );

      // Bid 1 (User A)
      const signature1 = await generateSignature(network, abstractInstance.address, owner);
      const bidId1 = getBidId(receiver.address, baseTokenURI, baseTokenURI);
      const tx1 = abstractInstance
        .connect(receiver)
        .createBid(baseTokenURI, baseTokenURI, signature1, { value: amount * 2 });
      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(bidId1, receiver.address, amount * 2, baseTokenURI);

      // Bid 2 (User B)
      const signature2 = await generateSignature(network, abstractInstance.address, owner);
      const bidId2 = getBidId(stranger.address, baseTokenURI, baseTokenURI);
      const tx2 = abstractInstance
        .connect(stranger)
        .createBid(baseTokenURI, baseTokenURI, signature2, { value: amount * 3 });
      await expect(tx2)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(bidId2, stranger.address, amount * 3, baseTokenURI);

      // Update Bid 1 (User A)
      const tx3 = abstractInstance.connect(receiver).updateBid(baseTokenURI, baseTokenURI, { value: amount * 10 });
      await expect(tx3)
        .to.emit(abstractInstance, "UpdateBid")
        .withArgs(bidId1, await receiver.getAddress(), amount * 12, amount * 10);

      await time.increase(86400);

      // mint 1
      const tx4 = abstractInstance.mint(receiver.address, baseTokenURI, baseTokenURI);
      await expect(tx4)
        .to.emit(erc721Instance, "Transfer")
        .withArgs(ethers.constants.AddressZero, receiver.address, tokenId);

      await time.increase(86400);

      // mint 2
      const tx5 = abstractInstance.mint(stranger.address, baseTokenURI, baseTokenURI);
      await expect(tx5).to.emit(erc721Instance, "Transfer").withArgs(ethers.constants.AddressZero, stranger.address, 2);
    });

    it("foo should fail: Not yet callable", async function () {
      const { abstractInstance, owner, receiver, stranger, network } = await loadFixture(deployAbstractBrowsingFixture);

      const signature1 = await generateSignature(network, abstractInstance.address, owner);
      const bidId1 = getBidId(receiver.address, baseTokenURI, baseTokenURI);
      const tx1 = abstractInstance
        .connect(receiver)
        .createBid(baseTokenURI, baseTokenURI, signature1, { value: amount * 2 });
      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(bidId1, receiver.address, amount * 2, baseTokenURI);

      const signature2 = await generateSignature(network, abstractInstance.address, owner);
      const bidId2 = getBidId(stranger.address, baseTokenURI, baseTokenURI);
      const tx2 = abstractInstance
        .connect(stranger)
        .createBid(baseTokenURI, baseTokenURI, signature2, { value: amount * 3 });
      await expect(tx2)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(bidId2, stranger.address, amount * 3, baseTokenURI);

      const tx3 = abstractInstance.mint(stranger.address, baseTokenURI, baseTokenURI);
      await expect(tx3).to.be.revertedWith(`Not yet callable`);
    });

    it("should fail: Limit exceeded", async function () {
      const { abstractInstance, erc721Instance, owner, receiver, stranger, network } = await loadFixture(
        deployAbstractBrowsingFixture,
      );

      const signature1 = await generateSignature(network, abstractInstance.address, owner);
      const bidId1 = getBidId(receiver.address, baseTokenURI, baseTokenURI);
      const tx1 = abstractInstance
        .connect(receiver)
        .createBid(baseTokenURI, baseTokenURI, signature1, { value: amount * 2 });
      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(bidId1, receiver.address, amount * 2, baseTokenURI);

      const signature2 = await generateSignature(network, abstractInstance.address, owner);
      const bidId2 = getBidId(stranger.address, baseTokenURI, baseTokenURI);
      const tx2 = abstractInstance
        .connect(stranger)
        .createBid(baseTokenURI, baseTokenURI, signature2, { value: amount * 3 });
      await expect(tx2)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(bidId2, stranger.address, amount * 3, baseTokenURI);

      const signature3 = await generateSignature(network, abstractInstance.address, owner);
      const bidId3 = getBidId(owner.address, baseTokenURI, baseTokenURI);
      const tx3 = abstractInstance
        .connect(owner)
        .createBid(baseTokenURI, baseTokenURI, signature3, { value: amount * 4 });
      await expect(tx3)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(bidId3, owner.address, amount * 4, baseTokenURI);

      await time.increase(86400);

      const tx4 = abstractInstance.mint(owner.address, baseTokenURI, baseTokenURI);
      await expect(tx4)
        .to.emit(erc721Instance, "Transfer")
        .withArgs(ethers.constants.AddressZero, owner.address, tokenId);

      await time.increase(86400);

      const tx5 = abstractInstance.mint(stranger.address, baseTokenURI, baseTokenURI);
      await expect(tx5).to.emit(erc721Instance, "Transfer").withArgs(ethers.constants.AddressZero, stranger.address, 2);

      await time.increase(86400);

      const tx6 = abstractInstance.mint(receiver.address, baseTokenURI, baseTokenURI);
      await expect(tx6).to.be.revertedWith(`Limit exceeded`);
    });
  });

  describe("withdraw", function () {
    it("should fail: account is missing role", async function () {
      const { abstractInstance, owner, receiver } = await loadFixture(deployAbstractBrowsingFixture);
      const tx = abstractInstance.connect(receiver).withdraw(owner.address);
      await expect(tx).to.be.revertedWith(
        `AccessControl: account ${receiver.address.toLowerCase()} is missing role ${DEFAULT_ADMIN_ROLE}`,
      );
    });

    it("should withdraw", async function () {
      // TODO - should not be able to withdraw users funds until bid has been consumed
      const { abstractInstance, erc721Instance, owner, receiver, network } = await loadFixture(
        deployAbstractBrowsingFixture,
      );

      const signature = await generateSignature(network, abstractInstance.address, owner);
      const bidId = getBidId(receiver.address, baseTokenURI, baseTokenURI);
      const tx1 = abstractInstance
        .connect(receiver)
        .createBid(baseTokenURI, baseTokenURI, signature, { value: amount });
      await expect(tx1).to.emit(abstractInstance, "CreateBid").withArgs(bidId, receiver.address, amount, baseTokenURI);

      await time.increase(86400);

      const mintTx = abstractInstance.mint(receiver.address, baseTokenURI, baseTokenURI);
      await expect(mintTx)
        .to.emit(erc721Instance, "Transfer")
        .withArgs(ethers.constants.AddressZero, receiver.address, tokenId);

      const tx = abstractInstance.withdraw(owner.address);
      await expect(tx).to.emit(abstractInstance, "Withdrawn").withArgs(owner.address, amount);
      const balance = await abstractInstance.provider.getBalance(abstractInstance.address);
      expect(balance).to.equal(0);
    });
  });
});
