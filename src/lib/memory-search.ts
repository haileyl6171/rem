// ============================================================================
//  Semantic memory search — SERVER ONLY.  ★ THE REDIS FEATURE ★
//  Owned by P2. "Find memories like this one" via Redis vector similarity.
//
//  Redis here is the VECTOR SEARCH ENGINE (not a cache): each memory's
//  description is embedded (src/lib/embeddings.ts) and stored as a vector in a
//  RediSearch HNSW index. KNN queries return the most semantically similar
//  memories. Supabase remains the source of truth for the row data.
//
//  Index lives over HASH keys  memory:<id>  with fields:
//    embedding (FLOAT32[1024], COSINE) · description · status · splat_url · created_at
// ============================================================================

import "server-only";
import { traceChain, withSpan } from "@arizeai/phoenix-otel";
import { getConnectedRedisClient } from "@/lib/redis";
import { embed, EMBED_DIM } from "@/lib/embeddings";
import { retrieverSpanOptions } from "@/lib/tracing";

// node-redis renamed its schema enums between v4 (SchemaFieldTypes /
// VectorAlgorithms) and v6 (SCHEMA_FIELD_TYPE / SCHEMA_VECTOR_FIELD_ALGORITHM).
// The underlying values are just the RediSearch keywords, so we use string
// literals to stay correct across versions. (typed via `as const` below.)
const FIELD = { VECTOR: "VECTOR", TAG: "TAG", NUMERIC: "NUMERIC" } as const;
const ALGO = { HNSW: "HNSW" } as const;

const INDEX = "idx:memories";
const PREFIX = "memory:";

// ---------------------------------------------------------------------------
//  Relevance threshold — the Arize feedback loop, made real.
//  The LLM-as-judge evaluator (src/lib/evaluator.ts) found that low-similarity
//  KNN neighbors are usually judged "not_relevant" and drag precision down.
//  So we drop neighbors whose cosine similarity is below this cutoff before
//  showing them to users. Chosen from the eval data; override via env.
//  Pass { minScore: 0 } to bypass it (the evaluator does this to measure the
//  honest baseline vs. the filtered set). See ARIZE.md.
// ---------------------------------------------------------------------------
export const MIN_RELEVANCE = Number(process.env.MEMORY_RELEVANCE_THRESHOLD ?? 0.6);

/** A neighbor returned by the similarity search. */
export interface SimilarMemory {
  id: string;
  description: string;
  status: string;
  splat_url: string | null;
  score: number; // cosine similarity in [0,1]; 1 = most similar
}

// Create the index once per process (cheap to re-check; FT.CREATE is one-time).
let indexReady: Promise<void> | null = null;

function ensureIndex(): Promise<void> {
  if (!indexReady) {
    indexReady = (async () => {
      const client = await getConnectedRedisClient();
      try {
        await client.ft.info(INDEX);
        return; // already exists
      } catch {
        // fall through to create
      }
      try {
        await client.ft.create(
          INDEX,
          {
            embedding: {
              type: FIELD.VECTOR,
              ALGORITHM: ALGO.HNSW,
              TYPE: "FLOAT32",
              DIM: EMBED_DIM,
              DISTANCE_METRIC: "COSINE",
              AS: "embedding",
            },
            status: { type: FIELD.TAG, AS: "status" },
            created_at: {
              type: FIELD.NUMERIC,
              AS: "created_at",
              SORTABLE: true,
            },
          },
          { ON: "HASH", PREFIX },
        );
      } catch (err) {
        // Another request may have created it in the meantime — that's fine.
        if (!(err instanceof Error) || !/index already exists/i.test(err.message)) {
          indexReady = null; // let a later call retry on real failures
          throw err;
        }
      }
    })();
  }
  return indexReady;
}

function toBlob(vec: number[]): Buffer {
  return Buffer.from(new Float32Array(vec).buffer);
}

/**
 * Store (or refresh) a memory's embedding so it shows up in similarity search.
 * Call this on create and whenever the description changes.
 */
export const indexMemory = traceChain(
  async function indexMemory(input: {
    id: string;
    description: string;
    status?: string;
    splat_url?: string | null;
    created_at?: string;
  }): Promise<void> {
    if (!input.description?.trim()) return;
    await ensureIndex();
    const client = await getConnectedRedisClient();
    const vec = await embed(input.description, "document");

    await client.hSet(PREFIX + input.id, {
      id: input.id,
      description: input.description,
      status: input.status ?? "PENDING",
      splat_url: input.splat_url ?? "",
      created_at: input.created_at
        ? String(Date.parse(input.created_at))
        : String(Date.now()),
    });
    await client.hSet(PREFIX + input.id, { embedding: toBlob(vec) });
  },
  { name: "index-memory" },
);

/** Run a KNN search for the given query vector, returning up to `k` neighbors. */
const knn = withSpan(
  async function knn(
    queryVec: number[],
    k: number,
    excludeId?: string,
    opts?: { minScore?: number },
  ): Promise<SimilarMemory[]> {
    await ensureIndex();
    const client = await getConnectedRedisClient();
    const minScore = opts?.minScore ?? 0;

    // When filtering, over-fetch a candidate pool so a full set of k *strong*
    // matches survives the cutoff instead of just truncating the top-k.
    const base = excludeId ? k + 1 : k;
    const fetchN = minScore > 0 ? Math.max(base, k * 4) : base;

    const result = await client.ft.search(
      INDEX,
      `*=>[KNN ${fetchN} @embedding $BLOB AS score]`,
      {
        PARAMS: { BLOB: toBlob(queryVec) },
        SORTBY: "score",
        DIALECT: 2,
        RETURN: ["score", "id", "description", "status", "splat_url"],
        LIMIT: { from: 0, size: fetchN },
      },
    );

    return result.documents
      .map((doc) => {
        const v = doc.value as Record<string, string>;
        const distance = parseFloat(v.score ?? "1");
        return {
          id: v.id,
          description: v.description ?? "",
          status: v.status ?? "",
          splat_url: v.splat_url ? v.splat_url : null,
          score: 1 - distance,
        };
      })
      .filter((m) => m.id && m.id !== excludeId)
      // ↓ The Arize-driven improvement: drop weak matches the judge flags.
      .filter((m) => m.score >= minScore)
      .slice(0, k);
  },
  retrieverSpanOptions(),
);

export const findSimilarMemories = traceChain(
  async function findSimilarMemories(
    source: { id: string; description: string },
    k = 6,
    opts?: { minScore?: number },
  ): Promise<SimilarMemory[]> {
    if (!source.description?.trim()) return [];
    const minScore = opts?.minScore ?? MIN_RELEVANCE;
    const vec = await embed(source.description, "query");
    return knn(vec, k, source.id, { minScore });
  },
  { name: "find-similar-memories" },
);

export const searchMemories = traceChain(
  async function searchMemories(text: string, k = 6): Promise<SimilarMemory[]> {
    if (!text.trim()) return [];
    const vec = await embed(text, "query");
    return knn(vec, k);
  },
  { name: "search-memories" },
);
