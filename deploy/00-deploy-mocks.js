const { network } = require('hardhat')
const { developmentChains } = require('../helper-hardhat-config')

const BASE_FEES = ethers.utils.parseEther('0.25')
const GAS_PRICE_LINK = 1e9

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, log } = deployments
  const { deployer } = await getNamedAccounts()
  const args = [BASE_FEES, GAS_PRICE_LINK]

  if (developmentChains.includes(network.name)) {
    log('Local network detected! Deploying mock...')
    await deploy('VRFCoordinatorV2Mock', {
      from: deployer,
      args: args,
      log: true,
    })
    log('Mocks Deployed...')
    log('-------------------------------------------')
  }
}

module.exports.tags = ['all', 'mocks']
