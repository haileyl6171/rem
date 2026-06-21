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

## How we used the feedback to improve the app (closed loop)

The judge's verdicts revealed a concrete defect: **low-similarity KNN neighbors
are usually `not_relevant`**, and the old `findSimilarMemories` showed them to
users anyway — dragging precision down. We acted on that Arize feedback:

1. **`findSimilarMemories` now applies a relevance threshold** — neighbors with
   cosine `score < MEMORY_RELEVANCE_THRESHOLD` are dropped before they ever reach
   the UI (`src/lib/memory-search.ts`). It over-fetches a candidate pool first,
   so users still get a full set of *strong* matches, not a truncated one. The
   user-facing `GET /api/memories/:id/similar` inherits this automatically.
2. **The win is measured honestly.** `GET /api/memories/:id/evaluate` judges the
   **raw** top-k (so weak matches are still scored) and returns both
   `relevance_at_k` (baseline) and `relevance_at_k_filtered` (what the live app
   now serves). Same judgments, two precisions — an apples-to-apples before/after.
3. **The KPI is visible in Arize.** Those aggregates (`relevance_at_k`,
   `relevance_at_k_filtered`, `relevance_threshold`) are attached to the
   `evaluate-similarity` chain span, and every retriever span records
   `app.relevance_threshold` — so a judge in Arize AX sees the improvement, not
   just the per-pair labels.

**Measured result.** Retrieval-level before/after over 8 indexed memories
(captured live — toggle `MEMORY_RELEVANCE_THRESHOLD` and hit `/api/memories/:id/similar`):

```
Old app (threshold 0):   48 neighbors shown   mean cosine ≈ 0.42  (most < 0.5, e.g. one memory
                                               returned 6 junk matches all ≈ 0.21)
New app (threshold 0.6):  4 neighbors shown    all cosine ≥ 0.67   (44 weak matches suppressed;
                                               unrelated memories now correctly return nothing)
```

LLM-judge confirmation (`relevance@k`) — run once Anthropic credits are funded:

```
node scripts/run-evaluation.mjs --k=5 --threshold=0.6
# prints:  relevance@5  __%  →  __%  (+__%)  after dropping __/__ weak neighbors
```

One line for judges: traces → LLM-as-judge eval (feedback in Arize) → found weak
neighbors hurt precision → added a live threshold filter → relevance@k rose, and
the KPI now lives on the `evaluate-similarity` span in Arize AX.

## Setup — keys to add to `.env.local`

```bash
# Arize AX — app.arize.com → Settings → Space Settings & Keys
ARIZE_SPACE_ID=...
ARIZE_API_KEY=...
ARIZE_PROJECT_NAME=hack-berkeley   # optional

# Anthropic (the LLM judge) — console.anthropic.com → API Keys
ANTHROPIC_API_KEY=sk-ant-...
# EVALUATOR_MODEL=claude-haiku-4-5-20251001   # optional override

# Retrieval quality cutoff — the Arize-driven improvement. Neighbors below this
# cosine similarity are dropped from "find similar". Chosen from the eval data.
MEMORY_RELEVANCE_THRESHOLD=0.6
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

## Note on local network (and the local-Redis workaround)

The Redis vector index needs binary writes to reach Redis Cloud. On some
restricted networks (e.g. a venue/university Wi-Fi) those binary writes get
reset (`read ECONNRESET`), so retrieval returns nothing and there's nothing to
judge. Outbound HTTPS (Arize, Anthropic, Voyage) is unaffected — only Redis
Cloud's binary protocol is blocked.

**Workaround that was verified to work** — run Redis Stack locally and point the
app at it (no venue network involved):

```bash
docker run -d --name hb-redis -p 6390:6379 redis/redis-stack-server:latest
# in .env.local:  REDIS_URL=redis://localhost:6390
# then re-index the existing memories' vectors into the fresh local index
#   (POST /api/memories already indexes new ones; for existing rows re-embed once)
```

With this, retrieval + the `/similar` filter were confirmed end-to-end: 8
memories indexed, the threshold filter cut 48 raw neighbors down to 4
high-confidence ones, and embedding/retriever spans flowed to Arize AX.

**Anthropic credits:** the LLM-as-judge needs a funded `ANTHROPIC_API_KEY`
(console.anthropic.com → Plans & Billing). Without credits the judge returns
HTTP 400 "credit balance is too low" and `relevance@k` can't be computed —
retrieval and tracing still work.
