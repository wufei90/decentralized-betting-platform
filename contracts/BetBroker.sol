// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4 <0.9.0;

/*
 ________     ___    ___ ________  ________          ________  _________  ___  ___  ________  ___  ________     
|\   __  \   |\  \  /  /|\   __  \|\_____  \        |\   ____\|\___   ___\\  \|\  \|\   ___ \|\  \|\   __  \    
\ \  \|\  \  \ \  \/  / | \  \|\  \|____|\ /_       \ \  \___|\|___ \  \_\ \  \\\  \ \  \_|\ \ \  \ \  \|\  \   
 \ \   __  \  \ \    / / \ \   ____\    \|\  \       \ \_____  \   \ \  \ \ \  \\\  \ \  \ \\ \ \  \ \  \\\  \  
  \ \  \ \  \  /     \/   \ \  \___|   __\_\  \       \|____|\  \   \ \  \ \ \  \\\  \ \  \_\\ \ \  \ \  \\\  \ 
   \ \__\ \__\/  /\   \    \ \__\     |\_______\        ____\_\  \   \ \__\ \ \_______\ \_______\ \__\ \_______\
    \|__|\|__/__/ /\ __\    \|__|     \|_______|       |\_________\   \|__|  \|_______|\|_______|\|__|\|_______|
             |__|/ \|__|                               \|_________|                                             

*/

import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract BetBroker is ReentrancyGuard, Ownable {
    using Counters for Counters.Counter;
    using SafeMath for uint256;

    Counters.Counter private _betIds;
    IERC20 public immutable _token;

    struct Bet {
        uint256 betId;
        uint256 eventId;
        uint256 creatorAmount;
        uint256 takerAmount;
        bool isClosed;
        bool isClaimed;
        address creator;
        address taker;
        uint8 result;
    }

    mapping(uint256 => Bet) internal bets;

    constructor(address token) {
        _token = IERC20(token);
    }

    // ============ EVENTS ============

    event BetCreated(
        uint256 indexed betId,
        uint256 indexed eventId,
        address creator,
        uint256 creatorAmount,
        uint256 takerAmount
    );

    event BetTaken(
        uint256 indexed betId,
        uint256 indexed eventId,
        address creator,
        address taker,
        uint256 creatorAmount,
        uint256 takerAmount
    );

    event BetClosed(
        uint256 indexed betId,
        uint256 indexed eventId,
        address creator,
        uint256 creatorAmount
    );

    event GainDistributed(
        uint256 indexed betId,
        uint256 indexed eventId,
        address creator,
        address taker,
        uint256 creatorAmount,
        uint256 takerAmount,
        uint8 result
    );

    // ============ MODIFIERS ============

    modifier canBet(uint256 amount) {
        require(_token.balanceOf(msg.sender) >= amount, "Non-sufficient funds");
        require(
            _token.allowance(msg.sender, address(this)) >= amount,
            "Non-sufficient allowed tokens"
        );
        _;
    }

    modifier betExists(uint256 betId) {
        require(betId == bets[betId].betId, "Bet does not exist");
        _;
    }

    // ============ BETTING FUNCTIONS ============

    function createBet(
        uint256 eventId,
        uint256 creatorAmount,
        uint256 takerAmount
    ) public nonReentrant canBet(creatorAmount) {
        require(
            creatorAmount > 0 && takerAmount > 0,
            "Bet size cannot be zero"
        );
        _token.transferFrom(msg.sender, address(this), creatorAmount);
        _betIds.increment();
        uint256 betId = _betIds.current();
        bets[betId] = Bet(
            betId,
            eventId,
            creatorAmount,
            takerAmount,
            false,
            false,
            msg.sender,
            address(0),
            0
        );

        emit BetCreated(betId, eventId, msg.sender, creatorAmount, takerAmount);
    }

    function takeBet(uint256 betId)
        external
        nonReentrant
        canBet(bets[betId].takerAmount)
        betExists(betId)
    {
        require(!bets[betId].isClosed, "Bet is closed");
        uint256 amount = bets[betId].takerAmount;
        _token.transferFrom(msg.sender, address(this), amount);
        bets[betId].taker = msg.sender;
        bets[betId].isClosed = true;

        emit BetTaken(
            betId,
            bets[betId].eventId,
            bets[betId].creator,
            msg.sender,
            bets[betId].creatorAmount,
            amount
        );
    }

    function closeBet(uint256 betId) external onlyOwner betExists(betId) {
        require(bets[betId].taker == address(0), "Bet has been taken");
        bets[betId].isClosed = true;
        bets[betId].result = 0;

        emit BetClosed(
            betId,
            bets[betId].eventId,
            bets[betId].creator,
            bets[betId].creatorAmount
        );
    }

    function distributeGains(uint256 betId, bool creatorWon)
        external
        onlyOwner
        betExists(betId)
    {
        address taker = bets[betId].taker;
        require(taker != address(0), "Bet not taken");
        require(bets[betId].result == 0, "Gains already ditributed");
        if (creatorWon) {
            bets[betId].result = 1;
        } else {
            bets[betId].result = 2;
        }

        emit GainDistributed(
            betId,
            bets[betId].eventId,
            bets[betId].creator,
            taker,
            bets[betId].creatorAmount,
            bets[betId].takerAmount,
            bets[betId].result
        );
    }

    function claimGains(uint256 betId) external nonReentrant betExists(betId) {
        require(bets[betId].result != 0, "Result unknown");
        require(!bets[betId].isClaimed, "Gains already claimed");
        if (bets[betId].result == 1) {
            require(msg.sender == bets[betId].creator, "Not the winner");
        } else {
            require(msg.sender == bets[betId].taker, "Not the winner");
        }
        bets[betId].isClaimed = true;
        _token.transfer(
            msg.sender,
            bets[betId].takerAmount.add(bets[betId].creatorAmount)
        );
    }

    // ============ PUBLIC READ-ONLY ============

    function getBets() external view returns (Bet[] memory) {
        uint256 totalCount = _betIds.current();
        Bet[] memory _result = new Bet[](totalCount);
        for (uint256 i = 0; i < totalCount; i++) {
            _result[i] = bets[i + 1];
        }
        return _result;
    }

    function getOpenBets(uint256 eventId, address addr)
        external
        view
        returns (Bet[] memory)
    {
        uint256 totalCount = _betIds.current();
        uint256 count = 0;
        uint256 index = 0;

        for (uint256 i = 0; i < totalCount; i++) {
            if (
                !bets[i + 1].isClosed &&
                bets[i + 1].eventId == eventId &&
                bets[i + 1].creator != addr
            ) {
                ++count;
            }
        }

        Bet[] memory _result = new Bet[](count);
        for (uint256 i = 0; i < totalCount; i++) {
            if (
                !bets[i + 1].isClosed &&
                bets[i + 1].eventId == eventId &&
                bets[i + 1].creator != addr
            ) {
                _result[index] = bets[i + 1];
                ++index;
            }
        }

        return _result;
    }

    function getBetsByAddress(address addr)
        external
        view
        returns (Bet[] memory)
    {
        uint256 totalCount = _betIds.current();
        uint256 count = 0;
        uint256 index = 0;

        for (uint256 i = 0; i < totalCount; i++) {
            if (bets[i + 1].creator == addr || bets[i + 1].taker == addr) {
                ++count;
            }
        }

        Bet[] memory _result = new Bet[](count);
        for (uint256 i = 0; i < totalCount; i++) {
            if (bets[i + 1].creator == addr || bets[i + 1].taker == addr) {
                _result[index] = bets[i + 1];
                ++index;
            }
        }

        return _result;
    }
}
