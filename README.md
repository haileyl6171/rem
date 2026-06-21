# Rem — walk through your memories in 3D

Write down a moment (and drop a photo or video), and Rem turns it into a 3D
Gaussian-splat scene you can walk through. Built at the Berkeley AI Hackathon.

Two input modalities, same 3D output:

- **Text / photo** → creative vision (Pika) → AI video (Veo 3) →
- **Video** → re-graded to the memory's look (Pika fix-my-look; palette/lighting/mood
  changed, original geometry + camera motion preserved, so it stays COLMAP-friendly) →

…then → frames → COLMAP → gaussian-splat training → a `scene.ply` you explore in the browser.

---

## Architecture — 4 components, 2 deployments, 1 hosted DB

| Component        | Runs on                | Does                                        | Code                                                |
| ---------------- | ---------------------- | ------------------------------------------- | --------------------------------------------------- | ----------- |
| **Frontend**     | the user's **browser** | input UI, progress bar, 3D viewer           | `src/app/**/page.tsx`, `src/components/`            |
| **Backend**      | **Vercel** (Next API)  | create memory, start pipeline, serve status | `src/app/api/`, `src/lib/`                          |
| **DB + Storage** | **Supabase**           | the memory row (status + splat URL) + files | `schema.sql`, accessed via `src/lib/` & `pipeline/` |
| **GPU pipeline** | **Modal**              | the heavy ML: (video                        | images)→frames→COLMAP→gsplat→`scene.ply`            | `pipeline/` |

Frontend + Backend are **one Next.js app** (one deploy). The pipeline is a
**separate** Python deploy on Modal. Supabase is a hosted service.

```
 🟦 BROWSER ──HTTP──► 🟩 VERCEL (Next API) ──trigger──► 🟥 MODAL (GPU pipeline)
     ▲                      │                                  │
     │ poll status          │ create / read row                │ write status + splat
     │ download scene.ply    ▼                                  ▼
     └──────────────── 📦 SUPABASE (Postgres + Storage) ◄───────┘
```

The browser and the GPU never talk directly — **the DB is the shared whiteboard.**

---

## End-to-end flow

```
1. 🟦 Browser   user submits a journal entry + photo(s) and/or a video
2. 🟩 Backend   POST /api/memories → insert row (PENDING) → upload files → trigger Modal → return { id }
3. 🟥 GPU       run_pipeline:
                  agent layer → persona-coherent prompt / creative look (Gemini + Pika MCP)
                  generate    → Veo 3 video (photo/text)  OR  fix-my-look re-grade (video)
                  score       → scene-appropriate music (Pika MCP, optional)
                  reconstruct → frames → COLMAP → gaussian-splat training → scene.ply
                (writes status GENERATING→RECONSTRUCTING→TRAINING to the DB as it goes)
4. 🟥 GPU       upload scene.ply to Storage → update row (status=READY, splat_url=...)
5. 🟦 Browser   polls GET /api/memories/:id every 2s → sees READY → loads splat_url into the viewer
```

`POST→Modal` is **async** (fire-and-forget). The pipeline runs its steps
**in order (sync)**. The browser **polls** to learn when it's done. The big
`scene.ply` is downloaded **directly from Storage** — it never passes through the backend.

Memories are also **embedded** (Voyage AI) and indexed in **Redis** for
"find memories like this one" similarity search (`/api/memories/:id/similar`).

---

## The agent layer (how a memory becomes a coherent scene)

The pipeline is a plain script, but the GENERATE half is driven by a small set of
agents in `pipeline/agents/` so each new memory stays visually consistent with the
person's past memories. Two patterns:

**A. Prompted Gemini sub-agents** — one shared multimodal client, each agent is a
focused system prompt:

- `vision` — reads the uploaded photos **once** → a cached structured `PhotoAnalysis`.
- `analyzer` — past memories + this memory's vision → the recurring "world summary."
- `extractor` — pulls the slice of that world relevant to the new entry.
- `persona` — merges it into a persistent, evolving **persona spec** (the visual identity).

**B. Pika MCP tool-agents** — Gemini connected to the **Pika MCP server** as an MCP
_client_ (OAuth via `agents/pika_auth.py`), using automatic tool-calling:

- `creative` — authors the **creative vision** for the shot from the scene + persona.
- `fix_look` — runs Pika's _fix-my-look_ skill to re-grade an input **video** to the
  memory's look (palette/lighting/mood) while preserving geometry, motion and identity.
- `music` — picks scene-appropriate music (`search_music` / `generate_music`) and mixes
  it under the clip (`edit_audio_mix`).

`steps/compose_scene.py` orchestrates them: `vision → analyzer → extractor → persona →
creative vision → final prompt`. Every Pika MCP agent is **gated** (`PIKA_MCP_ENABLED`)
and **fail-safe** — if disabled or erroring it returns nothing and the pipeline falls
back (persona-only prompt, raw clip, no music), so reconstruction always runs.

---

## Repo structure

```
hack-berkeley/
├── src/                                  ── THE NEXT.JS APP (browser + backend) ──
│   ├── app/
│   │   ├── page.tsx                  🟦 ingest screen
│   │   ├── memories/[id]/page.tsx    🟦 progress → 3D viewer (polls status)
│   │   └── api/
│   │       ├── memories/route.ts             🟩 POST create + start pipeline, GET list
│   │       ├── memories/[id]/route.ts        🟩 GET status (the poll endpoint)
│   │       ├── memories/[id]/similar/route.ts 🟩 semantic "similar memories" search
│   │       └── redis-health/route.ts         🟩 Redis connectivity check
│   ├── components/                    🟦 ingest-screen, loading-screen, memory-viewer
│   ├── lib/
│   │   ├── supabase.ts               🟩 server-only Supabase client
│   │   ├── db.ts                     🟩 create/read the memories row
│   │   ├── storage.ts                🟩 upload inputs / public URLs
│   │   ├── modal.ts                  🟩 trigger the GPU pipeline
│   │   ├── embeddings.ts             🟩 text embeddings (Voyage AI)
│   │   ├── memory-search.ts          🟩 Redis vector index + KNN search
│   │   └── redis.ts                  🟩 Redis client
│   └── types/memory.ts               📜 shared types = Contract A + C
│
├── pipeline/                             ── THE GPU SERVICE (Modal) ──
│   ├── app.py                        🟥 Modal app + trigger endpoint
│   ├── run_pipeline.py               🟥 the recipe (generate → reconstruct)
│   ├── db.py / storage.py            🟥 Supabase status writes / file I/O
│   ├── media.py                      🟥 photo-vs-video detection + first-frame grab
│   ├── veo.py                        🟥 Veo 3 video generation (gated)
│   ├── persona_store.py              🟥 the evolving persona spec (singleton)
│   ├── smoke_test.py / full_test.py  🟥 local GENERATE tests (no GPU/Supabase)
│   ├── agents/                          ── the coherence agent layer ──
│   │   ├── client.py                 🟥 shared multimodal Gemini client
│   │   ├── vision.py                 🟥 one-time photo read (cached)
│   │   ├── analyzer.py               🟥 past memories → world summary
│   │   ├── extractor.py              🟥 relevant slice for this entry
│   │   ├── persona.py                🟥 merge slice → persona spec
│   │   ├── creative.py               🟥 creative vision (Pika MCP)
│   │   ├── fix_look.py               🟥 video re-grade (Pika fix-my-look)
│   │   ├── music.py                  🟥 scene-aware music (Pika MCP)
│   │   └── pika_auth.py              🟥 Pika MCP OAuth (authorize + refresh)
│   └── steps/
│       ├── compose_scene.py          🟥 orchestrates the agents → prompt + analysis
│       ├── generate_video.py         🟥 Veo 3: creative prompt → video
│       ├── make_prompt.py            🟥 legacy one-shot prompt (superseded)
│       ├── extract_frames.py         🟥 ffmpeg: video → frames
│       ├── colmap.py                 🟥 frames → camera poses
│       ├── train_gsplat.py           🟥 poses → trained gaussians
│       └── export.py                 🟥 → scene.ply
│
├── schema.sql                        📜 the memories table = Contract C
├── .env.local.example                📜 Next.js env keys
└── .agents/skills/                   📦 vendored Pika skills (fix-my-look, persona-builder, …)
```

---

## API & status

```
POST /api/memories              create a memory + start the pipeline
                                multipart: { description, photo? }  (the file may be a video)
                                → 201 { id }
GET  /api/memories              list memories
GET  /api/memories/:id          one memory (the browser polls this for status)
GET  /api/memories/:id/similar  semantically similar memories
```

Each memory moves through these states, which the UI renders:

```
PENDING → GENERATING → RECONSTRUCTING → TRAINING → READY | FAILED
```

Files live in the public `memories` Storage bucket: `…/inputs/<file>` (the upload),
`…/frames/…` (for COLMAP), and `…/scene.ply` (the splat the viewer loads).

---

## Local setup

### Prereqs

- Node 20+, Python 3.11+, a Supabase project, a Modal account.

### 1. Add the missing deps

```bash
npm i @supabase/supabase-js          # backend talks to Supabase
```

(`pipeline/requirements.txt` is installed inside the Modal image, not locally.)

### 2. Supabase

- Run `schema.sql` in the SQL editor.
- Create a **public** Storage bucket named `memories`.

### 3. Env

```bash
cp .env.local.example .env.local     # fill in the NEXT.JS section (Supabase, Voyage, Redis)
# set the PIPELINE values as a Modal secret:
modal secret create rem-secrets \
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  GEMINI_API_KEY=... MODAL_SECRET=...
# creative vision (Pika MCP, OAuth-only):
#   1) once, locally:  cd pipeline && python -m agents.pika_auth authorize   (browser)
#   2) ship the token file to Modal (PIKA_MCP_TOKEN_PATH) or set PIKA_MCP_REFRESH_TOKEN,
#      then enable with  PIKA_MCP_ENABLED=1   (silent refresh thereafter)
# video generation (Veo 3): add  VEO_ENABLED=1   (reuses GEMINI_API_KEY)
```

### 4. Run

```bash
npm run dev                          # frontend + backend → http://localhost:3000
modal serve pipeline/app.py          # GPU pipeline (dev URL) → put it in MODAL_URL
```

---

## Conventions & notes

- **Next.js 16 (App Router, Turbopack).** ⚠️ `params` in route handlers and
  server pages is a **`Promise` — `await` it** (see `api/memories/[id]/route.ts`).
  Per `AGENTS.md`, this Next version has breaking changes: **after `npm install`,
  verify specifics against `node_modules/next/dist/docs/`** before relying on
  any API. `node_modules` is not committed, so those docs aren't on disk yet.
- **Server vs client:** `src/lib/*` is server-only (holds the service-role key) —
  never import it from a `"use client"` component. The browser only talks to the
  backend via `fetch`.
- **Big files → Storage, never the DB.** The DB stores the `splat_url` string;
  the browser downloads the file straight from Storage.
- **AI architecture:** the pipeline _recipe_ is a plain sequential script, but the
  GENERATE half is driven by the **agent layer** (`pipeline/agents/`, see the section
  above). Models in play: **Gemini** (persona/coherence sub-agents + photo vision),
  **Pika MCP** (creative vision, fix-my-look video re-grade, music), **Veo 3** (video),
  and **Voyage AI** embeddings for similarity search. All Pika MCP calls are gated and
  fail-safe, so the splat still builds with them off. Backend calls are traced with
  **Arize Phoenix**.
