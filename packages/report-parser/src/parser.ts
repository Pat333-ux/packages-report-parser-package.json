import { Bureau, MemberCreditProfile, Tradeline } from "@credit-orchestrator/fcra-rules-engine";

export interface RawBureauFeed {
  consumer: {
    id: string;
    first_name: string;
    last_name: string;
    street: string;
    city: string;
    state: string;
    postal_code: string;
    ssn_last4: string;
    fico_score_8: number;
  };
  walletAddress: string;
  accounts: Array<{
    id?: string;
    subscriber_name: string;
    original_creditor?: string;
    portfolio_type: string; // "revolving" | "installment" | "collection" | "medical"
    current_balance: number;
    high_credit_or_limit?: number;
    interest_rate?: number;
    account_status: string; // "open" | "closed" | "chargeoff" | "collection" | "paid"
    dofd?: string | null;
    bureaus: string[];
  }>;
}

function normalizeAccountType(raw: string): Tradeline["accountType"] {
  const val = raw.toUpperCase();
  if (val.includes("MED")) return "MEDICAL";
  if (val.includes("COLL")) return "COLLECTION";
  if (val.includes("INST") || val.includes("AUTO") || val.includes("MORT")) return "INSTALLMENT";
  return "REVOLVING";
}

function normalizeStatus(raw: string): Tradeline["status"] {
  const val = raw.toUpperCase();
  if (val.includes("CHARGE")) return "CHARGE_OFF";
  if (val.includes("COLL")) return "COLLECTION";
  if (val.includes("PAID")) return "PAID";
  if (val.includes("CLOS")) return "CLOSED";
  return "OPEN";
}

function normalizeBureaus(rawBureaus: string[]): Bureau[] {
  const mapped: Bureau[] = [];
  for (const b of rawBureaus) {
    const upper = b.toUpperCase();
    if (upper.includes("EQUIFAX") || upper === "EQ") mapped.push("EQUIFAX");
    if (upper.includes("EXPERIAN") || upper === "EX") mapped.push("EXPERIAN");
    if (upper.includes("TRANSUNION") || upper === "TU") mapped.push("TRANSUNION");
  }
  return mapped.length > 0 ? Array.from(new Set(mapped)) : ["EQUIFAX", "EXPERIAN", "TRANSUNION"];
}

/**
 * Normalizes a third-party bureau aggregator JSON feed (e.g. Array / Plaid Credit / SmartCredit)
 * into the deterministic MemberCreditProfile required by @credit-orchestrator/fcra-rules-engine.
 */
export function parseAggregatorFeed(feed: RawBureauFeed): MemberCreditProfile {
  const tradelines: Tradeline[] = feed.accounts.map((acc, index) => ({
    accountId: acc.id || `ACC-${Date.now()}-${index}`,
    creditorName: acc.subscriber_name.trim(),
    originalCreditor: acc.original_creditor?.trim(),
    accountType: normalizeAccountType(acc.portfolio_type),
    balance: Number(acc.current_balance || 0),
    creditLimit: Number(acc.high_credit_or_limit || 0),
    apr: Number(acc.interest_rate || 0),
    status: normalizeStatus(acc.account_status),
    dateOfFirstDelinquency: acc.dofd || null,
    bureausReporting: normalizeBureaus(acc.bureaus || [])
  }));

  return {
    memberId: feed.consumer.id || `NWO-${Date.now()}`,
    firstName: feed.consumer.first_name,
    lastName: feed.consumer.last_name,
    address: feed.consumer.street,
    city: feed.consumer.city,
    state: feed.consumer.state,
    zip: feed.consumer.postal_code,
    ssnLast4: feed.consumer.ssn_last4,
    currentFico: Number(feed.consumer.fico_score_8),
    walletAddress: feed.walletAddress,
    tradelines
  };
}

/**
 * Fallback lightweight text parser for raw pasted credit report tradeline blocks.
 * Expected line format:
 * CREDITOR | TYPE | BALANCE | LIMIT | STATUS | DOFD (YYYY-MM-DD or NONE) | BUREAUS (EQ,EX,TU)
 */
export function parseRawTextTradelines(rawText: string): Tradeline[] {
  const lines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

  return lines.map((line, idx) => {
    const [creditor, type, bal, lim, status, dofd, bureaus] = line.split("|").map((s) => s.trim());
    return {
      accountId: `TXT-${idx + 1}`,
      creditorName: creditor || "Unknown Creditor",
      accountType: normalizeAccountType(type || "REVOLVING"),
      balance: Number(bal) || 0,
      creditLimit: Number(lim) || 0,
      apr: 19.99,
      status: normalizeStatus(status || "OPEN"),
      dateOfFirstDelinquency: dofd && dofd.toUpperCase() !== "NONE" ? dofd : null,
      bureausReporting: normalizeBureaus((bureaus || "EQ,EX,TU").split(","))
    };
  });
}
