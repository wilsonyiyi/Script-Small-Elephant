# Repository Guidelines

## Project Structure & Module Organization

ScriptCat is a TypeScript browser extension. Entry points live in `src/` (`content.ts`, `inject.ts`, `scripting.ts`,
`sandbox.ts`, and `manifest.json`). Shared logic is under `src/pkg/`, UI pages and React components are under
`src/pages/`, and extension assets/locales are under `src/assets/`. Internal packages live in `packages/`
(`filesystem`, `message`, `cloudscript`, `chrome-extension-mock`, `eslint`). Test helpers are in `tests/`, browser e2e
specs are in `e2e/`, build scripts are in `scripts/`, and custom tooling is in `eslint-rules/` and `rspack-plugins/`.

## Build, Test, and Development Commands

Use pnpm; `preinstall` enforces it.

- `pnpm install` installs dependencies.
- `pnpm run dev` starts the Rspack development build. Load `dist/ext` as an unpacked browser extension.
- `pnpm run dev:noMap` runs development mode without source maps, useful for incognito testing.
- `pnpm run build` creates a production build.
- `pnpm run pack` packages the extension after `dist` is built.
- `pnpm test` runs Vitest unit tests.
- `pnpm run test:e2e` runs Playwright e2e tests.
- `pnpm run lint` runs TypeScript checks and ESLint.
- `pnpm run format` formats the repository with Prettier.

## Coding Style & Naming Conventions

Use TypeScript and React functional components. Prettier uses 2-space indentation, semicolons, double quotes,
`printWidth: 120`, and ES5 trailing commas. ESLint requires type imports, ignores unused names only when
prefixed with `_`, enforces React Hooks rules, and requires Chrome `lastError` handling. Prefer utilities in `src/pkg/`
and package APIs in `packages/` before adding dependencies. Use PascalCase for component files and follow existing
kebab-case route/helper filenames.

## UI Component Rules

Do not add raw native controls such as `<button>`. Use wrapped project components from `src/pages/components/ui/`
or existing local wrapper components instead; create or extend a wrapper when a needed control is missing. This applies
to all reusable UI controls so focus handling, variants, accessibility, and styling stay consistent.

## Testing Guidelines

Place unit tests beside code as `*.test.ts` or `*.test.tsx`; examples include `src/pkg/utils/encoding.test.ts` and
`packages/message/server.test.ts`. Shared mocks belong in `tests/mocks/`. Use Vitest for unit/integration tests and
Playwright specs in `e2e/*.spec.ts` for browser workflows. Run `pnpm test` and `pnpm run lint` before submitting; run
`pnpm run test:e2e` for UI, extension, or permission changes.

## Commit & Pull Request Guidelines

Commits follow gitmoji-style messages, often Chinese, for example `🐛 修复 Sidebar 尺寸调整异常 (#1373)` or
`✨ add login feature`. Keep each commit focused. Open PRs against `main` unless directed otherwise, include a clear
description, link issues, and attach screenshots or recordings for UI changes. Note manual extension reloads for
`manifest.json`, service worker, offscreen, or sandbox changes.

## Security & Configuration Tips

Do not commit secrets, private extension keys, or generated artifacts from `dist/`. Packaging may need
`dist/scriptcat.pem` locally, but keep it out of source control. Keep locale updates in
`src/assets/_locales/*/messages.json` synced when changing user-facing strings.
