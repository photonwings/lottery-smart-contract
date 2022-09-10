// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import 'hardhat/console.sol';
import '@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol';
import '@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol';
import '@chainlink/contracts/src/v0.8/interfaces/KeeperCompatibleInterface.sol';

// Error code is GAS efficient
error Lottery__NotEnoughETHEntered();
error Lottery__TransferFailed();
error Lottery__NotOpen();
error Lottery__UpKeepNotNeeded(
  uint256 currentBalance,
  uint256 numPlayers,
  uint256 raffelState
);

/** @title Lottery Smart Contract
 *  @author PhotonWings
 *  @notice Untamperable decentralized Lottery winner picking
 *  @dev Chainlink VRF, Chinlink Keepers are used for picking and
 *    automating the picking process
 */
contract Lottery is VRFConsumerBaseV2, KeeperCompatibleInterface {
  /* Type */
  enum LotteryState {
    OPEN,
    CALCULATING
  }

  /* State Vaiables */
  // immutable saves GAS
  uint256 private immutable i_entranceFee;
  // payable address allows to pay the winner
  address payable[] private s_players;
  VRFCoordinatorV2Interface private immutable i_vrfCoordinator;
  // Max gas in wei, you are willing to pay for request
  bytes32 private immutable i_gaseLane;
  // ID of subscrption account used to fund the contract (VRF)
  uint64 private immutable i_subscriptionId;
  // The gas limit for callback request
  uint32 private immutable i_callbackGasLimit;
  // Number of confirmations chainlink should wait before responding
  uint16 private constant REQUEST_CONFIRMATION = 3;
  // Number of random words needed
  uint32 private constant NUM_WORDS = 1;

  /* Lottery */
  // Addres of recent winner
  address private s_recentWinner;
  // Enum to store state of lottery
  LotteryState private s_lotteryState;
  // Stores previous timestamp
  uint256 private s_lastTimeStamp;
  // Time gap between picking a new winner
  uint256 private immutable i_interval;

  /* Events */
  event LotteryEnter(address indexed player);
  event RequestedLotteryWinner(uint256 indexed requestId);
  event WinnerPicked(address indexed winner);

  constructor(
    address vrfCordinatorV2,
    uint256 entranceFee,
    bytes32 gaseLane,
    uint64 subscriptionId,
    uint32 callbackGasLimit,
    uint256 interval
  )
    // Calling constructor of parent contract
    // Address of VRF contract
    VRFConsumerBaseV2(vrfCordinatorV2)
  {
    i_entranceFee = entranceFee;
    i_vrfCoordinator = VRFCoordinatorV2Interface(vrfCordinatorV2);
    i_gaseLane = gaseLane;
    i_subscriptionId = subscriptionId;
    i_callbackGasLimit = callbackGasLimit;
    // Initially setting that lottery is open
    s_lotteryState = LotteryState.OPEN;
    s_lastTimeStamp = block.timestamp;
    i_interval = interval;
  }

  /* Functions */
  /**
   * @dev Function to enter the lottery
   */
  // Public Payable function to recieve ETH from anyone
  function enterLottery() public payable {
    console.log(msg.value);
    // If entered money is less than minimum amount revert the transaction
    if (msg.value < i_entranceFee) {
      // Reverting the transaction with erro message
      revert Lottery__NotEnoughETHEntered();
    }
    // If lottery state is not open and someone try to enter, revert
    if (s_lotteryState != LotteryState.OPEN) {
      revert Lottery__NotOpen();
    }
    // msg.sender is not payable address
    // but s_players is a payable array, so type casting needed
    // sender's payable address is pushed to the array
    s_players.push(payable(msg.sender));
    // After player address entered to the array emmit an event
    // Name of events is reverse of function name
    emit LotteryEnter(msg.sender);
  }

  /**
   * @dev Function that picks the random winner from array
        with the help of random number recieved from chainlink VRF
        and resets some fields
   */
  function fulfillRandomWords(
    uint256, /*requestId*/
    uint256[] memory randomWords
  ) internal override {
    // Computes index of winner from long random number
    uint256 indexOfWinner = randomWords[0] % s_players.length;
    // Address of winner
    address payable recentWinner = s_players[indexOfWinner];
    s_recentWinner = recentWinner;
    // After calculatin the winner, set the state to open
    s_lotteryState = LotteryState.OPEN;
    // Resetting the players array after picking new winner
    s_players = new address payable[](0);
    // Resetting time stamp
    s_lastTimeStamp = block.timestamp;
    // Passing money to the winner
    (bool success, ) = recentWinner.call{value: address(this).balance}('');
    if (!success) {
      revert Lottery__TransferFailed();
    }
    emit WinnerPicked(recentWinner);
  }

  /**
   * @dev Chainlink Keeper nodes call this function
   * to check if upKeepNeeeded or not
   */
  function checkUpkeep(
    bytes memory /* checkData */
  )
    public
    view
    override
    returns (
      bool upkeepNeeded,
      bytes memory /* performData*/
    )
  {
    // All the below bool must be true for upKeeping
    // State should be OPEN
    bool isOpen = (s_lotteryState == LotteryState.OPEN);
    // Time passed should be greater than interval
    bool isTimePassed = ((block.timestamp - s_lastTimeStamp) > i_interval);
    // Atleast one player should be there
    bool hasPlayers = (s_players.length > 0);
    // Balance should be greater than zero
    bool hasBalance = (address(this).balance > 0);
    // Mentioning of type is not needed as it is mentioned in return statement
    upkeepNeeded = (isOpen && isTimePassed && hasPlayers && hasBalance);
    return (upkeepNeeded, '0x');
  }

  /**
   * @dev This function is called automatically if checkUpkeep
   *  returns true
   */
  function performUpkeep(
    bytes calldata /* performData */
  ) external override {
    (bool upkeepNeeded, ) = checkUpkeep('');
    if (!upkeepNeeded) {
      revert Lottery__UpKeepNotNeeded(
        address(this).balance,
        s_players.length,
        uint256(s_lotteryState)
      );
    }
    s_lotteryState = LotteryState.CALCULATING;
    uint256 requestId = i_vrfCoordinator.requestRandomWords(
      i_gaseLane,
      i_subscriptionId,
      REQUEST_CONFIRMATION,
      i_callbackGasLimit,
      NUM_WORDS
    );
    // This is redundent
    emit RequestedLotteryWinner(requestId);
  }

  /* View / Pure functions */
  function getEntranceFee() public view returns (uint256) {
    return i_entranceFee;
  }

  function getPlayer(uint256 index) public view returns (address) {
    return s_players[index];
  }

  function getRecentWinner() public view returns (address) {
    return s_recentWinner;
  }

  function getLotteryState() public view returns (LotteryState) {
    return s_lotteryState;
  }

  // NUM_WORDS not read from storage, so the function can be pure
  function getNumWords() public pure returns (uint256) {
    return NUM_WORDS;
  }

  function getNumberOfPlayers() public view returns (uint256) {
    return s_players.length;
  }

  function getLastTimeStamp() public view returns (uint256) {
    return s_lastTimeStamp;
  }

  function getRequestConfirmations() public pure returns (uint256) {
    return REQUEST_CONFIRMATION;
  }

  function getInterval() public view returns (uint256) {
    return i_interval;
  }
}
