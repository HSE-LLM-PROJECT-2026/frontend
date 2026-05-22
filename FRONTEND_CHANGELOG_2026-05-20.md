# Frontend Changes — 2026-05-20

This document records the latest UX/functional frontend updates applied in the current workspace before redeploy.

## Scope

Repository: `frontend`

Primary touched pages:
- `src/pages/Releases.tsx`
- `src/pages/TechnicalTokens.tsx`

## 1) Releases form UX simplification (`Releases.tsx`)

### What was changed

1. Added explicit loading state for release form selectors.
- While routes/deployments are fetched, selects now show `Идёт загрузка...`.
- Empty states are explicit:
  - `Нет доступных route alias`
  - `Нет доступных deployment`

2. Removed manual/extra fields that were not needed.
- Removed `Release Type` switch (`Standard` / `Migration`).
- Removed target custom block:
  - `💡 Конфигурация параметров нового деплоймента (Target)`
  - `Custom Configure`

3. Made SLO override optional.
- Added toggle `SLO Thresholds (Auto-Rollback) — опционально`.
- SLO fields are shown and sent only when toggle is enabled.

4. Added auto-detection and auto-fill.
- `routeId` initializes from available routes.
- `sourceId` and `targetId` are auto-derived from route backends + weights.
- Source select is read-only (auto-resolved) to reduce user errors.
- Release name is optional; if empty, auto-generated from route/target and timestamp.

5. Improved submit safety.
- Added inline submit error area.
- Submit disabled while form options are loading or required resolved values are absent.

### Result

Release creation now requires fewer manual inputs and is closer to “safe defaults / auto-resolve” behavior.

## 2) Technical Tokens UX: one-click cURL copy (`TechnicalTokens.tsx`)

### What was changed

1. Added direct per-row action button:
- New button in token row actions: `Copy cURL`.
- Copies ready-to-run cURL command in one click for that specific token/deployment.

2. Added row-level visual feedback:
- On successful copy for a row, button changes to `Copied` briefly.

3. Added safe fallback behavior:
- If full token value is not available (only prefix is known), copied cURL uses:
  - `<PASTE_TECHNICAL_TOKEN_HERE>`
- UI displays success hint telling user to replace placeholder with real token.

4. Existing cURL modal flow retained.
- Legacy `cURL` button (open modal with command preview) remains available.

### Result

Technical token workflow is faster for operators: direct copy from list without opening modal.

## Build verification

Build executed successfully after changes:

```bash
cd frontend
npm run build
```

Status: success.

## Redeploy note

Redeploy is performed via:

```bash
cd frontend/deploy
./rebuild-delete-deploy.sh
```

(With network/registry/cluster reachability requirements from existing deploy scripts.)
