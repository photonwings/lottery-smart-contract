const { assert, expect } = require('chai')
const { network, getNamedAccounts, deployments, ethers } = require('hardhat')
const {
  developmentChains,
  networkConfig,
} = require('../../helper-hardhat-config')

!developmentChains.includes(network.name)
  ? describe.skip
  : describe('Raffel unit test', () => {
      const chainId = network.config.chainId
      let lottery, vrfCoordinatorV2Mock, lotteryEntranceFee, deployer, interval

      beforeEach(async () => {
        deployer = (await getNamedAccounts()).deployer
        await deployments.fixture(['all'])
        lottery = await ethers.getContract('Lottery', deployer)
        lotteryEntranceFee = await lottery.getEntranceFee()
        interval = await lottery.getInterval()
        vrfCoordinatorV2Mock = await ethers.getContract(
          'VRFCoordinatorV2Mock',
          deployer
        )
      })

      describe('constructor', () => {
        it('Initializes lottery correnctly', async () => {
          const lotteryState = await lottery.getLotteryState()
          assert.equal(lotteryState.toString(), '0')
          assert.equal(interval.toString(), networkConfig[chainId]['interval'])
        })
      })

      describe('Enter lottery', () => {
        it("Revert when you don't pay enough", async () => {
          await expect(lottery.enterLottery()).to.be.revertedWith(
            'Lottery__NotEnoughETHEntered'
          )
        })
        it('Records player when they enter', async () => {
          await lottery.enterLottery({ value: lotteryEntranceFee })
          const playerFromContract = await lottery.getPlayer(0)
          assert.equal(playerFromContract, deployer)
        })
        it('Emits an event on enter', async () => {
          await expect(
            lottery.enterLottery({ value: lotteryEntranceFee })
          ).to.emit(lottery, 'LotteryEnter')
        })
        it("Dosen't allow to enter when calculating", async () => {
          await lottery.enterLottery({ value: lotteryEntranceFee })
          await network.provider.send('evm_increaseTime', [
            interval.toNumber() + 1,
          ])
          await network.provider.send('evm_mine')
          await lottery.performUpkeep([])
          await expect(
            lottery.enterLottery({ value: lotteryEntranceFee })
          ).to.be.revertedWith('Lottery__NotOpen')
        })
      })
      describe('CheckUpkeep', () => {
        it("Returns false if people haven't sent ETH", async () => {
          await network.provider.send('evm_increaseTime', [
            interval.toNumber() + 1,
          ])
          await network.provider.send('evm_mine')
          const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([])
          assert(!upkeepNeeded)
        })
        it('Returns false if lottery is not open', async () => {
          await lottery.enterLottery({ value: lotteryEntranceFee })
          await network.provider.send('evm_increaseTime', [
            interval.toNumber() + 1,
          ])
          await network.provider.send('evm_mine')
          await lottery.performUpkeep('0x')
          const lotteryState = await lottery.getLotteryState()
          const { upkeepNeeded } = await lottery.callStatic.checkUpkeep('0x')
          assert.equal(lotteryState.toString(), '1')
          assert.equal(upkeepNeeded, false)
        })
        it("returns false if enough time hasn't passed", async () => {
          await lottery.enterLottery({ value: lotteryEntranceFee })
          await network.provider.send('evm_increaseTime', [
            interval.toNumber() - 1,
          ])
          await network.provider.send('evm_mine')
          const { upkeepNeeded } = await lottery.callStatic.checkUpkeep('0x') // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
          assert(!upkeepNeeded)
        })
        it('returns true if enough time has passed, has players, eth, and is open', async () => {
          await lottery.enterLottery({ value: lotteryEntranceFee })
          await network.provider.send('evm_increaseTime', [
            interval.toNumber() + 1,
          ])
          await network.provider.send('evm_mine')
          const { upkeepNeeded } = await lottery.callStatic.checkUpkeep('0x') // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
          assert(upkeepNeeded)
        })
      })
      describe('PerformUpKeep', () => {
        it('It can only run if checkUpkeep is true', async () => {
          await lottery.enterLottery({ value: lotteryEntranceFee })
          await network.provider.send('evm_increaseTime', [
            interval.toNumber() + 1,
          ])
          await network.provider.send('evm_mine')
          const tx = await lottery.performUpkeep('0x')
          assert(tx)
        })
        it('Reverts when checkUpkeep is false', async () => {
          await expect(lottery.performUpkeep([])).to.be.revertedWith(
            'Lottery__UpKeepNotNeeded'
          )
        })
        it('Updates the lottery state, emits and event and calls the vrf coordinator ', async () => {
          await lottery.enterLottery({ value: lotteryEntranceFee })
          await network.provider.send('evm_increaseTime', [
            interval.toNumber() + 1,
          ])
          await network.provider.send('evm_mine')
          const txResponse = await lottery.performUpkeep([])
          const txReceipt = await txResponse.wait(1)
          const requestId = txReceipt.events[1].args.requestId
          const lotteryState = await lottery.getLotteryState()
          assert(requestId.toNumber() > 0)
          assert(lotteryState.toString() === '1')
        })
      })
      describe('FulfillRandomWords', () => {
        beforeEach(async () => {
          await lottery.enterLottery({ value: lotteryEntranceFee })
          await network.provider.send('evm_increaseTime', [
            interval.toNumber() + 1,
          ])
          await network.provider.send('evm_mine')
        })
        it('Can only be called after performUpkeep', async () => {
          await expect(
            vrfCoordinatorV2Mock.fulfillRandomWords(0, lottery.address)
          ).to.be.revertedWith('nonexistent request')
          await expect(
            vrfCoordinatorV2Mock.fulfillRandomWords(1, lottery.address)
          ).to.be.revertedWith('nonexistent request')
        })
        it('Picks a winnery, reset the lottery, and sends the money', async () => {
          const additionalPeople = 3
          const startingAccountIndex = 1
          const accounts = await ethers.getSigners()
          for (
            let i = startingAccountIndex;
            i < startingAccountIndex + additionalPeople;
            i++
          ) {
            const accountsConnected = lottery.connect(accounts[i])
            await accountsConnected.enterLottery({ value: lotteryEntranceFee })
          }

          const startingTimeStamp = await lottery.getLastTimeStamp()

          await new Promise(async (resolve, reject) => {
            lottery.once('WinnerPicked', async () => {
              console.log('WinnerPicked event fired!')

              try {
                const recentWinner = await lottery.getRecentWinner()
                const lotteryState = await lottery.getLotteryState()
                const winnerBalance = await accounts[1].getBalance()
                const endingTimeStamp = await lottery.getLastTimeStamp()
                const numberOfPlayers = await lottery.getNumberOfPlayers()

                assert.equal(lotteryState, 0)
                assert.equal(numberOfPlayers.toString(), '0')
                assert(endingTimeStamp > startingTimeStamp)
                await expect(lottery.getPlayer(0)).to.be.reverted
                assert.equal(recentWinner.toString(), accounts[1].address)
                assert.equal(
                  winnerBalance.toString(),
                  startingBalance
                    .add(
                      lotteryEntranceFee
                        .mul(additionalPeople)
                        .add(lotteryEntranceFee)
                    )
                    .toString()
                )
                resolve()
              } catch (e) {
                reject(e)
              }
            })

            const tx = await lottery.performUpkeep([])
            const txReceipt = await tx.wait(1)
            const startingBalance = await accounts[1].getBalance()
            await vrfCoordinatorV2Mock.fulfillRandomWords(
              txReceipt.events[1].args.requestId,
              lottery.address
            )
          })
        })
      })
    })
