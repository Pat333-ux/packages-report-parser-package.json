import express, { Request, Response } from "express";
import { auditCreditProfile, MemberCreditProfile } from "@credit-orchestrator/fcra-rules-engine";
import { parseAggregatorFeed, RawBureauFeed } from "@credit-orchestrator/report-parser";
import { generateBureauDisputePackets } from "@credit-orchestrator/dispute-generator";
import { calculateOptimalPayoffPlan } from "@credit-orchestrator/debt-optimizer";
import { dispatchToHomeLoanOrchestrator } from "@credit-orchestrator/mortgage-handoff";

const app = express();
app.use(express.json());

// Endpoint 1: Ingest raw credit bureau aggregator feed -> normalize -> audit -> letters -> handoff
app.post("/api/credit/ingest-feed", async (req: Request, res: Response) => {
  const { rawFeed, availablePaydownBudgetUsd = 500, housingTarget } = req.body as {
    rawFeed: RawBureauFeed;
    availablePaydownBudgetUsd?: number;
    housingTarget?: {
      email: string;
      county: string;
      annualHouseholdIncome: number;
      purchasePrice: number;
      loanAmount: number;
    };
  };

  const normalizedProfile = parseAggregatorFeed(rawFeed);
  const audit = auditCreditProfile(normalizedProfile);
  const disputePackets = generateBureauDisputePackets(normalizedProfile, audit.disputeFlags);
  const payoffPlan = calculateOptimalPayoffPlan(normalizedProfile.tradelines, availablePaydownBudgetUsd);

  let mortgageHandoff = null;
  if (housingTarget) {
    mortgageHandoff = await dispatchToHomeLoanOrchestrator(normalizedProfile, audit, housingTarget);
  }

  res.status(200).json({
    normalizedProfile,
    audit,
    disputePackets,
    payoffPlan,
    mortgageHandoff
  });
});

// Endpoint 2: Direct normalized profile pipeline
app.post("/api/credit/rehabilitate", async (req: Request, res: Response) => {
  const { profile, availablePaydownBudgetUsd = 500, housingTarget } = req.body as {
    profile: MemberCreditProfile;
    availablePaydownBudgetUsd?: number;
    housingTarget?: {
      email: string;
      county: string;
      annualHouseholdIncome: number;
      purchasePrice: number;
      loanAmount: number;
    };
  };

  const audit = auditCreditProfile(profile);
  const disputePackets = generateBureauDisputePackets(profile, audit.disputeFlags);
  const payoffPlan = calculateOptimalPayoffPlan(profile.tradelines, availablePaydownBudgetUsd);

  let mortgageHandoff = null;
  if (housingTarget) {
    mortgageHandoff = await dispatchToHomeLoanOrchestrator(profile, audit, housingTarget);
  }

  res.status(200).json({
    audit,
    disputePackets,
    payoffPlan,
    mortgageHandoff
  });
});

const PORT = Number(process.env.PORT) || 4100;
app.listen(PORT, () => {
  console.log(`Credit Repair Orchestrator API running on port ${PORT}`);
});
