# CLI provenance — 2026-10-31

The user requested CLI use where a tool owns the operation, and direct editing where the project owns the content. No lockfile was handwritten.

## Initialization

```sh
npm install --global --prefix ~/.local pnpm@11.25.0
pnpm dlx create-nx-workspace@24.0.3 ambient-lab --preset=apps --workspaceType=integrated --packageManager=pnpm --useProjectJson=true --formatter=prettier --nxCloud=skip --analytics=false --aiAgents=none --interactive=false --skipGit --skipGitHubPush
git init -b main
```

Nx 24 mapped `apps` to its official empty template. That template initially used Nx 24.0.0, so core packages were aligned with the 24.0.3 generators using `pnpm add -Dw --save-exact nx@24.0.3 @nx/js@24.0.3`. `pnpm approve-builds nx` enabled Nx's required postinstall explicitly.

## Nx-generated projects

```sh
pnpm nx add @nx/web@24.0.3 --yes
pnpm nx g @nx/web:application apps/studio --name=studio --bundler=vite --style=css --unitTestRunner=none --e2eTestRunner=none --linter=none --useProjectJson=true --no-interactive
pnpm nx g @nx/js:library packages/audiovisual --name=audiovisual --importPath=@ambient-lab/audiovisual --bundler=none --unitTestRunner=none --linter=none --useProjectJson=true --no-interactive
pnpm nx add @nx/node@24.0.3 --yes
pnpm nx g @nx/node:application apps/render --name=render --framework=none --bundler=esbuild --unitTestRunner=none --e2eTestRunner=none --linter=none --useProjectJson=true --no-interactive
```

Dry runs were used before generation. The web generator could not dry-run while fetching Vite; the other project dry runs succeeded. Generator source and CLI help were inspected. The `nx-generate`, `nx-workspace` and `link-workspace-packages` guidance shipped by Nx was followed.

## Dependencies and Python

```sh
pnpm --filter @ambient-lab/audiovisual add --save-exact @strudel/web
pnpm --filter @org/studio --filter @org/render add @ambient-lab/audiovisual --workspace
pnpm --filter @org/render add --save-exact playwright
pnpm --filter @org/render add -D --save-exact @axe-core/playwright
pnpm runtime set node 22.22.2
pnpm add -Dw --save-exact @types/node@22
uv init --bare --no-package --name ambient-lab --python 3.12 --vcs none --no-readme
uv init --package --app --name ambient-media --python 3.12 --build-backend hatch --vcs none --author-from none python/media
uv python pin 3.12
uv add --package ambient-media opencv-python-headless numpy
uv add --dev ruff
uv sync --all-packages
pnpm nx sync --yes
```

`uv init` added the Python workspace member automatically. A root Python pin was added explicitly because `uv init --bare --python 3.12` sets the minimum version but does not create a version pin. The installed project environment uses Python 3.12.11.

The fresh shell initially selected Node 22 but pnpm child commands selected Homebrew Node 26. The supported `pnpm runtime set` CLI corrected this at project scope and wrote the runtime declaration and lockfile. A legacy `useNodeVersion` setting was rejected by pnpm 11 and removed through `pnpm config delete`; it is not part of the final setup.

## Custom integration

The Python Nx project registration is handwritten because it wraps an existing uv-created package. Its `doctor`, `lint` and `build` targets were then generated with `@nx/workspace:run-commands`. The same generator created render `inspect` and `doctor` targets. Task dependencies, cache policies, browser DOM typing, package export boundaries and root script aliases were tailored directly.

The same Nx target generator registered `audiovisual:test` and `render:smoke`. Studio build inputs explicitly include composition JSON, and schema tests include their external fixture/tool files. Generated render watch/deployment targets were removed because this local CLI does not offer a server or standalone deployment package.

Product code, composition data and documentation were directly edited. The unused generated welcome component/test was removed; no empty test target was left behind. The generated npm/Nx Cloud CI was removed rather than left as a misleading pipeline.

## Production implementation

The production task shells were generated through the same owning CLI:

```sh
pnpm nx g @nx/workspace:run-commands export --project=render --command='node apps/render/dist/main.js export' --no-interactive
pnpm nx g @nx/workspace:run-commands audio --project=render --command='node apps/render/dist/main.js audio' --no-interactive
pnpm nx g @nx/workspace:run-commands reproduce --project=render --command='node apps/render/dist/main.js reproduce' --no-interactive
pnpm nx g @nx/workspace:run-commands verify --project=media --command='uv run --locked --package ambient-media ambient-media verify' --no-interactive
pnpm nx g @nx/workspace:run-commands test --project=media --command='uv run --locked --package ambient-media python -m unittest discover -s python/media/tests -v' --no-interactive
pnpm nx g @nx/workspace:run-commands test --project=render --command='tsx --test tools/pipeline.spec.ts' --no-interactive
```

Custom task dependencies and cache inputs were edited after generation. Export tasks bypass cache and depend on both app builds. FFmpeg/FFprobe are invoked with argument arrays, and Python validation uses `uv run --locked`. No additional runtime package or lockfile edit was needed for this implementation. Formatting uses `pnpm nx format:write --all` and `uv run --locked ruff format python/media`.
