const { ethers, network } = require('hardhat')
const fs = require('fs')

const UPDATE_FRONTEND = process.env.UPDATE_FRONTEND
const CONSTANTS = '../lottery-frontend/constants/'
const ADDRESS_FILE = `${CONSTANTS}/address.json`
const ABI_FILE = `${CONSTANTS}/abi.json`

module.exports = async () => {
  if (UPDATE_FRONTEND) {
    console.log('Entering frontend update')
    await getContractAddress()
    await getAbi()
    console.log('Frontend update finished')
  }
}

const getContractAddress = async () => {
  const lottery = await ethers.getContract('Lottery')
  const contractAddress = JSON.parse(fs.readFileSync(ADDRESS_FILE, 'utf-8'))
  const chainId = network.config.chainId.toString()
  if (chainId in contractAddress) {
    if (!contractAddress[chainId].includes[lottery.address]) {
      contractAddress[chainId].push[lottery.address]
    }
  } else {
    contractAddress[chainId] = [lottery.address]
    fs.writeFileSync(ADDRESS_FILE, JSON.stringify(contractAddress))
  }
}

const getAbi = async () => {
  const lottery = await ethers.getContract('Lottery')
  fs.writeFileSync(
    ABI_FILE,
    lottery.interface.format(ethers.utils.FormatTypes.json)
  )
}

module.exports.tags = ['all', 'frontend']
