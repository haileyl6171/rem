# Rem — walk through your memories in 3D

Write down a moment (and drop a photo or video), and Rem turns it into a 3D
Gaussian-splat scene you can walk through. Built at the Berkeley AI Hackathon.

Text/photo → AI video (Pika) → frames → COLMAP → gaussian-splat training →
a `scene.ply` you explore in the browser.

---

## Architecture — 4 components, 2 deployments, 1 hosted DB

| Component | Runs on | Does | Code |
|---|---|---|---|
| **Frontend** | the user's **browser** | input UI, progress bar, 3D viewer | `src/app/**/page.tsx`, `src/components/` |
| **Backend** | **Vercel** (Next API) | create memory, start pipeline, serve status | `src/app/api/`, `src/lib/` |
| **DB + Storage** | **Supabase** | the memory row (status + splat URL) + files | `schema.sql`, accessed via `src/lib/` & `pipeline/` |
| **GPU pipeline** | **Modal** | the heavy ML: (video|images)→frames→COLMAP→gsplat→`scene.ply` | `pipeline/` |

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
1. 🟦 Browser   user submits journal + photo
2. 🟩 Backend   POST /api/memories → insert row (PENDING) → upload photo → trigger Modal → return { id }
3. 🟥 GPU       run_pipeline: prompt → video → frames → COLMAP → gsplat → scene.splat
                (writes status GENERATING→RECONSTRUCTING→TRAINING to the DB as it goes)
4. 🟥 GPU       upload scene.splat to Storage → update row (status=READY, splat_url=...)
5. 🟦 Browser   polls GET /api/memories/:id every 2s → sees READY → loads splat_url into the viewer
```

`POST→Modal` is **async** (fire-and-forget). The pipeline runs its steps
**in order (sync)**. The browser **polls** to learn when it's done. The big
`scene.ply` is downloaded **directly from Storage** — it never passes through the backend.

---

## Repo structure

```
hack-berkeley/
├── src/                                  ── THE NEXT.JS APP (browser + backend) ──
│   ├── app/
│   │   ├── page.tsx                  🟦 ingest screen (exists)                  [P1]
│   │   ├── memories/[id]/page.tsx    🟦 progress → 3D viewer (polls status)     [P1]
│   │   └── api/
│   │       ├── memories/route.ts     🟩 POST create + start pipeline, GET list  [P2]
│   │       └── memories/[id]/route.ts 🟩 GET status (the poll endpoint)         [P2]
│   ├── components/                    🟦 ingest-screen, loading-screen, memory-viewer [P1]
│   ├── lib/
│   │   ├── supabase.ts               🟩 server-only Supabase client            [P2]
│   │   ├── db.ts                     🟩 create/read the memories row           [P2]
│   │   ├── storage.ts                🟩 upload photos / public URLs            [P2]
│   │   └── modal.ts                  🟩 trigger the GPU pipeline               [P2]
│   └── types/memory.ts               📜 shared types = Contract A + C          [P2]
│
├── pipeline/                             ── THE GPU SERVICE (Modal) ──
│   ├── app.py                        🟥 Modal app + trigger endpoint           [P3]
│   ├── run_pipeline.py               🟥 the recipe (runs steps in order)       [P3]
│   ├── db.py                         🟥 write status to Supabase               [P3]
│   ├── storage.py                    🟥 download inputs / upload scene.ply     [P3]
│   ├── requirements.txt              🟥 python deps for the image              [P3]
│   └── steps/
│       ├── make_prompt.py            🟥 journal → video prompt (Claude)        [P3]
│       ├── generate_video.py         🟥 Pika: prompt → video                   [P3]
│       ├── extract_frames.py         🟥 ffmpeg: video → frames                 [P3]
│       ├── colmap.py                 🟥 frames → camera poses                  [P4]
│       ├── train_gsplat.py           🟥 poses → trained gaussians              [P4]
│       └── export.py                 🟥 → scene.splat                          [P4]
│
├── schema.sql                        📜 the memories table = Contract C        [P2]
├── .env.example                      📜 every key everyone needs               [P2]
└── public/sample_memory.splat        🟦 reference splat (used by the stub)
```

---

## The contracts

These four contracts let all 4 people work in parallel against mocks. **Agree on
them in hour 1; don't change them silently.**

### Contract A — HTTP API (Frontend ↔ Backend)
```
POST /api/memories          multipart/form-data: { description: string, photo?: File }
  → 201 { id: string }

GET  /api/memories/:id      → Memory   (the poll endpoint; see the Memory type)
GET  /api/memories          → Memory[] (optional gallery)
```
Types live in `src/types/memory.ts`.

### Contract B — Pipeline trigger (Backend ↔ GPU)
```
POST $MODAL_URL    header: X-Secret: $MODAL_SECRET
  body: { memoryId: string, inputKeys: string[], description: string }
  → { ok: true }      (returns immediately; pipeline runs in background)
```

### Contract C — DB row + status enum (everyone)
The `memories` table (`schema.sql`), mirrored in `src/types/memory.ts`. Status:
```
PENDING → GENERATING → RECONSTRUCTING → TRAINING → READY | FAILED
```
- Backend **creates** the row and **reads** it.
- GPU **updates** status / progress / splat_url / error.
- Frontend **reads** status (poll) and loads `splat_url` on READY.

### Contract D — Storage paths (GPU ↔ Browser, and within the pipeline)
```
memories/{id}/inputs/<file>        ← backend writes the upload
memories/{id}/frames/frame_*.jpg   ← extract_frames writes,  colmap reads   (P3→P4 handoff)
memories/{id}/scene.ply          ← export writes,          browser reads
```
Bucket name: `memories` (public).

---

## Team of 4

Assign by skill — strongest **ML/CV/3D → P4** (hardest), **frontend → P1**,
strongest **integrator → P2**.

| | Owns | Talks to others via |
|---|---|---|
| **P1 Frontend** | `app/*/page.tsx`, `components/` | Contract A (HTTP) |
| **P2 Backend/glue** | `app/api/`, `lib/`, `types/`, `schema.sql`, `.env` | **writes all 4 contracts** |
| **P3 Pipeline: generation** | `app.py`, `run_pipeline.py`, `db.py`, `storage.py`, `steps/make_prompt`+`generate_video`+`extract_frames` | Contract B (in), D (frames out) |
| **P4 Pipeline: reconstruction** | `steps/colmap`+`train_gsplat`+`export` | Contract D (frames in, splat out) |

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
cp .env.example .env.local           # fill in the NEXT.JS section
# set the PIPELINE values as a Modal secret:
modal secret create rem-secrets \
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  ANTHROPIC_API_KEY=... PIKA_API_KEY=... MODAL_SECRET=...
```

### 4. Run
```bash
npm run dev                          # frontend + backend → http://localhost:3000
modal serve pipeline/app.py          # GPU pipeline (dev URL) → put it in MODAL_URL
```

---

## Build order (de-risk the GPU path first)

1. **Hour 1 (together):** P2 finalizes `schema.sql`, the status enum, Storage
   paths, and the API shapes. Everyone else starts against stubs.
2. **Loop first, ML later:** P3 ships a stub `run_pipeline` that just `sleep`s
   through each status and copies `public/sample_memory.splat` to the output
   path. This proves the **whole create→poll→READY→render loop** with no ML.
3. **P4 in parallel:** get `frames → scene.splat` working on a **pre-recorded
   phone video** TODAY (COLMAP → gsplat → export). This is the riskiest piece.
4. **Plug in Pika** (P3) once the loop and reconstruction both work.
5. **Polish / creative layer** (memory bubbles, guided walkthrough) — only after
   the end-to-end demo is solid. *Optional.*

Because every stub honors the contracts, swapping a stub for the real thing is a
drop-in change.

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
- **AI scope:** the core pipeline is a plain sequential script, not an agent.
  The only AI calls are Pika (video) and one Claude call (`make_prompt`). An
  agentic "check the video and retry" loop is a *stretch goal*, not scaffolding.
- **Existing prototype:** `src/app/page.tsx` currently fakes the loading→viewer
  flow in memory. The real flow is: ingest → `POST /api/memories` →
  `router.push('/memories/'+id)` → the new page polls and renders. `memory-viewer.tsx`
  needs a `src` prop so it can load `splat_url` instead of the hardcoded sample.
```
