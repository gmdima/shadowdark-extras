# Changelog

All notable changes to this fork of `shadowdark-extras` are documented here.

Format based loosely on [Keep a Changelog](https://keepachangelog.com/).

## [6.10.20] — 2026-05-27 — Foundry v14 / Shadowdark 4.x compatibility sweep

A maintenance release fixing twelve regressions exposed by Foundry v13/v14
and Shadowdark 4.x. None of these change existing behavior beyond making
broken things work again. Verified against Foundry 14.363 / Shadowdark 4.0.6.

### Fixed

- **Enhanced-header ability checks were silent (`7abdee2`).** Clicking
  STR/DEX/CON/INT/WIS/CHA chips on the PC sheet's enhanced header did
  nothing. The handler called the legacy `actor.rollAbility(...)`, which
  SD 4.x removed in favor of `actor.system.rollStatCheck(abilityId, {skipPrompt})`.
  Swapped to the SD 4.x call, with Shift-click → `skipPrompt` and a
  legacy fallback for SD &lt;4 worlds. Initiative was unaffected because it
  routes through Foundry core `game.combat.rollInitiative`.

- **Turn Undead spell threw on cast (`71dc819`, `53d93b0`).** Two
  separate v14/SD-4.x breakages in the bundled macro:
  - `actor.rollAbility("cha", {chatMessage:false})` for the opposed CHA
    check no longer exists; its SD 4.x replacement (`rollStatCheck` →
    `rollFromConfig`) always posts a chat card, which would spam one
    card per undead and break the aggregated single-card UX. Replaced
    with a direct `1d20 + CHA mod` roll via core `Roll`, staying silent
    so the existing aggregated chat card still works.
  - `canvas.grid.measureDistance(casterToken, t)` for the range filter
    was removed in Foundry v13+. Replaced with
    `canvas.grid.measurePath([a, b]).distance` + a v12 fallback.

- **Condition application threw setting `rounds` (`53d93b0`).** When a
  spell applied a duration condition,
  `Object.assign(effect.duration, data.duration)` in `CombatSettingsSD.mjs`
  threw `Cannot set property rounds of #<Object> which has only a getter`.
  The embedded-effect duration object exposes getter-only fields in v14.
  Switched to spread into a fresh plain object instead — reads via the
  getter are fine, writes go to the new object.

- **Medkit looped "Update Available" forever (`56adc0f`).** Items packed
  under SD 3.6.1 lacked schema fields added in SD 4.x (e.g. `system.formula`).
  After Update, the actor copy carried the schema default `""` while
  the compendium source still had the key absent — `foundry.utils.equals("", undefined)`
  is `false`, so the diff persisted. Added a `_stripEmpty` recursive pass to
  the Medkit's `_cleanData` that drops `undefined`/`null`/`""`/`[]`/`{}`
  from both sides before comparison.

- **Level-up crashed for class-less actors (`413ffa2`).** The enhanced
  header's Level icon routed every actor other than literal "Level 0
  funnel" characters straight to `LevelUpSD`, but the system's
  `LevelUpSD.getData` does `fromUuid(actor.system.class)` and then reads
  `.system` on the result with no null-check — so any actor with an empty
  `system.class` threw `Cannot read properties of null (reading 'system')`
  on open. Now routes class-less actors to `CharacterGeneratorSD`, which
  is meant for class selection anyway. (The underlying null-handling
  bug is in the SD system itself and is worth a separate report.)

- **Character Generator dice button threw on click (`b304e4c`).** SDX's
  patched `_randomizeStats` set `type: CONST.CHAT_MESSAGE_TYPES.ROLL` on
  per-ability roll messages, but Foundry v13+ removed
  `CONST.CHAT_MESSAGE_TYPES` entirely (only `CHAT_MESSAGE_STYLES` remains,
  and it has no `ROLL` value — roll messages are now auto-classified by
  the presence of a `rolls` array). Dropped the `type` field.

- **Character Generator stats didn't update + chat showed only "3d6" (`d96c258`).**
  Three layered regressions: (1) `roll._total` (legacy private field) is
  `undefined` in v14, the public getter is `.total`; (2) wrote to
  `system.abilities[key].base` but SD 4.x migrated `abilities.base →
  abilities.value` so the form input stayed at the default 10;
  (3) `ChatMessage.create({rolls:[…]})` in v13+ doesn't render the dice
  content, only the formula. Switched to `roll.toMessage(...)` to match
  the sibling `_randomizeGold` / `_randomizeAlignment` methods in the
  same patch.

- **Dark-mode chat cards clipped the dice total (`c3df0a4`, `c3ffb17`).**
  `.dice-result` inherited `flex-direction: row` from upstream CSS in
  `sdx-dark-mode`, which let `.dice-formula` eat the full container
  width and pushed `.dice-total` off the right edge of the chat panel —
  visible as cards showing only "3d6" with no rolled total. Forced
  `flex-direction: column` so children stack vertically, then centered
  `.dice-total` horizontally for visual balance.

- **Legacy `.base` field swept module-wide (`f13251e`).** SD 4.x migrated
  both `abilities.X.base → abilities.X.value` and
  `attributes.hp.base → attributes.hp.max`. Migration runs once on data
  load, so existing copies get converted — but **new writes** to `.base`
  land in nonexistent schema fields (silently dropped on save) and
  **reads** return `undefined`. Fixed:
  - `CombatSettingsSD.mjs` (6 reads across target/baseRoll/casterRoll
    contexts). `@strBase`/`@dexBase`/etc. roll variables had been
    silently undefined, quietly breaking any weapon-bonus formula keyed
    on raw ability scores.
  - 3 Wolfshape AE specs (Dire Wolf / Winter Wolf / Wolf). Shapechange
    wrote `system.abilities.{str,dex,con}.base` and
    `system.attributes.hp.base` — all nonexistent in SD 4.x — so stats
    stayed unchanged when transforming. Now write `.value` and `.max`.

- **22 SDX spell items missing damage formulas (`eeb719c`).** SDX spell
  YAMLs were packed under SD 3.6.1 without `system.formula`; SD 4.x
  added that field, so the actor copy carries the default `""` while
  the compendium source has the key absent. Real content drift, beyond
  what the Medkit's empty-default fix can resolve. Sourced canonical
  formulas + `damageType` from `shadowdark.spells` by name match.
  Twenty-two spells now have proper values: Acid Arrow `1d6`,
  Burning Hands `1d6`, Cloud Kill `2d6`,
  Cure Wounds `(1 + (floor(@level.value/2)))d6` (healing),
  Disintegrate `3d8`, Eyebite `1d4`, Fate `1d10`, Fireball `4d6`,
  Flame Strike `2d6`, Frog Rain `1d6`, Lightning Bolt `3d6`,
  Magic Missile `1d4`, Mass Cure `2d6` (healing), Moonbeam `3d6`,
  Pin Doll `2d6`, Poison `1d6`, Prismatic Orb `3d8`,
  Regenerate `1d4` (healing), Smite `1d6`, Swarm `2d6`,
  Thor's Thunder `3d6`, Toadstool `1d6` (healing).

### Added

- **Click the XP row in the enhanced header to edit (`0d7fe5b`).** The
  enhanced header rendered XP as read-only display, but the editable
  input lived on the SD system's Details tab and was easy to miss.
  Clicking the XP row now swaps it for a focused number input;
  Enter / click-away saves to `system.level.xp`, Escape cancels.
  Cursor is `pointer` with a hover underline so the affordance is
  obvious.

### Upgrade notes

- After installing 6.10.20, open the **Shadowdark Extras Medkit** on any
  caster with SDX spells (sheet header → Medkit icon) and click
  **Update All**. This propagates the new `formula` / `damageType` /
  Wolfshape AE-key fixes onto actor-owned spell copies. New imports
  get the values automatically.
- The `LevelUpSD` null-class crash is technically a Shadowdark system
  bug. SDX now routes around it from its own Level icon, but opening
  Level Up from the system's native UI on a class-less actor will
  still crash until the system itself null-guards.

## [6.10.19] — 2026-05-21 — Hotfix: include `data/` in the release package

### Fixed

- **6.10.18 failed to load entirely on fresh installs.** The release zip (and
  the CI release workflow) did not include the `data/` directory, so
  `data/creature-type-map.mjs` — imported by the creature-type feature shipped
  in 6.10.18 — was missing from installs. The failed import cascaded through the
  main module and prevented Shadowdark Extras from loading at all. The release
  package and `.github/workflows/main.yml` now include `data/`.

## [6.10.18] — 2026-05-21 — Multi-level dungeon generator, creature-type mapping, icon fixes

Headline feature: the dungeon generator can now build **multi-level
dungeons** on a single scene, with stairs aligned across floors and joined
by native Foundry v14 `changeLevel` regions. This release also adds runtime
NPC creature-type mapping and fixes several references to core icons removed
in v14.

### Added — Multi-level dungeon generator

The Generator tray panel gains a **Multi-Level** section. Set **Levels**
(2–8) to stack that many floors on one scene, connected by native
`changeLevel` regions so a token taking a stair changes floor while keeping
the same map position.

- **Aligned stairs** — up/down connectors sit at the same x/y on adjacent
  floors, and are always placed inside rooms (never in a doorway or a 1-wide
  corridor).
- **Per-level variation** — upper floors trend toward grand, open halls and
  deeper floors toward tighter, maze-like crypts (**Variation** slider; 0 =
  uniform).
- **Connector variety** — staircases, spiral stairs, ladders, and shafts,
  plus occasional one-way drops and non-adjacent "chutes" that skip a floor.
  Every level always keeps at least one two-way connection, so a floor can
  never become a one-way trap (**Variety** slider; 0 = plain staircases).
- **Links/Floor** controls how many connections join each adjacent pair of
  floors.
- The Levels / Links / Variation / Variety slider values persist between
  sessions.

### Added — Runtime NPC creature-type mapping

NPC creature types are now derived at runtime from a bundled Shadowdark
Tools bestiary (279 monsters → 20 native types), with a per-actor override
flag and an "Apply to World Actors" bake button in the Creature Types app.
Exposed for other modules via
`game.modules.get("shadowdark-extras").api.getCreatureType(actor)` and
`getMappedCreatureType(name)`.

### Fixed

- Replaced 11 ActiveEffect/item icon references that pointed at core icons
  removed in Foundry v14.361, eliminating compendium-load 404s.

## [6.10.17] — 2026-05-20 — Dungeondraft decor packs and Hexplorer marker polish

This release expands the Decor tray into a fuller custom-art workflow:
Dungeondraft object packs can be imported, previewed, selectively
extracted, enabled, disabled, and browsed from the SDX Decor tab. It
also adds Foundry folder import for decor assets and improves Hexplorer
with visible hex-state markers.

### Added — Dungeondraft object pack importer for Decor

GM-only `ApplicationV2` tools now scan `.dungeondraft_pack` files,
preview pack contents, and extract selected object images into
`Data/decor/ddpacks/<packId>/objects/`. Extracted Dungeondraft assets
appear in the Decor browser under pack/category folders and paint using
the same decor placement controls as other imported decor.

Imported packs can be hidden or shown from the Dungeondraft pack manager.
Disabling a pack hides its assets from the Decor tray while leaving the
extracted files in place.

### Added — Foundry folder import for Decor assets

The Decor import dialog can now browse a Foundry-accessible folder and
register every supported image inside it. Folder selection previews as a
folder instead of trying to load the folder path as an image, preventing
404s for paths such as system token directories.

### Added — Hexplorer state markers

When Hexplorer is enabled, hexes now show small map markers for visible
state:

- **Explored / Mapped** — white marker
- **Claimed** — teal marker
- **Show to Players** — green marker

The tray handle button now uses a Font Awesome icon that renders reliably
and its title is clearer: `Hex Tooltip / Hexplorer`.

### Fixed

- Dungeondraft decor assets selected in the tray are now accepted by the
  decor stamp logic instead of being filtered out with `No tiles selected
  in the "symbols" tab`.
- Disabled Dungeondraft packs no longer leak back into the Decor tray via
  the generic `Data/decor/` folder scan.
- The Dungeondraft pack visibility control is now a clickable
  `Shown` / `Hidden` button instead of an inert checkbox affected by
  Foundry's `.disabled` CSS.
- Hexplorer marker-layer teardown is now safe across `canvasReady`
  redraws, avoiding stale PIXI `refCount` errors.

## [6.10.16] — 2026-05-19 — Hex tray navigation, decor import dialog, deterministic Region pairing

Two user-visible features, one architecture cleanup, and a build-format
change. The hex painter tray gains hierarchical folder navigation for
custom assets; a new multi-source decor import dialog (GM-only) can pull
assets from the Foundry library, a local upload, or a web URL.
Template→Region pairing is rewritten to use Foundry v14's shared document
ID guarantee instead of heuristic snapshots. Compendiums move to a YAML
source format under `src/packs/` — diff-able, mergeable, and stable
across Foundry sessions.

### Added — Custom hex tile folder navigation

`Data/hexes/` is now scanned recursively. Subfolders appear as
breadcrumb-navigable directories with quick-access chips that show item
counts. A back button steps up one level; clicking a breadcrumb segment
jumps directly to that depth. The legacy `BIOME_SUBDIRS` mapping
(`hexes/water/`, `hexes/vegetation/`, etc.) is preserved for shallow
layouts so existing folders keep working.

When a search filter is active, results expand to include sub-directory
matches; cleared, the view reverts to direct children of the current
path.

### Added — Multi-source decor import dialog

GM-only `ApplicationV2`-based dialog (`DecorImportApp`) with three tabs:

- **Foundry Library** — browse the existing data tree and register a path.
- **Local Upload** — select files or whole folders. Nested folder
  structure is preserved under `Data/decor/`. Single-file uploads land in
  `decor/Imported/`. Filename collisions get numeric suffixes
  (`wood-2.png`, `wood-3.png`).
- **Web URL** — paste a URL to register against the decor library.

Preview object URLs are revoked on close to prevent memory leaks.

### Fixed — Focus spell tracking now resolves compendium UUIDs

When a spell is cast from a chat card whose `itemUuid` is a compendium
document UUID, the tracker now resolves it to the actor-local item copy
by name + type before storing the tracked id. Prior behavior stored the
compendium id, which broke subsequent `actor.items.get(spellId)` lookups
during focus maintenance rolls.

The cast pipeline also now passes `item.uuid` (full UUID) to
`actor.system.castSpell()` instead of the bare item id, matching the
Shadowdark 4.x signature.

### Changed — Deterministic Region pairing via shared document ID

`MeasuredTemplate.id === auto-Region.id` is a Foundry v14 invariant
(empirically verified on v14.361). The previous heuristic
snapshot-and-diff lookup is replaced with the direct
`template.parent.regions.get(template.id)` lookup. A new
`SDX.templates.getPairedRegion(template)` helper exposes the O(1)
lookup. The `window._lastPlacedTemplateId` global is removed; the
read+write sites now share a `let`-scoped local. `SDX.templates` is
exposed on `module.api` for downstream macro use.

The `deleteRegion` hook binding to `_onDeleteTemplate` is dropped — the
cascading deletion fires `deleteMeasuredTemplate` first, and the second
binding caused double-firing cleanup logic.

### Build — Source-format compendiums (`src/packs/` YAML)

Tracked LevelDB binaries are replaced with YAML source files (one doc
per file) under `src/packs/`. The runtime LevelDB at `packs/` becomes a
build artifact, regenerated by `npm run pack` locally and by CI before
zipping the release. Compendiums are now diff-able, mergeable, and
stable across Foundry sessions. Verified lossless round-trip: 127 docs
unpacked → YAML → repacked → 127 docs.

Fresh-clone setup:

```bash
npm install
npm run pack    # rebuilds packs/ from src/packs/ YAML
```

## [6.10.15] — 2026-05-19 — Socket auth, formula eval, dungeon-painter v14 levels

Three coordinated changes: a security pass on the socket layer and HTML
rendering, a corrected formula evaluator, and a v14-native rewrite of
DungeonPainter's level handling. All verified live on Foundry v14.361 +
Shadowdark 4.0.4 with both GM and player clients connected.

### Fixed — GM socket handlers now authorize callers

All eight `module.socket` handlers that execute privileged work on the GM's
client (`executeMacroAsGM`, `sdxExecuteItemMacro`,
`executeSpellItemMacroAsGM`, `applyHolyWeaponAsGM`,
`applyCleansingWeaponAsGM`, `applyWrathWeaponAsGM`,
`applyWrathToAllWeaponsAsGM`, `sdxIdentifyItemAsGM`) now gate on the
calling user's `OWNER` permission for the target document.

Previously these handlers ran for any caller — a malicious or buggy
client could invoke arbitrary macros, mutate other players' actors, or
identify any item by sending crafted socket payloads. The gate:

```js
const sender = game.users.get(this.socketdata?.userId);
if (!sender) return;
if (!sender.isGM && !actor.testUserPermission(sender, "OWNER")) {
  console.warn(`${MODULE_ID} | Unauthorized ... attempt from user ${sender.name}`);
  return;
}
```

Verified across the bridge: Player1 invoking `sdxExecuteItemMacro` with
an item they do not own is rejected with the expected warning in the GM
console; the same call against a Player1-owned item proceeds.

Socket payloads now travel as UUIDs and the GM rehydrates via
`fromUuid()`, so the auth check happens against the resolved document
rather than caller-supplied IDs.

### Fixed — formula evaluator no longer rewrites to Math.\*

`Roll.safeEval` in v14 evaluates inside a `MATH_PROXY` sandbox that
exposes bare math fn names (`floor`, `ceil`, `round`, `min`, `max`) but
not the `Math` global. The previous remediation pass rewrote bare names
to `Math.floor(...)` etc. before calling `safeEval`, which the sandbox
rejected as "non-numeric result" — every spell formula like
`(floor(@level/2)+1)d6` would throw.

The `Math.*` rewrite has been removed; expressions pass through
`Roll.safeEval` unchanged. Verified with `floor(7/2) → 3`,
`max(1, floor(7/2)) → 3`, `floor(10/3) + ceil(10/4) → 6`.

### Fixed — requirement evaluator reverted to `new Function`

Source-requirement strings on Active Effects use logical and string
operators (`charClass === "wizard"`, `path.includes("holy")`,
`level >= 5 && ancestry === "elf"`) that `Roll.safeEval` cannot evaluate.
The earlier `Roll.safeEval` swap is reverted; requirements run under a
scoped `new Function(...keys, "return (" + req + ")")` evaluator with
actor properties bound as local variables.

### Fixed — XSS in HTML interpolations

User-controlled `img.src`, `alt`, and document `name` values are now
wrapped in `foundry.utils.escapeHTML(... ?? "")` everywhere they are
interpolated into template strings:

- identify chat card (`shadowdark-extras.mjs`)
- NPC attack image rows
- damage card target rows (`CombatSettingsSD.mjs`)
- Tom arena player portraits + assets (`apps/TomPlayerView.mjs`)

### Changed — `renderChatMessageHTML` replaces legacy hook + global monkeypatch

The Shadowdark system's `removeTorchTimer` calls
`html.querySelector(".light-source").remove()` without null-checking.
The previous workaround monkeypatched `Element.prototype.querySelector`
globally to return a dummy element — a footgun that could affect any
selector on any DOM node. The new approach scopes the fix to chat
rendering:

```js
Hooks.on("renderChatMessageHTML", (message, html, context) => {
  if (!element.querySelector(".light-source")) {
    const dummy = document.createElement("div");
    dummy.className = "light-source sdx-dummy-light-source";
    dummy.style.display = "none";
    element.appendChild(dummy);
  }
});
```

`renderChatMessage` (legacy v13 hook) is replaced by
`renderChatMessageHTML` (v14 hook) throughout.

### Changed — Active Effect requirement enforcement off the data-prep hot path

The async `prepareActorData` hook that evaluated source requirements and
scheduled `effect.update` calls via `setTimeout` is gone. Requirements
now run synchronously via `updateActor`, `renderActorSheet`, and
`createItem` event hooks — no more sheet renders blocked by async work
in the data preparation cycle.

### Changed — context menu modernized for v14

Scene context menu entries use `label` and `visible` (v14 properties)
instead of `name` and `condition` (v13).

### Refactored — DungeonPainter level handling

`scripts/DungeonPainterSD.mjs` lost 345 net lines. Documents are now
matched by `levels` membership rather than `elevation` tolerance, which
fixes incorrect tile/wall identity on multi-floor scenes where two
levels share grid coordinates with `elevation: 0`.

- `documentMatchesLevel(doc, levelContext)` centralizes the membership
  check; used by fill, delete, door placement, and wall rebuild.
- `rebuildWallsForLevel(scene, levelContext, opts)` unifies the GM-local
  and player-socket rebuild paths — no more divergence between
  "rebuild from GM canvas action" and "rebuild from player paint event".
- Dead v14 Scene fallbacks removed (`scene._view`, `scene.initialLevel`,
  `scene.firstLevel` — none of these exist in v14.361).
- `getSceneLevelContextForElevation` now uses range containment
  (`bottom <= z <= top`) instead of exact `bottom === z`.
- `applySceneLevelData` no longer clobbers caller-supplied elevation
  values; only defaults to `0` when the caller omits it.
- Probe-tile fill path removed; eliminated the risk of duplicate
  first-cell tiles when a player painted while a probe was in flight.

Verified live on a two-level test scene: painting overlapping grid
coordinates on `defaultLevel0000` and an `Upper` level keeps each
level's tiles, walls, and drawings independent. Deleting on one level
leaves the other intact.

### Repo hygiene

`.gitignore` updated to exclude release artifacts (`module.zip`,
`*.zip`), agent scratch (`.planning/`, `GEMINI.md`, `CLAUDE.md`,
`AGENTS.md`), and the Foundry LevelDB lock sentinel
(`packs/**/LOCK`). Local planning docs and per-agent config files no
longer enter `git status`.

## [6.10.14] — 2026-05-18 — Module API security hardening

Implements all of `SECURITY-PLAN-Module-API.md`. Five coordinated additions
that tighten the `module.api` surface against malicious modules and accidental
destructive automation, without breaking any legitimate caller.

The 6.10.13 work (clutter return + `placeDungeonDecor`) is bundled into this
release — both sets of changes ship together as 6.10.14.

### Added — `gmOnly()` wrapper on destructive functions

12+ mutating functions on `module.api` are now wrapped to refuse non-GM
callers with a clean error:

```
SDX | <name>: requires GM permission
```

Read-only functions (`getConditionsData`, `generateRandomSeed`, etc.) stay
open to all users. Players running macros, third-party player modules, or
socket-driven calls can no longer call destructive SDX operations even when
the bridge accepts the call.

Verified end-to-end with a Player1 user connected via the bridge:
- `generateDungeon` from Player1 → rejected with the permission error
- `getSceneLevelContext` from Player1 → succeeded as expected
- `getConditionsData` from Player1 → returned the full conditions registry

### Added — input validation and clamping on `generateDungeon`

Absurd values are now silently clamped at function entry instead of letting
the generator hang Foundry. The new `safeConfig` block in
`DungeonGeneratorSD.mjs` enforces:

| Field | Min | Max |
|---|---|---|
| `roomCount` | 1 | 50 |
| `stairs` | 0 | 10 |
| `stairsDown` | 0 | 10 |
| `clutter` | 0 | 20 |
| `density` | 0 | 1 |
| `branching` | 0 | 1 |
| `roomSizeBias` | 0 | 1 |
| `wallThickness` | 1 | 100 |
| `wallColor` | hex format `/^#[0-9a-f]{6}$/i` | (rejected → default `#5C3D3D`) |
| `seed` | string, max 100 chars | (non-string → "default") |

Verified: `generateDungeon({roomCount: 99999})` clamps to 50 rooms (~1500
tiles) instead of attempting 99,999 rooms (would crash Foundry).

### Added — asset path allowlist on `placeDungeonDecor`

The `src` parameter is now validated against a prefix allowlist before any
tile is created:

- `modules/shadowdark-extras/`
- `worlds/`
- `fa-nexus-assets/`
- `systems/shadowdark/`

A call with `src: "https://evil.com/tracker.png"` or any unallowed path
throws cleanly:

```
SDX.placeDungeonDecor: src "..." not in allowlist
```

Closes a real attack vector: a malicious macro that called
`placeDungeonDecor` with a remote URL would have caused Foundry to fetch
the URL, leaking the GM's IP and revealing the world's state.

### Added — `api.internal.*` namespace for unstable helpers

The `module.api` top-level surface is now the **stable public contract**.
Implementation helpers that were exposed for cross-module use but aren't
part of the long-term API have been moved to `module.api.internal.*`:

- `internal.applySceneLevelData`
- `internal.getSceneLevelContext`
- `internal.getDungeonBackground`

Anything under `internal.*` may change without notice. Anything at the top
level is a stable contract.

**MCP caveat:** the current `foundry-mcp-live` `call_module_api` tool does
flat key lookup (`api[fn]`), so dotted paths like `internal.getSceneLevelContext`
aren't reachable through MCP yet. Reported upstream; the bridge handler
needs `resolveDotted()` traversal to support nested namespaces. Direct
callers (macros, other modules) reach `internal.*` normally.

### Added — `audited()` wrapper for forensics

Every entry on `module.api` (public + internal) now logs to console on
invocation:

```
[SDX.api] generateDungeon called by: <caller stack frame>
```

Searchable when investigating "who clobbered scene X?" — zero behavior
change, just paper trail.

### Added — `force` flag on `clearGeneratedTiles`

`clearGeneratedTiles` now shows a confirmation `DialogV2` by default
(safer for accidental clicks). Autonomous callers pass `{ force: true }`
to bypass:

```js
await api.clearGeneratedTiles({ force: true });   // skips dialog
await api.clearGeneratedTiles();                  // prompts user → { cancelled: true } if dismissed
```

### Documentation updates

`SDX-MCP-DUNGEON-API.md` now documents:
- The GM-permission requirement (with the exact error string)
- The hard caps on every numeric config parameter
- The `force: true` opt-out pattern for `clearGeneratedTiles`
- The `internal.*` namespace and its instability promise

---

## [6.10.13] — 2026-05-18 — Dungeon clutter return value + `placeDungeonDecor` helper

Extends 6.10.12's multi-level orchestration API with clutter (decor)
support, so MCP / external automation can see exactly what the
generator placed AND drop additional narrative decor at specific
positions.

### Added — `generateDungeon` now returns clutter positions

The return value gains a `clutter` array alongside `stairsUp` and
`stairsDown`:

```js
{
  stairsUp:   [{ x, y, gridX, gridY }, ...],
  stairsDown: [{ x, y, gridX, gridY }, ...],
  clutter:    [{ src, x, y, width, height, gridX, gridY }, ...]
}
```

Each clutter entry includes the source asset path, pixel position,
pixel size, and grid coords. Useful for downstream tooling that
wants to know exactly what decor exists where (e.g. for narrative
agents adding context around a fountain or statue).

### Added — `placeDungeonDecor(opts)` helper on `module.api`

Manual decor placement for cases where the generator's random
selection isn't enough — agents can drop a specific tile (boss
throne, trap marker, narrative prop) at a known position. Companion
to `generateDungeon`'s clutter array.

```js
await game.modules.get("shadowdark-extras").api.placeDungeonDecor({
  sceneId,
  src: "modules/shadowdark-extras/assets/Dungeon/clutter/statue-100x100.png",
  x: 1500, y: 1000,
  width: 100, height: 100,
  centered: true,           // subtract w/2, h/2 from x/y
  levelId: "<levelId>"      // scope to a specific floor
});
// → { id, x, y, width, height }
```

The helper handles centering, attaches the SDX `dungeonClutter` flag
(so the tile can be identified or cleared by other module tools),
and scopes the tile to a specific v14 Level ID.

### Fixed — two bugs in Gemini-supplied clutter loop

Caught and patched during smoke-testing:

1. **`gridSize` was undefined in `generateDungeon` scope.** Clutter
   placement referenced `gridSize` (lowercase) but only `GRID_SIZE`
   (module-level constant) is in scope. Result: `Math.ceil(item.w /
   undefined)` → `NaN`, which propagated and caused the whole
   generation to throw silently. Fixed to use `GRID_SIZE`.

2. **Typo in occupancy tracking.** The occupancy `Set` was being
   populated with the wrong row coordinate (`${gx + ox},${oy + oy}`
   instead of `${gx + ox},${gy + oy}`) — would have caused
   incorrect collision detection between adjacent decor items.
   Fixed.

### Cleanup — deduplicated `module.api` registrations

The 6.10.12 wire-up accidentally registered `placeChangeLevelRegion`
and `placeDungeonSurface` twice in the same `module.api` object.
Functionally harmless (the second assignment overwrote the first
with itself) but ugly. Consolidated into a single block.

### Added — `SDX-MCP-DUNGEON-API.md` documentation

New top-level doc covering the dungeon orchestration API surface,
return shapes, end-to-end workflow with the foundry-mcp-live MCP
server. Useful reference for agents or anyone building on top of
the API.

---

## [6.10.12] — 2026-05-18 — Dungeon elevation fix + multi-level orchestration API

Two related drops shipped together.

### Fixed — dungeon-generator tiles now use `elevation: 0` instead of the level's bottom

Reported by upstream dev: "creates the tiles at wrong elevation
(right level, but elevation should be 0, instead it reads the
elevation of the level)."

Tiles and drawings should sit at `elevation: 0` and carry their level
membership through `doc.levels = [levelId]` — that's how v14 native
levels expect the data. The dungeon generator was instead writing
`elevation: levelContext.elevation` (the level's bottom, e.g. 20 for
Second Floor), double-encoding the slab.

Fix had two leak points; both plugged:

1. `scripts/DungeonPainterSD.mjs::applySceneLevelData` — the obvious
   source. Non-Wall branch now writes `doc.elevation = 0`. Wall
   branch unchanged (walls correctly need absolute `wall-height`
   coordinates).

2. `scripts/DungeonGeneratorSD.mjs::createWithElevation` — the
   silent override. After `createEmbeddedDocuments` resolved, this
   helper was post-updating Tile and Drawing docs with
   `elevation: <captured level bottom>`, undoing fix #1. Both
   branches now write `elevation: 0`.

Validated end-to-end on Restored Keep across all 4 floors including
the basement (elevation -20 to 0): newly-generated tiles all came
back with `elevation: 0`. Walls retained `wall-height: {bottom: 20,
top: 40}` on Second Floor, correctly absolute. No regression on
single-level scenes (the fix is a no-op when `levelContext.elevation
=== 0`).

### Added — `module.api` helpers for multi-level dungeon orchestration

Three additions to support fully-autonomous multi-level dungeon
generation (where an agent or external integration can build a scene
with multiple floors, generate dungeons per floor, and link stairs
between floors without human clicks).

**1. `generateDungeon` now returns stair positions**

The function previously returned nothing. It now returns:

```js
{
  stairsUp:   [{ x, y, gridX, gridY }, ...],
  stairsDown: [{ x, y, gridX, gridY }, ...]
}
```

Caller can now know where stair tiles were placed, which makes it
possible to drop `changeLevel` regions at the correct positions to
make the stairs actually transition tokens between floors.

**2. `placeChangeLevelRegion(opts)` — new helper on `module.api`**

Wrapper that creates a Region with the v14-native `changeLevel`
behavior at a given position, bridging two specified levels.
Companion to `generateDungeon`'s stair-position output.

```js
const api = game.modules.get("shadowdark-extras").api;
const { stairsUp } = await api.generateDungeon({ stairs: 1, ... });
const stair = stairsUp[0];
await api.placeChangeLevelRegion({
  sceneId, x: stair.x, y: stair.y,
  levels: [groundLevelId, upperLevelId],
  movementActions: []   // [] = walk, ["climb"] = ladders
});
// Token walking onto that region now triggers "Move to Upper?" dialog.
```

**3. `placeDungeonSurface(opts)` — new helper on `module.api`**

Walks every dungeon-generated tile on a given level and creates a
single Region with the `defineSurface` behavior whose `shapes[]` is
one rectangle per tile. This tells Foundry v14 "this is the walkable
floor of this level" — used by token spawn/movement logic.

```js
await api.placeDungeonSurface({ sceneId, levelId: groundFloorId });
// → { id, name, tileCount }
```

Implementation lives in new module `scripts/DungeonRegionsSD.mjs`.

**End-state flow** (fully autonomous via the foundry-mcp-live MCP
server's tools + this API):

```js
const { id: sceneId } = await create_scene({ name: "Procedural Dungeon" });
await add_scene_level({ sceneId, name: "Ground",   bottom: 0,  top: 20 });
await add_scene_level({ sceneId, name: "Upper",    bottom: 20, top: 40 });

const { levels } = await get_scene_levels({ sceneId });

for (const floor of levels) {
  await set_canvas_level({ sceneId, levelId: floor.id });
  const { stairsUp, stairsDown } = await api.generateDungeon({
    seed: floor.name, roomCount: 5, stairs: 1, stairsDown: 1
  });
  await api.placeDungeonSurface({ sceneId, levelId: floor.id });
  for (const s of [...stairsUp, ...stairsDown]) {
    await api.placeChangeLevelRegion({
      sceneId, x: s.x, y: s.y,
      levels: [floor.id, adjacentFloor.id]
    });
  }
}
```

Phase 4 of the roadmap (cross-floor stair *alignment* — picking
room layouts so the up-stair on floor N lands at the same (x, y)
as the down-stair on floor N+1) remains future work.

---

## [6.10.11] — 2026-05-18 — Levels-aware spell regions + elevation badge + GM unidentified-item display + AA overhaul + public module.api

Five drops shipped together.

### Fixed — spell templates now respect Levels (caster's floor only)

Dev-provided fix for the bug originally reported in 6.10.9/6.10.10:
when the caster was on an upper level, AoE spells (Fireball, Lightning,
Sleep, Web, etc.) silently affected nobody — the template placed at
elevation 0 while caster + targets were at elevation 20.

Rather than a band-aid elevation default, the dev's solution is a
proper v14 Region-aware rewrite of `TemplateEffectsSD.mjs`:

- `_isSameLevel(tokenLevelId, doc)` — checks `RegionDocument.levels`
  (which v14 auto-populates when a Region is created from a
  MeasuredTemplate) AND `flags.shadowdark-extras.casterLevelId`
  (a new flag written at template-creation time by the casting code,
  for the MeasuredTemplate path)
- `getTokensInTemplate` walks the auto-created Region when present
  to read levels; falls back to the MeasuredTemplate placeable otherwise
- `getTemplatesContainingToken` and `getTemplatesContainingPoint` now
  prefer `RegionDocument#testPoint({x, y, elevation})` — the v14-native
  API that handles elevation slabs natively. Falls back to the
  placeable's `testPoint` (and finally to raw `shape.contains`) for
  pre-v14 Foundry
- Token movement detection now also fires on `level` and `elevation`
  changes, not just `x`/`y`. A token moving between floors triggers
  the same `onEnter`/`onLeave` logic as walking into/out of a region
- New `onCreation` trigger separate from `onEnter` — fires for tokens
  already inside a template *at placement time*, distinct from tokens
  that walk in afterwards. Resolves the long-standing "drop Web on
  enemies, conditions don't apply" report cleanly
- `deleteRegion` hook added alongside `deleteMeasuredTemplate` so
  effect cleanup happens whichever document gets removed first

End-user behaviour: tokens visible on a balcony two floors up are no
longer caught by a Fireball cast on the ground floor. Tokens on the
caster's own floor (matching `level` ID or matching `elevation`
exactly) are affected as before.

### Changed — Automated Animations integration overhaul

`AutoAnimationsSD.mjs` rewritten by the dev (~2KB larger). Properly
integrates via the `AutomatedAnimations-WorkflowStart` hook to gate
animations on roll outcome:

- Critical failures: never animate
- Critical successes: always animate
- Attack/spell with target: animate only on success
- Spells without target: configurable via new `aaAnimateSpellsWithoutTarget`
  setting (defaults true)
- Weapons without target: always animate (they were used)
- Item-card pre-roll messages: blocked (these are the "Roll Attack"
  preview cards, not actual rolls)
- System-native messages (healing, etc.) without `flags.shadowdark.isRoll`
  pass through to AA unchanged

New world setting `SDX.Settings.AAIntegration.Name` (default on,
`requiresReload`) toggles the whole integration. The
`preCreateChatMessage` hook also injects `data-item-id` into messages
that ship only `data-uuid="Actor.X.Item.Y"`, so AA can resolve the
item without monkey-patching SD's templates.

### Added — persistent elevation badge on placed templates

SDX's `place()` already shows an elevation overlay during placement
(adjusted via Alt+wheel), but the overlay was destroyed once the
template committed. Without it the only feedback for "this template
is at the wrong z" was "the spell affected no one" — silent failure.

New module `TemplateElevationBadgeSD.mjs` attaches a small `el N`
label as a PIXI child of the placeable's container whenever
`elevation !== 0`. The label moves with the template, cleans up on
delete, and stays out of the way at ground level (no badge for
elevation 0, to avoid cluttering single-floor scenes).

### Added — GM-side display of unidentified items (restored)

When SDX dropped its custom identification UI in 6.10.5 (in favour of
SD 4.x's native system), the visual hint that flagged unidentified
items in the GM's inventory view went with it. Restored via a small
new module `UnidentifiedDisplaySD.mjs`:

- Hooks `renderActorSheet`, `renderItemDirectory`,
  `renderCompendium(Directory)`
- For GM viewers only, rewrites the visible item name to
  `Unidentified Armor (Chainmail)` — the unidentified name with the
  real name in parens
- Players continue to see just the unidentified name
- DOM-only patch — no data is mutated, no flags written

### Added — Public `module.api` surface for automation / scripting / MCP

**New feature, not previously available.** SDX now exposes a documented
set of functions on `game.modules.get("shadowdark-extras").api`, so
macros, third-party modules, the `foundry-mcp-live` server, or any
external automation can drive SDX features directly — no monkey-patching
or reaching into internals required.

The previous `module.api` only exposed a small handful of spell helpers
intended for spell macros. This release widens it to cover the dungeon
generator, hex generator, scene-level helpers, and the existing
weapon/identify/shapechanger entry points that were registered
elsewhere in the codebase.

**Available functions** (call any of them as
`game.modules.get("shadowdark-extras").api.<fn>(...args)`):

- **Map generation**
  - `generateDungeon(config)` — procedural dungeon on the active scene.
    Takes `{seed, roomCount, density, branching, roomSizeBias, symmetry,
    stairs, stairsDown, clutter, useTexture, wallShadows, wallColor,
    wallThickness}`. GM only.
  - `generateHexMap(params)` — procedural hex map
  - `clearGeneratedTiles()` — wipe generated tiles on the active scene
  - `getGeneratorSettings()` / `setGeneratorSettings(settings)` —
    read/write the dungeon generator's stored config
  - `generateRandomSeed()` — fresh seed string for the generator

- **Scene / levels helpers**
  - `getSceneLevelContext(scene?, preferredLevelId?)` — returns
    `{levelId, elevation, rangeTop}` for the active or supplied scene
  - `applySceneLevelData(doc, type, levelContext?)` — annotates a
    placeable doc with level/elevation flags so it lives on the
    intended floor (used by the dungeon generator internally; callable
    for custom tooling)
  - `getDungeonBackground()` — returns the configured dungeon
    background tile path

- **Spells / focus tracker**
  - `startDurationSpell(...)`, `endDurationSpell(...)`,
    `registerSpellModification(...)`, `getActiveDurationSpells(...)`,
    `showConditionsModal(...)`, `getConditionsData()`

- **Magic weapon dialogs**
  - `showHolyWeaponDialog()`, `applyHolyWeapon(...)`,
    `applyWrathWeapon(...)`, `applyWrathToAllWeapons(...)`,
    `showWrathWeaponDialog()`, `applyCleansingWeapon(...)`,
    `showCleansingWeaponDialog()`

- **Shapechanger**
  - `showShapechangerDialog()`, `applyShapechanger(...)`,
    `revertShapechanger(...)`

- **Identification**
  - `isUnidentified(item)`, `getUnidentifiedName(item)`,
    `identifyItem(item)`, `showIdentifyDialog(...)`,
    `showItemReveal(...)`

**Reachable via foundry-mcp-live ≥ v0.11.1:** the MCP's
`call_module_api({moduleId, fn, args})` tool routes directly to this
surface. Example test that's now possible end-to-end:

```jsonc
call_module_api({
  moduleId: "shadowdark-extras",
  fn: "generateDungeon",
  args: [{ seed: "mcp-001", roomCount: 6, density: 0.7, stairs: 1 }]
})
```

Discovery affordance: passing an unknown `fn` name returns an error
listing every callable function on the surface, so agents (and humans)
can introspect what's available without reading source.

**Author note:** anything not on this list is internal and may change
without warning. If you depend on something that isn't exposed,
open an issue — it's easier to add it cleanly than to monkey-patch
around it.

---

## [6.10.10] — 2026-05-17 — TemplateEffects containment alignment

Defensive consistency change — not a confirmed bug fix. A tester
reported template effects not applying on initial drop until tokens
exited and re-entered the area, but the issue could not be reliably
reproduced. Either way, the underlying difference in containment
math was worth straightening out.

### Changed — TemplateEffectsSD containment uses `placeable.testPoint`

`TemplateEffectsSD.mjs` had three containment helpers
(`getTokensInTemplate`, `getTemplatesContainingToken`,
`getTemplatesContainingPoint`) that tested membership via the raw
PIXI shape:

```js
template.shape.contains(token.center.x - anchorX, token.center.y - anchorY)
```

This worked in v13 where `shape` was a PIXI primitive centered at
origin, but in v14 the placeable's shape can be in a different
coordinate space — particularly when the placeable was just created
and its first refresh hasn't completed. Meanwhile, SDX's own
`getTokensInTemplate` in `shadowdark-extras.mjs` uses
`templateObject.testPoint(t.center)` directly, which delegates to the
PlaceableObject's `testPoint` method that handles the shape↔world
transform internally and remains correct from creation onward.

All three helpers now mirror SDX's pattern: prefer
`template.testPoint(worldPoint)`, fall back to the local-coord
`shape.contains()` if `testPoint` isn't available (older Foundry
builds). Initial-drop and movement-enter paths now share the same
proven-working containment math.

No behavioural change expected for users who weren't seeing the
phantom bug. The fallback guarantees backward compat.

---

## [6.10.9] — 2026-05-17 — Template effects on-drop + non-damage spell chat card

Two fixes around template-based spells:

### Fixed — template effects (Web, Sleep, etc.) now apply on initial placement

Dev-provided patch to `TemplateEffectsSD.mjs`. Previously, dropping a
template on top of existing tokens (e.g. casting Web over a group)
did NOT apply the spell's effect — tokens had to exit and re-enter
the template area to receive it.

Two interlocking causes:

- The `createMeasuredTemplate` hook gated initial-enter triggers on a
  `!config.initialEnterTriggered` flag that was set by the casting
  code, so the very first enter never fired. Guard removed —
  deduplication already lives inside `applyTemplateConditions`.
- The hook's wait-for-shape-ready was a fixed 100 ms sleep; v14
  template `.shape` resolution sometimes takes longer. Replaced with
  a polling loop that retries up to 1 s.

Side benefit: read the template `flags` BEFORE any `setFlag` call,
since v14 silently drops post-create `setFlag` on MeasuredTemplate
documents (part of the template→region deprecation).

### Fixed — non-damage spells no longer show cast roll as damage breakdown

SDX damage card was rendering the spell **cast** roll (e.g. `1d20 + 14`
for Sleep's spellcasting check) as the damage breakdown for effect-only
spells like Sleep and Web. Result was a misleading `22 = 8 + 14` line
inside the SDX card, duplicating the cast roll already shown in the SD
card above.

Root cause was a fallback chain in `buildRollBreakdown()` (`CombatSettingsSD.mjs`):

```js
const roll = spellRollFromFlag || damageRollData || messageRoll || spellRoll || npcBaseRoll;
//                                                  ^^^^^^^^^^^ wrong
```

`messageRoll` is the SD "main" roll (cast/attack d20), not damage —
that belongs to the SD card above. For non-damage spells where
`damageRollData` is null, this fallback caught the cast roll and
rendered it as damage. A secondary fallback to
`window._lastSpellRollBreakdown` had the same leak.

Both fallbacks removed. `buildRollBreakdown` now returns null when no
real damage roll exists, and the breakdown section is omitted from
the card entirely. The "APPLY EFFECTS" header + target list still
render for effect-only spells, since those are legitimately useful.

---

## [6.10.8] — 2026-05-17 — Dark-mode CSS hotfixes (chat text + pause font)

Three CSS regressions in dark-mode that were visible since SD's 4.x
update — neither newly introduced nor previously catalogued. All three
are scoped to `body.sdx-dark-mode`, so non-dark-mode users were never
affected.

### Fixed — chat-card sub-headings now legible

SD v4 renamed the chat-card markup; the "Attack Roll" / "Damage Roll"
sub-headings now ship under `.chat-message .message-content .sub-heading`,
which inherits the default chat-message text color. On SDX's dark
damage-card background that read as dark-grey-on-dark.

```css
.chat-message .message-content .sub-heading { color: white; }
```

### Fixed — character name in chat header

`.message-sender` (the speaker name on each chat card) was inheriting
the same dark color and showed as black-on-dark in dark mode. The
existing dark-mode rule already styled font-family / font-size; just
added the missing `color: white`.

### Fixed — "Game Paused" overlay font restored to JSL Blackletter

`body.sdx-dark-mode` redefines `--font-header` to `"Montserrat-medium"`
for SDX's own themed UI, but the SD system's `#pause figcaption` uses
`var(--font-header)` directly, so the override cascaded onto the pause
overlay and replaced SD's intended blackletter font with a plain
sans-serif. Surgical restore:

```css
body.sdx-dark-mode #pause figcaption {
    font-family: "JSL Blackletter", sans-serif;
}
```

Specificity (0,1,1,1) cleanly overrides SD's `#pause figcaption`
(0,1,0,1) only when dark mode is active. Vanilla SDX (no dark mode)
remains unchanged.

---

## [6.10.7] — 2026-05-17 — Preroll bonuses, healing-spell damage roll, chat card cleanup

Four behaviour fixes from upstream dev (`e3f5de0`).

### Fixed — preroll dialog now shows weapon damage bonuses (`shadowdark-extras.mjs`)

The "Attacking with Longsword" preroll dialog previously listed only
hit bonuses. Damage bonuses (e.g. `Mighty (+1)`, `MAGIKA (+1d4)`) were
applied silently to the final chat result, so the player had no way to
see the expected damage range while choosing Advantage/Normal/Disadvantage.

Now:
- Damage bonuses are baked into the dialog's Damage Roll formula
  (`1d8 + 1 + 1d4` instead of just `1d8`)
- The tooltip line below the formula lists each contributing bonus
  with its formula in parens — e.g. `Mighty (+1), MAGIKA (+ 1d4)`
- The wrapper path that previously double-baked damage bonuses has
  been removed; comment now points to `calculateWeaponBonusDamage()`
  as the single source of truth

### Fixed — healing spells no longer use d20 cast roll as damage (`CombatSettingsSD.mjs`)

For spells like Cure Wounds, the damage-card pipeline was reading
`message.rolls[message.rolls.length - 1]` as a fallback when no roll
matched the damage formula. That fallback would grab the **d20 cast
roll** (success/fail check) and use its value as the healing amount.

Now the matcher returns `null` if no roll matches the formula, and a
new pending-roll guard bails cleanly when `rollDamageFromMessage()`
hasn't yet attached the async damage roll to `message.rolls`. The
subsequent `msg.update({rolls})` re-render picks up the correct value.

### Fixed — weapon damage bonus no longer double-counted in chat (`CombatSettingsSD.mjs`)

When `renderRollDialogSD` bakes the damage bonus into the roll formula
(so the preroll dialog displays the correct total), the final chat
card was also calling `calculateWeaponBonusDamage()` and **adding the
same bonus again**. Result: a +1 Mighty bonus contributed twice.

Fixed by:
- New `_sdxDamageBonusInFormula` / `sdxBonusInDamageFormula` config
  flags signal upstream-baked bonuses
- Persisted as `bonusInFormula` inside `weaponBonusResults` so the
  final render can read it after DataModel serialisation strips
  underscore-prefixed keys
- When `bonusInFormula` is true, `totalDamage` only adds the
  critical-hit bonus, not the regular bonus
- `buildRollBreakdown()` also receives zeroed-out `bonusFormula` /
  `bonusRollResults` so the UI doesn't render an extra breakdown term

### Changed — SD chat card visually integrated with SDX card

When the SDX damage card is shown, the SD chat card is now restructured
in-place to reduce redundancy:
- The weapon icon/name row is moved **above** the "Attack Roll" heading
  so it reads as the card's header
- The redundant Targets sub-section is hidden (SDX already lists targets)
- The card gets an `.sdx-integrated` class hook for future CSS theming

---

## [6.10.6] — 2026-05-17 — AE library expansion, multi-level dungeons, live weapon-anim preview

Three feature drops bundled together; no breaking changes.

### Added — pack-sdxeffects: 13 new Active Effects (`7353f9b`)

Cross-referenced the [official Shadowdark AE wiki](https://github.com/Muttley/foundryvtt-shadowdark/wiki/Active-Effects)
against our pack inventory and filled coverage gaps the system actually
reads. Pack now ships 127 effects (was 114).

New entries:

- **Extra Damage Die** family (5 variants) — `system.roll.attack.extra-damage-die.{all|melee|ranged|<weapon-name>|<property>}`
  for adding a bonus damage die on top of the base damage roll
- **Attack Bonus — property-targeted** (3 variants) — bonus to-hit
  scoped to weapons with a specific property (e.g. `finesse`, `loading`,
  `versatile`)
- **Damage Bonus — property-targeted** (3 variants) — same idea on the
  damage roll
- **Upgrade Damage Die (this)** — bumps the equipped weapon's damage
  die one step (d6 → d8 → d10 → d12)
- **Shield AC Bonus** — `system.bonuses.acBonus` keyed for shields

All entries use the SD 4.x change format (`{type: "add", phase:
"initial", priority: 0}`), not legacy numeric modes. Verified live
against `system.roll.attack.extra-damage-die.all` resolution path.

### Added — Multi-level dungeon generator (`b910a2c`)

Dungeon generator and painter now place rooms, walls, tiles, and tokens
at the correct scene level when the Levels module is active OR when
Foundry v14's native `flags.levels` field is set on the scene.

New exports in `DungeonPainterSD.mjs`:

- `getSceneLevelContext(scene)` — returns `{levelId, elevation, rangeTop}`
- `applySceneLevelData(doc, type, ctx)` — tags placeables with
  `elevation`, `levels[]`, `flags.levels.rangeTop`,
  `flags['wall-height'].{bottom, top}`
- `getCurrentElevation()`, `getDungeonBackground()`,
  `ensureBackgroundDrawing()` — helpers for the painter UI

New helpers in `DungeonGeneratorSD.mjs`:

- `clearSceneAtLevel(scene, levelContext, levelsActive)` — only deletes
  dungeon-flagged docs at the matching level, leaving other levels'
  content untouched
- `waitForDungeonCanvasReady` / `waitForDocumentLayerReady` — prevents
  `createEmbeddedDocuments` race against scene resize
- `createWithElevation(type, docs, chunkSize)` — post-create batch
  update for `wall-height` and `levels.rangeTop`

Tested on a scene with native v14 `levelId: "defaultLevel0000"`,
`rangeTop: 20`. Sample tile tagged correctly; sample wall got
`flags['wall-height']: {bottom: 0, top: 20}`. Backward-compatible —
on scenes without level data the generator behaves exactly as before.

### Changed — Live preview for weapon animations (`18eac6f`)

The WeaponAnimationConfig dialog now plays the animation on the active
token(s) as you tweak the form. No more save → unequip → re-equip
cycle to see what a rotation/scale/glow change looks like.

`WeaponAnimationSD.mjs::playWeaponAnimation(token, item, configOverride)`
now accepts an optional `configOverride` — when present, that object
is used as the animation config instead of reading `item.getFlag(...)`.
That lets the dialog hand the in-progress form values to the same
playback function the saved flag uses, so preview and saved behaviour
are pixel-identical.

`WeaponAnimationConfig.mjs` gains:

- `_readCurrentConfig()` — reads the form into a config object
  (single source of truth — also reused on Save)
- `_scheduleLivePreview()` — 350ms debounce on input/change events
  so dragging a slider doesn't spam Sequencer
- `_livePreviewAnimation()` — finds every active token for the item's
  parent actor and replays the animation with the override config

On Cancel, the animation replays from the **saved** flag so any
unsaved tweaks revert visually. Verified live: 3 rapid input events
collapsed to 1 preview call; rotation=90 propagated through
`_readCurrentConfig` → `_livePreviewAnimation` correctly.

---

## [6.10.1] — 2026-05-17 — FilePicker deprecation cleanup

Foundry v13+ namespaces `FilePicker` under `foundry.applications.apps.
FilePicker.implementation`. The legacy global still works but emits a
deprecation warning on every use — and SDX uses FilePicker in 21 files
(asset browsing for hex painter, dungeon painter, scene exporter,
sheet image pickers, etc.).

Fix: each file aliases `const FilePicker = foundry.applications.apps.
FilePicker?.implementation ?? globalThis.FilePicker;` near the top, so
the rest of the file uses the local non-deprecated reference with no
per-callsite rewrites. Falls back to the global on older Foundry
versions.

Files touched: DungeonPainterSD, DungeonGeneratorSD, DungeonGenerator,
HexTooltipSD, PinStyleEditorSD, MaphubViewerApp, IconPickerSD,
SheetEditorConfig, SceneExporter, SceneImporter, NPCAttackSheetSD,
NPCFeatureSheetSD, ClassAbilitySheetSD, BackgroundSheetSD,
PotionSheetSD, WeaponAnimationSD, apps/TomEditors, shadowdark-extras.

---

## [6.10.0] — 2026-05-16 — Shadowdark 4.x / Foundry v14.361 compat sweep

Multi-day sweep landing SD 4.x compatibility across every spell, weapon,
chat-card, and template flow. 12-commit chain (`0006a89` → `3e65f27`)
with per-phase commits preserved for revertability. Cross-reviewed by
Codex and Gemini through 9 + 2 rounds respectively before execution.

### Added

- **`scripts/sd4Compat.mjs`** — central compatibility helper module
  (`747a0ad`). 201 lines, four exports consumed by every other sweep
  target so the SD 3.x → 4.x shape change is read in exactly one place:
  - `readSdRollOutcome(message)` →
    `{mainRoll, total, isSuccess, isCriticalSuccess, isCriticalFailure, isMasked}`.
    Uses `message.rolls.find(r => r.type === "main")` (NOT `rolls[0]` —
    index is not guaranteed). `isMasked` distinguishes "can't see this
    whispered roll" from "the roll failed" so actor-mutating side
    effects can skip silently on non-recipient clients.
  - `readSdDamageRoll(message)` → `{roll, total}`. Separates the
    damage-typed roll from the main roll; mixing them used to
    silently feed the main attack roll into damage formulas.
  - `resolveCardContext(message, html)` →
    `{actorId, itemUuid, itemId, rollConfig}`. SD 4.x `rollConfig`
    flag takes precedence over the legacy `.chat-card` / `.item-card`
    DOM lookup; tolerates `cast.spellUuid` as well as `itemUuid`.
  - `getActorStats(actor)` → `{hp, hpMax, ac}` reading
    `system.attributes.*` (v4) with `system.hp.*` / `system.ac.*`
    fallback.
- **Active Effect Compendium (`pack-sdxeffects`)** — native Foundry v14
  `ActiveEffect` primary document library. Contains 114 drag-and-drop
  effects:
  - 17 custom SDX advantages/disadvantages mapped to v4 data paths.
  - 97 cloned predefined system effects for unified library access.
  - Manual 404 audit fix for 16 core icon paths (teal potions, red scrolls).
- **Chat-card apply-state persistence** (`3e65f27`) — `damageApplied`
  and `conditionsApplied` flags on the chat message survive re-renders
  so the buttons render as disabled "APPLIED" and the click handler
  hard-blocks a second apply. DOM `data-already-applied` attribute
  provides a parallel guard across tab-switch rebuilds.

### Fixed — SD 4.x roll-shape migration

- **15 main-roll callsites + 3 damage-roll callsites** routed through
  `sd4Compat` helpers:
  - `CombatSettingsSD.mjs` (`ee7d266`) — 12 main + 2 damage spread
    across the wand-success gate, crit-double-duration, item-give,
    template gate, save-DC extraction, aura cast, spell-effects gate,
    crit-damage doubling, damage total, crit-hit bonus dice,
    auto-apply guard, duration-tracker start, and damage breakdown.
    Each callsite now decides explicitly what to do on
    `isMasked === true`; actor-mutating sites skip silently.
  - `shadowdark-extras.mjs` (`25fb915`) — 3 sites in
    `executeWeaponItemMacro`, `executeSpellItemMacro`, and the
    recent-cast lookup.
  - `MysteriousCasting.mjs` (`25fb915`) — content-structure gate
    extended to recognize SD 4.x markers (`.dice-roll` + `rollConfig`)
    instead of failing closed when the legacy `.chat-card` / `.item-card`
    containers aren't present; damage feature-detect uses
    `readSdDamageRoll`.
- **10 `.chat-card` DOM lookups** migrated to `resolveCardContext`:
  - `CombatSettingsSD.mjs` (`ee7d266`) — 5 sites including the
    `hasWeaponCard` feature detect (now also recognizes the new
    `rollConfig` flag) and three visual-hide ops guarded so they
    no-op safely on SD 4.x messages.
  - `shadowdark-extras.mjs` (`25fb915`) — 3 sites.
  - `FocusSpellTrackerSD.mjs` (`a2e0bf7`) — 2 sites including a full
    rewrite of the wand-use tracking lookup at L2847.

### Fixed — SD 4.x data model migration

- **`actor.system.bonuses` removed in SD 4.x** — migrated reads
  (`05ea30e`):
  - `actor.system.bonuses.spellcastingCheckBonus` →
    `actor.system.spellcasting.bonus` at `shadowdark-extras.mjs:15699`
    and `:15854`.
  - Generic `actor.system.bonuses` read at `:14254` updated for
    new sub-bonus paths.
  - `TomSD.mjs:52` HP read switched from `system.hp.value` to
    `system.attributes.hp.value`.
- **`CONFIG.SHADOWDARK.EFFECT_ASK_INPUT` is gone** — the two
  `.push()` calls at `shadowdark-extras.mjs:17941-17942` and
  `:17962-17966` were silent no-ops on v4. Removed (`05ea30e`).
  SD 4.x handles REPLACEME placeholders without external registration.
- **17 predefined Active Effect entries renamed** to v4 paths
  (`d848303`). Disadvantage entries map to the SAME `.advantage.*` path
  as their advantage counterpart but with `value: -1` — SD's
  `applyAdvantage(formula, adv)` takes a signed integer (positive →
  2d20kh, negative → 2d20kl). Mapping table:
  - `abilityAdvantage<Ability>` →
    `system.roll.stat.advantage.<ability>` (value +1)
  - `abilityDisadvantage<Ability>` →
    `system.roll.stat.advantage.<ability>` (value -1)
  - `meleeAdvantage` → `system.roll.melee.advantage.all`
  - `rangedAdvantage` → `system.roll.ranged.advantage.all`
  - `spellAdvantageAll` → `system.roll.spell.advantage.all`
  - `spellDisadvantageAll` →
    `system.roll.spell.advantage.all` (value -1)
  - `spellDisadvantage` →
    `system.roll.spell.advantage.REPLACEME` (value -1)
  - The remaining 7 entries (`meleeDamageDice`, `rangedDamageDice`,
    `freyasOmen`, `macroExecute`, `silenced`, `glassbones`,
    `invisibility`) target SDX module flags — already v4-safe.

### Fixed — Foundry v14 template hardening

- **`MeasuredTemplate` setFlag is silently dropped after creation**
  in v14 (`5185106`). All SDX template flags
  (`templateEffects`, `templateExpiry`, etc.) must be written at
  create time. `SDX.templates.place()` now accepts a `templateFlags`
  option that gets merged into the document data before
  `createEmbeddedDocuments`. Fireball templates now expire as
  configured instead of lingering forever.
- **Template expiry off-by-one** (`5977927`) — a spell cast in
  round 1 with `duration: 1` was being marked to expire at the start
  of round 3 instead of round 2. Calculation switched from
  `currentRound + expiryRounds` to `currentRound + expiryRounds - 1`.

### Fixed — SD 4.x combat regressions

- **Actors not marked defeated on HP→0** (`01a0008`) — SD 4.x's
  `ActorSD._onUpdate` only animates the HP change; it no longer calls
  `_setDefeated()`. Added an `updateActor` hook that watches for
  `system.attributes.hp.value` going to 0 and invokes
  `actor._setDefeated()` explicitly. Player characters get prone +
  unconscious per SD design; NPCs get the dead status.
- **Chat-card "Apply Condition" double-apply** (`3e65f27`, task #7) —
  the auto-apply on first render was firing the button click, then
  any re-render (scroll, tab-switch, settings change) rebuilt the
  button with a fresh `applying` data state, letting a manual click
  fire the handler again. Persistent message-flag guard described in
  the "Added" section blocks the second apply.
- **Chat-card "Apply Damage" silent double-apply** (`3e65f27`,
  task #8) — same root cause, same fix. The `setTimeout` that
  re-enabled the button 2 seconds after success was the actual
  re-entry path; that path now only re-enables when no damage was
  applied (so the user can fix targets and retry).

### Changed

- `SDX.templates.place()` signature extended with optional
  `templateFlags = null` — v14 module flags written at create-time
  only. Internal callers (`placeAndTarget` in `CombatSettingsSD.mjs`)
  now pass a pre-built `sdxTemplateFlags` object so
  `templateEffects` + `templateExpiry` persist on the
  `MeasuredTemplateDocument`.
- Damage-card and effects-card buttons display "APPLIED" with a check
  icon when the message already had its corresponding apply flag set,
  instead of always rendering "APPLY DAMAGE" / "APPLY CONDITION".

### Verified

Five paths exercised programmatically against the live world via the
foundry-vtt MCP bridge after the sweep landed:

- Fireball cast — damage card injected, `autoApplied` flag set, main
  success: true.
- Longsword attack — main + damage rolls both flow through helpers.
- Sleep regression check — old casts inspected via flags only (fresh
  cast required UI interaction).
- HP→0 defeat (Druchor 1→0 HP) — prone + unconscious + combatant
  `defeated` flag applied via the new `updateActor` hook.
- AE rename — `system.roll.stat.advantage.dex` went 0→1 with
  SD-native AE structure.

### Out of scope (tracked separately)

- **Task #14** — `MeasuredTemplate` → `RegionDocument` migration
  (the original "switch templates to regions" goal from before the
  power-outage session loss). Foundry v14.361 ships
  `ApplyActiveEffectRegionBehaviorType`, `RegionDocument#hidden`,
  region-to-token attachment, and `Region#_onAnimationStateChange` —
  enough native machinery to retire most of `TemplateEffectsSD.mjs`.
  Detailed feature-mapping required before any rewrite commits.
- **Task #11** — DialogV2 default-button collision in
  `FocusSpellTrackerSD.mjs` (V2 migration follow-up).
- **Task #15** — repackage SDX advantage/disadvantage AEs as a v14
  compendium pack instead of constructing them inline. Optional
  architectural cleanup.

---

## [6.9.4] — 2026-05-15 — pin style defaults & more deprecation cleanup

Surfaced while exercising journal pins and carousing in v14.

### Fixed — Runtime correctness

- **Pin Style Editor color inputs** — `<input type="color">` requires a
  valid `#rrggbb` value and rejects empty strings with a render-time
  warning. The template references `style.symbolColor`,
  `style.iconColor`, and `style.customIconPath` but those keys weren't
  in `DEFAULT_PIN_STYLE`, so they rendered as `value=""` and broke
  `_renderHTML`. Added defaults: `iconColor: "#ffffff"`,
  `symbolColor: "#ffffff"`, `customIconPath: ""`.

### Fixed — Deprecation warnings

- **`CONST.DICE_ROLL_MODES`** (V16 removal) — `LightTrackerAppSD.mjs`
  used `CONST.DICE_ROLL_MODES.PUBLIC` to set roll mode on its
  "disable all lights" chat card. Switched to the new string value
  `"publicroll"`.
- **Legacy `-=` deletion key syntax** (V16 removal) — three call sites
  in `CarousingSD.mjs` used `flags.shadowdark-extras.-=carousingDrops`
  / `-=carousingSession` to wipe carousing state on journal updates.
  Migrated to the v14+ sentinel
  `foundry.data.operators.ForcedDeletion`:
  ```js
  { [`flags.${MODULE_ID}.carousingDrops`]: foundry.data.operators.ForcedDeletion }
  ```
  Simplified the matching watcher hook — the ForcedDeletion sentinel
  appears under the actual key, not as a `-=`-prefixed entry, so the
  parallel `flagChanges["-=..."]` checks were dropped.

---

## [6.9.3] — 2026-05-15 — more v14 deprecation cleanup

Follow-up to 6.9.2 — cleans up deprecation warnings surfaced when
actually exercising features (POI tile sort, journal pin hover,
marching-mode dialogs, hex painter preview).

### Fixed — v14/v15/v16 deprecation warnings

- **`loadTexture` global** (V15 removal) — 6 call sites in
  `HexPainterSD.mjs` migrated to `foundry.canvas.loadTexture`. Fires on
  every POI tile preview and stamp.
- **`foundry.utils.objectsEqual`** (V16 removal) — renamed to
  `foundry.utils.equals` in `JournalPinsSD.mjs` (hot path: every pin
  click and hover) and `MedkitSD.mjs`.
- **`PoiTileSortApp` migrated to ApplicationV2** — was extending V1
  `Application`. Converted defaults to `DEFAULT_OPTIONS` / `PARTS`,
  `getData` → `_prepareContext`, `activateListeners` → `_onRender`,
  `this.element[0]` → `this.element` (HTMLElement, not jQuery).
- **`MarchingModeSD.mjs` three V1 `Dialog`s migrated to `DialogV2`**:
  - `showLeaderDialog` (set party leader)
  - `showMovementModeDialog` (free/marching toggle with clickable
    option boxes)
  - SDX Pins menu (add pin / pin list)
  Button callbacks now use `(event, button, dialog)` signature; form
  values read via `button.form.elements.<name>.value`; the
  movement-mode option click wiring runs after `dialog.render(...).then(...)`.

### Fixed — Runtime correctness

- **GSAP PixiPlugin now registered** at JournalPinsSD module load.
  Without registration, GSAP warned `Invalid property pixi set to
  {brightness, hue}` on every pin hover/leave and silently no-op'd the
  filter tweens. PixiPlugin was already bundled in 6.9.2 but never
  initialized — pin brightness/hue effects are now actually visible.

### Known remaining

- ~25 more V1 `new Dialog(...)` call sites across the codebase
  (Party sheet, Combat settings, Trade window, etc.). V16 removal —
  not urgent; will migrate opportunistically.
- Third-party warnings unchanged from 6.9.2 (PixiJS, SD system V1
  Apps, TokenMagic 0.8.1, obs-utils manifest).

---

## [6.9.2] — 2026-05-15 — v14 polish & follow-up fixes

Follow-up release that cleans up issues surfaced after 6.9.1.

### Fixed — Runtime correctness

- **Audit cleanup**: removed three dead-code prototype patches targeting
  ActorSD methods that no longer exist in SD 4.x (`buildWeaponDisplay`
  ×2, `getExtraDamageDiceForWeapon`). They were silently no-op'ing
  behind guards; deleted ~190 lines of unreachable code.
- **`applyDamage` socket call fixed**: an old call site invoked
  `executeAsGM("applyDamage", tokenId, damage, actorName)` against a
  handler name that was never registered. Routed through the existing
  `applyTokenDamage` handler with the proper `{ tokenId, damage,
  actorName }` shape so player damage-application actually reaches
  the GM in multiplayer.
- **Freya's Omen reroll button migrated** to v14's
  `renderChatMessageHTML` hook. The previous chat-hook migration
  pass missed this one; vanilla DOM rewrite of the jQuery-based
  handler.
- **jQuery method calls on HTMLElement** fixed in three more chat
  hook handlers that the v14 hook-name migration left half-finished:
  - `shadowdark-extras.mjs` weapon-macro chat trigger — vanilla DOM
    rewrite of `html.find('.chat-card').data()`.
  - `CombatSettingsSD.mjs` `injectDamageCard` — re-wrap with `$()` at
    function entry so the existing 30+ jQuery calls inside keep
    working (pragmatic minimal-change fix vs rewriting them all).
  - `FocusSpellTrackerSD.mjs` `handleWandUsesTracking` — vanilla DOM
    rewrite of chat-card lookup.

### Fixed — Console noise

- **Restored GSAP + PixiPlugin** (`greensock/dist/gsap.min.js` and
  `PixiPlugin.min.js`, version 3.12.5). An earlier "GSAP cleanup"
  commit removed the bundled library but left five `gsap.*` call
  sites in `JournalPinsSD.mjs` (ripple, scale, brightness tweens) —
  every journal pin click threw `ReferenceError: gsap is not
  defined`.
- **Migrated 12 v13-deprecated global namespaces** that fire
  per-boot deprecation warnings and will hard-break in Foundry v15:
  - `Actors` / `Items` (sheet registrations) →
    `foundry.documents.collections.Actors` / `.Items`
  - `WallsLayer` / `Wall` (libWrapper paths in WallContextMenuSD) →
    `foundry.canvas.layers.WallsLayer` / `foundry.canvas.placeables.Wall`
  - `FilePicker` (HexPainter custom tile loading) →
    `foundry.applications.apps.FilePicker.implementation`
- **Three SDX-emitted info-level warnings downgraded** to
  `console.log`: TomSocketHandler init message and HexPainter's
  graceful-fallback messages when FilePicker permission isn't
  available during early boot.
- **HexPainter custom tile loaders now early-return for non-GMs**.
  FilePicker.browse requires GM permission; non-GMs were previously
  hitting a try/catch fallback that produced two warnings each load.

### Cleanup

- Removed stale `// TODO: Update this if ItemSD.prototype.rollItem
  signature changed in 4.x` comment after verifying the signature
  matches SD 4.x's `async rollItem(parts, data, options={})`.

### Known remaining

Boot console will still show ~10 warnings, all third-party:
- PixiJS DisplacementFilter deprecation (library internal)
- Shadowdark system's own V1 Application warnings (LightSourceTrackerSD,
  EffectPanelSD) and ActiveEffect mode-vs-type deprecations
- TokenMagic 0.8.1's `autoTemplateSettings` regression
- obs-utils manifest `manifestPlusVersion` key warning

Zero SDX-attributed warnings on a fresh world load.

---

## [6.9.1] — 2026-05-15 — Foundry v14 / Shadowdark 4.0.x compatibility

This series of changes brings the module forward from its last upstream release
(6.90, verified Foundry 13 / Shadowdark 3.x) to run on Foundry 14.361 and
Shadowdark 4.0.4. Upstream `gmdima/shadowdark-extras` appears unmaintained, so
this fork carries the migration.

### Fixed — Boot & init blockers

- **`canUseMagicItems` patch** — retargeted from removed `ActorSD.prototype`
  method to the `PlayerSD` data-model getter. Replaced libWrapper (which lacks
  clean cross-version getter support) with a direct property-descriptor
  override.
- **`buildNpcAttackDisplays` / `buildNpcSpecialDisplays`** — retargeted from
  `ActorSD.prototype` to the `NpcSD` data model. Inside the wrapped method
  `this` is now the data model; the actor is reached via `this.parent`.
- **`setupWandUsesBlocker`** — retargeted the `castSpell` wrap to both
  `PlayerSD` and `NpcSD` data models; handles UUID-or-id first arg.
- **`buildWeaponDisplay`** — removed in Shadowdark 4.x; the patch now skips
  cleanly behind a presence guard.
- **`TraySD.getPartyTokens` item-piles guard** — Foundry v14 now throws when
  `getFlag` is called against an inactive module's scope. Added an
  `item-piles` module-active check before reading the flag.
- **`CONFIG.SHADOWDARK.EFFECT_ASK_INPUT` guard** — removed in SD 4.x; SDX's
  spell-disadvantage wiring previously crashed init with `Cannot read
  properties of undefined (reading 'includes')`. Guarded with
  `Array.isArray()`.
- **Three silent ESM syntax errors** in a checkpoint commit broke init for
  the whole module without producing any console error (Foundry's ESM loader
  swallows parse failures). Fixed:
  - Duplicate inline import of `getPromptableHitBonuses` / `getPromptableDamageBonuses`.
  - Orphan `});` from a deleted `Hooks.once("ready", () => {` wrapper.
  - `await` inside a non-async arrow function in the itemacro migration hook.
- **`setupRollConfigPatches` timing fix** — `Hooks.once("ready", …)` was
  registered from inside an outer `ready` callback that had already fired, so
  the inner wrap never ran. Switched to direct iteration since the registration
  point is already past `ready`.
- **`generateDungeon` missing `gridSize` local** — function referenced bare
  `gridSize` in 20+ places (configureScene, fitToContent, scene padding,
  renderFloor/Walls/Doors helper calls, stairs, clutter) but never declared
  it. Added `const gridSize = GRID_SIZE;` at function entry plus the missing
  `const GRID_SIZE = 100;` module-level declaration.

### Fixed — Runtime correctness

- **Chat card `_renderChatMessage` monkeypatch** — removed. SD 4.x renamed
  `type` → `style` on chat data; SDX's patch was overriding the new renderer
  with broken legacy code that omitted the field entirely.
- **`ArmorAEPatchSD` simplification** — SD 4.x natively suppresses Active
  Effects for stashed and unequipped items. SDX's patch is no longer needed
  for those cases; trimmed to keep only the unidentified-item suppression
  (still SDX-specific) and delegates the rest to SD's native getter.
- **Rolling logic migration** — `rollAttack`, `rollAbility`, advantage /
  disadvantage prototype patches were dead code in SD 4.x (methods removed or
  relocated). Migrated to wrap each actor's `actor.system.rollConfigGenerators`
  on instance creation (with backfill on `ready` for existing actors), and
  inject promptable bonuses via a `renderRollDialogSD` hook compatible with
  ApplicationV2.
- **Roll-config wrap targets the instance, not the prototype** — `rollConfigGenerators`
  is declared as a class instance field in SD 4.x, so prototype-targeted patches
  early-returned silently. Wrap each actor's generators per-instance.
- **Weapon animation button now injects** — SD 4.x ships a native `tab-bonuses`
  on weapon sheets, which made SDX's `injectWeaponBonusTab` short-circuit
  before reaching `injectWeaponAnimationButton`. When a native bonuses tab is
  detected, still inject the animation button, then bail out of the SDX
  bonus-content injection.
- **Dungeon tile rendering offset** — Foundry v14 changed the default tile
  texture anchor to `(0.5, 0.5)` = center. Tiles created without an explicit
  anchor rendered half a cell up-left of their document position; the wall
  builder placed walls correctly, producing the visible "tiles shifted
  up-left" symptom on every painted/generated dungeon. Painter and generator
  now set `texture.anchorX: 0, texture.anchorY: 0` on every tile (floors,
  stairs, clutter, probes).
- **Tray toggle button chevron** — direction now updates with collapsed /
  expanded state. The panel was sliding off-screen correctly; only the
  visual cue was stuck, which read as "tray won't close."

### Changed — Dependencies

- **`itemacro` decoupled from runtime path.** The module previously hard-
  required `itemacro` for every spell / scroll / wand / potion / class-ability
  trigger macro: gated each execution on `game.modules.get("itemacro")?.active`
  and called `item.executeMacro()` (an itemacro prototype injection). With
  itemacro uninstalled (its v14 status is uncertain), every trigger macro
  silently no-op'd. Native executor `executeItemMacro(item, scope)` now
  handles execution; reads `flags.shadowdark-extras.macroCommand` first with
  a fallback read of legacy `flags.itemacro.macro.command` for unmigrated
  worlds. One-time data migration runs on first `ready` after upgrade.
  `itemacro` removed from `module.json` `requires`.
- **`autoanimations` added to `recommends`** in `module.json`. SDX's
  `AutoAnimationsSD` only filters AA's animations (suppresses on failed
  rolls); it doesn't generate them. Without AA installed, attack/spell
  animations don't fire — and the previous manifest never declared the
  relationship.
- **`module.json` compatibility** — `verified: "14"`, system
  `verified: "4.0.4"`.

### Known remaining work

- The wider feature surface inside `executeSpellItemMacro`-style call sites
  still exposes the rich legacy scope (`target`, `targets`, `isSuccess`,
  etc.) to macro authors. Preserved for back-compat with existing user
  macros. Future macros can use the simpler `(actor, token, item, scope)`
  shape the native executor exposes.
- `WeaponBonusConfig.mjs` still references `game.modules.get("itemacro")?.active`
  for the weapon-macro UI hint. Cosmetic only — runtime works without
  itemacro.
- Pre-existing socket handler `executeSpellItemMacroAsGM` is called but
  never registered (line 18807). Run-as-GM for spell macros has never worked
  on this module; only matters in multiplayer.
