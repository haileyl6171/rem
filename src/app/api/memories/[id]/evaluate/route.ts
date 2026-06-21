// ============================================================================
//  GET /api/memories/:id/evaluate  — score the "find similar" quality
//  ★ Arize evaluator endpoint ★
//
//  Runs the real retrieval (traced: chain → retriever → embedding) and then
//  judges each returned neighbor with the LLM-as-judge evaluator (traced:
//  llm span with the relevance label/score as feedback). Returns a report:
//  relevance@k and mean score — i.e. "is the app doing a good job?".
//
//  Everything runs inside the Next.js runtime where instrumentation.ts has
//  registered the Arize exporter, so the whole evaluation shows up as one
//  trace in Arize AX. Used by scripts/run-evaluation.mjs for batch runs.
// ============================================================================

import { NextResponse } from "next/server";
import {
  context,
  getMetadataAttributes,
  setMetadata,
  traceChain,
} from "@arizeai/phoenix-otel";
import { getMemory } from "@/lib/db";
import { findSimilarMemories, MIN_RELEVANCE } from "@/lib/memory-search";
import { evaluateRelevance, type RelevanceJudgment } from "@/lib/evaluator";

export const runtime = "nodejs";

interface JudgedNeighbor extends RelevanceJudgment {
  id: string;
  description: string;
  retrieval_score: number; // cosine similarity from Redis KNN
}

const precision = (judged: JudgedNeighbor[]) =>
  judged.length > 0
    ? judged.filter((j) => j.label === "relevant").length / judged.length
    : 0;

// One traced unit of work: retrieve neighbors, judge each, aggregate.
const evaluateSimilarity = traceChain(
  async (source: { id: string; description: string }, k: number) => {
    // Judge the RAW top-k (minScore: 0) so weak matches are still scored —
    // that's what lets us prove the Arize-driven filter raises precision.
    const neighbors = await findSimilarMemories(
      { id: source.id, description: source.description },
      k,
      { minScore: 0 },
    );

    const judged: JudgedNeighbor[] = [];
    for (const n of neighbors) {
      const verdict = await evaluateRelevance({
        query: source.description,
        document: n.description,
      });
      judged.push({
        id: n.id,
        description: n.description,
        retrieval_score: n.score,
        ...verdict,
      });
    }

    const meanScore =
      judged.length > 0
        ? judged.reduce((s, j) => s + j.score, 0) / judged.length
        : 0;

    // Baseline (all k) vs. what the live app now serves (score >= threshold).
    const kept = judged.filter((j) => j.retrieval_score >= MIN_RELEVANCE);
    const relevanceAtK = Number(precision(judged).toFixed(3));
    const relevanceAtKFiltered = Number(precision(kept).toFixed(3));

    return {
      memory_id: source.id,
      source_description: source.description,
      k,
      evaluated: judged.length,
      relevant_count: judged.filter((j) => j.label === "relevant").length,
      relevance_at_k: relevanceAtK,
      relevance_threshold: MIN_RELEVANCE,
      relevance_at_k_filtered: relevanceAtKFiltered,
      kept_count: kept.length,
      dropped_count: judged.length - kept.length,
      mean_relevance_score: Number(meanScore.toFixed(3)),
      results: judged,
    };
  },
  {
    name: "evaluate-similarity",
    // ↓ Surface the aggregate KPI in Arize so the improvement is queryable
    //   there, not just in the terminal — "Arize output, valuably used".
    processOutput: (r: {
      relevance_at_k: number;
      relevance_at_k_filtered: number;
      relevance_threshold: number;
      mean_relevance_score: number;
      evaluated: number;
      kept_count: number;
      dropped_count: number;
    }) =>
      getMetadataAttributes({
        relevance_at_k: r.relevance_at_k,
        relevance_at_k_filtered: r.relevance_at_k_filtered,
        relevance_threshold: r.relevance_threshold,
        mean_relevance_score: r.mean_relevance_score,
        evaluated: r.evaluated,
        kept_count: r.kept_count,
        dropped_count: r.dropped_count,
      }),
  },
);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const memory = await getMemory(id);
  if (!memory) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!memory.description?.trim()) {
    return NextResponse.json(
      { error: "Memory has no description to evaluate." },
      { status: 400 },
    );
  }

  const k = Number(new URL(request.url).searchParams.get("k")) || 5;

  try {
    // Tag every span in this evaluation with the memory id (visible in Arize).
    const report = await context.with(
      setMetadata(context.active(), { memory_id: id }),
      () => evaluateSimilarity({ id: memory.id, description: memory.description ?? "" }, k),
    );
    return NextResponse.json(report);
  } catch (err) {
    // Evaluation is an offline-quality tool — never hard-fail the request.
    console.error("[evaluate] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "evaluation failed" },
      { status: 502 },
    );
  }
}
