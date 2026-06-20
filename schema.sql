-- ============================================================================
--  CONTRACT C — the database schema (the spine everyone shares)
-- ============================================================================
--  Run this once in the Supabase SQL editor (Dashboard → SQL → New query).
--  Owned by P2 (Backend). If you change a column here, also update:
--    • src/types/memory.ts   (the TypeScript mirror the frontend reads)
--    • pipeline/db.py        (the columns the GPU writes)
--
--  Big files (photos, the .splat) DO NOT live here — only pointers to Storage.
-- ============================================================================

create table if not exists memories (
  id          uuid primary key default gen_random_uuid(),

  -- user input
  description text,                       -- the journal entry the user typed
  input_keys  jsonb        default '[]',  -- Storage paths of uploaded photos
                                          -- e.g. ["memories/<id>/inputs/photo.jpg"]

  -- pipeline state (the GPU updates these as it works; the browser polls them)
  status      text         default 'PENDING',  -- see the enum below
  progress    int          default 0,          -- 0–100, drives the progress bar
  error       text,                            -- human-readable; set only on FAILED

  -- result (null until the pipeline finishes)
  splat_url   text,                       -- public HTTPS URL of scene.splat in Storage

  created_at  timestamptz  default now(),
  updated_at  timestamptz  default now()
);

-- Keep updated_at fresh on every write (nice for debugging / sorting).
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_memories_updated_at on memories;
create trigger trg_memories_updated_at
  before update on memories
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
--  STATUS ENUM (Contract C) — these exact strings are used by ALL components.
--  Do not invent new values without telling the team.
--
--    PENDING        row created, GPU not started yet
--    GENERATING     making the video (Pika) + extracting frames
--    RECONSTRUCTING running COLMAP (camera poses)
--    TRAINING       training the gaussian splat
--    READY          done — splat_url is populated, viewer can load it
--    FAILED         something broke — error is populated
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
--  STORAGE BUCKET (Contract D)
--  Create a PUBLIC bucket named "memories" so the browser can download the
--  .splat directly over HTTPS. Easiest via Dashboard → Storage → New bucket
--  (toggle "Public"). Or uncomment the line below:
-- ----------------------------------------------------------------------------
-- insert into storage.buckets (id, name, public) values ('memories','memories',true)
--   on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
--  RLS: For a hackathon we talk to the DB only from the server (Next API +
--  Modal) using the SERVICE ROLE key, which bypasses RLS. So you can leave
--  RLS disabled. If you later expose the anon key to the browser, enable RLS
--  and add policies. (Default: leave as-is.)
-- ----------------------------------------------------------------------------
