const { network, ethers } = require('hardhat')
const { developmentChains, networkConfig } = require('../helper-hardhat-config')
const { verify } = require('../util/verify')

const VRF_FUND = ethers.utils.parseEther('2')

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, log } = deployments
  const { deployer } = await getNamedAccounts()
  const chainId = network.config.chainId
  const gasLane = networkConfig[chainId]['gasLane']
  const entranceFee = networkConfig[chainId]['entranceFee']
  const callbackGasLimit = networkConfig[chainId]['callbackGasLimit']
  const interval = networkConfig[chainId]['interval']
  let vrfCordinatorV2Address, subscriptionId
  if (developmentChains.includes(network.name)) {
    const vrfCordinatorV2Mock = await ethers.getContract('VRFCoordinatorV2Mock')
    vrfCordinatorV2Address = vrfCordinatorV2Mock.address
    const transactionResponse = await vrfCordinatorV2Mock.createSubscription()
    const transactionReceipt = await transactionResponse.wait(1)
    subscriptionId = transactionReceipt.events[0].args.subId
    await vrfCordinatorV2Mock.fundSubscription(subscriptionId, VRF_FUND)
  } else {
    vrfCordinatorV2Address = networkConfig[chainId]['vrfCoordinator']
    subscriptionId = networkConfig[chainId]['subscriptionId']
  }

  const args = [
    vrfCordinatorV2Address,
    entranceFee,
    gasLane,
    subscriptionId,
    callbackGasLimit,
    interval,
  ]
  const lottery = await deploy('Lottery', {
    from: deployer,
    args: args,
    log: true,
    waitConfirmation: network.config.blockConfirmations,
  })

  if (!developmentChains.includes(network.name)) {
    await verify(lottery.address, args)
  }
  log('----------------------------------------------------')
}

module.exports.tags = ['all', 'lottery']
