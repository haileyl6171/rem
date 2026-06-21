// ============================================================================
//  Arize / OpenInference tracing helpers — SERVER ONLY.
// ============================================================================

import "server-only";
import {
  context,
  getRetrieverAttributes,
  setMetadata,
  traceChain,
  withSpan,
} from "@arizeai/phoenix-otel";

export { context, setMetadata, traceChain, withSpan };

/** Attach memory id to all child spans in a request (visible in Arize metadata). */
export function withMemoryTrace<T>(
  memoryId: string,
  fn: () => Promise<T>,
): Promise<T> {
  return context.with(setMetadata(context.active(), { memory_id: memoryId }), fn);
}

export function retrieverSpanOptions() {
  return {
    name: "redis-vector-knn",
    kind: "RETRIEVER" as const,
    attributes: {
      "db.system": "redis",
      "db.operation": "FT.SEARCH KNN",
      // Records which app version produced the trace (pre/post Arize-driven filter).
      "app.relevance_threshold": Number(process.env.MEMORY_RELEVANCE_THRESHOLD ?? 0.6),
    },
    processOutput: (results: { id: string; description: string; score: number }[]) =>
      getRetrieverAttributes({
        documents: results.map((r) => ({
          id: r.id,
          content: r.description,
          score: r.score,
        })),
      }),
  };
}
