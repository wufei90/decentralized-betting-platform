const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers')
const { anyValue } = require('@nomicfoundation/hardhat-chai-matchers/withArgs')
const { expect } = require('chai')
const { BigNumber } = require('ethers')
const maxAmount = BigNumber.from('10').pow(12).mul(BigNumber.from('10').pow(18))
const amount1 = 10 ** 9
const amount2 = 20 ** 9

describe('BetBroker', function () {
  async function deployFixture () {
    const [owner, account1, account2] = await ethers.getSigners()

    const Token = await ethers.getContractFactory('BeTX')
    const token = await Token.deploy()
    await token.deployed()
    const BetBroker = await ethers.getContractFactory('BetBroker')
    const betBroker = await BetBroker.deploy(token.address)
    await betBroker.deployed()

    return { token, betBroker, owner, account1, account2 }
  }
  describe('Deployment', function () {
    it('Should set the right contract', async function () {
      const { token, betBroker } = await loadFixture(deployFixture)
      expect(await betBroker._token()).to.be.equal(token.address)
    })

    it('Should set the right owner', async function () {
      const { betBroker, owner } = await loadFixture(deployFixture)
      expect(await betBroker.owner()).to.be.equal(owner.address)
    })

    it('Should set the right owner', async function () {
      const { token, owner } = await loadFixture(deployFixture)
      expect(await token.owner()).to.be.equal(owner.address)
    })

    it('Should send the right amount to owner', async function () {
      const { token, owner } = await loadFixture(deployFixture)
      expect(await token.balanceOf(owner.address)).to.be.equal(maxAmount)
    })
  })

  describe('Betting', function () {
    it('Should create bet', async function () {
      const { token, betBroker, owner, account1 } = await loadFixture(deployFixture)
      const eventId = 1

      await expect(betBroker.connect(account1).createBet(eventId, amount1, amount2))
        .to.be.revertedWith('Non-sufficient funds')
      await token.connect(owner).transfer(account1.address, amount1)
      expect(await token.balanceOf(betBroker.address)).to.be.equal(0)
      expect(await token.balanceOf(account1.address)).to.be.equal(amount1)

      await expect(betBroker.connect(account1).createBet(eventId, amount1, amount2))
        .to.be.revertedWith('Non-sufficient allowed tokens')
      await token.connect(account1).approve(betBroker.address, maxAmount)
      expect(await token.balanceOf(betBroker.address)).to.be.equal(0)
      expect(await token.balanceOf(account1.address)).to.be.equal(amount1)

      await expect(betBroker.connect(account1).createBet(eventId, 0, amount2))
        .to.be.revertedWith('Bet size cannot be zero')
      await expect(betBroker.connect(account1).createBet(eventId, amount1, 0))
        .to.be.revertedWith('Bet size cannot be zero')
      expect(await token.balanceOf(betBroker.address)).to.be.equal(0)
      expect(await token.balanceOf(account1.address)).to.be.equal(amount1)

      await expect(betBroker.connect(account1).createBet(eventId, amount1, amount2))
        .to.emit(betBroker, 'BetCreated')
        .withArgs(anyValue, eventId, account1.address, amount1, amount2)

      expect(await token.balanceOf(betBroker.address)).to.be.equal(amount1)
      expect(await token.balanceOf(account1.address)).to.be.equal(0)
    })

    it('Should take bet', async function () {
      const { token, betBroker, owner, account1, account2 } = await loadFixture(deployFixture)
      const eventId = 1
      const betId = 1

      await token.connect(account1).approve(betBroker.address, maxAmount)
      await token.connect(owner).transfer(account1.address, amount1)
      await betBroker.connect(account1).createBet(eventId, amount1, amount2)
      expect(await token.balanceOf(betBroker.address)).to.be.equal(amount1)
      expect(await token.balanceOf(account1.address)).to.be.equal(0)

      await expect(betBroker.connect(account2).takeBet(betId))
        .to.be.revertedWith('Non-sufficient funds')
      await token.connect(owner).transfer(account2.address, amount2)
      expect(await token.balanceOf(betBroker.address)).to.be.equal(amount1)
      expect(await token.balanceOf(account2.address)).to.be.equal(amount2)

      await expect(betBroker.connect(account2).takeBet(betId))
        .to.be.revertedWith('Non-sufficient allowed tokens')
      await token.connect(account2).approve(betBroker.address, maxAmount)
      expect(await token.balanceOf(betBroker.address)).to.be.equal(amount1)
      expect(await token.balanceOf(account2.address)).to.be.equal(amount2)

      await expect(betBroker.connect(account2).takeBet(betId))
        .to.emit(betBroker, 'BetTaken')
        .withArgs(anyValue, eventId, account1.address, account2.address, amount1, amount2)
      expect(await token.balanceOf(betBroker.address)).to.be.equal(amount1 + amount2)
      expect(await token.balanceOf(account2.address)).to.be.equal(0)
    })

    it('Should fail to take bet (closed)', async function () {
      const { token, betBroker, owner, account1, account2 } = await loadFixture(deployFixture)
      const eventId = 1
      const betId = 1

      await token.connect(account1).approve(betBroker.address, maxAmount)
      await token.connect(owner).transfer(account1.address, amount1)
      await token.connect(account2).approve(betBroker.address, maxAmount)
      await token.connect(owner).transfer(account2.address, amount2)
      await betBroker.connect(account1).createBet(eventId, amount1, amount2)
      await betBroker.connect(owner).closeBet(betId)
      await expect(betBroker.connect(account2).takeBet(betId))
        .to.be.revertedWith('Bet is closed')

      expect(await token.balanceOf(betBroker.address)).to.be.equal(amount1)
      expect(await token.balanceOf(account1.address)).to.be.equal(0)
      expect(await token.balanceOf(account2.address)).to.be.equal(amount2)
    })

    it('Should close bet', async function () {
      const { token, betBroker, owner, account1 } = await loadFixture(deployFixture)
      const eventId = 1
      const betId = 1

      await token.connect(account1).approve(betBroker.address, maxAmount)
      await token.connect(owner).transfer(account1.address, amount1)
      await betBroker.connect(account1).createBet(eventId, amount1, amount2)
      await expect(betBroker.connect(owner).closeBet(betId))
        .to.emit(betBroker, 'BetClosed')
        .withArgs(anyValue, eventId, account1.address, amount1)

      expect(await token.balanceOf(betBroker.address)).to.be.equal(amount1)
      expect(await token.balanceOf(account1.address)).to.be.equal(0)
    })

    it('Should fail to close bet (bet taken)', async function () {
      const { token, betBroker, owner, account1, account2 } = await loadFixture(deployFixture)
      const eventId = 1
      const betId = 1

      await token.connect(account1).approve(betBroker.address, maxAmount)
      await token.connect(owner).transfer(account1.address, amount1)
      await token.connect(account2).approve(betBroker.address, maxAmount)
      await token.connect(owner).transfer(account2.address, amount2)
      await betBroker.connect(account1).createBet(eventId, amount1, amount2)
      await betBroker.connect(account2).takeBet(betId)
      await expect(betBroker.connect(owner).closeBet(betId))
        .to.be.revertedWith('Bet has been taken')

      expect(await token.balanceOf(betBroker.address)).to.be.equal(amount1 + amount2)
      expect(await token.balanceOf(account1.address)).to.be.equal(0)
    })

    it('Should distribute & claim gains (creator won)', async function () {
      const { token, betBroker, owner, account1, account2 } = await loadFixture(deployFixture)
      const eventId = 1
      const betId = 1
      const creatorWon = true

      await token.connect(account1).approve(betBroker.address, maxAmount)
      await token.connect(owner).transfer(account1.address, amount1)
      await token.connect(account2).approve(betBroker.address, maxAmount)
      await token.connect(owner).transfer(account2.address, amount2)
      await betBroker.connect(account1).createBet(eventId, amount1, amount2)

      await expect(betBroker.connect(owner).distributeGains(betId, creatorWon))
        .to.be.revertedWith('Bet not taken')
      await betBroker.connect(account2).takeBet(betId)

      await expect(betBroker.connect(account1).claimGains(betId))
        .to.be.revertedWith('Result unknown')
      expect(await token.balanceOf(betBroker.address)).to.be.equal(amount1 + amount2)
      expect(await token.balanceOf(account1.address)).to.be.equal(0)

      await expect(betBroker.connect(owner).distributeGains(betId, creatorWon))
        .to.emit(betBroker, 'GainDistributed')
        .withArgs(anyValue, eventId, account1.address, account2.address, amount1, amount2, 1)

      await expect(betBroker.connect(owner).distributeGains(betId, !creatorWon))
        .to.be.revertedWith('Gains already ditributed')

      await expect(betBroker.connect(account2).claimGains(betId))
        .to.be.revertedWith('Not the winner')
      expect(await token.balanceOf(betBroker.address)).to.be.equal(amount1 + amount2)
      expect(await token.balanceOf(account2.address)).to.be.equal(0)
      await betBroker.connect(account1).claimGains(betId)
      await expect(betBroker.connect(account1).claimGains(betId))
        .to.be.revertedWith('Gains already claimed')

      expect(await token.balanceOf(betBroker.address)).to.be.equal(0)
      expect(await token.balanceOf(account1.address)).to.be.equal(amount1 + amount2)
      expect(await token.balanceOf(account2.address)).to.be.equal(0)
    })

    it('Should distribute & claim  gains (taker won)', async function () {
      const { token, betBroker, owner, account1, account2 } = await loadFixture(deployFixture)
      const eventId = 1
      const betId = 1
      const creatorWon = false

      await token.connect(account1).approve(betBroker.address, maxAmount)
      await token.connect(owner).transfer(account1.address, amount1)
      await token.connect(account2).approve(betBroker.address, maxAmount)
      await token.connect(owner).transfer(account2.address, amount2)
      await betBroker.connect(account1).createBet(eventId, amount1, amount2)

      await expect(betBroker.connect(owner).distributeGains(betId, creatorWon))
        .to.be.revertedWith('Bet not taken')
      await betBroker.connect(account2).takeBet(betId)

      await expect(betBroker.connect(account1).claimGains(betId))
        .to.be.revertedWith('Result unknown')
      expect(await token.balanceOf(betBroker.address)).to.be.equal(amount1 + amount2)
      expect(await token.balanceOf(account1.address)).to.be.equal(0)

      await expect(betBroker.connect(owner).distributeGains(betId, creatorWon))
        .to.emit(betBroker, 'GainDistributed')
        .withArgs(anyValue, eventId, account1.address, account2.address, amount1, amount2, 2)

      await expect(betBroker.connect(owner).distributeGains(betId, !creatorWon))
        .to.be.revertedWith('Gains already ditributed')

      await expect(betBroker.connect(account1).claimGains(betId))
        .to.be.revertedWith('Not the winner')
      expect(await token.balanceOf(betBroker.address)).to.be.equal(amount1 + amount2)
      expect(await token.balanceOf(account1.address)).to.be.equal(0)
      await betBroker.connect(account2).claimGains(betId)
      await expect(betBroker.connect(account2).claimGains(betId))
        .to.be.revertedWith('Gains already claimed')

      expect(await token.balanceOf(betBroker.address)).to.be.equal(0)
      expect(await token.balanceOf(account1.address)).to.be.equal(0)
      expect(await token.balanceOf(account2.address)).to.be.equal(amount1 + amount2)
    })

    it('Should fail to execute "betExists" functions', async function () {
      const { token, betBroker, owner, account1 } = await loadFixture(deployFixture)
      const betId = 1

      await token.connect(account1).approve(betBroker.address, maxAmount)
      await token.connect(owner).transfer(account1.address, amount1)
      expect(await token.balanceOf(betBroker.address)).to.be.equal(0)
      expect(await token.balanceOf(account1.address)).to.be.equal(amount1)

      await expect(betBroker.connect(account1).takeBet(betId))
        .to.be.revertedWith('Bet does not exist')
      await expect(betBroker.connect(account1).claimGains(betId))
        .to.be.revertedWith('Bet does not exist')
      await expect(betBroker.connect(owner).closeBet(betId))
        .to.be.revertedWith('Bet does not exist')
      await expect(betBroker.connect(owner).distributeGains(betId, true))
        .to.be.revertedWith('Bet does not exist')
    })

    it('Should fail to execute "onlyOwner" functions', async function () {
      const { betBroker, account1 } = await loadFixture(deployFixture)
      const betId = 1

      await expect(betBroker.connect(account1).closeBet(betId))
        .to.be.revertedWith('Ownable: caller is not the owner')
      await expect(betBroker.connect(account1).distributeGains(betId, true))
        .to.be.revertedWith('Ownable: caller is not the owner')
    })
  })

  describe('Viewer', function () {
    it('Should return all bets', async function () {
      const { token, betBroker, owner, account1, account2 } = await loadFixture(deployFixture)
      /// //////////////////
      // bet 1 : created
      // bet 2 : taken
      // bet 3 : closed
      // bet 4 : distributed
      /// //////////////////

      await token.connect(account1).approve(betBroker.address, maxAmount)
      await token.connect(owner).transfer(account1.address, amount1 * 3)
      await token.connect(account2).approve(betBroker.address, maxAmount)
      await token.connect(owner).transfer(account2.address, amount2 * 3)
      await betBroker.connect(account1).createBet(1, amount1, amount2)
      await betBroker.connect(account1).createBet(2, amount1, amount2)
      await betBroker.connect(account2).createBet(3, amount2, amount1)
      await betBroker.connect(account2).createBet(4, amount2, amount1)

      await betBroker.connect(account2).takeBet(2)
      await betBroker.connect(owner).closeBet(3)
      await betBroker.connect(account1).takeBet(4)
      await betBroker.connect(owner).distributeGains(4, true)

      const res = await betBroker.getBets()

      expect(res.length).to.be.equal(4)

      expect(res[0].eventId).to.be.equal(1)
      expect(res[0].creator).to.be.equal(account1.address)
      expect(res[0].taker).to.be.hexEqual('0x0')
      expect(res[0].creatorAmount).to.be.equal(amount1)
      expect(res[0].takerAmount).to.be.equal(amount2)
      expect(res[0].isClosed).to.be.equal(false)
      expect(res[0].result).to.be.equal(0)

      expect(res[1].eventId).to.be.equal(2)
      expect(res[1].creator).to.be.equal(account1.address)
      expect(res[1].taker).to.be.equal(account2.address)
      expect(res[1].creatorAmount).to.be.equal(amount1)
      expect(res[1].takerAmount).to.be.equal(amount2)
      expect(res[1].isClosed).to.be.equal(true)
      expect(res[1].result).to.be.equal(0)

      expect(res[2].eventId).to.be.equal(3)
      expect(res[2].creator).to.be.equal(account2.address)
      expect(res[2].taker).to.be.hexEqual('0x0')
      expect(res[2].creatorAmount).to.be.equal(amount2)
      expect(res[2].takerAmount).to.be.equal(amount1)
      expect(res[2].isClosed).to.be.equal(true)
      expect(res[2].result).to.be.equal(0)

      expect(res[3].eventId).to.be.equal(4)
      expect(res[3].creator).to.be.equal(account2.address)
      expect(res[3].taker).to.be.equal(account1.address)
      expect(res[3].creatorAmount).to.be.equal(amount2)
      expect(res[3].takerAmount).to.be.equal(amount1)
      expect(res[3].isClosed).to.be.equal(true)
      expect(res[3].result).to.be.equal(1)
    })

    it('Should return all bets for a given address', async function () {
      const { token, betBroker, owner, account1, account2 } = await loadFixture(deployFixture)
      /// //////////////////
      // bet 1 : created
      // bet 2 : taken
      // bet 3 : closed
      // bet 4 : distributed
      /// //////////////////

      await token.connect(account1).approve(betBroker.address, maxAmount)
      await token.connect(owner).transfer(account1.address, amount1 * 3)
      await token.connect(account2).approve(betBroker.address, maxAmount)
      await token.connect(owner).transfer(account2.address, amount2 * 3)
      await betBroker.connect(account1).createBet(1, amount1, amount2)
      await betBroker.connect(account1).createBet(2, amount1, amount2)
      await betBroker.connect(account2).createBet(3, amount2, amount1)
      await betBroker.connect(account2).createBet(4, amount2, amount1)

      await betBroker.connect(account2).takeBet(2)
      await betBroker.connect(owner).closeBet(3)
      await betBroker.connect(account1).takeBet(4)
      await betBroker.connect(owner).distributeGains(4, true)

      const res1 = await betBroker.getBetsByAddress(account1.address)
      expect(res1.length).to.be.equal(3)
      expect(res1[0].eventId).to.be.equal(1)
      expect(res1[1].eventId).to.be.equal(2)
      expect(res1[2].eventId).to.be.equal(4)

      const res2 = await betBroker.getBetsByAddress(account2.address)
      expect(res2.length).to.be.equal(3)
      expect(res2[0].eventId).to.be.equal(2)
      expect(res2[1].eventId).to.be.equal(3)
      expect(res2[2].eventId).to.be.equal(4)
    })

    it('Should return all open bets for a given event and address', async function () {
      const { token, betBroker, owner, account1, account2 } = await loadFixture(deployFixture)
      const eventId = 1
      const otherEventId = 23

      await token.connect(account1).approve(betBroker.address, maxAmount)
      await token.connect(owner).transfer(account1.address, amount1 * 3)
      await token.connect(account2).approve(betBroker.address, maxAmount)
      await token.connect(owner).transfer(account2.address, amount2 * 3)

      await betBroker.connect(account1).createBet(eventId, amount1, amount2)
      let res = await betBroker.getOpenBets(eventId, account2.address)
      expect(res.length).to.be.equal(1)

      await betBroker.connect(account2).takeBet(1)
      res = await betBroker.getOpenBets(eventId, account1.address)
      expect(res.length).to.be.equal(0)

      await betBroker.connect(account1).createBet(eventId, amount1, amount2)
      res = await betBroker.getOpenBets(eventId, account2.address)
      expect(res.length).to.be.equal(1)
      await betBroker.connect(owner).closeBet(2)
      res = await betBroker.getOpenBets(eventId, account2.address)
      expect(res.length).to.be.equal(0)

      await betBroker.connect(account2).createBet(eventId, amount2, amount1)
      res = await betBroker.getOpenBets(eventId, account2.address)
      expect(res.length).to.be.equal(0)

      await betBroker.connect(account1).createBet(otherEventId, amount1, amount2)
      res = await betBroker.getOpenBets(eventId, account2.address)
      expect(res.length).to.be.equal(0)
    })
  })
})
