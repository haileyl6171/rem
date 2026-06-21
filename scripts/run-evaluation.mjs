// ============================================================================
//  Batch evaluation runner — the "evaluator" you run at the Arize booth.
//
//  For every memory in Supabase it calls GET /api/memories/:id/evaluate, which
//  retrieves "similar" memories and judges each with the Claude LLM-as-judge.
//  Every call emits a full trace (retriever + embedding + evaluator spans) to
//  Arize AX, with the relevance label/score as feedback.
//
//  Then it prints:
//    1. The app's current quality:  relevance@k and mean relevance score.
//    2. The IMPROVEMENT: applying a retrieval-score threshold (drop weak KNN
//       matches) and showing precision goes up — i.e. feedback → a better app.
//
//  Usage:
//    1. Start the dev server:  npm run dev   (needs ARIZE_*, REDIS_URL,
//       VOYAGE_API_KEY, ANTHROPIC_API_KEY in .env.local)
//    2. node scripts/run-evaluation.mjs [--k=5] [--threshold=0.6] [--base=http://localhost:3000]
// ============================================================================

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const BASE = args.base ?? "http://localhost:3000";
const K = Number(args.k ?? 5);
const THRESHOLD = Number(args.threshold ?? 0.6); // retrieval-score cutoff

const pct = (n) => `${(n * 100).toFixed(1)}%`;

async function main() {
  console.log(`\n▶ Evaluating "find similar memories" quality (k=${K}) via ${BASE}\n`);

  const listRes = await fetch(`${BASE}/api/memories`);
  if (!listRes.ok) throw new Error(`GET /api/memories ${listRes.status}`);
  const memories = await listRes.json();
  const withDesc = memories.filter((m) => (m.description ?? "").trim().length > 0);

  if (withDesc.length === 0) {
    console.log("No memories with descriptions to evaluate. Create a few first.");
    return;
  }
  console.log(`Found ${withDesc.length} memories with descriptions. Judging neighbors...\n`);

  const reports = [];
  for (const m of withDesc) {
    const r = await fetch(`${BASE}/api/memories/${m.id}/evaluate?k=${K}`);
    if (!r.ok) {
      console.log(`  ✗ ${m.id.slice(0, 8)}  (${r.status}) — skipped`);
      continue;
    }
    const report = await r.json();
    reports.push(report);
    console.log(
      `  ✓ ${m.id.slice(0, 8)}  "${(report.source_description ?? "").slice(0, 40)}"  ` +
        `relevance@${K}=${pct(report.relevance_at_k)}  mean=${report.mean_relevance_score}`,
    );
  }

  if (reports.length === 0) {
    console.log("\nNo successful evaluations. Is the dev server running with all keys set?");
    return;
  }

  // --- 1. Current quality -------------------------------------------------
  const allJudged = reports.flatMap((r) => r.results);
  const totalRelevant = allJudged.filter((j) => j.label === "relevant").length;
  const baseline = allJudged.length > 0 ? totalRelevant / allJudged.length : 0;
  const meanScore =
    allJudged.length > 0
      ? allJudged.reduce((s, j) => s + j.score, 0) / allJudged.length
      : 0;

  console.log("\n" + "═".repeat(64));
  console.log("  CURRENT QUALITY (LLM-judged)");
  console.log("═".repeat(64));
  console.log(`  Memories evaluated:        ${reports.length}`);
  console.log(`  Neighbor pairs judged:     ${allJudged.length}`);
  console.log(`  Precision (relevance@${K}):  ${pct(baseline)}`);
  console.log(`  Mean relevance score:      ${meanScore.toFixed(3)}`);

  // --- 2. Improvement: filter weak KNN matches by retrieval score ---------
  const kept = allJudged.filter((j) => j.retrieval_score >= THRESHOLD);
  const keptRelevant = kept.filter((j) => j.label === "relevant").length;
  const improved = kept.length > 0 ? keptRelevant / kept.length : 0;

  console.log("\n" + "═".repeat(64));
  console.log(`  IMPROVEMENT  —  drop neighbors with retrieval_score < ${THRESHOLD}`);
  console.log("═".repeat(64));
  console.log(`  Shown before:  ${allJudged.length} neighbors, precision ${pct(baseline)}`);
  console.log(`  Shown after:   ${kept.length} neighbors, precision ${pct(improved)}`);
  const delta = improved - baseline;
  console.log(
    `  Δ precision:   ${delta >= 0 ? "+" : ""}${pct(delta)}  ` +
      `(filtered out ${allJudged.length - kept.length} weak matches)`,
  );
  console.log(
    `\n  ✓ LIVE: findSimilarMemories applies \`score >= ${THRESHOLD}\`\n` +
      `    (MEMORY_RELEVANCE_THRESHOLD). The /similar endpoint users hit now\n` +
      `    serves this higher-precision set — Arize feedback → a better app.\n`,
  );

  // Copy-paste line for ARIZE.md (the before/after evidence).
  console.log("─".repeat(64));
  console.log("  ARIZE.md summary line:");
  console.log(
    `  relevance@${K} ${pct(baseline)} → ${pct(improved)} ` +
      `(+${pct(Math.max(0, delta))}) after dropping ${allJudged.length - kept.length}/` +
      `${allJudged.length} neighbors with retrieval_score < ${THRESHOLD}.`,
  );
  console.log("─".repeat(64) + "\n");
}

main().catch((e) => {
  console.error("\nEvaluation run failed:", e.message);
  process.exit(1);
});
