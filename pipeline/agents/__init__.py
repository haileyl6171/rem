# ============================================================================
#  The coherence agent layer.
#
#  This package upgrades the GENERATE half of the pipeline from two flat Gemini
#  calls (make_prompt → generate_video) into a small multi-agent system that
#  makes each new memory's scene COHERENT with the person's past memories.
#
#  Orchestrator:  steps/compose_scene.py
#  Subagents:     agents/analyzer.py   — reads the past, summarizes the world
#                 agents/extractor.py  — pulls the slice relevant to the new entry
#                 agents/persona.py    — merges it into a persistent persona spec
#
#  Everything here runs on the Gemini API. The only paid video calls live in
#  pipeline/veo.py and are skipped unless VEO_ENABLED=1, so this layer works
#  end-to-end with zero video spend.
# ============================================================================
