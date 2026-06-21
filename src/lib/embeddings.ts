// ============================================================================
//  Text embeddings — SERVER ONLY.
//  Owned by P2. Turns a memory's description into a vector so Redis can do
//  semantic "find memories like this one" search (src/lib/memory-search.ts).
//
//  Provider: Voyage AI (Anthropic's recommended embeddings partner; generous
//  free tier). Swappable — only this file talks to the embedding API.
// ============================================================================

import "server-only";

import {
  defaultProcessInput,
  defaultProcessOutput,
  getEmbeddingAttributes,
  withSpan,
} from "@arizeai/phoenix-otel";

// voyage-3.5 outputs 1024-dim vectors. If you change the model, update this to
// match the new dimension AND drop the Redis index (see ensureIndex in
// memory-search.ts) so it rebuilds at the new size.
export const EMBED_DIM = 1024;

const MODEL = process.env.VOYAGE_MODEL ?? "voyage-3.5";

async function embedImpl(
  text: string,
  inputType: "document" | "query" = "document",
): Promise<number[]> {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) {
    throw new Error("Missing VOYAGE_API_KEY. See .env.local.example");
  }

  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      input: [text],
      model: MODEL,
      input_type: inputType,
    }),
  });

  if (!res.ok) {
    throw new Error(`Voyage embed failed: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as { data: { embedding: number[] }[] };
  const vec = json.data?.[0]?.embedding;
  if (!vec || vec.length !== EMBED_DIM) {
    throw new Error(
      `Voyage returned ${vec?.length ?? 0} dims, expected ${EMBED_DIM}`,
    );
  }
  return vec;
}

/**
 * Embed a single piece of text into a 1024-dim vector.
 * Traced as an OpenInference EMBEDDING span in Arize AX.
 */
export const embed = withSpan(embedImpl, {
  name: "voyage-embed",
  kind: "EMBEDDING",
  attributes: {
    "llm.provider": "voyage",
    "llm.model_name": MODEL,
  },
  processInput: defaultProcessInput,
  processOutput: (vec: number[]) => ({
    ...defaultProcessOutput({ dimensions: vec.length }),
    ...getEmbeddingAttributes({
      modelName: MODEL,
      embeddings: [{ vector: vec.slice(0, 16) }],
    }),
  }),
});
