<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->

## Ambient Lab rules

- Nx owns project discovery and task execution. pnpm owns JS/TS dependencies; uv owns Python dependencies and environments.
- Use official Nx generators for apps/libraries, pnpm add/remove for JS dependencies, and uv init/add/remove/sync for Python. Never hand-edit lockfiles.
- Direct edits are appropriate for product code, composition data, documentation and integration settings unsupported by generators. A shell script that writes a manifest is not a substitute for the owning CLI.
- Do not call Context7 unless the user explicitly requests it.
- The user has authorized the production pipeline: fractal rendering, audio response, WAV/MP4 export, and verified repeatability. Report only capabilities verified against real outputs; diagnostic encoding is not an artwork export.
- Browser-only Strudel code belongs behind the audiovisual/audio entry point. Node tools use the neutral root entry point.
- Do not cache real-time audio, camera capture or environment diagnostics. Keep media outputs under ignored runs/.
- No Nx Cloud, remote publishing or global user/model configuration changes are required.

## Concept-led production

- Each concept determines its own production process. There is no mandatory sequence or single best creative workflow.
- Support audio-first, visual-first, co-development, live exploration, offline rendering and hybrid approaches as needed by the work. These are design requirements, not claims that every mode is implemented today.
- Treat the current Strudel-to-Julia export pipeline as one working recipe. Do not make its instrument choices, renderer, direction of influence, or preparation steps universal requirements.
- Build reusable capabilities that experiments can combine, replace, skip and revisit. Do not require freezing music before visual exploration or require every visual to react to audio.
- Keep technical dependencies explicit, but do not turn them into prescribed creative stages. Nx coordinates tasks; it does not dictate artistic decisions.

## Project-local model collaboration

- User explicitly requests GPT-6.1 Terra at maximum supported reasoning for complex production coding. Apply `docs/agent-system/model-routing.json`: `model: gpt-6.1-terra`, `reasoning_effort: ultra`, `fork_turns: none` when spawning these implementation workers. Use a compact, self-contained brief and explicit non-overlapping file ownership.
- Preserve the lead's current model for creative integration and an independent critic for evidence-based review. Reuse workers for follow-ups; avoid duplicating full conversations and exploration. Do not reduce artifact quality to save context.
- Keep heavy renders sequential. This local collaboration contract does not authorize global model-setting changes. Apply `/Users/light_one/.codex/skills/agent-system-engineering/SKILL.md` when revising this arrangement. Report measured token savings only when actual telemetry exists.
- User also explicitly assigns GPT-6 Astra to regulate artistic complexity and limits. Terra handles substantial computation/implementation; savings from reduced duplicate context should support richer structure, not simpler artwork. Show actual image-review evidence and before/after decisions to the user; distinguish agent review from user approval.
- Preserve versions and provenance without forcing every exploratory session to be deterministic. State and verify the reproducibility guarantees of each chosen production mode separately.
- Intended finished works span roughly 5–60 minutes across varied genres and visual forms. Do not claim long-form support until the relevant mode has been exercised at that duration.

## Sound–visual workbench review

- User requests an independent review agent for workbench production. Reuse that critic across implementation/review cycles and fix observed blockers before reporting completion. Review is evidence-based; critic approval is not user approval of artistic taste.
- Acceptance includes actual Strudel music generation, WAV validity, video containing that music on the same timeline, visible effects at control boundaries, honest tool capability labels, and editable/saveable workflow settings. A rendered still or successful build alone is insufficient.
- Keep review evidence and failed attempts in `docs/agent-system/workbench-critique.md` and `workbench-state.md`; generated test media belongs under `runs/`. Check current files against those records before resuming.
- When native routes are only handoff plans, label them as such. Do not present the browser preview as a live TouchDesigner/cables output. Distinguish exact offline rendering from real-time browser recording and report tested duration separately from configurable limits.
