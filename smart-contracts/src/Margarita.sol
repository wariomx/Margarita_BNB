// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {IVRFCoordinatorV2Plus} from "@chainlink/contracts/src/v0.8/vrf/dev/interfaces/IVRFCoordinatorV2Plus.sol";
import {VRFConsumerBaseV2Plus} from "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import {VRFV2PlusClient} from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";

contract Margarita is ERC1155, Pausable, VRFConsumerBaseV2Plus {
    using EnumerableSet for EnumerableSet.UintSet;

    uint256 public constant BLANCO = 1;
    uint256 public constant REPOSADO = 2;
    uint256 public constant ANEJO = 3;
    uint256 public constant EXTRA_ANEJO = 4;

    uint256 private constant ROLL_RANGE = 10_000;
    uint256 private constant REPOSADO_FROM = 7_000;
    uint256 private constant ANEJO_FROM = 9_200;
    uint256 private constant EXTRA_ANEJO_FROM = 9_900;

    uint256 private constant MINT_GAS = 150_000;

    uint32 public constant MIN_CALLBACK_GAS = 260_000;
    uint32 public constant MAX_CALLBACK_GAS = 2_500_000;

    string public constant name = "Agave Barrel";
    string public constant symbol = "AGAVE";

    struct Barrel {
        string name;
        string distillery;
        uint256 totalShares;
        string metadataURI;
    }

    Barrel public barrel;
    uint256 public redeemedCount;

    uint256 public extraAnejoIssued;

    uint256 public subscriptionId;
    bytes32 public keyHash;
    uint32 public callbackGasLimit = 300_000;
    uint16 public requestConfirmations = 3;
    bool public vrfNativePayment;

    uint256 public price;

    uint256 public constant PULL_TIMEOUT = 1 hours;

    address public immutable lockedCoordinator;

    mapping(address => uint256) public refundable;

    struct PendingPull {
        address player;
        uint96 paid;
        uint64 requestedAt;
    }

    mapping(uint256 => PendingPull) public pendingPulls;
    mapping(address => EnumerableSet.UintSet) private _pendingOf;

    uint256 public reservedForPending;

    mapping(address => mapping(uint256 => uint256)) public unclaimed;

    uint64[4] public agingTimes;

    struct Aging {
        address owner;
        uint8 tier;
        uint64 readyAt;
    }

    mapping(uint256 => Aging) public agings;
    mapping(address => EnumerableSet.UintSet) private _agingsOf;
    uint256 public nextAgingId = 1;

    event PullRequested(address indexed player, uint256 indexed requestId);
    event PullRevealed(address indexed player, uint256 indexed requestId, uint256 tier, uint256 roll);
    event MintDeferred(address indexed player, uint256 tier);
    event PullRefunded(address indexed player, uint256 indexed requestId, uint256 amount);
    event RefundClaimed(address indexed player, uint256 amount);
    event AgingStarted(address indexed player, uint256 indexed agingId, uint256 tier, uint256 readyAt);
    event AgingFinished(address indexed player, uint256 indexed agingId, uint256 newTier);
    event Redeemed(address indexed player, uint256 indexed redemptionId);
    event PriceUpdated(uint256 price);
    event AgingTimesUpdated(uint64 blanco, uint64 reposado, uint64 anejo);
    event VrfConfigUpdated(
        uint256 subscriptionId, bytes32 keyHash, uint32 callbackGasLimit, uint16 confirmations, bool nativePayment
    );
    event Withdrawn(address indexed to, uint256 amount);

    error WrongPayment(uint256 sent, uint256 expected);
    error InvalidTier(uint256 tier);
    error NotAgingOwner();
    error AgingNotReady(uint256 readyAt);
    error UnknownAging();
    error BarrelEmpty();
    error NothingToClaim();
    error NothingToWithdraw();
    error WithdrawFailed();
    error OnlySelf();
    error ZeroAddressTo();
    error UnknownPull();
    error RefundNotAvailable(uint256 availableAt);
    error RefundFailed();
    error RequestIdInUse(uint256 requestId);
    error CallbackGasOutOfRange(uint32 given);

    constructor(address vrfCoordinator, uint256 _subscriptionId, bytes32 _keyHash, uint256 _price, string memory uri_)
        ERC1155(uri_)
        VRFConsumerBaseV2Plus(vrfCoordinator)
    {
        lockedCoordinator = vrfCoordinator;
        subscriptionId = _subscriptionId;
        keyHash = _keyHash;
        price = _price;

        agingTimes[BLANCO] = 2 minutes;
        agingTimes[REPOSADO] = 5 minutes;
        agingTimes[ANEJO] = 10 minutes;

        barrel = Barrel({
            name: unicode"Margarita Barrel #001 - Extra Añejo Reserva",
            distillery: unicode"Margarita, Jalisco",
            totalShares: 100,
            metadataURI: "ipfs://barrel-001"
        });
    }

    function pull() external payable whenNotPaused returns (uint256 requestId) {
        if (msg.value != price) revert WrongPayment(msg.value, price);
        if (extraAnejoIssued >= barrel.totalShares) revert BarrelEmpty();

        requestId = IVRFCoordinatorV2Plus(lockedCoordinator).requestRandomWords(
            VRFV2PlusClient.RandomWordsRequest({
                keyHash: keyHash,
                subId: subscriptionId,
                requestConfirmations: requestConfirmations,
                callbackGasLimit: callbackGasLimit,
                numWords: 1,
                extraArgs: VRFV2PlusClient._argsToBytes(VRFV2PlusClient.ExtraArgsV1({nativePayment: vrfNativePayment}))
            })
        );

        if (pendingPulls[requestId].player != address(0)) revert RequestIdInUse(requestId);
        pendingPulls[requestId] =
            PendingPull({player: msg.sender, paid: SafeCast.toUint96(msg.value), requestedAt: uint64(block.timestamp)});
        reservedForPending += msg.value;
        _pendingOf[msg.sender].add(requestId);
        emit PullRequested(msg.sender, requestId);
    }

    function fulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) internal override {
        if (msg.sender != lockedCoordinator) return;
        PendingPull memory p = pendingPulls[requestId];
        if (p.player == address(0) || randomWords.length == 0) return;
        delete pendingPulls[requestId];
        _pendingOf[p.player].remove(requestId);
        reservedForPending -= p.paid;

        address player = p.player;
        uint256 roll = uniformIndex(randomWords[0], ROLL_RANGE);
        uint256 tier = rollToTier(roll);
        if (tier == EXTRA_ANEJO) {
            if (extraAnejoIssued < barrel.totalShares) extraAnejoIssued++;
            else tier = ANEJO;
        }

        try this.mintFromVrf{gas: MINT_GAS}(player, tier) {}
        catch {
            unclaimed[player][tier] += 1;
            emit MintDeferred(player, tier);
        }

        emit PullRevealed(player, requestId, tier, roll);
    }

    function mintFromVrf(address player, uint256 tier) external {
        if (msg.sender != address(this)) revert OnlySelf();
        _mint(player, tier, 1, "");
    }

    function claimUnclaimed(uint256 tier) external {
        uint256 amount = unclaimed[msg.sender][tier];
        if (amount == 0) revert NothingToClaim();
        unclaimed[msg.sender][tier] = 0;
        _mint(msg.sender, tier, amount, "");
    }

    function cancelPulls(uint256[] calldata requestIds) external onlyOwner whenPaused {
        for (uint256 i; i < requestIds.length; i++) {
            uint256 requestId = requestIds[i];
            PendingPull memory p = pendingPulls[requestId];
            if (p.player == address(0)) revert UnknownPull();
            uint256 availableAt = uint256(p.requestedAt) + PULL_TIMEOUT;
            if (block.timestamp < availableAt) revert RefundNotAvailable(availableAt);

            delete pendingPulls[requestId];
            _pendingOf[p.player].remove(requestId);
            refundable[p.player] += p.paid;
            emit PullRefunded(p.player, requestId, p.paid);
        }
    }

    function claimRefund() external {
        uint256 amount = refundable[msg.sender];
        if (amount == 0) revert NothingToClaim();
        refundable[msg.sender] = 0;
        reservedForPending -= amount;
        emit RefundClaimed(msg.sender, amount);
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert RefundFailed();
    }

    function uniformIndex(uint256 word, uint256 upperBound) public pure returns (uint256) {
        uint256 threshold = (type(uint256).max - upperBound + 1) % upperBound;
        uint256 nonce;
        while (word < threshold) {
            word = uint256(keccak256(abi.encode(word, nonce++)));
        }
        return word % upperBound;
    }

    function rollToTier(uint256 roll) public pure returns (uint256) {
        if (roll >= EXTRA_ANEJO_FROM) return EXTRA_ANEJO;
        if (roll >= ANEJO_FROM) return ANEJO;
        if (roll >= REPOSADO_FROM) return REPOSADO;
        return BLANCO;
    }

    function agingCost(uint256 tier) public pure returns (uint256) {
        if (tier == BLANCO) return 3;
        if (tier == REPOSADO) return 3;
        if (tier == ANEJO) return 7;
        revert InvalidTier(tier);
    }

    function startAging(uint256 tier) external whenNotPaused returns (uint256 agingId) {
        if (tier < BLANCO || tier > ANEJO) revert InvalidTier(tier);
        if (tier == ANEJO) {
            if (extraAnejoIssued >= barrel.totalShares) revert BarrelEmpty();
            extraAnejoIssued++;
        }

        _burn(msg.sender, tier, agingCost(tier));

        agingId = nextAgingId++;
        uint64 readyAt = uint64(block.timestamp) + agingTimes[tier];
        agings[agingId] = Aging({owner: msg.sender, tier: uint8(tier), readyAt: readyAt});
        _agingsOf[msg.sender].add(agingId);

        emit AgingStarted(msg.sender, agingId, tier, readyAt);
    }

    function finishAging(uint256 agingId) external {
        Aging memory a = agings[agingId];
        if (a.owner == address(0)) revert UnknownAging();
        if (a.owner != msg.sender) revert NotAgingOwner();
        if (block.timestamp < a.readyAt) revert AgingNotReady(a.readyAt);

        delete agings[agingId];
        _agingsOf[msg.sender].remove(agingId);

        uint256 newTier = uint256(a.tier) + 1;
        _mint(msg.sender, newTier, 1, "");

        emit AgingFinished(msg.sender, agingId, newTier);
    }

    function redeem() external whenNotPaused returns (uint256 redemptionId) {
        if (redeemedCount >= barrel.totalShares) revert BarrelEmpty();
        _burn(msg.sender, EXTRA_ANEJO, 1);
        redemptionId = ++redeemedCount;
        emit Redeemed(msg.sender, redemptionId);
    }

    function pendingPullsOf(address player)
        public
        view
        returns (uint256[] memory requestIds, PendingPull[] memory pulls)
    {
        requestIds = _pendingOf[player].values();
        pulls = new PendingPull[](requestIds.length);
        for (uint256 i; i < requestIds.length; i++) {
            pulls[i] = pendingPulls[requestIds[i]];
        }
    }

    function agingsOf(address player) public view returns (uint256[] memory agingIds, Aging[] memory list) {
        agingIds = _agingsOf[player].values();
        list = new Aging[](agingIds.length);
        for (uint256 i; i < agingIds.length; i++) {
            list[i] = agings[agingIds[i]];
        }
    }

    function balancesOf(address player) public view returns (uint256[4] memory b) {
        for (uint256 t = BLANCO; t <= EXTRA_ANEJO; t++) {
            b[t - 1] = balanceOf(player, t);
        }
    }

    function playerState(address player)
        external
        view
        returns (
            uint256[4] memory balances,
            uint256[4] memory unclaimedByTier,
            uint256[] memory pullIds,
            PendingPull[] memory pulls,
            uint256[] memory agingIds,
            Aging[] memory agingList
        )
    {
        balances = balancesOf(player);
        for (uint256 t = BLANCO; t <= EXTRA_ANEJO; t++) {
            unclaimedByTier[t - 1] = unclaimed[player][t];
        }
        (pullIds, pulls) = pendingPullsOf(player);
        (agingIds, agingList) = agingsOf(player);
    }

    function setPrice(uint256 _price) external onlyOwner {
        price = _price;
        emit PriceUpdated(_price);
    }

    function setAgingTimes(uint64 blanco, uint64 reposado, uint64 anejo) external onlyOwner {
        agingTimes[BLANCO] = blanco;
        agingTimes[REPOSADO] = reposado;
        agingTimes[ANEJO] = anejo;
        emit AgingTimesUpdated(blanco, reposado, anejo);
    }

    function setVrfConfig(
        uint256 _subscriptionId,
        bytes32 _keyHash,
        uint32 _callbackGasLimit,
        uint16 _requestConfirmations,
        bool _nativePayment
    ) external onlyOwner {
        if (_callbackGasLimit < MIN_CALLBACK_GAS || _callbackGasLimit > MAX_CALLBACK_GAS) {
            revert CallbackGasOutOfRange(_callbackGasLimit);
        }
        subscriptionId = _subscriptionId;
        keyHash = _keyHash;
        callbackGasLimit = _callbackGasLimit;
        requestConfirmations = _requestConfirmations;
        vrfNativePayment = _nativePayment;
        emit VrfConfigUpdated(_subscriptionId, _keyHash, _callbackGasLimit, _requestConfirmations, _nativePayment);
    }

    function setURI(string calldata uri_) external onlyOwner {
        _setURI(uri_);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function withdraw(address payable to) external onlyOwner {
        if (to == address(0)) revert ZeroAddressTo();
        uint256 amount = address(this).balance - reservedForPending;
        if (amount == 0) revert NothingToWithdraw();
        emit Withdrawn(to, amount);
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert WithdrawFailed();
    }
}
