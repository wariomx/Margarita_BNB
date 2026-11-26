// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {Margarita} from "../src/Margarita.sol";
import {PrizeVault} from "../src/PrizeVault.sol";
import {MockStock} from "../src/MockStock.sol";
import {VRFCoordinatorV2_5Mock} from "@chainlink/contracts/src/v0.8/vrf/mocks/VRFCoordinatorV2_5Mock.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract SixDecimals is ERC20 {
    constructor() ERC20("Six", "SIX") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}

contract PrizeVaultTest is Test {
    Margarita game;
    VRFCoordinatorV2_5Mock vrf;
    PrizeVault vault;
    MockStock nvda;
    MockStock cake;

    uint256 constant PRICE = 0.001 ether;
    uint256 constant WORD_OFFSET = 10_000;

    address owner = makeAddr("owner");
    address alice = makeAddr("alice");
    address signer;
    uint256 signerKey;
    uint256 nextNonce = 1;

    function setUp() public {
        (signer, signerKey) = makeAddrAndKey("quote-signer");

        vrf = new VRFCoordinatorV2_5Mock(0.1 ether, 1e9, 4e15);
        uint256 subId = vrf.createSubscription();
        vrf.fundSubscription(subId, 100_000 ether);
        game = new Margarita(address(vrf), subId, keccak256("k"), PRICE, "ipfs://x/{id}.json");
        vrf.addConsumer(subId, address(game));

        vault = new PrizeVault(IERC1155(address(game)), signer, owner);
        nvda = new MockStock("NVDAx", owner);
        cake = new MockStock("CAKE", owner);

        vm.startPrank(owner);
        vault.setToken(address(nvda), true);
        nvda.mint(address(vault), 1_000_000e18);
        cake.mint(address(vault), 1_000_000e18);
        vm.stopPrank();

        vm.deal(alice, 10 ether);
        vm.prank(alice);
        game.setApprovalForAll(address(vault), true);
    }

    function _give(address player, uint256 tier, uint256 n) internal {
        uint256 roll = tier == 1 ? 0 : tier == 2 ? 7000 : tier == 3 ? 9200 : 9900;
        for (uint256 i; i < n; i++) {
            vm.prank(player);
            uint256 id = game.pull{value: PRICE}();
            uint256[] memory words = new uint256[](1);
            words[0] = roll + WORD_OFFSET;
            vrf.fulfillRandomWordsWithOverride(id, address(game), words);
        }
    }

    function _quote(address token, uint256 priceUsd) internal returns (PrizeVault.Quote memory q) {
        q = PrizeVault.Quote(token, priceUsd, block.timestamp + 60, nextNonce++);
    }

    function _sign(PrizeVault.Quote memory q, uint256 key) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, vault.quoteDigest(q));
        return abi.encodePacked(r, s, v);
    }

    function test_Defaults() public view {
        assertEq(vault.tierUsd(1), 1e18);
        assertEq(vault.tierUsd(2), 5e18);
        assertEq(vault.tierUsd(3), 20e18);
        assertEq(vault.tierUsd(4), 0);
        assertEq(vault.signer(), signer);
        assertEq(vault.owner(), owner);
        assertEq(address(vault.game()), address(game));
        assertEq(nvda.name(), "Margarita Test NVDAx");
        assertEq(nvda.symbol(), "mNVDAx");
        assertEq(nvda.decimals(), 18);
    }

    function test_ClaimPays() public {
        _give(alice, 3, 2);
        PrizeVault.Quote memory q = _quote(address(nvda), 150e18);
        bytes memory sig = _sign(q, signerKey);
        vm.expectEmit(address(vault));
        emit PrizeVault.Claimed(alice, 3, 2, address(nvda), 150e18, uint256(40e18) * 1e18 / 150e18, q.nonce);
        vm.prank(alice);
        uint256 payout = vault.claim(3, 2, q, sig);
        assertEq(payout, uint256(40e18) * 1e18 / 150e18);
        assertEq(nvda.balanceOf(alice), payout);
        assertEq(game.balanceOf(alice, 3), 0);
        assertEq(game.balanceOf(address(vault), 3), 2);
        assertTrue(vault.nonceUsed(q.nonce));
    }

    function test_PayoutMath() public view {
        assertEq(vault.quotePayout(1, 1, 1e18), 1e18);
        assertEq(vault.quotePayout(1, 1, 2e18), 0.5e18);
        assertEq(vault.quotePayout(2, 3, 250e18), 0.06e18);
        assertEq(vault.quotePayout(3, 1, 0.5e18), 40e18);
        assertEq(vault.quotePayout(3, 10, 3e18), uint256(200e18) * 1e18 / 3e18);
    }

    function test_RevertExpired() public {
        _give(alice, 1, 1);
        PrizeVault.Quote memory q = _quote(address(nvda), 1e18);
        bytes memory sig = _sign(q, signerKey);
        vm.warp(q.expiry + 1);
        vm.prank(alice);
        vm.expectRevert(PrizeVault.QuoteExpired.selector);
        vault.claim(1, 1, q, sig);
    }

    function test_ClaimAtExpiryWorks() public {
        _give(alice, 1, 1);
        PrizeVault.Quote memory q = _quote(address(nvda), 1e18);
        bytes memory sig = _sign(q, signerKey);
        vm.warp(q.expiry);
        vm.prank(alice);
        vault.claim(1, 1, q, sig);
    }

    function test_RevertReplay() public {
        _give(alice, 1, 2);
        PrizeVault.Quote memory q = _quote(address(nvda), 1e18);
        bytes memory sig = _sign(q, signerKey);
        vm.startPrank(alice);
        vault.claim(1, 1, q, sig);
        vm.expectRevert(PrizeVault.NonceUsed.selector);
        vault.claim(1, 1, q, sig);
        vm.stopPrank();
    }

    function test_RevertWrongSigner() public {
        _give(alice, 1, 1);
        PrizeVault.Quote memory q = _quote(address(nvda), 1e18);
        (, uint256 badKey) = makeAddrAndKey("attacker");
        bytes memory sig = _sign(q, badKey);
        vm.prank(alice);
        vm.expectRevert(PrizeVault.BadSignature.selector);
        vault.claim(1, 1, q, sig);
    }

    function test_RevertTamperedPrice() public {
        _give(alice, 1, 1);
        PrizeVault.Quote memory q = _quote(address(nvda), 100e18);
        bytes memory sig = _sign(q, signerKey);
        q.priceUsd = 1e18;
        vm.prank(alice);
        vm.expectRevert(PrizeVault.BadSignature.selector);
        vault.claim(1, 1, q, sig);
    }

    function test_RevertDisabledToken() public {
        _give(alice, 1, 1);
        PrizeVault.Quote memory q = _quote(address(cake), 1e18);
        bytes memory sig = _sign(q, signerKey);
        vm.prank(alice);
        vm.expectRevert(PrizeVault.TokenDisabled.selector);
        vault.claim(1, 1, q, sig);
    }

    function test_RevertTier4AndTier0() public {
        _give(alice, 4, 1);
        PrizeVault.Quote memory q = _quote(address(nvda), 1e18);
        bytes memory sig = _sign(q, signerKey);
        vm.startPrank(alice);
        vm.expectRevert(PrizeVault.InvalidTier.selector);
        vault.claim(4, 1, q, sig);
        vm.expectRevert(PrizeVault.InvalidTier.selector);
        vault.claim(0, 1, q, sig);
        vm.stopPrank();
        assertEq(game.balanceOf(alice, 4), 1);
    }

    function test_RevertZeroAmountAndZeroPrice() public {
        _give(alice, 1, 1);
        PrizeVault.Quote memory q = _quote(address(nvda), 1e18);
        bytes memory sig = _sign(q, signerKey);
        vm.prank(alice);
        vm.expectRevert(PrizeVault.ZeroAmount.selector);
        vault.claim(1, 0, q, sig);

        PrizeVault.Quote memory z = _quote(address(nvda), 0);
        bytes memory zsig = _sign(z, signerKey);
        vm.prank(alice);
        vm.expectRevert(PrizeVault.BadPrice.selector);
        vault.claim(1, 1, z, zsig);
    }

    function test_RevertUnderfunded() public {
        _give(alice, 3, 1);
        PrizeVault.Quote memory q = _quote(address(nvda), 1e12);
        bytes memory sig = _sign(q, signerKey);
        vm.prank(alice);
        vm.expectRevert(PrizeVault.InsufficientVault.selector);
        vault.claim(3, 1, q, sig);
        assertEq(game.balanceOf(alice, 3), 1);
        assertFalse(vault.nonceUsed(q.nonce));
    }

    function test_RevertWithoutTierTokens() public {
        PrizeVault.Quote memory q = _quote(address(nvda), 1e18);
        bytes memory sig = _sign(q, signerKey);
        vm.prank(alice);
        vm.expectRevert();
        vault.claim(1, 1, q, sig);
    }

    function test_RevertWithoutApproval() public {
        _give(alice, 1, 1);
        vm.prank(alice);
        game.setApprovalForAll(address(vault), false);
        PrizeVault.Quote memory q = _quote(address(nvda), 1e18);
        bytes memory sig = _sign(q, signerKey);
        vm.prank(alice);
        vm.expectRevert();
        vault.claim(1, 1, q, sig);
    }

    function test_PauseBlocks() public {
        _give(alice, 1, 1);
        PrizeVault.Quote memory q = _quote(address(nvda), 1e18);
        bytes memory sig = _sign(q, signerKey);
        vm.prank(owner);
        vault.pause();
        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.claim(1, 1, q, sig);
        vm.prank(owner);
        vault.unpause();
        vm.prank(alice);
        vault.claim(1, 1, q, sig);
    }

    function test_OnlyOwner() public {
        bytes memory err = abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice);
        vm.startPrank(alice);
        vm.expectRevert(err);
        vault.setSigner(alice);
        vm.expectRevert(err);
        vault.setTierUsd(1, 2e18);
        vm.expectRevert(err);
        vault.setToken(address(cake), true);
        vm.expectRevert(err);
        vault.withdraw(address(nvda), 1);
        vm.expectRevert(err);
        vault.sweepTiers(1, 1);
        vm.expectRevert(err);
        vault.pause();
        vm.expectRevert(err);
        nvda.mint(alice, 1);
        vm.stopPrank();
    }

    function test_OwnerAdmin() public {
        SixDecimals six = new SixDecimals();
        vm.startPrank(owner);
        vault.setTierUsd(2, 7e18);
        assertEq(vault.tierUsd(2), 7e18);
        vm.expectRevert(PrizeVault.InvalidTier.selector);
        vault.setTierUsd(4, 1e18);
        vault.setToken(address(nvda), false);
        assertFalse(vault.enabled(address(nvda)));
        vm.expectRevert(PrizeVault.BadDecimals.selector);
        vault.setToken(address(six), true);
        vault.withdraw(address(nvda), 10e18);
        assertEq(nvda.balanceOf(owner), 10e18);
        vm.stopPrank();
    }

    function test_SetSignerRotates() public {
        _give(alice, 1, 1);
        (address newSigner, uint256 newKey) = makeAddrAndKey("new-signer");
        vm.prank(owner);
        vault.setSigner(newSigner);
        PrizeVault.Quote memory q = _quote(address(nvda), 1e18);
        bytes memory oldSig = _sign(q, signerKey);
        vm.prank(alice);
        vm.expectRevert(PrizeVault.BadSignature.selector);
        vault.claim(1, 1, q, oldSig);
        bytes memory newSig = _sign(q, newKey);
        vm.prank(alice);
        vault.claim(1, 1, q, newSig);
    }

    function test_SweepTiers() public {
        _give(alice, 2, 3);
        PrizeVault.Quote memory q = _quote(address(nvda), 1e18);
        bytes memory sig = _sign(q, signerKey);
        vm.prank(alice);
        vault.claim(2, 3, q, sig);
        vm.prank(owner);
        vault.sweepTiers(2, 3);
        assertEq(game.balanceOf(owner, 2), 3);
    }

    function test_OwnershipTwoStep() public {
        vm.prank(owner);
        vault.transferOwnership(alice);
        assertEq(vault.owner(), owner);
        vm.prank(alice);
        vault.acceptOwnership();
        assertEq(vault.owner(), alice);
    }

    function test_TypehashString() public view {
        assertEq(
            vault.QUOTE_TYPEHASH(), keccak256("Quote(address token,uint256 priceUsd,uint256 expiry,uint256 nonce)")
        );
    }

    function test_Eip712Vector() public {
        vm.chainId(97);
        address vaultAddr = 0x1111111111111111111111111111111111111111;
        deployCodeTo("PrizeVault.sol:PrizeVault", abi.encode(address(game), signer, owner), vaultAddr);
        PrizeVault v = PrizeVault(vaultAddr);
        PrizeVault.Quote memory q =
            PrizeVault.Quote(0x2222222222222222222222222222222222222222, 123.45e18, 1_800_000_000, 42);

        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("MargaritaPrizeVault"),
                keccak256("1"),
                uint256(97),
                vaultAddr
            )
        );
        bytes32 structHash = keccak256(abi.encode(v.QUOTE_TYPEHASH(), q.token, q.priceUsd, q.expiry, q.nonce));
        bytes32 expected = keccak256(abi.encodePacked("\x19\x01", domain, structHash));
        assertEq(v.domainSeparator(), domain);
        assertEq(v.quoteDigest(q), expected);

        uint256 key = 0xA11CE;
        (uint8 sv, bytes32 r, bytes32 s) = vm.sign(key, expected);
        console.log("signerAddr", vm.addr(key));
        console.logBytes32(domain);
        console.logBytes32(structHash);
        console.logBytes32(expected);
        console.logBytes(abi.encodePacked(r, s, sv));
    }
}
