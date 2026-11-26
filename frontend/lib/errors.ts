import {
  BaseError,
  ContractFunctionRevertedError,
  InsufficientFundsError,
  UserRejectedRequestError,
  formatEther,
} from "viem";
import { TIERS, asTier } from "./contract";
import { formatClock } from "./format";

export type FriendlyError = {
  title: string;
  body: string;
  code: string;
};

function tierName(id: unknown) {
  try {
    return TIERS[asTier(Number(id))].name;
  } catch {
    return `tier ${String(id)}`;
  }
}

export function toFriendlyError(err: unknown, unit = "tBNB"): FriendlyError {
  if (err instanceof BaseError) {
    if (err.walk((e) => e instanceof UserRejectedRequestError)) {
      return {
        title: "You cancelled in your wallet",
        body: "Nothing was sent. Try again when you’re ready.",
        code: "UserRejectedRequestError · 4001",
      };
    }
    if (err.walk((e) => e instanceof InsufficientFundsError)) {
      return {
        title: `Not enough ${unit}`,
        body: `You need the price plus the network fee.`,
        code: "InsufficientFundsError",
      };
    }
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName ?? "";
      const args = (revert.data?.args ?? []) as readonly unknown[];
      const code = name ? `${name}(${args.map(String).join(", ")})` : revert.shortMessage;
      switch (name) {
        case "WrongPayment":
          return {
            title: "The price changed",
            body: `The price is now ${formatEther(args[1] as bigint)} ${unit}. Check it and pull again.`,
            code,
          };
        case "EnforcedPause":
          return {
            title: "Paused by the owner",
            body: "New pulls, aging and redeeming are paused. Finishing barrels and refunds still work.",
            code,
          };
        case "RefundNotAvailable":
          return {
            title: "Too early to cancel",
            body: `A pull can be cancelled from ${formatClock(args[0] as bigint)}, 1 hour after it was made.`,
            code,
          };
        case "UnknownPull":
          return {
            title: "That pull is settled",
            body: "It was already revealed or cancelled. Check My cellar for the result.",
            code,
          };
        case "RequestIdInUse":
          return {
            title: "The draw couldn’t start",
            body: "Chainlink returned a request id already in use. Nothing was charged; try again.",
            code,
          };
        case "ExpectedPause":
          return { title: "Not while open", body: "This only works while the game is paused.", code };
        case "AgingNotReady":
          return {
            title: "Not ready yet",
            body: `This barrel is ready at ${formatClock(args[0] as bigint)}.`,
            code,
          };
        case "UnknownAging":
          return {
            title: "Already finished",
            body: "This barrel was already collected. The new token is on your shelf.",
            code,
          };
        case "NotAgingOwner":
          return { title: "Not your barrel", body: "This aging barrel belongs to another wallet.", code };
        case "ERC1155InsufficientBalance":
          return {
            title: "You don’t have one",
            body: `You need 1 ${tierName(args[3])} for this.`,
            code,
          };
        case "InvalidTier":
          return { title: "That tier can’t be aged", body: "Only Blanco, Reposado and Añejo age.", code };
        case "BarrelEmpty":
          return {
            title: "The barrel is sold out",
            body: "All 100 bottles already have an Extra Añejo. New pulls and aging Añejo into Extra Añejo are closed; the tokens you hold are not affected.",
            code,
          };
        case "NothingToClaim":
          return { title: "Nothing to claim", body: "There is nothing held for this wallet.", code };
        case "RefundFailed":
          return {
            title: "Refund couldn’t be sent",
            body: `Your wallet rejected the ${unit} transfer. Try from a regular wallet.`,
            code,
          };
        case "QuoteExpired":
          return { title: "The price quote expired", body: "Quotes last 2 minutes. Swap again to get a fresh CoinMarketCap price.", code };
        case "NonceUsed":
          return { title: "That quote was already used", body: "Each quote works once. Swap again to get a new one.", code };
        case "TokenDisabled":
          return { title: "That prize is closed", body: "Pick another prize; this token isn’t offered right now.", code };
        case "InsufficientVault":
          return { title: "The vault is out of that prize", body: "Pick another prize or a smaller amount.", code };
        case "ZeroAmount":
        case "ZeroPayout":
          return { title: "Amount too small", body: "Swap at least one token.", code };
        case "BadPrice":
          return { title: "Price unavailable", body: "CoinMarketCap returned no usable price. Try again in a minute.", code };
        case "BadSignature":
        case "ECDSAInvalidSignature":
        case "ECDSAInvalidSignatureLength":
        case "ECDSAInvalidSignatureS":
          return { title: "The price quote didn’t check out", body: "The vault only accepts quotes signed by the Margarita price service. Try again.", code };
      }
      return { title: "The contract rejected this", body: "Nothing changed.", code };
    }
    return { title: "Transaction failed", body: err.shortMessage, code: err.name };
  }
  return {
    title: "Something went wrong",
    body: err instanceof Error ? err.message : String(err),
    code: "unknown",
  };
}
