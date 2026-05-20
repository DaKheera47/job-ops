import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Pipeline step-ordering guard.
 *
 * Background: in May 2026 the relocation + anti-domain filters were silently
 * removed from the pipeline. Without them every discovered job — including
 * obvious mismatches (healthcare, retail, legal, native-Polish-only roles,
 * jobs in cities the user cannot move to) — went straight to the LLM scorer.
 * Users saw irrelevant "garbage" jobs in Telegram and the daily Anthropic
 * budget was wasted scoring listings that were always going to be rejected.
 *
 * The lesson: the pipeline's filter chain is load-bearing. Quietly dropping
 * a step is a silent regression that only shows up in production output.
 *
 * This test pins the **relative order** of the steps that gate cost,
 * relevance, and user trust. It is intentionally a string-level check
 * against `orchestrator.ts` so any agent that reorders or removes a step
 * gets a red test immediately, without needing to run the full pipeline.
 *
 * If you legitimately need to change the order or remove a step, update
 * BOTH this test and CLAUDE.md's "Pipeline Step Ordering" section in the
 * same commit. The test is the contract; CLAUDE.md is the doc.
 */
describe("pipeline step ordering", () => {
  const orchestratorSource = readFileSync(
    join(__dirname, "orchestrator.ts"),
    "utf8",
  );
  const stepsIndexSource = readFileSync(
    join(__dirname, "steps", "index.ts"),
    "utf8",
  );

  // The canonical pipeline order. Each entry is the step-function name as
  // it appears at the call site inside runPipeline.
  const REQUIRED_ORDER = [
    "discoverJobsStep",
    "preImportLivenessStep",
    "importJobsStep",
    "filterRelocationJobsStep",
    "filterAntiDomainJobsStep",
    "checkLivenessStep",
    "scoreJobsStep",
    "selectJobsStep",
    "processJobsStep",
  ];

  it("invokes every required step at least once", () => {
    for (const step of REQUIRED_ORDER) {
      expect(
        orchestratorSource.includes(`${step}(`),
        `Expected runPipeline to call ${step}(...). If you removed it on purpose, update this test AND CLAUDE.md → Pipeline Step Ordering in the same commit.`,
      ).toBe(true);
    }
  });

  it("calls the filter steps between import and scoring", () => {
    // Find the first call site of each step (the actual invocation, not the
    // import). Using `step(` is enough because TypeScript identifiers are
    // unique and the import lines do not include trailing parentheses.
    const indexOfCall = (step: string): number =>
      orchestratorSource.indexOf(`${step}(`);

    const order = REQUIRED_ORDER.map((step) => ({
      step,
      idx: indexOfCall(step),
    }));

    for (const { step, idx } of order) {
      expect(idx, `${step} not found in orchestrator.ts`).toBeGreaterThan(0);
    }

    for (let i = 1; i < order.length; i++) {
      const prev = order[i - 1];
      const curr = order[i];
      expect(
        curr.idx,
        `Step "${curr.step}" must be called AFTER "${prev.step}" in runPipeline. ` +
          `Found ${curr.step} at index ${curr.idx} but ${prev.step} at ${prev.idx}. ` +
          `If you intentionally reordered the pipeline, update REQUIRED_ORDER in this test AND CLAUDE.md.`,
      ).toBeGreaterThan(prev.idx);
    }
  });

  it("exports both filter steps from pipeline/steps/index.ts", () => {
    // If exports disappear, TypeScript will catch direct imports, but the
    // failure mode of "step file present, export removed, no longer called"
    // is exactly what we hit in the May 2026 regression. Belt and braces.
    expect(stepsIndexSource).toContain(
      'export { filterRelocationJobsStep } from "./filter-relocation"',
    );
    expect(stepsIndexSource).toContain(
      'export { filterAntiDomainJobsStep } from "./filter-anti-domain"',
    );
  });
});
