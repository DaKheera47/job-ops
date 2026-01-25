type CrawlPhase = "list" | "job";

export interface JobOpsCrawlProgressPayload {
  phase: CrawlPhase;
  currentUrl?: string;
  listPagesProcessed: number;
  listPagesTotal?: number;
  jobCardsFound: number;
  jobPagesEnqueued: number;
  jobPagesSkipped: number;
  jobPagesProcessed: number;
  ts: string;
}

interface JobOpsCrawlProgressState {
  listPagesProcessed: number;
  listPagesTotal?: number;
  jobCardsFound: number;
  jobPagesEnqueued: number;
  jobPagesSkipped: number;
  jobPagesProcessed: number;
  currentUrl?: string;
  phase: CrawlPhase;
}

const PROGRESS_PREFIX = "JOBOPS_PROGRESS ";
const isEnabled = () => process.env.JOBOPS_EMIT_PROGRESS === "1";

const state: JobOpsCrawlProgressState = {
  listPagesProcessed: 0,
  jobCardsFound: 0,
  jobPagesEnqueued: 0,
  jobPagesSkipped: 0,
  jobPagesProcessed: 0,
  phase: "list",
};

function emit(): void {
  if (!isEnabled()) return;

  const payload: JobOpsCrawlProgressPayload = {
    phase: state.phase,
    currentUrl: state.currentUrl,
    listPagesProcessed: state.listPagesProcessed,
    listPagesTotal: state.listPagesTotal,
    jobCardsFound: state.jobCardsFound,
    jobPagesEnqueued: state.jobPagesEnqueued,
    jobPagesSkipped: state.jobPagesSkipped,
    jobPagesProcessed: state.jobPagesProcessed,
    ts: new Date().toISOString(),
  };

  process.stdout.write(`${PROGRESS_PREFIX}${JSON.stringify(payload)}\n`);
}

export function initJobOpsProgress(listPagesTotal: number): void {
  state.listPagesTotal = listPagesTotal;
  state.phase = "list";
  emit();
}

export function markListPageDone(params: {
  currentUrl: string;
  jobCardsFound: number;
  jobPagesEnqueued: number;
  jobPagesSkipped: number;
}): void {
  state.listPagesProcessed += 1;
  state.phase = "list";
  state.currentUrl = params.currentUrl;
  state.jobCardsFound += params.jobCardsFound;
  state.jobPagesEnqueued += params.jobPagesEnqueued;
  state.jobPagesSkipped += params.jobPagesSkipped;
  emit();
}

export function markJobPageDone(params: { currentUrl: string }): void {
  state.jobPagesProcessed += 1;
  state.phase = "job";
  state.currentUrl = params.currentUrl;
  emit();
}
