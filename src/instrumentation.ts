/**
 * Next.js server startup hook — registers Arize AX OpenTelemetry export.
 * Requires ARIZE_SPACE_ID + ARIZE_API_KEY in .env.local (from Arize dashboard).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const spaceId = process.env.ARIZE_SPACE_ID;
  const apiKey = process.env.ARIZE_API_KEY;
  if (!spaceId || !apiKey) {
    console.warn(
      "[arize] Skipping trace export — set ARIZE_SPACE_ID and ARIZE_API_KEY in .env.local",
    );
    return;
  }

  const { register: registerArize } = await import("@arizeai/phoenix-otel");

  registerArize({
    projectName: process.env.ARIZE_PROJECT_NAME ?? "hack-berkeley",
    url: "https://otlp.arize.com/v1/traces",
    headers: {
      space_id: spaceId,
      api_key: apiKey,
    },
    // Immediate export in dev so traces show up quickly at the booth.
    batch: process.env.NODE_ENV === "production",
  });

  console.info("[arize] Tracing enabled → hack-berkeley project on Arize AX");
}
