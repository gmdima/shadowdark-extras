#!/usr/bin/env bash
# verify.sh — pre-commit / pre-release sanity check for shadowdark-extras.
# Run from module root. Exits non-zero if any BLOCKING check fails.
# WARNING checks surface tech debt but don't block commits.
#
# Flags:
#   --strict   Treat warnings as errors (use during security passes)
#
# Each grep pattern below was a real bug found in this codebase.
# When you find a new class of regression, add to BLOCKING.
# Pre-existing issues being tracked for cleanup go in WARNING.

set -e
strict=0
[[ "$1" == "--strict" ]] && strict=1
block_fail=0
warn_fail=0

scan_block() {
  local label="$1"
  local pattern="$2"
  shift 2
  if grep -nE "$pattern" "$@" 2>/dev/null; then
    echo "[BLOCK] $label"
    block_fail=1
  fi
}

scan_warn() {
  local label="$1"
  local pattern="$2"
  shift 2
  if grep -nE "$pattern" "$@" 2>/dev/null; then
    echo "[WARN]  $label"
    warn_fail=1
  fi
}

echo "=== node --check on .mjs files ==="
mjs_files=$(git ls-files 'scripts/*.mjs' 'scripts/**/*.mjs' 2>/dev/null || find scripts -name '*.mjs' -type f)
for f in $mjs_files; do
  if ! node --check "$f" 2>/dev/null; then
    echo "[BLOCK] syntax: $f"
    node --check "$f"
    block_fail=1
  fi
done

mjs_paths=( $mjs_files )

echo "=== BLOCKING — regressions of previously fixed bugs ==="

# Socketlib auth: handler context is { socketdata: { userId } }, not { senderId }.
scan_block "this.senderId (socketlib gives this.socketdata.userId)" \
  'this\.senderId' "${mjs_paths[@]}"

# Async global leakage between hook handlers (v6.10.15 fix).
scan_block "window._lastPlacedTemplateId (use let-scoped local in same fn)" \
  'window\._lastPlacedTemplateId' "${mjs_paths[@]}"

# Roll.safeEval sandbox exposes bare math fns; Math.* inside arg breaks.
scan_block "Math.* inside Roll.safeEval string arg (v6.10.15 fix)" \
  'Roll\.safeEval\([^)]*Math\.(floor|ceil|round|min|max|abs|PI|sqrt)' "${mjs_paths[@]}"

# Legacy v13 chat render hook. v14 fires renderChatMessageHTML.
scan_block 'Hooks.on("renderChatMessage" (use renderChatMessageHTML in v14)' \
  'Hooks\.on\("renderChatMessage"[^H]' "${mjs_paths[@]}"

# Global DOM monkeypatch — replaced with scoped hook in v6.10.15.
scan_block "Element.prototype.querySelector = (global monkeypatch)" \
  'Element\.prototype\.querySelector\s*=' "${mjs_paths[@]}"

# Heuristic Region pairing — v14 binds template.id === region.id (v6.10.16 fix).
scan_block "existingRegionIds snapshot (use parent.regions.get(template.id))" \
  'existingRegionIds\s*=' "${mjs_paths[@]}"

# Async prepareActorData hook — removed in v6.10.15.
scan_block "prepareActorData hook (use updateActor/renderActorSheet/createItem)" \
  'Hooks\.on\("prepareActorData"' "${mjs_paths[@]}"

# Region delete hook duplication — removed in v6.10.16.
scan_block 'Hooks.on("deleteRegion" (cascade already fires deleteMeasuredTemplate)' \
  'Hooks\.on\("deleteRegion"\s*,\s*\([^)]*\)\s*=>\s*_onDeleteTemplate' "${mjs_paths[@]}"

# Context menu v13 properties.
scan_block "context menu name:/condition: (use label:/visible: in v14)" \
  'menuItems\.push\(\s*\{\s*name:|menuItems\.push\(\s*\{\s*[^}]*condition:' "${mjs_paths[@]}"

echo "=== WARNING — pre-existing tech debt (use --strict to block) ==="

# Raw eval() — pre-existing in TMFXFilterEditor. Should migrate to scoped evaluator.
scan_warn "raw eval( — use Roll.safeEval for formulas, new Function for scoped" \
  '^[^/]*[^.]eval\(' "${mjs_paths[@]}"

# Unescaped img.src — pre-existing in macro/carousing/formation files. XSS surface.
scan_warn "raw src=\${...img/image} — wrap in foundry.utils.escapeHTML for XSS safety" \
  'src="\$\{[A-Za-z_$][A-Za-z0-9_$]*\.(img|image)\}"' "${mjs_paths[@]}"

echo "=== pack runtime state ==="
if [ -f packs/pack-sdxeffects/LOCK ]; then
  recent_log=$(find packs/pack-sdxeffects -name '*.log' -mmin -1 2>/dev/null | head -1)
  if [ -n "$recent_log" ]; then
    echo "[WARN]  pack-sdxeffects log recently modified ($recent_log). Foundry may be running — close world before committing pack changes."
    warn_fail=1
  fi
fi

echo
if [ $block_fail -ne 0 ]; then
  echo "verify: FAIL (blocking)"
  exit 1
fi
if [ $strict -eq 1 ] && [ $warn_fail -ne 0 ]; then
  echo "verify: FAIL (strict mode — warnings treated as errors)"
  exit 1
fi
if [ $warn_fail -ne 0 ]; then
  echo "verify: OK with warnings"
  exit 0
fi
echo "verify: OK"
