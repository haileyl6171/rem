// ============================================================================
//  DEMO DATA — the self-contained demo's source of truth.
//
//  No backend, no Supabase, no Modal, no network. Every memory here points at a
//  .splat file BUNDLED in /public, so the whole create → load → explore flow
//  works on stage even with the WiFi unplugged. Swap a path to /bonsai.splat or
//  /sample_memory.splat (both shipped) — or drop a new .splat in /public and
//  point at it.
// ============================================================================

import type { MemoryEntry } from "@/components/memory-grid";

/** A demo memory: the grid tile data + the local scene it opens. */
export interface DemoMemory extends MemoryEntry {
  /** Path to a .splat in /public — loaded directly by the viewer. */
  splatUrl: string;
  /** Short evocative caption shown on the viewer's title card. */
  caption: string;
  /** Faux capture date for the title card. */
  date: string;
}

// Two scenes ship in /public. The richer (bigger) bonsai is the "hero" memory;
// the lighter sample loads instantly and is the default for freshly generated
// memories so the demo stays snappy.
const HERO_SPLAT = "/bonsai.splat";
const LIGHT_SPLAT = "/sample_memory.splat";

export const DEMO_MEMORIES: DemoMemory[] = [
  {
    id: "1",
    title: "Golden hour on the porch",
    caption: "the light went amber and nobody wanted to go inside",
    date: "Aug 2023",
    splatUrl: HERO_SPLAT,
    colorProfile: { base: "#8B4513", accent: "#A65E2E" },
  },
  {
    id: "2",
    title: "Morning fog in the valley",
    caption: "the whole valley breathing slow under a grey blanket",
    date: "Nov 2023",
    splatUrl: LIGHT_SPLAT,
    colorProfile: { base: "#C87533", accent: "#E09050" },
  },
  {
    id: "3",
    title: "Rain on the cobblestones",
    caption: "every streetlight smeared into the wet stone",
    date: "Mar 2024",
    splatUrl: LIGHT_SPLAT,
    colorProfile: { base: "#A0522D", accent: "#BF6F45" },
  },
  {
    id: "4",
    title: "Autumn leaves at the creek",
    caption: "the water carried the red ones away one by one",
    date: "Oct 2023",
    splatUrl: HERO_SPLAT,
    colorProfile: { base: "#D4883A", accent: "#E8A060" },
  },
  {
    id: "5",
    title: "Dusty road at sunset",
    caption: "the heat still rising off the gravel at dusk",
    date: "Jul 2023",
    splatUrl: LIGHT_SPLAT,
    colorProfile: { base: "#6B3A2A", accent: "#8B5540" },
  },
  {
    id: "6",
    title: "Old bookshop on Market St",
    caption: "paper and dust and a bell over the door",
    date: "Feb 2024",
    splatUrl: LIGHT_SPLAT,
    colorProfile: { base: "#CC6B3C", accent: "#E08858" },
  },
  {
    id: "7",
    title: "Wind through the wheat field",
    caption: "a slow gold tide going all the way to the fence line",
    date: "Jun 2023",
    splatUrl: HERO_SPLAT,
    colorProfile: { base: "#8E6540", accent: "#B08560" },
  },
  {
    id: "8",
    title: "First snow on the rooftop",
    caption: "the city gone quiet and white before anyone woke",
    date: "Dec 2023",
    splatUrl: LIGHT_SPLAT,
    colorProfile: { base: "#5C3D2E", accent: "#7A5845" },
  },
];

// The scene a newly generated memory opens into (fast-loading by design).
export const DEFAULT_NEW_SPLAT = LIGHT_SPLAT;

// A warm palette pool for memories the user creates during the demo.
const NEW_MEMORY_PALETTES = [
  { base: "#B56A40", accent: "#D08858" },
  { base: "#9C5A35", accent: "#C07A4A" },
  { base: "#7A4A30", accent: "#A66B45" },
  { base: "#C8753A", accent: "#E29A5E" },
];

/**
 * Turn a freshly-submitted memory into a DemoMemory that can be added to the
 * grid and opened in the viewer — entirely client-side, no backend round-trip.
 */
export function buildDemoMemory(description: string, index: number): DemoMemory {
  const palette = NEW_MEMORY_PALETTES[index % NEW_MEMORY_PALETTES.length];
  const trimmed = description.trim();
  const title =
    trimmed.length > 0
      ? trimmed.split(/\s+/).slice(0, 5).join(" ")
      : "A memory without words";
  return {
    id: `new-${Date.now()}`,
    title: title.charAt(0).toUpperCase() + title.slice(1),
    caption: trimmed || "reconstructed from a moment",
    date: "Just now",
    splatUrl: DEFAULT_NEW_SPLAT,
    colorProfile: palette,
  };
}
