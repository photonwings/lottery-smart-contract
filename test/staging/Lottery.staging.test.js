const { assert, expect } = require('chai')
const { network, getNamedAccounts, deployments, ethers } = require('hardhat')
const { developmentChains } = require('../../helper-hardhat-config')

developmentChains.includes(network.name)
  ? describe.skip
  : describe('Lottery Staging test', () => {
      let lottery, lotteryEntranceFee, deployer

      beforeEach(async () => {
        deployer = (await getNamedAccounts()).deployer
        lottery = await ethers.getContract('Lottery', deployer)
        lotteryEntranceFee = await lottery.getEntranceFee()
      })
      describe('FulfillRandomWords', () => {
        it('Works with chainlink VRF and Keepers', async () => {
          console.log('Setting up test...')
          const startingTimeStamp = await lottery.getLastTimeStamp()
          const accounts = await ethers.getSigners()
          await new Promise(async (resolve, reject) => {
            lottery.once('WinnerPicked', async () => {
              console.log('WinnerPicked event fired!')
              try {
                const recentWinner = await lottery.getRecentWinner()
                const lotteryState = await lottery.getLotteryState()
                const winnerEndingBalance = await accounts[0].getBalance()
                const endingTimeStamp = await lottery.getLastTimeStamp()

                await expect(lottery.getPlayer(0)).to.be.reverted
                assert.equal(recentWinner.toString(), accounts[0].address)
                assert.equal(lotteryState, 0)
                assert.equal(
                  winnerEndingBalance.toString(),
                  winnerStartingBalance.add(lotteryEntranceFee).toString()
                )
                assert(endingTimeStamp > startingTimeStamp)
                resolve()
              } catch (e) {
                console.log(e)
                reject(e)
              }
            })
            console.log('Entering Raffle...')
            const tx = await lottery.enterLottery({ value: lotteryEntranceFee })
            await tx.wait(1)
            console.log('Ok, time to wait...')
            const winnerStartingBalance = await accounts[0].getBalance()
          })
        })
      })
    })
