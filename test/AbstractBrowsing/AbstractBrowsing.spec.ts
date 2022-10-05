/* eslint-disable prettier/prettier */
/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Network } from "@ethersproject/networks";

import {
  amount,
  testUrl1,
  testUrl2,
  baseTokenURI,
  DEFAULT_ADMIN_ROLE,
  MINTER_ROLE,
  tokenId,
  tokenName,
  tokenSymbol,
  testUrl3,
} from "../constants";

describe("PeriodicMinter", function () {
  async function deployAbstractBrowsingFixture() {
    const [owner, receiver, stranger] = await ethers.getSigners();

    const erc721Factory = await ethers.getContractFactory("ERC721Test");
    const erc721Instance = await erc721Factory.deploy(tokenName, tokenSymbol);

    const abstractFactory = await ethers.getContractFactory("PeriodicMinter");
    const abstract = await abstractFactory.deploy(tokenName);

    await abstract.setFactory(erc721Instance.address);
    await erc721Instance.grantRole(MINTER_ROLE, abstract.address);

    const network = await ethers.provider.getNetwork();

    return { owner, receiver, stranger, erc721Instance, abstract, network };
  }

  const getBidId = (address: string, url: string, tokenUri: string): string => {
    return ethers.utils.solidityKeccak256(["address", "string", "string"], [address, url, tokenUri]);
  };

  const generateSignature = (
    network: Network,
    verifierAddress: string,
    owner: SignerWithAddress,
    url: string,
    tokenUri: string,
  ) => {
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
      { url, tokenUri },
    );
  };

  describe("hasRole", function () {
    it("DEFAULT_ADMIN_ROLE", async function () {
      const { abstract, owner } = await loadFixture(deployAbstractBrowsingFixture);
      const isAdmin = await abstract.hasRole(DEFAULT_ADMIN_ROLE, owner.address);
      expect(isAdmin).to.equal(true);
    });
  });

  describe("bid (create)", function () {
    it("Should make first bid", async function () {
      const { abstract, owner, receiver, network } = await loadFixture(deployAbstractBrowsingFixture);
      const signature = await generateSignature(network, abstract.address, owner, testUrl1, baseTokenURI);
      const bidId = getBidId(receiver.address, testUrl1, baseTokenURI);
      const tx1 = abstract.connect(receiver).createBid(testUrl1, baseTokenURI, signature, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstract, "CreateBid")
        .withArgs(bidId, receiver.address, amount * 2, baseTokenURI);

      const highest = await abstract.getHighestBidAmount();
      expect(highest).to.equal(amount * 2);
    });

    it("should make second bid", async function () {
      const { abstract, owner, receiver, stranger, network } = await loadFixture(deployAbstractBrowsingFixture);
      const signature1 = await generateSignature(network, abstract.address, owner, testUrl1, baseTokenURI);

      const bidId1 = getBidId(receiver.address, testUrl1, baseTokenURI);
      const tx1 = abstract.connect(receiver).createBid(testUrl1, baseTokenURI, signature1, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstract, "CreateBid")
        .withArgs(bidId1, receiver.address, amount * 2, baseTokenURI);

      const signature2 = await generateSignature(network, abstract.address, owner, testUrl2, baseTokenURI);

      const bidId2 = getBidId(stranger.address, testUrl2, baseTokenURI);
      const tx2 = abstract.connect(stranger).createBid(testUrl2, baseTokenURI, signature2, { value: amount * 3 });

      await expect(tx2)
        .to.emit(abstract, "CreateBid")
        .withArgs(bidId2, stranger.address, amount * 3, baseTokenURI);

      const highest = await abstract.getHighestBidAmount();
      expect(highest).to.equal(amount * 3);
    });

    it("FOO Should allow higher bid to be placed for existing url", async function () {
      const { abstract, owner, receiver, stranger, network } = await loadFixture(deployAbstractBrowsingFixture);
      const signature1 = await generateSignature(network, abstract.address, owner, testUrl1, baseTokenURI);
      const signature2 = await generateSignature(network, abstract.address, owner, testUrl1, baseTokenURI);
      const bidId1 = getBidId(receiver.address, testUrl1, baseTokenURI);
      const bidId2 = getBidId(stranger.address, testUrl1, baseTokenURI);

      await expect(abstract.connect(receiver).createBid(testUrl1, baseTokenURI, signature1, { value: amount * 2 }))
        .to.emit(abstract, "CreateBid")
        .withArgs(bidId1, receiver.address, amount * 2, baseTokenURI);

      const balance = await abstract.provider.getBalance(receiver.address);
      const expectedBalance = balance.add(amount * 2);

      await expect(abstract.connect(stranger).createBid(testUrl1, baseTokenURI, signature2, { value: amount * 3 }))
        .to.emit(abstract, "CreateBid")
        .withArgs(bidId2, stranger.address, amount * 3, baseTokenURI);

      const balanceWithRefund = await abstract.provider.getBalance(receiver.address);
      expect(balanceWithRefund).to.be.eq(expectedBalance);

      const highest = await abstract.getHighestBidAmount();
      expect(highest).to.equal(amount * 3);
    });

    // TODO - should fail if bid too low when bidding on existing URL

    it("should fail: Bid amount lower then highest (equal)", async function () {
      const { abstract, owner, receiver, stranger, network } = await loadFixture(deployAbstractBrowsingFixture);
      const signature1 = await generateSignature(network, abstract.address, owner, testUrl1, baseTokenURI);

      const bidId = getBidId(receiver.address, testUrl1, baseTokenURI);
      const tx1 = abstract.connect(receiver).createBid(testUrl1, baseTokenURI, signature1, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstract, "CreateBid")
        .withArgs(bidId, receiver.address, amount * 2, baseTokenURI);

      const signature2 = await generateSignature(network, abstract.address, owner, testUrl2, baseTokenURI);
      const tx2 = abstract.connect(stranger).createBid(testUrl2, baseTokenURI, signature2, { value: amount * 2 });

      await expect(tx2).to.be.revertedWith(`BidStack: Bid should be 5% higher`);
    });

    it("should fail: Bid amount lower then highest (less)", async function () {
      const { abstract, owner, receiver, stranger, network } = await loadFixture(deployAbstractBrowsingFixture);
      const signature1 = await generateSignature(network, abstract.address, owner, testUrl1, baseTokenURI);

      const bidId = getBidId(receiver.address, testUrl1, baseTokenURI);
      const tx1 = abstract.connect(receiver).createBid(testUrl1, baseTokenURI, signature1, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstract, "CreateBid")
        .withArgs(bidId, receiver.address, amount * 2, baseTokenURI);

      const signature2 = await generateSignature(network, abstract.address, owner, testUrl2, baseTokenURI);

      const tx2 = abstract.connect(stranger).createBid(testUrl2, baseTokenURI, signature2, { value: amount });

      await expect(tx2).to.be.revertedWith(`BidStack: Bid should be 5% higher`);
    });

    it("should fail: Invalid signature", async function () {
      const { abstract, owner, receiver, network } = await loadFixture(deployAbstractBrowsingFixture);
      const signature = await generateSignature(network, abstract.address, owner, testUrl1, baseTokenURI);

      const tx1 = abstract.connect(receiver).createBid(testUrl1, "meh", signature, { value: 0 });

      await expect(tx1).to.be.revertedWith(`SignatureValidator: Invalid signature`);
    });

    it("should fail: Value is too low", async function () {
      const { abstract, owner, receiver, network } = await loadFixture(deployAbstractBrowsingFixture);
      const signature = await generateSignature(network, abstract.address, owner, testUrl1, baseTokenURI);

      const tx1 = abstract.connect(receiver).createBid(testUrl1, baseTokenURI, signature, { value: amount / 2 });

      await expect(tx1).to.be.revertedWith(`BidStack: Bid should be higher than minimum`);
    });
  });

  describe("bid (update)", function () {
    it("should update bid", async function () {
      const { abstract, owner, receiver, network } = await loadFixture(deployAbstractBrowsingFixture);
      const signature = await generateSignature(network, abstract.address, owner, testUrl1, baseTokenURI);

      const bidId = getBidId(receiver.address, testUrl1, baseTokenURI);
      const tx1 = abstract.connect(receiver).createBid(testUrl1, baseTokenURI, signature, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstract, "CreateBid")
        .withArgs(bidId, receiver.address, amount * 2, baseTokenURI);

      const tx2 = abstract.connect(receiver).updateBid(testUrl1, baseTokenURI, { value: amount * 10 });
      await expect(tx2)
        .to.emit(abstract, "UpdateBid")
        .withArgs(bidId, await receiver.getAddress(), amount * 12, amount * 10);

      const highest = await abstract.getHighestBidAmount();
      expect(highest).to.equal(amount * 12);
    });

    it("should fail: Not enough bid value", async function () {
      const { abstract, owner, receiver, stranger, network } = await loadFixture(deployAbstractBrowsingFixture);
      const signature = await generateSignature(network, abstract.address, owner, testUrl1, baseTokenURI);

      const bidId = getBidId(receiver.address, testUrl1, baseTokenURI);
      const tx1 = abstract.connect(receiver).createBid(testUrl1, baseTokenURI, signature, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstract, "CreateBid")
        .withArgs(bidId, receiver.address, amount * 2, baseTokenURI);

      const signature2 = await generateSignature(network, abstract.address, owner, testUrl2, baseTokenURI);

      const tx2 = abstract.connect(stranger).createBid(testUrl2, baseTokenURI, signature2, { value: amount * 2 });

      await expect(tx2).to.be.revertedWith(`BidStack: Bid should be 5% higher`);
    });
  });

  describe("cancelBid", function () {
    it("should revoke", async function () {
      const { abstract, owner, receiver, stranger, network } = await loadFixture(deployAbstractBrowsingFixture);

      const signature1 = await generateSignature(network, abstract.address, owner, testUrl1, baseTokenURI);
      const bidId1 = getBidId(receiver.address, testUrl1, baseTokenURI);
      const tx1 = abstract.connect(receiver).createBid(testUrl1, baseTokenURI, signature1, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstract, "CreateBid")
        .withArgs(bidId1, receiver.address, amount * 2, baseTokenURI);

      const signature2 = await generateSignature(network, abstract.address, owner, testUrl2, baseTokenURI);
      const bidId2 = getBidId(stranger.address, testUrl2, baseTokenURI);
      const tx2 = abstract.connect(stranger).createBid(testUrl2, baseTokenURI, signature2, { value: amount * 3 });

      await expect(tx2)
        .to.emit(abstract, "CreateBid")
        .withArgs(bidId2, stranger.address, amount * 3, baseTokenURI);

      // TODO - Test that funds are returned correctly
      const tx3 = abstract.connect(receiver).cancelBid(testUrl1, baseTokenURI);
      await expect(tx3)
        .to.emit(abstract, "CancelBid")
        .withArgs(bidId1, receiver.address, amount * 2);

      const highest = await abstract.getHighestBidAmount();
      expect(highest).to.equal(amount * 3);
    });

    it("should fail: Can't remove highest bid", async function () {
      const { abstract, owner, receiver, stranger, network } = await loadFixture(deployAbstractBrowsingFixture);

      const signature1 = await generateSignature(network, abstract.address, owner, testUrl1, baseTokenURI);
      const bidId1 = getBidId(receiver.address, testUrl1, baseTokenURI);
      const tx1 = abstract.connect(receiver).createBid(testUrl1, baseTokenURI, signature1, { value: amount * 2 });
      await expect(tx1)
        .to.emit(abstract, "CreateBid")
        .withArgs(bidId1, receiver.address, amount * 2, baseTokenURI);

      const signature2 = await generateSignature(network, abstract.address, owner, testUrl2, baseTokenURI);
      const bidId2 = getBidId(stranger.address, testUrl2, baseTokenURI);
      const tx2 = abstract.connect(stranger).createBid(testUrl2, baseTokenURI, signature2, { value: amount * 3 });
      await expect(tx2)
        .to.emit(abstract, "CreateBid")
        .withArgs(bidId2, stranger.address, amount * 3, baseTokenURI);

      const tx3 = abstract.connect(stranger).cancelBid(testUrl2, baseTokenURI);
      await expect(tx3).to.be.revertedWithCustomError(abstract, "CannotCancelHighBid");
    });

    it("should fail: Not an owner", async function () {
      const { abstract, owner, receiver, stranger, network } = await loadFixture(deployAbstractBrowsingFixture);

      const signature1 = await generateSignature(network, abstract.address, owner, testUrl1, baseTokenURI);
      const bidId1 = getBidId(receiver.address, testUrl1, baseTokenURI);
      const tx1 = abstract.connect(receiver).createBid(testUrl1, baseTokenURI, signature1, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstract, "CreateBid")
        .withArgs(bidId1, receiver.address, amount * 2, baseTokenURI);

      const signature2 = await generateSignature(network, abstract.address, owner, testUrl2, baseTokenURI);
      const bidId2 = getBidId(stranger.address, testUrl2, baseTokenURI);
      const tx2 = abstract.connect(stranger).createBid(testUrl2, baseTokenURI, signature2, { value: amount * 3 });

      await expect(tx2)
        .to.emit(abstract, "CreateBid")
        .withArgs(bidId2, stranger.address, amount * 3, baseTokenURI);

      const tx3 = abstract.connect(stranger).cancelBid(testUrl2, "bogus");
      await expect(tx3).to.be.revertedWithCustomError(abstract, "InvalidBidId");
    });

    // TODO - Need to update tests to use different urls & tokenUris
  });

  describe("mint", function () {
    it("should mint after first bid", async function () {
      const { abstract, owner, receiver, erc721Instance, network } = await loadFixture(deployAbstractBrowsingFixture);

      const signature = await generateSignature(network, abstract.address, owner, testUrl1, baseTokenURI);
      const bidId1 = getBidId(receiver.address, testUrl1, baseTokenURI);
      const tx1 = abstract.connect(receiver).createBid(testUrl1, baseTokenURI, signature, { value: amount * 2 });
      await expect(tx1)
        .to.emit(abstract, "CreateBid")
        .withArgs(bidId1, receiver.address, amount * 2, baseTokenURI);

      await time.increase(86400);

      const tx2 = abstract.mint(receiver.address, testUrl1, baseTokenURI);
      await expect(tx2)
        .to.emit(erc721Instance, "Transfer")
        .withArgs(ethers.constants.AddressZero, receiver.address, tokenId);
      const highest = await abstract.getHighestBidAmount();
      expect(highest).to.equal(0);
    });

    it("should mint after second bid", async function () {
      const { abstract, erc721Instance, owner, receiver, stranger, network } = await loadFixture(
        deployAbstractBrowsingFixture,
      );

      const signature1 = await generateSignature(network, abstract.address, owner, testUrl1, baseTokenURI);
      const bidId1 = getBidId(receiver.address, testUrl1, baseTokenURI);
      const tx1 = abstract.connect(receiver).createBid(testUrl1, baseTokenURI, signature1, { value: amount * 2 });
      await expect(tx1)
        .to.emit(abstract, "CreateBid")
        .withArgs(bidId1, receiver.address, amount * 2, baseTokenURI);

      const signature2 = await generateSignature(network, abstract.address, owner, testUrl2, baseTokenURI);
      const bidId2 = getBidId(stranger.address, testUrl2, baseTokenURI);
      const tx2 = abstract.connect(stranger).createBid(testUrl2, baseTokenURI, signature2, { value: amount * 3 });
      await expect(tx2)
        .to.emit(abstract, "CreateBid")
        .withArgs(bidId2, stranger.address, amount * 3, baseTokenURI);

      await time.increase(86400);

      const tx3 = abstract.mint(stranger.address, testUrl2, baseTokenURI);
      await expect(tx3)
        .to.emit(erc721Instance, "Transfer")
        .withArgs(ethers.constants.AddressZero, stranger.address, tokenId);

      const highest = await abstract.getHighestBidAmount();
      expect(highest).to.equal(amount * 2);
    });

    it("should mint twice after second bid", async function () {
      const { abstract, erc721Instance, owner, receiver, stranger, network } = await loadFixture(
        deployAbstractBrowsingFixture,
      );

      const signature1 = await generateSignature(network, abstract.address, owner, testUrl1, baseTokenURI);
      const bidId1 = getBidId(receiver.address, testUrl1, baseTokenURI);
      const tx1 = abstract.connect(receiver).createBid(testUrl1, baseTokenURI, signature1, { value: amount * 2 });
      await expect(tx1)
        .to.emit(abstract, "CreateBid")
        .withArgs(bidId1, receiver.address, amount * 2, baseTokenURI);

      const signature2 = await generateSignature(network, abstract.address, owner, testUrl2, baseTokenURI);
      const bidId2 = getBidId(stranger.address, testUrl2, baseTokenURI);
      const tx2 = abstract.connect(stranger).createBid(testUrl2, baseTokenURI, signature2, { value: amount * 3 });
      await expect(tx2)
        .to.emit(abstract, "CreateBid")
        .withArgs(bidId2, stranger.address, amount * 3, baseTokenURI);

      await time.increase(86400);

      const tx3 = abstract.mint(stranger.address, testUrl2, baseTokenURI);
      await expect(tx3)
        .to.emit(erc721Instance, "Transfer")
        .withArgs(ethers.constants.AddressZero, stranger.address, tokenId);

      await time.increase(86400);

      const tx4 = abstract.mint(receiver.address, testUrl1, baseTokenURI);
      await expect(tx4).to.emit(erc721Instance, "Transfer").withArgs(ethers.constants.AddressZero, receiver.address, 2);
    });

    it("should mint correctly after update", async function () {
      const { abstract, erc721Instance, owner, receiver, stranger, network } = await loadFixture(
        deployAbstractBrowsingFixture,
      );

      // Bid 1 (User A)
      const signature1 = await generateSignature(network, abstract.address, owner, testUrl1, baseTokenURI);
      const bidId1 = getBidId(receiver.address, testUrl1, baseTokenURI);
      const tx1 = abstract.connect(receiver).createBid(testUrl1, baseTokenURI, signature1, { value: amount * 2 });
      await expect(tx1)
        .to.emit(abstract, "CreateBid")
        .withArgs(bidId1, receiver.address, amount * 2, baseTokenURI);

      // Bid 2 (User B)
      const signature2 = await generateSignature(network, abstract.address, owner, testUrl2, baseTokenURI);
      const bidId2 = getBidId(stranger.address, testUrl2, baseTokenURI);
      const tx2 = abstract.connect(stranger).createBid(testUrl2, baseTokenURI, signature2, { value: amount * 3 });
      await expect(tx2)
        .to.emit(abstract, "CreateBid")
        .withArgs(bidId2, stranger.address, amount * 3, baseTokenURI);

      // Update Bid 1 (User A)
      const tx3 = abstract.connect(receiver).updateBid(testUrl1, baseTokenURI, { value: amount * 10 });
      await expect(tx3)
        .to.emit(abstract, "UpdateBid")
        .withArgs(bidId1, await receiver.getAddress(), amount * 12, amount * 10);

      await time.increase(86400);

      // mint 1
      const tx4 = abstract.mint(receiver.address, testUrl1, baseTokenURI);
      await expect(tx4)
        .to.emit(erc721Instance, "Transfer")
        .withArgs(ethers.constants.AddressZero, receiver.address, tokenId);

      await time.increase(86400);

      // mint 2
      const tx5 = abstract.mint(stranger.address, testUrl2, baseTokenURI);
      await expect(tx5).to.emit(erc721Instance, "Transfer").withArgs(ethers.constants.AddressZero, stranger.address, 2);
    });

    it("should fail: Not yet callable", async function () {
      const { abstract, owner, receiver, stranger, network } = await loadFixture(deployAbstractBrowsingFixture);

      const signature1 = await generateSignature(network, abstract.address, owner, testUrl1, baseTokenURI);
      const bidId1 = getBidId(receiver.address, testUrl1, baseTokenURI);
      const tx1 = abstract.connect(receiver).createBid(testUrl1, baseTokenURI, signature1, { value: amount * 2 });
      await expect(tx1)
        .to.emit(abstract, "CreateBid")
        .withArgs(bidId1, receiver.address, amount * 2, baseTokenURI);

      const signature2 = await generateSignature(network, abstract.address, owner, testUrl2, baseTokenURI);
      const bidId2 = getBidId(stranger.address, testUrl2, baseTokenURI);
      const tx2 = abstract.connect(stranger).createBid(testUrl2, baseTokenURI, signature2, { value: amount * 3 });
      await expect(tx2)
        .to.emit(abstract, "CreateBid")
        .withArgs(bidId2, stranger.address, amount * 3, baseTokenURI);

      const tx3 = abstract.mint(stranger.address, testUrl2, baseTokenURI);
      await expect(tx3).to.be.revertedWith(`Not yet callable`);
    });

    it("should fail: Limit exceeded", async function () {
      const { abstract, erc721Instance, owner, receiver, stranger, network } = await loadFixture(
        deployAbstractBrowsingFixture,
      );

      const signature1 = await generateSignature(network, abstract.address, owner, testUrl1, baseTokenURI);
      const bidId1 = getBidId(receiver.address, testUrl1, baseTokenURI);
      const tx1 = abstract.connect(receiver).createBid(testUrl1, baseTokenURI, signature1, { value: amount * 2 });
      await expect(tx1)
        .to.emit(abstract, "CreateBid")
        .withArgs(bidId1, receiver.address, amount * 2, baseTokenURI);

      const signature2 = await generateSignature(network, abstract.address, owner, testUrl2, baseTokenURI);
      const bidId2 = getBidId(stranger.address, testUrl2, baseTokenURI);
      const tx2 = abstract.connect(stranger).createBid(testUrl2, baseTokenURI, signature2, { value: amount * 3 });
      await expect(tx2)
        .to.emit(abstract, "CreateBid")
        .withArgs(bidId2, stranger.address, amount * 3, baseTokenURI);

      const signature3 = await generateSignature(network, abstract.address, owner, testUrl3, baseTokenURI);
      const bidId3 = getBidId(owner.address, testUrl3, baseTokenURI);
      const tx3 = abstract.connect(owner).createBid(testUrl3, baseTokenURI, signature3, { value: amount * 4 });
      await expect(tx3)
        .to.emit(abstract, "CreateBid")
        .withArgs(bidId3, owner.address, amount * 4, baseTokenURI);

      await time.increase(86400);

      const tx4 = abstract.mint(owner.address, testUrl3, baseTokenURI);
      await expect(tx4)
        .to.emit(erc721Instance, "Transfer")
        .withArgs(ethers.constants.AddressZero, owner.address, tokenId);

      await time.increase(86400);

      const tx5 = abstract.mint(stranger.address, testUrl2, baseTokenURI);
      await expect(tx5).to.emit(erc721Instance, "Transfer").withArgs(ethers.constants.AddressZero, stranger.address, 2);

      await time.increase(86400);

      const tx6 = abstract.mint(receiver.address, testUrl1, baseTokenURI);
      await expect(tx6).to.be.revertedWith(`Limit exceeded`);
    });
  });

  describe("withdraw", function () {
    it("should fail: account is missing role", async function () {
      const { abstract, owner, receiver } = await loadFixture(deployAbstractBrowsingFixture);
      const tx = abstract.connect(receiver).withdraw(owner.address);
      await expect(tx).to.be.revertedWith(
        `AccessControl: account ${receiver.address.toLowerCase()} is missing role ${DEFAULT_ADMIN_ROLE}`,
      );
    });

    it("should withdraw", async function () {
      // TODO - should not be able to withdraw users funds until bid has been consumed
      const { abstract, erc721Instance, owner, receiver, network } = await loadFixture(deployAbstractBrowsingFixture);

      const signature = await generateSignature(network, abstract.address, owner, testUrl1, baseTokenURI);
      const bidId = getBidId(receiver.address, testUrl1, baseTokenURI);
      const tx1 = abstract.connect(receiver).createBid(testUrl1, baseTokenURI, signature, { value: amount });
      await expect(tx1).to.emit(abstract, "CreateBid").withArgs(bidId, receiver.address, amount, baseTokenURI);

      await time.increase(86400);

      const mintTx = abstract.mint(receiver.address, testUrl1, baseTokenURI);
      await expect(mintTx)
        .to.emit(erc721Instance, "Transfer")
        .withArgs(ethers.constants.AddressZero, receiver.address, tokenId);

      const tx = abstract.withdraw(owner.address);
      await expect(tx).to.emit(abstract, "Withdrawn").withArgs(owner.address, amount);
      const balance = await abstract.provider.getBalance(abstract.address);
      expect(balance).to.equal(0);
    });
  });
});
