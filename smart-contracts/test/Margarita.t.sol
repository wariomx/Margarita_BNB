// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Margarita} from "../src/Margarita.sol";
import {VRFCoordinatorV2_5Mock} from "@chainlink/contracts/src/v0.8/vrf/mocks/VRFCoordinatorV2_5Mock.sol";
import {VRFConsumerBaseV2Plus} from "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";

contract RejectingPlayer {
    function pull(Margarita game) external payable returns (uint256) {
        return game.pull{value: msg.value}();
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        revert("no thanks");
    }
}

contract GasBurner {
    uint256 public sink;

    function pull(Margarita game) external payable returns (uint256) {
        return game.pull{value: msg.value}();
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external returns (bytes4) {
        while (true) {
            sink++;
        }
        return this.onERC1155Received.selector;
    }
}

contract MargaritaTest is Test {
    Margarita game;
    VRFCoordinatorV2_5Mock vrf;
    uint256 subId;

    uint256 constant PRICE = 0.001 ether;
    uint256 constant WORD_OFFSET = 10_000;
    bytes32 constant KEY_HASH = keccak256("test-key-hash");

    address owner = address(this);
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public {
        vrf = new VRFCoordinatorV2_5Mock(0.1 ether, 1e9, 4e15);
        subId = vrf.createSubscription();
        vrf.fundSubscription(subId, 100_000 ether);

        game = new Margarita(address(vrf), subId, KEY_HASH, PRICE, "ipfs://agave/{id}.json");
        vrf.addConsumer(subId, address(game));

        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
    }

    function _pullAs(address player) internal returns (uint256 requestId) {
        vm.prank(player);
        requestId = game.pull{value: PRICE}();
    }

    function _fulfill(uint256 requestId, uint256 word) internal {
        uint256[] memory words = new uint256[](1);
        words[0] = word;
        vrf.fulfillRandomWordsWithOverride(requestId, address(game), words);
    }

    function _giveTier(address player, uint256 tier) internal {
        uint256 roll = tier == 1 ? 0 : tier == 2 ? 7000 : tier == 3 ? 9200 : 9900;
        _fulfill(_pullAs(player), roll + WORD_OFFSET);
        assertEq(game.balanceOf(player, tier), 1);
    }

    function _giveTierN(address player, uint256 tier, uint256 n) internal {
        uint256 roll = tier == 1 ? 0 : tier == 2 ? 7000 : tier == 3 ? 9200 : 9900;
        uint256 before = game.balanceOf(player, tier);
        for (uint256 i; i < n; i++) {
            _fulfill(_pullAs(player), roll + WORD_OFFSET);
        }
        assertEq(game.balanceOf(player, tier), before + n);
    }

    function _cancel(uint256 id) internal {
        uint256[] memory ids = new uint256[](1);
        ids[0] = id;
        game.cancelPulls(ids);
    }

    function test_TierBoundaries() public view {
        assertEq(game.rollToTier(0), 1);
        assertEq(game.rollToTier(6999), 1);
        assertEq(game.rollToTier(7000), 2);
        assertEq(game.rollToTier(9199), 2);
        assertEq(game.rollToTier(9200), 3);
        assertEq(game.rollToTier(9899), 3);
        assertEq(game.rollToTier(9900), 4);
        assertEq(game.rollToTier(9999), 4);
    }

    function test_PullEndToEnd_MintsRolledTier() public {
        uint256 id = _pullAs(alice);
        (address player,,) = game.pendingPulls(id);
        assertEq(player, alice);

        vm.expectEmit(true, true, false, true, address(game));
        emit Margarita.PullRevealed(alice, id, 4, 9900);
        _fulfill(id, 19_900);

        assertEq(game.balanceOf(alice, 4), 1);
        (address after_,,) = game.pendingPulls(id);
        assertEq(after_, address(0));
    }

    function testFuzz_PullAlwaysMintsMatchingTier(uint256 word) public {
        uint256 tier = game.rollToTier(game.uniformIndex(word, 10_000));
        _fulfill(_pullAs(alice), word);
        assertEq(game.balanceOf(alice, tier), 1);
    }

    function test_PullWithoutEnoughBnbReverts() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Margarita.WrongPayment.selector, PRICE - 1, PRICE));
        game.pull{value: PRICE - 1}();
    }

    function test_PullWithZeroBnbReverts() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Margarita.WrongPayment.selector, 0, PRICE));
        game.pull();
    }

    function test_PullCollectsPrice() public {
        _pullAs(alice);
        assertEq(address(game).balance, PRICE);
    }

    function test_PullRevertsWhenPaused() public {
        game.pause();
        vm.prank(alice);
        vm.expectRevert();
        game.pull{value: PRICE}();
    }

    function test_OnlyCoordinatorCanFulfill() public {
        uint256 id = _pullAs(alice);
        uint256[] memory words = new uint256[](1);
        words[0] = 19_900;

        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(VRFConsumerBaseV2Plus.OnlyCoordinatorCanFulfill.selector, bob, address(vrf))
        );
        game.rawFulfillRandomWords(id, words);
    }

    function test_MintFromVrfOnlySelf() public {
        vm.prank(alice);
        vm.expectRevert(Margarita.OnlySelf.selector);
        game.mintFromVrf(alice, 4);
    }

    function test_SameRequestCannotMintTwice() public {
        uint256 id = _pullAs(alice);
        _fulfill(id, WORD_OFFSET);
        vm.expectRevert();
        _fulfill(id, WORD_OFFSET);
        assertEq(game.balanceOf(alice, 1), 1);
    }

    function test_CallbackDoesNotRevertForRejectingContract() public {
        RejectingPlayer p = new RejectingPlayer();
        uint256 id = p.pull{value: PRICE}(game);

        _fulfill(id, 19_900);

        assertEq(game.balanceOf(address(p), 4), 0);
        assertEq(game.unclaimed(address(p), 4), 1);
        (address after_,,) = game.pendingPulls(id);
        assertEq(after_, address(0));
    }

    function test_ClaimUnclaimedRevertsWhenNothing() public {
        vm.prank(alice);
        vm.expectRevert(Margarita.NothingToClaim.selector);
        game.claimUnclaimed(1);
    }

    function test_FinishAgingTooEarlyReverts() public {
        _giveTierN(alice, 1, 3);
        vm.prank(alice);
        uint256 agingId = game.startAging(1);
        assertEq(game.balanceOf(alice, 1), 0, "token taken");

        vm.warp(block.timestamp + 2 minutes - 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Margarita.AgingNotReady.selector, block.timestamp + 1));
        game.finishAging(agingId);
    }

    function test_FinishAgingOnTimeMintsNextTier() public {
        _giveTierN(alice, 1, 3);
        vm.prank(alice);
        uint256 agingId = game.startAging(1);

        vm.warp(block.timestamp + 2 minutes);
        vm.prank(alice);
        game.finishAging(agingId);

        assertEq(game.balanceOf(alice, 2), 1);
        assertEq(game.balanceOf(alice, 1), 0);
    }

    function test_FullAgingLadderCosts63Blancos() public {
        _giveTierN(alice, 1, 63);
        uint64[3] memory times = [uint64(2 minutes), 5 minutes, 10 minutes];
        uint256[3] memory batches = [uint256(21), 7, 1];
        for (uint256 tier = 1; tier <= 3; tier++) {
            uint256[] memory ids = new uint256[](batches[tier - 1]);
            vm.startPrank(alice);
            for (uint256 i; i < ids.length; i++) {
                ids[i] = game.startAging(tier);
            }
            vm.warp(block.timestamp + times[tier - 1]);
            for (uint256 i; i < ids.length; i++) {
                game.finishAging(ids[i]);
            }
            vm.stopPrank();
        }
        assertEq(game.balanceOf(alice, 4), 1);
        assertEq(game.balanceOf(alice, 1) + game.balanceOf(alice, 2) + game.balanceOf(alice, 3), 0);
    }

    function test_AgingCosts() public view {
        assertEq(game.agingCost(1), 3);
        assertEq(game.agingCost(2), 3);
        assertEq(game.agingCost(3), 7);
    }

    function test_StartAgingWithTooFewTokensReverts() public {
        _giveTierN(alice, 1, 2);
        vm.prank(alice);
        vm.expectRevert();
        game.startAging(1);
        assertEq(game.balanceOf(alice, 1), 2, "nothing burned");
    }

    function test_OneBlancoCannotReachExtraAnejo() public {
        _giveTier(alice, 1);
        vm.prank(alice);
        vm.expectRevert();
        game.startAging(1);
    }

    function test_FinishAgingTwiceReverts() public {
        _giveTierN(alice, 1, 3);
        vm.prank(alice);
        uint256 agingId = game.startAging(1);
        vm.warp(block.timestamp + 2 minutes);

        vm.startPrank(alice);
        game.finishAging(agingId);
        vm.expectRevert(Margarita.UnknownAging.selector);
        game.finishAging(agingId);
        vm.stopPrank();

        assertEq(game.balanceOf(alice, 2), 1);
    }

    function test_FinishAgingByOtherPlayerReverts() public {
        _giveTierN(alice, 1, 3);
        vm.prank(alice);
        uint256 agingId = game.startAging(1);
        vm.warp(block.timestamp + 2 minutes);

        vm.prank(bob);
        vm.expectRevert(Margarita.NotAgingOwner.selector);
        game.finishAging(agingId);
    }

    function test_StartAgingWithoutTokenReverts() public {
        vm.prank(alice);
        vm.expectRevert();
        game.startAging(1);
    }

    function test_CannotAgeExtraAnejo() public {
        _giveTier(alice, 4);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Margarita.InvalidTier.selector, 4));
        game.startAging(4);
    }

    function test_AgingTimeChangeDoesNotAffectRunningBarrel() public {
        _giveTierN(alice, 1, 3);
        vm.prank(alice);
        uint256 agingId = game.startAging(1);

        game.setAgingTimes(1 days, 1 days, 1 days);

        vm.warp(block.timestamp + 2 minutes);
        vm.prank(alice);
        game.finishAging(agingId);
        assertEq(game.balanceOf(alice, 2), 1);
    }

    function test_SetAgingTimesOnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert("Only callable by owner");
        game.setAgingTimes(1, 1, 1);
    }

    function test_RedeemWithoutExtraAnejoReverts() public {
        _giveTier(alice, 3);
        vm.prank(alice);
        vm.expectRevert();
        game.redeem();
    }

    function test_RedeemBurnsExtraAnejo() public {
        _giveTier(alice, 4);
        vm.expectEmit(true, true, false, false, address(game));
        emit Margarita.Redeemed(alice, 1);
        vm.prank(alice);
        game.redeem();

        assertEq(game.balanceOf(alice, 4), 0);
        assertEq(game.redeemedCount(), 1);
    }

    function test_ExtraAnejoCapStopsPulls() public {
        _giveTierN(alice, 4, 100);
        assertEq(game.extraAnejoIssued(), 100);

        vm.prank(bob);
        vm.expectRevert(Margarita.BarrelEmpty.selector);
        game.pull{value: PRICE}();
    }

    function test_ExtraAnejoRollAtCapPaysAnejo() public {
        _giveTierN(alice, 4, 99);
        uint256 bobPull = _pullAs(bob);
        _giveTierN(alice, 4, 1);
        assertEq(game.extraAnejoIssued(), 100);

        vm.expectEmit(true, true, false, true, address(game));
        emit Margarita.PullRevealed(bob, bobPull, 3, 9900);
        _fulfill(bobPull, 9900 + WORD_OFFSET);

        assertEq(game.balanceOf(bob, 4), 0);
        assertEq(game.balanceOf(bob, 3), 1);
        assertEq(game.extraAnejoIssued(), 100);
    }

    function test_AgingIntoExtraAnejoCountsAgainstCap() public {
        _giveTierN(alice, 4, 99);
        _giveTierN(bob, 3, 14);

        vm.startPrank(bob);
        game.startAging(3);
        assertEq(game.extraAnejoIssued(), 100);

        vm.expectRevert(Margarita.BarrelEmpty.selector);
        game.startAging(3);
        vm.stopPrank();
        assertEq(game.balanceOf(bob, 3), 7);
    }

    function test_AgingLowerTiersStillWorksAtCap() public {
        _giveTierN(bob, 1, 3);
        _giveTierN(alice, 4, 100);
        vm.prank(bob);
        game.startAging(1);
        assertEq(game.balanceOf(bob, 1), 0);
    }

    function test_WithdrawOnlyOwner() public {
        _pullAs(alice);
        vm.prank(alice);
        vm.expectRevert("Only callable by owner");
        game.withdraw(payable(alice));
    }

    function test_OwnerWithdrawsAll() public {
        _fulfill(_pullAs(alice), WORD_OFFSET);
        _fulfill(_pullAs(bob), WORD_OFFSET);
        address payable treasury = payable(makeAddr("treasury"));

        game.withdraw(treasury);

        assertEq(treasury.balance, 2 * PRICE);
        assertEq(address(game).balance, 0);
    }

    function test_WithdrawEmptyReverts() public {
        vm.expectRevert(Margarita.NothingToWithdraw.selector);
        game.withdraw(payable(owner));
    }

    function test_SetPriceOnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert("Only callable by owner");
        game.setPrice(0);

        game.setPrice(0.002 ether);
        assertEq(game.price(), 0.002 ether);
    }

    function test_PauseOnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert("Only callable by owner");
        game.pause();
    }

    function test_PlayerCannotRefundOwnPull() public {
        uint256 id = _pullAs(alice);
        vm.warp(block.timestamp + 1 hours);
        game.pause();
        uint256[] memory ids = new uint256[](1);
        ids[0] = id;
        vm.prank(alice);
        vm.expectRevert("Only callable by owner");
        game.cancelPulls(ids);
    }

    function test_CancelRequiresPause() public {
        uint256 id = _pullAs(alice);
        vm.warp(block.timestamp + 1 hours);
        vm.expectRevert();
        _cancel(id);
    }

    function test_CancelBeforeTimeoutReverts() public {
        uint256 id = _pullAs(alice);
        vm.warp(block.timestamp + 1 hours - 1);
        game.pause();
        vm.expectRevert(abi.encodeWithSelector(Margarita.RefundNotAvailable.selector, block.timestamp + 1));
        _cancel(id);
    }

    function test_CancelCreditsAndClaimReturnsBnb() public {
        uint256 id = _pullAs(alice);
        uint256 before = alice.balance;
        vm.warp(block.timestamp + 1 hours);
        game.pause();
        _cancel(id);

        assertEq(game.refundable(alice), PRICE);
        assertEq(game.reservedForPending(), PRICE, "still reserved until claimed");

        vm.prank(alice);
        game.claimRefund();
        assertEq(alice.balance, before + PRICE);
        assertEq(game.refundable(alice), 0);
        assertEq(game.reservedForPending(), 0);
    }

    function test_CancelUsesPricePaidNotCurrentPrice() public {
        uint256 id = _pullAs(alice);
        game.setPrice(1 ether);
        vm.warp(block.timestamp + 1 hours);
        game.pause();
        _cancel(id);
        assertEq(game.refundable(alice), PRICE);
    }

    function test_CancelAfterRevealReverts() public {
        uint256 id = _pullAs(alice);
        _fulfill(id, WORD_OFFSET);
        vm.warp(block.timestamp + 1 hours);
        game.pause();
        vm.expectRevert(Margarita.UnknownPull.selector);
        _cancel(id);
    }

    function test_DoubleCancelReverts() public {
        uint256 id = _pullAs(alice);
        vm.warp(block.timestamp + 1 hours);
        game.pause();
        _cancel(id);
        vm.expectRevert(Margarita.UnknownPull.selector);
        _cancel(id);
    }

    function test_ClaimRefundTwiceReverts() public {
        uint256 id = _pullAs(alice);
        vm.warp(block.timestamp + 1 hours);
        game.pause();
        _cancel(id);
        vm.startPrank(alice);
        game.claimRefund();
        vm.expectRevert(Margarita.NothingToClaim.selector);
        game.claimRefund();
        vm.stopPrank();
    }

    function test_LateFulfillmentAfterCancelIsIgnored() public {
        uint256 id = _pullAs(alice);
        vm.warp(block.timestamp + 1 hours);
        game.pause();
        _cancel(id);

        _fulfill(id, 19_900);
        for (uint256 t = 1; t <= 4; t++) {
            assertEq(game.balanceOf(alice, t), 0);
        }
    }

    function test_RejectingPlayerCannotBlockCancel() public {
        RejectingPlayer p = new RejectingPlayer();
        uint256 id = p.pull{value: PRICE}(game);
        vm.warp(block.timestamp + 1 hours);
        game.pause();
        _cancel(id);
        assertEq(game.refundable(address(p)), PRICE);
    }

    function test_EmptyRandomWordsIgnored() public {
        uint256 id = _pullAs(alice);
        vm.prank(address(vrf));
        game.rawFulfillRandomWords(id, new uint256[](0));
        (address player,,) = game.pendingPulls(id);
        assertEq(player, alice, "still pending");
    }

    function test_WithdrawCannotTakePendingOrRefundableFunds() public {
        _fulfill(_pullAs(alice), WORD_OFFSET);
        uint256 pendingId = _pullAs(bob);

        address payable treasury = payable(makeAddr("treasury"));
        game.withdraw(treasury);
        assertEq(treasury.balance, PRICE, "only settled revenue");

        vm.warp(block.timestamp + 1 hours);
        game.pause();
        _cancel(pendingId);
        vm.expectRevert(Margarita.NothingToWithdraw.selector);
        game.withdraw(treasury);

        vm.prank(bob);
        game.claimRefund();
        assertEq(address(game).balance, 0);
    }

    function test_SwappedCoordinatorCannotChooseRolls() public {
        uint256 id = _pullAs(alice);
        address fake = makeAddr("fakeCoordinator");
        game.setCoordinator(fake);

        uint256[] memory words = new uint256[](1);
        words[0] = 19_900;
        vm.prank(fake);
        game.rawFulfillRandomWords(id, words);

        assertEq(game.balanceOf(alice, 4), 0);
        (address player,,) = game.pendingPulls(id);
        assertEq(player, alice, "still pending for the real coordinator");
    }

    function test_PullAlwaysUsesLockedCoordinator() public {
        game.setCoordinator(makeAddr("fakeCoordinator"));
        uint256 id = _pullAs(alice);
        assertEq(game.lockedCoordinator(), address(vrf));
        assertGt(id, 0);
    }

    function test_SetVrfConfigRejectsLowCallbackGas() public {
        vm.expectRevert(abi.encodeWithSelector(Margarita.CallbackGasOutOfRange.selector, uint32(259_999)));
        game.setVrfConfig(subId, KEY_HASH, 259_999, 3, false);
        game.setVrfConfig(subId, KEY_HASH, 260_000, 3, false);
        assertEq(game.callbackGasLimit(), 260_000);
    }

    function test_SetVrfConfigRejectsHugeCallbackGas() public {
        vm.expectRevert(abi.encodeWithSelector(Margarita.CallbackGasOutOfRange.selector, uint32(2_500_001)));
        game.setVrfConfig(subId, KEY_HASH, 2_500_001, 3, false);
    }

    function test_GasBurnerAtMinimumCallbackGasStillRecords() public {
        game.setVrfConfig(subId, KEY_HASH, game.MIN_CALLBACK_GAS(), 3, false);
        GasBurner b = new GasBurner();
        uint256 id = b.pull{value: PRICE}(game);
        _fulfill(id, 19_900);
        assertEq(game.unclaimed(address(b), 4), 1, "deferred, callback did not revert");
    }

    function test_PriceAboveUint96Reverts() public {
        uint256 huge = uint256(type(uint96).max) + 1;
        game.setPrice(huge);
        vm.deal(alice, huge);
        vm.prank(alice);
        vm.expectRevert();
        game.pull{value: huge}();
    }

    function test_UniformIndexMatchesModuloForNormalWords() public view {
        assertEq(game.uniformIndex(19_900, 10_000), 9_900);
        assertEq(game.uniformIndex(type(uint256).max, 10_000), type(uint256).max % 10_000);
    }

    function test_UniformIndexRejectsBiasedLowWords() public view {
        uint256 r = game.uniformIndex(0, 10_000);
        assertLt(r, 10_000);
        assertEq(r, game.uniformIndex(0, 10_000), "deterministic");
    }

    function _measureFulfill(uint256 id) internal returns (uint256 used) {
        uint256[] memory words = new uint256[](1);
        words[0] = 19_900;
        vm.prank(address(vrf));
        uint256 g = gasleft();
        game.rawFulfillRandomWords(id, words);
        used = g - gasleft();
    }

    function test_CallbackGas_NormalPlayer() public {
        uint256 used = _measureFulfill(_pullAs(alice));
        emit log_named_uint("callback gas (EOA)", used);
        assertLt(used, 300_000 * 70 / 100, "keep a 30% buffer");
    }

    function test_CallbackGas_WorstCaseGasBurner() public {
        GasBurner b = new GasBurner();
        uint256 id = b.pull{value: PRICE}(game);
        uint256 used = _measureFulfill(id);
        emit log_named_uint("callback gas (gas burner)", used);
        assertLt(used, 300_000 * 70 / 100, "keep a 30% buffer");
        assertEq(game.unclaimed(address(b), 4), 1, "deferred, not lost");
    }

    function test_GasBurnerThroughRealMockCallbackStillRecords() public {
        GasBurner b = new GasBurner();
        uint256 id = b.pull{value: PRICE}(game);
        _fulfill(id, 19_900);
        assertEq(game.unclaimed(address(b), 4), 1);
    }

    function test_PendingPullsOfTracksPullRevealAndRefund() public {
        uint256 a = _pullAs(alice);
        uint256 b = _pullAs(alice);
        uint256 c = _pullAs(alice);
        _pullAs(bob);

        (uint256[] memory ids, Margarita.PendingPull[] memory pulls) = game.pendingPullsOf(alice);
        assertEq(ids.length, 3);
        assertEq(pulls[0].player, alice);
        assertEq(pulls[0].paid, PRICE);

        _fulfill(b, WORD_OFFSET);
        (ids,) = game.pendingPullsOf(alice);
        assertEq(ids.length, 2);
        assertTrue(_contains(ids, a) && _contains(ids, c));

        vm.warp(block.timestamp + 1 hours);
        game.pause();
        _cancel(a);
        (ids,) = game.pendingPullsOf(alice);
        assertEq(ids.length, 1);
        assertEq(ids[0], c);

        (ids,) = game.pendingPullsOf(bob);
        assertEq(ids.length, 1, "bob unaffected");
    }

    function test_AgingsOfTracksStartAndFinish() public {
        _giveTierN(alice, 1, 3);
        _giveTierN(alice, 2, 3);
        vm.startPrank(alice);
        uint256 x = game.startAging(1);
        uint256 y = game.startAging(2);
        vm.stopPrank();

        (uint256[] memory ids, Margarita.Aging[] memory list) = game.agingsOf(alice);
        assertEq(ids.length, 2);
        assertEq(list[0].owner, alice);

        vm.warp(block.timestamp + 2 minutes);
        vm.prank(alice);
        game.finishAging(x);
        (ids, list) = game.agingsOf(alice);
        assertEq(ids.length, 1);
        assertEq(ids[0], y);
        assertEq(list[0].tier, 2);
    }

    function test_PlayerStateAggregates() public {
        _giveTierN(alice, 1, 3);
        vm.prank(alice);
        game.startAging(1);
        _giveTier(alice, 1);
        _giveTier(alice, 4);
        _pullAs(alice);

        (uint256[4] memory bal, uint256[4] memory unc, uint256[] memory pullIds,, uint256[] memory agingIds,) =
            game.playerState(alice);

        assertEq(bal[0], 1);
        assertEq(bal[3], 1);
        assertEq(unc[0] + unc[1] + unc[2] + unc[3], 0);
        assertEq(pullIds.length, 1);
        assertEq(agingIds.length, 1);
    }

    function _contains(uint256[] memory arr, uint256 v) internal pure returns (bool) {
        for (uint256 i; i < arr.length; i++) {
            if (arr[i] == v) return true;
        }
        return false;
    }
}
