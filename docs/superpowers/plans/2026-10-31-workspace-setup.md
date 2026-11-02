# Ambient Lab CLI-first workspace implementation plan

> **For agentic workers:** Execute natively, task by task. User has authorized setup using official CLIs; no further approval is needed for this scope.

**Goal:** Create a functioning Nx-controlled workspace with pnpm JS/TS projects and uv Python/OpenCV projects.

**Execution status:** Completed on 2026-10-31. See ../../verification.md for executed checks and limitations. The Expect invocation did not complete; local Playwright/axe checks passed instead. Node was additionally pinned with the pnpm runtime CLI after discovering different shell/child-process versions.

**Architecture:** Four projects: Studio browser app, render CLI, shared audiovisual library, and Python media package. Compositions are data. Nx exposes all development, build, validation, and diagnostic commands.

**Tech Stack:** Nx, pnpm, TypeScript/Vite, Strudel, uv/Python 3.12, OpenCV/NumPy, existing FFmpeg/Chrome.

**Spec:** Current conversation: composition-centered structure; Nx owns orchestration; official CLI generation and dependency management are mandatory where supported. Foundation setup, not a finished music/video product.

## Global constraints

- Isolate work in /Users/light_one/AI_project/Media/ambient-lab.
- Generate the repository and JS/TS projects with Nx generators.
- Create Python projects with uv init; add dependencies with uv add and pnpm add.
- Handwrite only project-specific integration, documentation, and diagnostics.
- No Context7 calls, remote publishing, cloud-cache setup, or unrelated project edits.
- Keep actual export implementation explicitly pending until validated.

## Review focus

- Fresh dependency installation reproduces both environments from lockfiles.
- Nx recognizes Python and JS/TS projects and their dependency edges.
- A browser-only Strudel import must not break the Node CLI.
- Diagnostics fail visibly when required tools are absent.
- Workspace commands must work outside Codex via a standalone pnpm executable.

## Task 1: Generate the workspace

- [x] Install standalone pnpm through npm's CLI.
- [x] Run the pinned create-nx-workspace CLI with pnpm, no cloud, and no automatic GitHub push.
- [x] Record generator commands and exact tool versions.

## Task 2: Generate executable projects

- [x] Use Nx add/generate for Studio, renderer, and audiovisual library.
- [x] Use uv init for root and Python media member; uv add for OpenCV/NumPy.
- [x] Register Python targets through Nx's run-commands generator where supported.
- [x] Add Strudel and browser tooling through pnpm.

## Task 3: Add project-specific integration

- [x] Define a small composition manifest and shared validation.
- [x] Connect Studio/renderer to shared library and media diagnostics to uv.
- [x] Add no-cache Nx diagnostics and reproducible build/typecheck targets.
- [x] Document future export stages without fake successful export commands.

## Task 4: Verify and document

- [x] Nx project graph includes four intended projects.
- [x] Build/typecheck and Python lint/check targets pass.
- [x] Open Studio in a browser; verify shared composition data and Strudel initialization.
- [x] Run expect-cli for browser-facing changes; disclose unavailable external test prerequisites if any.
- [x] Verify lockfile installs and fresh-shell CLI resolution.
- [x] Save README, CLI provenance, and verification results.
