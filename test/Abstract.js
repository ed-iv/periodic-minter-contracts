const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");

describe("Abstract", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshopt in every test.
  async function deployOneYearLockFixture() {
    const [owner, bidderA, bidderB, bidderC, bidderD] = await ethers.getSigners();

    const Abstract = await ethers.getContractFactory("Abstract");
    const abstract = await Abstract.deploy();

    return { 
      abstract,
      owner,
      bidderA,
      bidderB,
      bidderC,
      bidderD
    };
  }

  describe("Deployment", function () {
    it("Should be deployed", async function () {
      const { abstract, bidderA, bidderB } = await loadFixture(deployOneYearLockFixture);
      const {
        constants,
        expectRevert,
    } = require('@openzeppelin/test-helpers');
      const hb = await abstract.getHighestBid();
      await expect(hb.bidder).to.equal(constants.ZERO_ADDRESS);
      await expect(hb.amount).to.equal(0);
      await expect(await abstract.queueSize()).to.equal(0);
    });
  });

  describe("First bid", function () {
    it("Should revert min bid value", async function () {
      const { abstract, bidderA, bidderB } = await loadFixture(deployOneYearLockFixture);
      const cA = abstract.connect(bidderA);
      await expect(cA.bid('123', {value: 10000000000000})).to.be.revertedWith('Bid amount is low');
    });
    it("Should be able to bid", async function () {
      const { abstract, bidderA, bidderB } = await loadFixture(deployOneYearLockFixture);
      const cA = abstract.connect(bidderA);
      await expect(cA.bid('123', {value: 1000000000000000})).to.be.fulfilled;
      const hb = await abstract.getHighestBid();
      await expect(hb.bidder).to.equal(await bidderA.getAddress());
      await expect(hb.amount).to.equal(1000000000000000);
      await expect(await abstract.queueSize()).to.equal(1);
    });
  });

  describe("Second bid", function () {
    let fix;
    before(async () => {
      fix= await loadFixture(deployOneYearLockFixture);
      const cA = fix.abstract.connect(fix.bidderA);
      await cA.bid('123', {value: 1000000000000000});
    })
    it("Should revert min bid value", async function () {
      await expect(await fix.abstract.queueSize()).to.equal(1);
      const cB = fix.abstract.connect(fix.bidderB);
      await expect(cB.bid('234', {value: 10000000000000})).to.be.revertedWith('Bid amount lower then highest');
    });
    it("Should be able to bid", async function () {
      const cB = fix.abstract.connect(fix.bidderB);
      await expect(await fix.abstract.queueSize()).to.equal(1);
      await expect(cB.bid('234', {value: 2000000000000000})).to.be.fulfilled;
      const hb = await fix.abstract.getHighestBid();
      await expect(hb.bidder).to.equal(await fix.bidderB.getAddress());
      await expect(hb.amount).to.equal(2000000000000000);
      await expect(await fix.abstract.queueSize()).to.equal(2);
    });
  });
  describe("Remove and update", function () {
    let fix;
    let cA, cB, cC, cD;
    before(async () => {
      fix= await loadFixture(deployOneYearLockFixture);
      cD = fix.abstract.connect(fix.bidderD);
      await cD.bid('1', {value: 1000000000000000});

      cC = fix.abstract.connect(fix.bidderC);
      await cC.bid('2', {value: 2000000000000000});

      cB = fix.abstract.connect(fix.bidderB);
      await cB.bid('3', {value: 3000000000000000});

      cA = fix.abstract.connect(fix.bidderA);
      await cA.bid('4', {value: 4000000000000000});
    });

    it("Should succesifully set up", async function () {
      await expect(await fix.abstract.queueSize()).to.equal(4);
      const hb = await fix.abstract.getHighestBid();
      await expect(hb.bidder).to.equal(await fix.bidderA.getAddress());
      await expect(hb.amount).to.equal(4000000000000000);
    });

    it("Should revert if removing highest bidder", async function () {
      await expect(cA.revokeBid('4')).to.be.revertedWith('Highest bid could not be removed');
    });

    it("Should remove bidder in the middle", async function () {
      await expect(cA.revokeBid('2')).to.be.fulfilled;
      await expect(await fix.abstract.queueSize()).to.equal(3);
      const q = await fix.abstract.getFullQueue();
      // await expect(await fix.abstract.getFullQueue()).to.equal([4,3,1,0]);
      console.log('q', q);
    });
    // it("Should be able to bid", async function () {
    //   const cB = fix.abstract.connect(fix.bidderB);
    //   await expect(await fix.abstract.queueSize()).to.equal(1);
    //   await expect(cB.bid('234', {value: 2000000000000000})).to.be.fulfilled;
    //   const hb = await fix.abstract.getHighestBid();
    //   await expect(hb.bidder).to.equal(await fix.bidderB.getAddress());
    //   await expect(hb.amount).to.equal(2000000000000000);
    //   await expect(await fix.abstract.queueSize()).to.equal(2);
    // });
  });


  // describe("Withdrawals", function () {
  //   describe("Validations", function () {
  //     it("Should revert with the right error if called too soon", async function () {
  //       const { lock } = await loadFixture(deployOneYearLockFixture);

  //       await expect(lock.withdraw()).to.be.revertedWith(
  //         "You can't withdraw yet"
  //       );
  //     });

  //     it("Should revert with the right error if called from another account", async function () {
  //       const { lock, unlockTime, otherAccount } = await loadFixture(
  //         deployOneYearLockFixture
  //       );

  //       // We can increase the time in Hardhat Network
  //       await time.increaseTo(unlockTime);

  //       // We use lock.connect() to send a transaction from another account
  //       await expect(lock.connect(otherAccount).withdraw()).to.be.revertedWith(
  //         "You aren't the owner"
  //       );
  //     });

  //     it("Shouldn't fail if the unlockTime has arrived and the owner calls it", async function () {
  //       const { lock, unlockTime } = await loadFixture(
  //         deployOneYearLockFixture
  //       );

  //       // Transactions are sent using the first signer by default
  //       await time.increaseTo(unlockTime);

  //       await expect(lock.withdraw()).not.to.be.reverted;
  //     });
  //   });

  //   describe("Events", function () {
  //     it("Should emit an event on withdrawals", async function () {
  //       const { lock, unlockTime, lockedAmount } = await loadFixture(
  //         deployOneYearLockFixture
  //       );

  //       await time.increaseTo(unlockTime);

  //       await expect(lock.withdraw())
  //         .to.emit(lock, "Withdrawal")
  //         .withArgs(lockedAmount, anyValue); // We accept any value as `when` arg
  //     });
  //   });

  //   describe("Transfers", function () {
  //     it("Should transfer the funds to the owner", async function () {
  //       const { lock, unlockTime, lockedAmount, owner } = await loadFixture(
  //         deployOneYearLockFixture
  //       );

  //       await time.increaseTo(unlockTime);

  //       await expect(lock.withdraw()).to.changeEtherBalances(
  //         [owner, lock],
  //         [lockedAmount, -lockedAmount]
  //       );
  //     });
  //   });
  // });
});
