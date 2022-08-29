import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Network } from "@ethersproject/networks";
import { time } from "@openzeppelin/test-helpers";

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

describe("AbstractBrowsing", function () {
  async function deployAbstractBrowsingFixture() {
    const [owner, receiver, stranger] = await ethers.getSigners();

    const erc721Factory = await ethers.getContractFactory("ERC721Test");
    const erc721Instance = await erc721Factory.deploy(tokenName, tokenSymbol);

    const abstractFactory = await ethers.getContractFactory("AbstractBrowsing");
    const abstractInstance = await abstractFactory.deploy(tokenName);

    await abstractInstance.setFactory(erc721Instance.address);
    await erc721Instance.grantRole(MINTER_ROLE, abstractInstance.address);

    const network = await ethers.provider.getNetwork();

    return { owner, receiver, stranger, erc721Instance, abstractInstance, network };
  }

  const generateSignature = (
    network: Network,
    verifierAddress: string,
    owner: SignerWithAddress,
    account: SignerWithAddress,
    multiplier: number,
    customNonce = nonce,
  ) => {
    return owner._signTypedData(
      // Domain
      {
        name: tokenName,
        version: "1.0.0",
        chainId: network.chainId,
        verifyingContract: verifierAddress,
      },
      // Types
      {
        createBid: [
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

  const generateSignatureUpdateRevoke = (
    network: Network,
    verifierAddress: string,
    owner: SignerWithAddress,
    bidId: number,
    customNonce = nonce,
  ) => {
    return owner._signTypedData(
      // Domain
      {
        name: tokenName,
        version: "1.0.0",
        chainId: network.chainId,
        verifyingContract: verifierAddress,
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

  describe("hasRole", function () {
    it("DEFAULT_ADMIN_ROLE", async function () {
      const { abstractInstance, owner } = await loadFixture(deployAbstractBrowsingFixture);
      const isAdmin = await abstractInstance.hasRole(DEFAULT_ADMIN_ROLE, owner.address);
      expect(isAdmin).to.equal(true);
    });
  });

  describe("bid (create)", function () {
    it("should make first bid", async function () {
      const { abstractInstance, owner, receiver, network } = await loadFixture(deployAbstractBrowsingFixture);
      const nonce1 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const signature = await generateSignature(network, abstractInstance.address, owner, receiver, 2, nonce1);

      const tx1 = abstractInstance.connect(receiver).createBid(nonce1, baseTokenURI, signature, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(1, receiver.address, amount * 2);

      const highest = await abstractInstance.getHighestBid();
      expect(highest.bidder).to.equal(receiver.address);
      expect(highest.amount).to.equal(amount * 2);
    });

    it("should make second bid", async function () {
      const { abstractInstance, owner, receiver, stranger, network } = await loadFixture(deployAbstractBrowsingFixture);
      const nonce1 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const nonce2 = ethers.utils.hexlify(ethers.utils.randomBytes(32));

      const signature1 = await generateSignature(network, abstractInstance.address, owner, receiver, 2, nonce1);

      const tx1 = abstractInstance.connect(receiver).createBid(nonce1, baseTokenURI, signature1, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(1, receiver.address, amount * 2);

      const signature2 = await generateSignature(network, abstractInstance.address, owner, stranger, 3, nonce2);

      const tx2 = abstractInstance.connect(stranger).createBid(nonce2, baseTokenURI, signature2, { value: amount * 3 });

      await expect(tx2)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(2, stranger.address, amount * 3);

      const highest = await abstractInstance.getHighestBid();
      expect(highest.bidder).to.equal(stranger.address);
      expect(highest.amount).to.equal(amount * 3);
    });

    it("should fail: Bid amount lower then highest (equal)", async function () {
      const { abstractInstance, owner, receiver, stranger, network } = await loadFixture(deployAbstractBrowsingFixture);
      const nonce1 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const nonce2 = ethers.utils.hexlify(ethers.utils.randomBytes(32));

      const signature1 = await generateSignature(network, abstractInstance.address, owner, receiver, 2, nonce1);

      const tx1 = abstractInstance.connect(receiver).createBid(nonce1, baseTokenURI, signature1, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(1, receiver.address, amount * 2);

      const signature2 = await generateSignature(network, abstractInstance.address, owner, stranger, 2, nonce2);

      const tx2 = abstractInstance.connect(stranger).createBid(nonce2, baseTokenURI, signature2, { value: amount * 2 });

      await expect(tx2).to.be.revertedWith(`BidStack: Bid should be 5% higher`);
    });

    it("should fail: Bid amount lower then highest (less)", async function () {
      const { abstractInstance, owner, receiver, stranger, network } = await loadFixture(deployAbstractBrowsingFixture);
      const nonce1 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const nonce2 = ethers.utils.hexlify(ethers.utils.randomBytes(32));

      const signature1 = await generateSignature(network, abstractInstance.address, owner, receiver, 2, nonce1);

      const tx1 = abstractInstance.connect(receiver).createBid(nonce1, baseTokenURI, signature1, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(1, receiver.address, amount * 2);

      const signature2 = await generateSignature(network, abstractInstance.address, owner, stranger, 1, nonce2);

      const tx2 = abstractInstance.connect(stranger).createBid(nonce2, baseTokenURI, signature2, { value: amount });

      await expect(tx2).to.be.revertedWith(`BidStack: Bid should be 5% higher`);
    });

    it("should fail: Expired signature", async function () {
      const { abstractInstance, owner, receiver, stranger, network } = await loadFixture(deployAbstractBrowsingFixture);
      const signature = await generateSignature(network, abstractInstance.address, owner, receiver, 2);

      const tx1 = abstractInstance.connect(receiver).createBid(nonce, baseTokenURI, signature, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(1, receiver.address, amount * 2);

      const tx2 = abstractInstance.connect(stranger).createBid(nonce, baseTokenURI, signature, { value: amount * 2 });

      await expect(tx2).to.be.revertedWith(`SignatureValidator: Expired signature`);
    });

    it("should fail: Invalid signature", async function () {
      const { abstractInstance, owner, receiver, network } = await loadFixture(deployAbstractBrowsingFixture);
      const signature = await generateSignature(network, abstractInstance.address, owner, receiver, 2);

      const tx1 = abstractInstance.connect(receiver).createBid(nonce, baseTokenURI, signature, { value: 0 });

      await expect(tx1).to.be.revertedWith(`SignatureValidator: Invalid signature`);
    });

    it("should fail: Value is too low", async function () {
      const { abstractInstance, owner, receiver, network } = await loadFixture(deployAbstractBrowsingFixture);
      const signature = await generateSignature(network, abstractInstance.address, owner, receiver, 1 / 2);

      const tx1 = abstractInstance.connect(receiver).createBid(nonce, baseTokenURI, signature, { value: amount / 2 });

      await expect(tx1).to.be.revertedWith(`BidStack: Bid should be higher than minimum`);
    });
  });

  describe("bid (update)", function () {
    it("should update bid", async function () {
      const { abstractInstance, owner, receiver, network } = await loadFixture(deployAbstractBrowsingFixture);
      const nonce1 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const nonce2 = ethers.utils.hexlify(ethers.utils.randomBytes(32));

      const signature1 = await generateSignature(network, abstractInstance.address, owner, receiver, 2, nonce1);
      const tx1 = abstractInstance.connect(receiver).createBid(nonce1, baseTokenURI, signature1, { value: amount * 2 });

      const bidId = 1;
      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(bidId, receiver.address, amount * 2);

      const signature2 = await generateSignatureUpdateRevoke(network, abstractInstance.address, owner, bidId, nonce2);
      const tx2 = abstractInstance.connect(receiver).updateBid(nonce2, bidId, signature2, { value: amount * 10 });
      await expect(tx2)
        .to.emit(abstractInstance, "UpdateBid")
        .withArgs(bidId, await receiver.getAddress(), amount * 12, amount * 10);

      const highest = await abstractInstance.getHighestBid();

      expect(highest.bidder).to.equal(receiver.address);
      expect(highest.amount).to.equal(amount * 12);
    });

    it("should fail: Not enough bid value", async function () {
      const { abstractInstance, owner, receiver, stranger, network } = await loadFixture(deployAbstractBrowsingFixture);
      const nonce1 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const nonce2 = ethers.utils.hexlify(ethers.utils.randomBytes(32));

      const signature1 = await generateSignature(network, abstractInstance.address, owner, receiver, 2, nonce1);

      const tx1 = abstractInstance.connect(receiver).createBid(nonce1, baseTokenURI, signature1, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(1, receiver.address, amount * 2);

      const signature2 = await generateSignature(network, abstractInstance.address, owner, stranger, 2, nonce2);

      const tx2 = abstractInstance.connect(stranger).createBid(nonce2, baseTokenURI, signature2, { value: amount * 2 });

      await expect(tx2).to.be.revertedWith(`BidStack: Bid should be 5% higher`);
    });
  });

  describe("cancelBid", function () {
    it("should revoke", async function () {
      const { abstractInstance, owner, receiver, stranger, network } = await loadFixture(deployAbstractBrowsingFixture);
      const nonce1 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const nonce2 = ethers.utils.hexlify(ethers.utils.randomBytes(32));

      const signature1 = await generateSignature(network, abstractInstance.address, owner, receiver, 2, nonce1);

      const tx1 = abstractInstance.connect(receiver).createBid(nonce1, baseTokenURI, signature1, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(1, receiver.address, amount * 2);

      const signature2 = await generateSignature(network, abstractInstance.address, owner, stranger, 3, nonce2);

      const tx2 = abstractInstance.connect(stranger).createBid(nonce2, baseTokenURI, signature2, { value: amount * 3 });

      await expect(tx2)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(2, stranger.address, amount * 3);

      const nonce3 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const signature3 = await generateSignatureUpdateRevoke(network, abstractInstance.address, owner, 1, nonce3);
      const tx3 = abstractInstance.connect(receiver).cancelBid(nonce3, 1, signature3);

      await expect(tx3)
        .to.emit(abstractInstance, "CancelBid")
        .withArgs(1, receiver.address, amount * 2);

      const highest = await abstractInstance.getHighestBid();
      expect(highest.bidder).to.equal(stranger.address);
      expect(highest.amount).to.equal(amount * 3);
    });

    it("should fail: Can't remove highest bid", async function () {
      const { abstractInstance, owner, receiver, stranger, network } = await loadFixture(deployAbstractBrowsingFixture);
      const nonce1 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const nonce2 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const nonce3 = ethers.utils.hexlify(ethers.utils.randomBytes(32));

      const signature1 = await generateSignature(network, abstractInstance.address, owner, receiver, 2, nonce1);
      const tx1 = abstractInstance.connect(receiver).createBid(nonce1, baseTokenURI, signature1, { value: amount * 2 });
      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(1, receiver.address, amount * 2);

      const signature2 = await generateSignature(network, abstractInstance.address, owner, stranger, 3, nonce2);
      const tx2 = abstractInstance.connect(stranger).createBid(nonce2, baseTokenURI, signature2, { value: amount * 3 });
      await expect(tx2)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(2, stranger.address, amount * 3);

      const signature3 = await generateSignatureUpdateRevoke(network, abstractInstance.address, owner, 2, nonce3);
      const tx3 = abstractInstance.connect(stranger).cancelBid(nonce3, 2, signature3);
      await expect(tx3).to.be.revertedWithCustomError(abstractInstance, "CannotCancelHighBid");
    });

    it("should fail: Not an owner", async function () {
      const { abstractInstance, owner, receiver, stranger, network } = await loadFixture(deployAbstractBrowsingFixture);
      const nonce1 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const nonce2 = ethers.utils.hexlify(ethers.utils.randomBytes(32));

      const signature1 = await generateSignature(network, abstractInstance.address, owner, receiver, 2, nonce1);

      const tx1 = abstractInstance.connect(receiver).createBid(nonce1, baseTokenURI, signature1, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(1, receiver.address, amount * 2);

      const signature2 = await generateSignature(network, abstractInstance.address, owner, stranger, 3, nonce2);

      const tx2 = abstractInstance.connect(stranger).createBid(nonce2, baseTokenURI, signature2, { value: amount * 3 });

      await expect(tx2)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(2, stranger.address, amount * 3);

      const nonce3 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const signature3 = await generateSignatureUpdateRevoke(network, abstractInstance.address, owner, 1, nonce3);
      const tx3 = abstractInstance.connect(stranger).cancelBid(nonce3, 1, signature3);

      await expect(tx3).to.be.revertedWith(`Exchange: Not an owner`);
    });
  });

  describe("mint", function () {
    it("should mint after first bid", async function () {
      const { abstractInstance, owner, receiver, erc721Instance, network } = await loadFixture(
        deployAbstractBrowsingFixture,
      );
      const signature = await generateSignature(network, abstractInstance.address, owner, receiver, 2);

      const tx1 = abstractInstance.connect(receiver).createBid(nonce, baseTokenURI, signature, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(1, receiver.address, amount * 2);

      const current1 = await time.latest();
      await time.increaseTo(current1.add(ethers.BigNumber.from(86400)));

      const tx2 = abstractInstance.mint();

      await expect(tx2)
        .to.emit(erc721Instance, "Transfer")
        .withArgs(ethers.constants.AddressZero, receiver.address, tokenId);

      const highest = await abstractInstance.getHighestBid();
      expect(highest.bidder).to.equal(ethers.constants.AddressZero);
      expect(highest.amount).to.equal(0);
    });

    it("should mint after second bid", async function () {
      const { abstractInstance, erc721Instance, owner, receiver, stranger, network } = await loadFixture(
        deployAbstractBrowsingFixture,
      );
      const nonce1 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const nonce2 = ethers.utils.hexlify(ethers.utils.randomBytes(32));

      const signature1 = await generateSignature(network, abstractInstance.address, owner, receiver, 2, nonce1);

      const tx1 = abstractInstance.connect(receiver).createBid(nonce1, baseTokenURI, signature1, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(1, receiver.address, amount * 2);

      const signature2 = await generateSignature(network, abstractInstance.address, owner, stranger, 3, nonce2);

      const tx2 = abstractInstance.connect(stranger).createBid(nonce2, baseTokenURI, signature2, { value: amount * 3 });

      await expect(tx2)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(2, stranger.address, amount * 3);

      const current1 = await time.latest();
      await time.increaseTo(current1.add(ethers.BigNumber.from(86400)));

      const tx3 = abstractInstance.mint();

      await expect(tx3)
        .to.emit(erc721Instance, "Transfer")
        .withArgs(ethers.constants.AddressZero, stranger.address, tokenId);

      const highest = await abstractInstance.getHighestBid();
      expect(highest.bidder).to.equal(receiver.address);
      expect(highest.amount).to.equal(amount * 2);
    });

    it("should mint twice after second bid", async function () {
      const { abstractInstance, erc721Instance, owner, receiver, stranger, network } = await loadFixture(
        deployAbstractBrowsingFixture,
      );
      const nonce1 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const nonce2 = ethers.utils.hexlify(ethers.utils.randomBytes(32));

      const signature1 = await generateSignature(network, abstractInstance.address, owner, receiver, 2, nonce1);

      const tx1 = abstractInstance.connect(receiver).createBid(nonce1, baseTokenURI, signature1, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(1, receiver.address, amount * 2);

      const signature2 = await generateSignature(network, abstractInstance.address, owner, stranger, 3, nonce2);

      const tx2 = abstractInstance.connect(stranger).createBid(nonce2, baseTokenURI, signature2, { value: amount * 3 });

      await expect(tx2)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(2, stranger.address, amount * 3);

      const current1 = await time.latest();
      await time.increaseTo(current1.add(ethers.BigNumber.from(86400)));

      const tx3 = abstractInstance.mint();

      await expect(tx3)
        .to.emit(erc721Instance, "Transfer")
        .withArgs(ethers.constants.AddressZero, stranger.address, tokenId);

      const current2 = await time.latest();
      await time.increaseTo(current2.add(ethers.BigNumber.from(86400)));

      const tx4 = abstractInstance.mint();

      await expect(tx4).to.emit(erc721Instance, "Transfer").withArgs(ethers.constants.AddressZero, receiver.address, 2);
    });

    it("should mint correctly after update", async function () {
      const { abstractInstance, erc721Instance, owner, receiver, stranger, network } = await loadFixture(
        deployAbstractBrowsingFixture,
      );
      const nonce1 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const nonce2 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      // await testgetStackInfo({});
      const signature1 = await generateSignature(network, abstractInstance.address, owner, receiver, 2, nonce1);

      // 1 bid
      const tx1 = abstractInstance.connect(receiver).createBid(nonce1, baseTokenURI, signature1, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(1, receiver.address, amount * 2);
      // await testgetStackInfo({});

      // 2nd bid
      const signature2 = await generateSignature(network, abstractInstance.address, owner, stranger, 3, nonce2);

      const tx2 = abstractInstance.connect(stranger).createBid(nonce2, baseTokenURI, signature2, { value: amount * 3 });

      await expect(tx2)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(2, stranger.address, amount * 3);
      // await testgetStackInfo({});

      // 1st update
      const nonce3 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const signature3 = await generateSignatureUpdateRevoke(network, abstractInstance.address, owner, 1, nonce3);
      const tx3 = abstractInstance.connect(receiver).updateBid(nonce3, 1, signature3, { value: amount * 10 });
      await expect(tx3)
        .to.emit(abstractInstance, "UpdateBid")
        .withArgs(1, await receiver.getAddress(), amount * 12, amount * 10);
      // await testgetStackInfo({});

      // mint 1
      const current1 = await time.latest();
      await time.increaseTo(current1.add(ethers.BigNumber.from(86400)));

      const tx4 = abstractInstance.mint();

      await expect(tx4)
        .to.emit(erc721Instance, "Transfer")
        .withArgs(ethers.constants.AddressZero, receiver.address, tokenId);

      // mint 2
      const current2 = await time.latest();
      await time.increaseTo(current2.add(ethers.BigNumber.from(86400)));

      const tx5 = abstractInstance.mint();

      await expect(tx5).to.emit(erc721Instance, "Transfer").withArgs(ethers.constants.AddressZero, stranger.address, 2);
    });

    it("should fail: Not yet callable", async function () {
      const { abstractInstance, owner, receiver, stranger, network } = await loadFixture(deployAbstractBrowsingFixture);
      const nonce1 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const nonce2 = ethers.utils.hexlify(ethers.utils.randomBytes(32));

      const signature1 = await generateSignature(network, abstractInstance.address, owner, receiver, 2, nonce1);

      const tx1 = abstractInstance.connect(receiver).createBid(nonce1, baseTokenURI, signature1, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(1, receiver.address, amount * 2);

      const signature2 = await generateSignature(network, abstractInstance.address, owner, stranger, 3, nonce2);

      const tx2 = abstractInstance.connect(stranger).createBid(nonce2, baseTokenURI, signature2, { value: amount * 3 });

      await expect(tx2)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(2, stranger.address, amount * 3);

      const tx3 = abstractInstance.mint();

      await expect(tx3).to.be.revertedWith(`Not yet callable`);
    });

    it("should fail: Limit exceeded", async function () {
      const { abstractInstance, erc721Instance, owner, receiver, stranger, network } = await loadFixture(
        deployAbstractBrowsingFixture,
      );
      const nonce1 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const nonce2 = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const nonce3 = ethers.utils.hexlify(ethers.utils.randomBytes(32));

      const signature1 = await generateSignature(network, abstractInstance.address, owner, receiver, 2, nonce1);

      const tx1 = abstractInstance.connect(receiver).createBid(nonce1, baseTokenURI, signature1, { value: amount * 2 });

      await expect(tx1)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(1, receiver.address, amount * 2);

      const signature2 = await generateSignature(network, abstractInstance.address, owner, stranger, 3, nonce2);

      const tx2 = abstractInstance.connect(stranger).createBid(nonce2, baseTokenURI, signature2, { value: amount * 3 });

      await expect(tx2)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(2, stranger.address, amount * 3);

      const signature3 = await generateSignature(network, abstractInstance.address, owner, receiver, 4, nonce3);

      const tx3 = abstractInstance.connect(owner).createBid(nonce3, baseTokenURI, signature3, { value: amount * 4 });

      await expect(tx3)
        .to.emit(abstractInstance, "CreateBid")
        .withArgs(3, owner.address, amount * 4);

      const current1 = await time.latest();
      await time.increaseTo(current1.add(ethers.BigNumber.from(86400)));

      const tx4 = abstractInstance.mint();

      await expect(tx4)
        .to.emit(erc721Instance, "Transfer")
        .withArgs(ethers.constants.AddressZero, owner.address, tokenId);

      const current2 = await time.latest();
      await time.increaseTo(current2.add(ethers.BigNumber.from(86400)));

      const tx5 = abstractInstance.mint();

      await expect(tx5).to.emit(erc721Instance, "Transfer").withArgs(ethers.constants.AddressZero, stranger.address, 2);

      const current3 = await time.latest();
      await time.increaseTo(current3.add(ethers.BigNumber.from(86400)));

      const tx6 = abstractInstance.mint();

      await expect(tx6).to.be.revertedWith(`Exchange: Limit exceeded`);
    });
  });

  describe("withdraw", function () {
    it("should fail: account is missing role", async function () {
      const { abstractInstance, receiver } = await loadFixture(deployAbstractBrowsingFixture);
      const tx = abstractInstance.connect(receiver).withdraw();
      await expect(tx).to.be.revertedWith(
        `AccessControl: account ${receiver.address.toLowerCase()} is missing role ${DEFAULT_ADMIN_ROLE}`,
      );
    });

    it("should withdraw", async function () {
      const { abstractInstance, owner, receiver, network } = await loadFixture(deployAbstractBrowsingFixture);
      const signature = await generateSignature(network, abstractInstance.address, owner, receiver, 1);

      const tx1 = abstractInstance.connect(receiver).createBid(nonce, baseTokenURI, signature, { value: amount });

      await expect(tx1).to.emit(abstractInstance, "CreateBid").withArgs(1, receiver.address, amount);

      const tx = abstractInstance.withdraw();
      await expect(tx).to.emit(abstractInstance, "Withdrawn").withArgs(owner.address, amount);
      const balance = await abstractInstance.provider.getBalance(abstractInstance.address);
      expect(balance).to.equal(0);
    });
  });
});
