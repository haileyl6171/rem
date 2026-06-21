// ============================================================================
//  DEMO DATA — the self-contained demo's source of truth.
//
//  No backend, no Supabase, no Modal, no network. Every memory here points at a
//  gaussian-splat scene bundled in /public — our real reconstructions under
//  /public/real_use, plus the two detailed reference splats in /public — so the
//  whole create → load → explore flow works on stage entirely from local files.
// ============================================================================

import type { MemoryEntry } from "@/components/memory-grid";

/** A demo memory: the grid tile data + the local scene it opens. */
export interface DemoMemory extends MemoryEntry {
  /** Path to a real reconstructed scene in /public/real_use. */
  splatUrl: string;
  /** Short evocative caption shown on the viewer's title card. */
  caption: string;
  /** Capture label for the title card. */
  date: string;
}

// The real reconstructions we captured + trained for the demo.
export const DEMO_MEMORIES: DemoMemory[] = [
  {
    id: "redbull",
    title: "The Red Bull on the desk",
    caption: "hour twenty of the hackathon, running on this",
    date: "Hack Day",
    splatUrl: "/real_use/Redbull_Scene.ply",
    colorProfile: { base: "#7FA8C4", accent: "#A8CCE0" },
  },
  {
    id: "pingpong",
    title: "Ping pong in the break room",
    caption: "the one good rally we got on camera",
    date: "Hack Night",
    splatUrl: "/real_use/Ping_pong.ply",
    colorProfile: { base: "#8FB0A0", accent: "#B8D4C6" },
  },
  {
    id: "suhaan",
    title: "Suhaan on the stage",
    caption: "right before the demo went up",
    date: "Demo Day",
    splatUrl: "/real_use/Suhaan_Stage.ply",
    colorProfile: { base: "#A99BC4", accent: "#C8BCE0" },
  },
  // The two detailed reference splats from earlier.
  {
    id: "bonsai",
    title: "The bonsai by the window",
    caption: "the little tree that watched us work",
    date: "Reference",
    splatUrl: "/bonsai.splat",
    colorProfile: { base: "#88B0A4", accent: "#B4D6CB" },
  },
  {
    id: "dreamy",
    title: "A dreamy scene",
    caption: "a half-remembered place, soft at the edges",
    date: "Dreamt",
    splatUrl: "/real_use/scene_29999.ply",
    colorProfile: { base: "#B0A6D8", accent: "#D4CBF2" },
  },
  {
    id: "stage1",
    title: "The main stage",
    caption: "lights up, the room holding its breath",
    date: "Showtime",
    splatUrl: "/real_use/stage1_scene.ply",
    colorProfile: { base: "#C49BB0", accent: "#E0BCCF" },
  },
];

// The scene a newly generated memory opens into.
export const DEFAULT_NEW_SPLAT = "/real_use/Redbull_Scene.ply";

// Cool palette pool for memories the user creates during the demo.
const NEW_MEMORY_PALETTES = [
  { base: "#7FA8C4", accent: "#A8CCE0" },
  { base: "#8FB0A0", accent: "#B8D4C6" },
  { base: "#A99BC4", accent: "#C8BCE0" },
  { base: "#9FB3C4", accent: "#C2D2DE" },
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
