# Workspace verification — 2026-10-31

This records the workspace foundation, not a completed fractal/artwork renderer.

## Passed

- `pnpm install --frozen-lockfile` and `uv sync --locked --all-packages` accepted their lockfiles.
- A fresh login shell resolves standalone `~/.local/bin/pnpm` 11.25.0 and `~/.local/bin/uv`.
- `pnpm exec node` uses project-managed Node 22.22.2 after `pnpm runtime set node 22.22.2`.
- `pnpm run check`: 8 Nx tasks succeeded (build/typecheck/Python lint/schema tests); 4 schema tests passed.
- `pnpm run inspect`: valid sample manifest, explicitly reports `exportImplemented: false`.
- `pnpm run doctor`: Python 3.12.11, OpenCV 5.0.0, NumPy 2.5.4, 124 detected edge pixels, verified one-second H.264/AAC encode; Chrome WebGL2 with M1 Max Metal renderer and nonzero offline audio output.
- `pnpm nx run render:smoke`: real Strudel nonzero output, silence after Stop, rapid restart, keyboard control, 30-second auto-stop, zero browser errors, zero axe WCAG A/AA violations, no horizontal overflow at 375px. Repeated after pinning the Node runtime.
- Inspected Nx graph: exactly `studio`, `render`, `audiovisual`, `media`; both JS apps depend on audiovisual; render doctor explicitly schedules media doctor.
- Actual cache regression check: changed a composition title, rebuilt Studio and found the new title in its bundle; restored the original file and verified the rebuilt/restored bundle contained no temporary title.

The last browser run reported first contentful paint at 40ms on this local machine. This is a local smoke measurement, not a production performance benchmark or full Web Vitals audit.

## Review fixes

A read-only independent review identified a missing composition input in Studio's build cache and an unused generated render watch target with a wrong working directory. The build input was added and regression-checked; unused renderer watch/deployment targets were removed. Only supported inspect/diagnostic/build operations are advertised.

## Limitations

`expect-cli` was invoked for adversarial browser verification but produced no output for several minutes and was terminated. The local Playwright + axe smoke check above supplied the browser evidence instead; no successful Expect report is claimed.

The complete Strudel offline export path, synchronized fractal rendering and final artwork output are not implemented or verified. Python build-backend tooling is resolved by uv build's isolated build environment; the runtime environment is locked by uv.lock. No cloud cache, deployment or remote repository was configured.

Machine-local evidence: `runs/verification/project-graph.json` and browser screenshots. Generated outputs and diagnostic media are not committed.
