// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract PrizeVault is ERC1155Holder, EIP712, Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Quote {
        address token;
        uint256 priceUsd;
        uint256 expiry;
        uint256 nonce;
    }

    bytes32 public constant QUOTE_TYPEHASH =
        keccak256("Quote(address token,uint256 priceUsd,uint256 expiry,uint256 nonce)");

    uint8 public constant MIN_TIER = 1;
    uint8 public constant MAX_TIER = 3;

    IERC1155 public immutable game;
    address public signer;

    mapping(uint8 => uint256) public tierUsd;
    mapping(address => bool) public enabled;
    mapping(uint256 => bool) public nonceUsed;

    event Claimed(
        address indexed player,
        uint8 indexed tier,
        uint256 amount,
        address indexed token,
        uint256 priceUsd,
        uint256 payout,
        uint256 nonce
    );
    event SignerSet(address signer);
    event TierUsdSet(uint8 tier, uint256 usd);
    event TokenSet(address token, bool enabled);
    event Withdrawn(address token, address to, uint256 amount);
    event TiersSwept(uint8 tier, address to, uint256 amount);

    error InvalidTier();
    error ZeroAmount();
    error ZeroAddress();
    error TokenDisabled();
    error QuoteExpired();
    error NonceUsed();
    error BadSignature();
    error BadPrice();
    error ZeroPayout();
    error InsufficientVault();
    error BadDecimals();

    constructor(IERC1155 game_, address signer_, address owner_) EIP712("MargaritaPrizeVault", "1") Ownable(owner_) {
        if (address(game_) == address(0) || signer_ == address(0)) revert ZeroAddress();
        game = game_;
        signer = signer_;
        tierUsd[1] = 1e18;
        tierUsd[2] = 5e18;
        tierUsd[3] = 20e18;
        emit SignerSet(signer_);
    }

    function claim(uint8 tier, uint256 amount, Quote calldata q, bytes calldata sig)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 payout)
    {
        if (tier < MIN_TIER || tier > MAX_TIER) revert InvalidTier();
        if (amount == 0) revert ZeroAmount();
        if (!enabled[q.token]) revert TokenDisabled();
        if (block.timestamp > q.expiry) revert QuoteExpired();
        if (q.priceUsd == 0) revert BadPrice();
        if (nonceUsed[q.nonce]) revert NonceUsed();
        if (ECDSA.recover(quoteDigest(q), sig) != signer) revert BadSignature();

        nonceUsed[q.nonce] = true;

        payout = quotePayout(tier, amount, q.priceUsd);
        if (payout == 0) revert ZeroPayout();
        if (IERC20(q.token).balanceOf(address(this)) < payout) revert InsufficientVault();

        game.safeTransferFrom(msg.sender, address(this), tier, amount, "");
        IERC20(q.token).safeTransfer(msg.sender, payout);

        emit Claimed(msg.sender, tier, amount, q.token, q.priceUsd, payout, q.nonce);
    }

    function quotePayout(uint8 tier, uint256 amount, uint256 priceUsd) public view returns (uint256) {
        if (tier < MIN_TIER || tier > MAX_TIER) revert InvalidTier();
        if (priceUsd == 0) revert BadPrice();
        return tierUsd[tier] * amount * 1e18 / priceUsd;
    }

    function quoteDigest(Quote calldata q) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(QUOTE_TYPEHASH, q.token, q.priceUsd, q.expiry, q.nonce)));
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function setSigner(address signer_) external onlyOwner {
        if (signer_ == address(0)) revert ZeroAddress();
        signer = signer_;
        emit SignerSet(signer_);
    }

    function setTierUsd(uint8 tier, uint256 usd) external onlyOwner {
        if (tier < MIN_TIER || tier > MAX_TIER) revert InvalidTier();
        tierUsd[tier] = usd;
        emit TierUsdSet(tier, usd);
    }

    function setToken(address token, bool on) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        if (on && IERC20Metadata(token).decimals() != 18) revert BadDecimals();
        enabled[token] = on;
        emit TokenSet(token, on);
    }

    function withdraw(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner(), amount);
        emit Withdrawn(token, owner(), amount);
    }

    function sweepTiers(uint8 tier, uint256 amount) external onlyOwner {
        game.safeTransferFrom(address(this), owner(), tier, amount, "");
        emit TiersSwept(tier, owner(), amount);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
