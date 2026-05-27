# Compendium Pack Build

Source-format compendium packs. The authoritative content lives as YAML
under `src/packs/<pack-name>/` (one file per document). The LevelDB
binaries under `packs/<pack-name>/` are built artifacts — gitignored.

## Why

Foundry's LevelDB pack format produces unreadable binary diffs in git and
gets rewritten on every world load, creating permanent worktree dirt. YAML
source is diff-able, mergeable, and stable.

## Workflow

### After editing in Foundry's compendium UI

1. Close Foundry (LevelDB is locked while the world is open).
2. `npm run unpack` — dumps the live LevelDB to `src/packs/`.
3. `git diff src/packs/` — review the change.
4. `git add src/packs/ && git commit`.

### After editing YAML source directly

1. Close Foundry.
2. `git diff src/packs/` — sanity-check the edit.
3. `npm run pack` — rebuilds the LevelDB from source.
4. Open Foundry, verify the change in-world.
5. `git add src/packs/ && git commit`.

### CI release

`.github/workflows/main.yml` runs `npm install && npm run pack` before
zipping. The committed YAML source is the source of truth; the LevelDB
in the release zip is generated.

## Files

- `unpack.mjs` — `LevelDB → YAML` for every pack declared in module.json.
- `pack.mjs`   — `YAML → LevelDB` for every pack with a source dir.

Both scripts iterate over `module.json`'s `packs[]` array — adding or
removing a pack in the manifest automatically wires it into the build.

## Gotchas

- **World must be closed** for either script. Both fail loudly if not.
- **Pack-LevelDB is gitignored** after this refactor (`packs/*/{*.ldb,*.log,LOCK,...}`).
  Don't unstage it; treat it as build output.
- **First-time setup** in a fresh clone: `npm install && npm run pack`
  before launching Foundry — otherwise the in-world packs will be empty.
