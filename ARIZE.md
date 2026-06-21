# Arize AX — Tracing + Evaluator (booth playbook)

Everything the Arize prize asks for: **traces → an evaluator → feedback → a
measurable improvement.** This doc is the "tell us what you did" script.

## What's instrumented

| Span | Where | Kind |
|------|-------|------|
| `voyage-embed` | `src/lib/embeddings.ts` | EMBEDDING |
| `redis-vector-knn` | `src/lib/memory-search.ts` | RETRIEVER |
| `relevance-evaluator` | `src/lib/evaluator.ts` | LLM |
| `evaluate-similarity` | `src/app/api/memories/[id]/evaluate/route.ts` | CHAIN |

Tracing is registered on server startup in `src/instrumentation.ts` and exported
to **Arize AX** (`otlp.arize.com`). Every memory creation and similarity search
already emits spans; the evaluation endpoint emits the judge spans.

## The evaluator (the LLM prompt the judges want to see)

`src/lib/evaluator.ts` is an **LLM-as-judge** (Claude). Given a SOURCE memory and
a RETRIEVED "similar" memory, it scores whether the match is genuinely relevant:

```json
{ "label": "relevant" | "not_relevant", "score": 0.0-1.0, "explanation": "…" }
```

The verdict is attached to the trace as metadata (`relevance_label`,
`relevance_score`) — that's the **feedback** visible in Arize AX.

## How we used the feedback to improve the app

`scripts/run-evaluation.mjs` judges every memory's neighbors and prints:

1. **Current quality** — `relevance@k` (precision) and mean relevance score.
2. **Improvement** — re-computes precision after dropping neighbors whose Redis
   `retrieval_score` is below a threshold. The judge confirms this **raises
   precision** (fewer weak matches shown), so we add a `score >= THRESHOLD`
   filter in `findSimilarMemories`. Feedback → concrete change → better app.

## Setup — keys to add to `.env.local`

```bash
# Arize AX — app.arize.com → Settings → Space Settings & Keys
ARIZE_SPACE_ID=...
ARIZE_API_KEY=...
ARIZE_PROJECT_NAME=hack-berkeley   # optional

# Anthropic (the LLM judge) — console.anthropic.com → API Keys
ANTHROPIC_API_KEY=sk-ant-...
# EVALUATOR_MODEL=claude-haiku-4-5-20251001   # optional override
```

(Already set from earlier work: `NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `REDIS_URL`, `VOYAGE_API_KEY`.)

## Run it

```bash
# 1. Start the traced server
npm run dev

# 2. Create a few memories (so there's something to retrieve & judge)
#    — via the app UI, or POST /api/memories

# 3. Generate traces + run the evaluator over all memories
node scripts/run-evaluation.mjs --k=5 --threshold=0.6
```

Then open **app.arize.com → the `hack-berkeley` project** to show the judges:
the trace tree (chain → retriever → embedding, plus the LLM evaluator spans) and
the `relevance_score` feedback on each.

## Note on local network

The Redis vector index needs binary writes to reach Redis Cloud. On some
restricted networks (e.g. a venue/university Wi-Fi) those binary writes get
reset, so retrieval returns nothing locally and there's nothing to judge. If
that happens, run on a phone hotspot or a deployed instance — the code is
unaffected. See the earlier diagnosis for details.
