/**
 * TileFlattenSD — Flatten multiple selected tiles into a single tile.
 * Adds a "Flatten" button to the Tile HUD when 2+ tiles are controlled.
 * Adds an "Unflatten" button to the Tile HUD for tiles created by this module.
 *
 * Capabilities:
 * - Flatten: Renders 2+ tiles to a single WebP image (max quality, 1:1 resolution).
 * - Unflatten: Restores original tiles from data stored in the flattened tile's flags.
 */

const MODULE_ID = 'shadowdark-extras';
const FLATTEN_ACTION = 'sdx-flatten-tiles';
const UNFLATTEN_ACTION = 'sdx-unflatten-tiles';
const UPLOAD_DIR = 'flattened-tiles';

// ─── Utility helpers ─────────────────────────────────────────────────────────

/** Wait one animation frame */
function nextFrame() {
    return new Promise(resolve => requestAnimationFrame(resolve));
}

/** Get controlled tile documents from the tiles layer */
function getControlledTiles() {
    const layer = canvas?.tiles;
    if (!layer) return [];
    const controlled = Array.isArray(layer.controlled) ? layer.controlled : [];
    const docs = [];
    const seen = new Set();
    for (const placeable of controlled) {
        const doc = placeable?.document;
        const id = doc?.id;
        if (!doc || !id || seen.has(id)) continue;
        docs.push(doc);
        seen.add(id);
    }
    return docs;
}

// ─── Bounds ──────────────────────────────────────────────────────────────────

function computeBounds(tiles) {
    if (!tiles?.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const doc of tiles) {
        const x = Number(doc.x) || 0;
        const y = Number(doc.y) || 0;
        const w = Number(doc.width) || 0;
        const h = Number(doc.height) || 0;
        const rot = Number(doc.rotation) || 0;

        if (rot !== 0) {
            const rad = rot * (Math.PI / 180);
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);
            const cx = x + w / 2;
            const cy = y + h / 2;
            const corners = [
                { x, y },
                { x: x + w, y },
                { x: x + w, y: y + h },
                { x, y: y + h }
            ];
            for (const c of corners) {
                const dx = c.x - cx;
                const dy = c.y - cy;
                const rx = cx + dx * cos - dy * sin;
                const ry = cy + dx * sin + dy * cos;
                minX = Math.min(minX, rx);
                minY = Math.min(minY, ry);
                maxX = Math.max(maxX, rx);
                maxY = Math.max(maxY, ry);
            }
        } else {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x + w);
            maxY = Math.max(maxY, y + h);
        }
    }

    if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

// ─── Visibility isolation ────────────────────────────────────────────────────

function isolateVisibility(tiles, bounds) {
    const selectedIds = new Set(tiles.map(d => d.id).filter(Boolean));
    const hidden = [];

    const hide = (obj) => {
        if (!obj || obj.visible === false) return;
        hidden.push({ obj, visible: obj.visible });
        obj.visible = false;
    };

    for (const p of (canvas?.tiles?.placeables ?? [])) {
        const doc = p?.document;
        if (!doc || selectedIds.has(doc.id)) continue;
        hide(p);
    }

    for (const p of (canvas?.background?.placeables ?? [])) {
        const doc = p?.document;
        if (!doc || selectedIds.has(doc.id)) continue;
        hide(p);
    }

    const primary = canvas?.primary;
    if (primary?.children) {
        for (const child of primary.children) {
            if (!child) continue;
            const childDoc = child?.document || child?.tile?.document;
            if (childDoc && selectedIds.has(childDoc.id)) continue;
            const parentPlaceable = child?.object;
            if (parentPlaceable?.document && selectedIds.has(parentPlaceable.document.id)) continue;
            hide(child);
        }
    }

    hide(primary?.background);
    hide(primary?.background?.mesh);
    hide(primary?.background?.sprite);
    hide(primary?.foreground);
    hide(primary?.foreground?.mesh);
    hide(primary?.foreground?.sprite);

    const hiddenFrames = [];
    for (const doc of tiles) {
        const p = doc?.object;
        if (p?.frame) {
            hiddenFrames.push({ frame: p.frame, visible: p.frame.visible });
            p.frame.visible = false;
        }
        if (p?.controlIcon) {
            hiddenFrames.push({ frame: p.controlIcon, visible: p.controlIcon.visible });
            p.controlIcon.visible = false;
        }
    }

    const grid = canvas?.grid;
    const gridVis = grid?.visible ?? null;
    if (grid) grid.visible = false;

    const iGrid = canvas?.interface?.grid;
    const iGridVis = iGrid?.visible ?? null;
    if (iGrid) iGrid.visible = false;

    const effects = canvas?.effects;
    const effectsVis = effects?.visible ?? null;
    if (effects) effects.visible = false;

    const iface = canvas?.interface;
    const ifaceVis = iface?.visible ?? null;
    if (iface) iface.visible = false;

    for (const doc of tiles) {
        const p = doc?.object;
        if (p) {
            p.visible = true;
            if (p.renderable !== undefined) p.renderable = true;
            const visual = p.sprite || p.mesh;
            if (visual) {
                visual.visible = true;
                if (visual.renderable !== undefined) visual.renderable = true;
            }
        }
    }

    return () => {
        for (const { obj, visible } of hidden) {
            try { obj.visible = visible; } catch (_) { }
        }
        for (const { frame, visible } of hiddenFrames) {
            try { frame.visible = visible; } catch (_) { }
        }
        if (gridVis !== null && grid) grid.visible = gridVis;
        if (iGridVis !== null && iGrid) iGrid.visible = iGridVis;
        if (effectsVis !== null && effects) effects.visible = effectsVis;
        if (ifaceVis !== null && iface) iface.visible = ifaceVis;
    };
}

// ─── Primary canvas patches ─────────────────────────────────────────────────

function patchPrimaryForTransparent(primary) {
    if (!primary) return null;

    const sprite = primary.sprite ?? null;
    const prevDisplayed = !!primary.displayed;
    const prevSpriteVis = sprite?.visible;
    const prevSpriteRend = sprite?.renderable;
    const prevClearColor = Array.isArray(primary.clearColor) ? primary.clearColor.slice() : null;

    primary.displayed = true;
    if (sprite) {
        sprite.visible = false;
        if (typeof sprite.renderable === 'boolean') sprite.renderable = false;
    }
    if (primary.clearColor) {
        try { primary.clearColor = [0, 0, 0, 0]; } catch (_) { }
    }
    try { primary.renderDirty = true; } catch (_) { }

    let restoreRender = null;
    if (typeof primary._render === 'function') {
        const origRender = primary._render;
        primary._render = function (localRenderer) {
            const r = localRenderer || canvas?.app?.renderer;
            const fb = r?.framebuffer;
            let restoreClear = null;
            if (fb && typeof fb.clear === 'function') {
                const origClear = fb.clear;
                fb.clear = function (rr, g, b, a, mask) {
                    return origClear.call(this, 0, 0, 0, 0, mask);
                };
                restoreClear = () => { fb.clear = origClear; };
            }
            try {
                return origRender.call(this, r);
            } finally {
                if (restoreClear) try { restoreClear(); } catch (_) { }
            }
        };
        try { primary.renderDirty = true; } catch (_) { }
        restoreRender = () => {
            primary._render = origRender;
            try { primary.renderDirty = true; } catch (_) { }
        };
    }

    return () => {
        try { primary.displayed = prevDisplayed; } catch (_) { }
        if (sprite) {
            try { sprite.visible = prevSpriteVis; } catch (_) { }
            if (prevSpriteRend !== undefined) try { sprite.renderable = prevSpriteRend; } catch (_) { }
        }
        if (prevClearColor) try { primary.clearColor = prevClearColor; } catch (_) { }
        try { primary.renderDirty = true; } catch (_) { }
        if (restoreRender) try { restoreRender(); } catch (_) { }
    };
}

// ─── Crop transparent borders ────────────────────────────────────────────────

function cropTransparentBorders(canvasEl, bounds) {
    const ctx = canvasEl.getContext('2d');
    const w = canvasEl.width;
    const h = canvasEl.height;
    if (!w || !h) return { canvas: canvasEl, bounds };

    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;

    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (data[(y * w + x) * 4 + 3] > 0) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }

    if (maxX < 0 || maxY < 0) return { canvas: canvasEl, bounds };

    const cropW = maxX - minX + 1;
    const cropH = maxY - minY + 1;

    if (minX === 0 && minY === 0 && cropW === w && cropH === h) {
        return { canvas: canvasEl, bounds };
    }

    const cropped = document.createElement('canvas');
    cropped.width = cropW;
    cropped.height = cropH;
    cropped.getContext('2d').drawImage(canvasEl, minX, minY, cropW, cropH, 0, 0, cropW, cropH);

    const newBounds = {
        x: bounds.x + minX,
        y: bounds.y + minY,
        width: cropW,
        height: cropH
    };

    return { canvas: cropped, bounds: newBounds };
}

// ─── Rendering ───────────────────────────────────────────────────────────────

async function renderTilesToCanvas(tiles, bounds) {
    if (!canvas?.ready || !canvas.stage || !canvas.app?.renderer) {
        throw new Error('Canvas not available');
    }

    const renderer = canvas.app.renderer;
    const stage = canvas.stage;
    const primary = canvas.primary;
    const resolution = 1;

    const pixelWidth = Math.max(1, Math.round(bounds.width * resolution));
    const pixelHeight = Math.max(1, Math.round(bounds.height * resolution));

    const gl = renderer.gl || renderer.context?.gl;
    const maxSize = gl?.getParameter?.(gl.MAX_TEXTURE_SIZE) ?? 4096;
    if (pixelWidth > maxSize || pixelHeight > maxSize) {
        throw new Error(
            `Flattened image (${pixelWidth}×${pixelHeight}px) exceeds GPU texture limit (${maxSize}px). ` +
            `Try selecting fewer tiles.`
        );
    }

    const restore = isolateVisibility(tiles, bounds);
    const restorePrimary = patchPrimaryForTransparent(primary);

    const origStage = {
        scaleX: stage.scale?.x ?? 1,
        scaleY: stage.scale?.y ?? 1,
        posX: stage.position?.x ?? 0,
        posY: stage.position?.y ?? 0,
        pivotX: stage.pivot?.x ?? 0,
        pivotY: stage.pivot?.y ?? 0
    };
    const origScreen = renderer.screen
        ? { width: renderer.screen.width, height: renderer.screen.height }
        : null;
    const rendBg = renderer.background || null;
    const prevBg = rendBg ? { alpha: rendBg.alpha, color: rendBg.color } : null;
    const hasBgAlpha = typeof renderer.backgroundAlpha === 'number';
    const prevBgAlpha = hasBgAlpha ? renderer.backgroundAlpha : null;

    const renderTexture = PIXI.RenderTexture.create({
        width: pixelWidth,
        height: pixelHeight,
        resolution: 1,
        scaleMode: PIXI.SCALE_MODES.LINEAR
    });
    if (renderTexture?.baseTexture) {
        try { renderTexture.baseTexture.clearColor = [0, 0, 0, 0]; } catch (_) { }
    }

    let outputCanvas = null;
    try {
        if (renderer.screen) {
            renderer.screen.width = pixelWidth;
            renderer.screen.height = pixelHeight;
        }

        try { stage.pivot?.set?.(0, 0); } catch (_) { }
        try { stage.position?.set?.(-bounds.x * resolution, -bounds.y * resolution); } catch (_) { }
        try { stage.scale?.set?.(resolution, resolution); } catch (_) { }

        if (rendBg) try { rendBg.alpha = 0; } catch (_) { }
        if (hasBgAlpha) try { renderer.backgroundAlpha = 0; } catch (_) { }

        await nextFrame();
        try { stage.updateTransform?.(); } catch (_) { }
        try { primary?.updateTransform?.(); } catch (_) { }
        await nextFrame();

        renderer.render(stage, { renderTexture, clear: true, skipUpdateTransform: false });

        outputCanvas = renderer.extract.canvas(renderTexture);
    } finally {
        renderTexture.destroy(true);

        try { stage.scale?.set?.(origStage.scaleX, origStage.scaleY); } catch (_) { }
        try { stage.position?.set?.(origStage.posX, origStage.posY); } catch (_) { }
        try { stage.pivot?.set?.(origStage.pivotX, origStage.pivotY); } catch (_) { }
        if (origScreen && renderer.screen) {
            renderer.screen.width = origScreen.width;
            renderer.screen.height = origScreen.height;
        }
        try { stage.updateTransform?.(); } catch (_) { }

        if (rendBg && prevBg) {
            try { rendBg.alpha = prevBg.alpha; rendBg.color = prevBg.color; } catch (_) { }
        }
        if (hasBgAlpha && prevBgAlpha !== null) {
            try { renderer.backgroundAlpha = prevBgAlpha; } catch (_) { }
        }

        if (restorePrimary) try { restorePrimary(); } catch (_) { }
        restore();
    }

    return { canvas: outputCanvas, bounds };
}

// ─── File saving ─────────────────────────────────────────────────────────────

async function ensureDir(dir) {
    try {
        const FP = foundry.applications.apps.FilePicker.implementation;
        await FP.browse('data', dir);
    } catch {
        try {
            const FP = foundry.applications.apps.FilePicker.implementation;
            await FP.createDirectory('data', dir);
        } catch (_) { }
    }
}

async function saveAsWebP(canvasEl, quality = 1.0) {
    if (!canvasEl) throw new Error('No canvas to save');

    await ensureDir(UPLOAD_DIR);

    const blob = await new Promise(resolve => {
        if (canvasEl.toBlob) {
            canvasEl.toBlob(resolve, 'image/webp', quality);
        } else {
            try {
                const dataUrl = canvasEl.toDataURL('image/webp', quality);
                const bin = atob(dataUrl.split(',')[1] || '');
                const arr = new Uint8Array(bin.length);
                for (let i = 0; i < arr.length; i++) arr[i] = bin.charCodeAt(i);
                resolve(new Blob([arr], { type: 'image/webp' }));
            } catch (e) {
                resolve(null);
            }
        }
    });

    if (!blob) throw new Error('Failed to create WebP blob');

    const timestamp = Date.now();
    const sceneId = canvas?.scene?.id || 'unknown';
    const filename = `flatten-${sceneId}-${timestamp}.webp`;
    const file = new File([blob], filename, { type: 'image/webp' });

    const FP = foundry.applications.apps.FilePicker.implementation;
    const result = await FP.upload('data', UPLOAD_DIR, file, {}, { notify: false });

    let path = '';
    if (typeof result?.url === 'string') path = result.url;
    else if (typeof result?.path === 'string') path = result.path;
    else if (typeof result === 'string') path = result;
    if (!path) path = `${UPLOAD_DIR}/${filename}`;

    await new Promise(r => setTimeout(r, 200));
    return path;
}

// ─── Tile Actions ────────────────────────────────────────────────────────────

// --- FLATTEN ---

async function createFlattenedTile(bounds, filePath, tiles) {
    if (!canvas?.scene) throw new Error('Scene not available');

    let elevation = 0;
    for (const doc of tiles) {
        const e = Number(doc.elevation ?? 0);
        if (e > elevation) elevation = e;
    }

    // Store original tile data for restoration
    const originalData = tiles.map(t => {
        const data = t.toObject(false);
        return { data };
    });

    const tileData = {
        texture: { src: filePath },
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        rotation: 0,
        alpha: 1,
        elevation,
        sort: 2,
        hidden: false,
        locked: false,
        occlusion: { mode: 0, alpha: 0 },
        flags: {
            [MODULE_ID]: {
                flattenedTile: true,
                originalTileCount: tiles.length,
                flattenedAt: Date.now(),
                originalPosition: { x: bounds.x, y: bounds.y },
                // Store full tile data for unflattening
                tiles: originalData
            }
        }
    };

    const created = await canvas.scene.createEmbeddedDocuments('Tile', [tileData]);
    await new Promise(r => setTimeout(r, 100));
    return created;
}

async function deleteOriginalTiles(tiles) {
    if (!canvas?.scene) return;
    const ids = tiles.map(t => t.id).filter(Boolean);
    if (!ids.length) return;
    await canvas.scene.deleteEmbeddedDocuments('Tile', ids);
}

async function flattenTiles(tiles) {
    if (!tiles || tiles.length < 2) {
        ui.notifications.warn('Select at least 2 tiles to flatten.');
        return;
    }

    try {
        ui.notifications.info('Flattening tiles…');
        const bounds = computeBounds(tiles);
        if (!bounds) throw new Error('Could not compute tile bounds');

        const result = await renderTilesToCanvas(tiles, bounds);
        if (!result?.canvas) throw new Error('Failed to render tiles');

        const cropped = cropTransparentBorders(result.canvas, bounds);
        if (cropped.canvas !== result.canvas) {
            try { result.canvas.width = 0; result.canvas.height = 0; } catch (_) { }
        }

        ui.notifications.info('Saving flattened image…');
        const filePath = await saveAsWebP(cropped.canvas, 1.0);

        try { cropped.canvas.width = 0; cropped.canvas.height = 0; } catch (_) { }

        ui.notifications.info('Creating flattened tile…');
        await createFlattenedTile(cropped.bounds, filePath, tiles);
        await deleteOriginalTiles(tiles);

        ui.notifications.info(`Flattened ${tiles.length} tiles successfully!`);

    } catch (error) {
        console.error(`${MODULE_ID} | TileFlatten failed:`, error);
        ui.notifications.error(`Failed to flatten tiles: ${error.message}`);
    }
}


// --- UNFLATTEN (DECONSTRUCT) ---

async function unflattenTile(tileDoc) {
    if (!tileDoc) return;

    const flags = tileDoc.flags?.[MODULE_ID];
    if (!flags?.flattenedTile || !flags?.tiles?.length) {
        ui.notifications.warn('This tile does not contain stored tile data.');
        return;
    }

    try {
        ui.notifications.info('Restoring original tiles…');

        const storedTiles = flags.tiles;
        const origin = flags.originalPosition || { x: tileDoc.x, y: tileDoc.y };

        // Calculate offset if the flattened tile was moved
        const offsetX = tileDoc.x - origin.x;
        const offsetY = tileDoc.y - origin.y;

        const toCreate = [];
        for (const entry of storedTiles) {
            if (!entry.data) continue;
            const data = foundry.utils.deepClone(entry.data);

            // Remove ID and stats to create fresh
            delete data._id;
            delete data._stats;

            // Apply offset
            if (typeof data.x === 'number') data.x += offsetX;
            if (typeof data.y === 'number') data.y += offsetY;

            // Always restore floor tiles at sort 0 to prevent sort inflation
            if (data.flags?.[MODULE_ID]?.dungeonFloor) data.sort = 0;

            toCreate.push(data);
        }

        if (!toCreate.length) {
            throw new Error('No valid tile data found to restore.');
        }

        // Create restored tiles
        await canvas.scene.createEmbeddedDocuments('Tile', toCreate);

        // Delete the flattened tile
        await canvas.scene.deleteEmbeddedDocuments('Tile', [tileDoc.id]);

        ui.notifications.info(`Restored ${toCreate.length} tiles successfully!`);

    } catch (error) {
        console.error(`${MODULE_ID} | Unflatten failed:`, error);
        ui.notifications.error(`Failed to unflatten tile: ${error.message}`);
    }
}


// ─── HUD Injection ──────────────────────────────────────────────────────────

function resolveHudElement(hud, payload) {
    if (payload) {
        if (payload instanceof HTMLElement) return payload;
        if (payload.element instanceof HTMLElement) return payload.element;
        if (Array.isArray(payload) && payload[0] instanceof HTMLElement) return payload[0];
        if (payload.jquery && payload[0] instanceof HTMLElement) return payload[0];
    }
    if (hud?.element instanceof HTMLElement) return hud.element;
    if (hud?.element?.[0] instanceof HTMLElement) return hud.element[0];
    return null;
}

function injectHudButtons(hud, html) {
    const root = resolveHudElement(hud, html);
    if (!root) {
        console.warn(`${MODULE_ID} | TileFlatten: Could not resolve HUD element`, { hud, html });
        return;
    }

    const column = root.querySelector('.col.right');
    if (!column) {
        console.warn(`${MODULE_ID} | TileFlatten: No .col.right found in HUD`);
        return;
    }

    // Clear existing buttons
    const existingFlatten = column.querySelector(`[data-action="${FLATTEN_ACTION}"]`);
    if (existingFlatten) existingFlatten.remove();

    const existingUnflatten = column.querySelector(`[data-action="${UNFLATTEN_ACTION}"]`);
    if (existingUnflatten) existingUnflatten.remove();

    // Get relevant tiles
    const tiles = getControlledTiles();
    const selectedCount = tiles.length;

    // Decide what to show
    // 1. If 1 tile selected AND it's a flattened tile -> Show Unflatten
    // 2. If 2+ tiles selected -> Show Flatten

    if (selectedCount === 1) {
        const tile = tiles[0];
        const isFlattened = tile.getFlag(MODULE_ID, 'flattenedTile');

        if (isFlattened) {
            // Show Unflatten Button
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'control-icon sdx-flatten-tiles'; // Reuse style
            btn.dataset.action = UNFLATTEN_ACTION;
            const label = 'Unflatten (Restore Original Tiles)';
            btn.dataset.tooltip = label;
            btn.setAttribute('aria-label', label);
            btn.title = label;
            btn.innerHTML = '<i class="fas fa-layer-group" style="transform: scale(1, -1);"></i>'; // Inverted icon

            btn.addEventListener('click', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                unflattenTile(tile);
            });

            column.appendChild(btn);
        }
    }
    else if (selectedCount >= 2) {
        // Show Flatten Button
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'control-icon sdx-flatten-tiles';
        btn.dataset.action = FLATTEN_ACTION;
        const label = `Flatten ${selectedCount} selected tiles`;
        btn.dataset.tooltip = label;
        btn.setAttribute('aria-label', label);
        btn.title = label;
        btn.innerHTML = '<i class="fas fa-layer-group"></i>';

        btn.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();

            const current = getControlledTiles();
            if (current.length < 2) {
                ui.notifications.warn('Select at least 2 tiles to flatten.');
                return;
            }

            btn.disabled = true;
            btn.classList.add('disabled');
            flattenTiles(current).finally(() => {
                btn.disabled = false;
                btn.classList.remove('disabled');
            });
        });

        column.appendChild(btn);
    }
}

// ─── Hook ───────────────────────────────────────────────────────────────────

console.log(`${MODULE_ID} | TileFlattenSD: Module loaded. HUD hook registered.`);

Hooks.on('renderTileHUD', (hud, html) => {
    try {
        injectHudButtons(hud, html);
    } catch (error) {
        console.error(`${MODULE_ID} | TileHUD flatten button error:`, error);
    }
});

// ─── Dungeon Level Flatten/Unflatten ─────────────────────────────────────────

/**
 * Returns floor tiles grouped by elevation, excluding already-flattened tiles.
 * Only tiles with flags.shadowdark-extras.dungeonFloor = true are included.
 * @returns {Object} { [elevation]: TileDocument[] }
 */
export function getDungeonFloorLevels() {
    const scene = canvas?.scene;
    if (!scene) return {};
    const tiles = scene.tiles.contents.filter(t =>
        t.flags?.[MODULE_ID]?.dungeonFloor === true &&
        !t.flags?.[MODULE_ID]?.flattenedTile
    );
    const byElevation = {};
    for (const tile of tiles) {
        const elev = tile.elevation ?? 0;
        if (!byElevation[elev]) byElevation[elev] = [];
        byElevation[elev].push(tile);
    }
    return byElevation;
}

/**
 * Returns all dungeon-level flattened tile documents on the current scene.
 * @returns {TileDocument[]}
 */
export function getFlattendDungeonLevels() {
    const scene = canvas?.scene;
    if (!scene) return [];
    return scene.tiles.contents.filter(t =>
        typeof t.flags?.[MODULE_ID]?.dungeonFlattenedLevel === 'number'
    );
}

/**
 * Flatten all dungeon floor tiles at the given elevation into one tile.
 * Stores original data for unflatten; marks result with dungeonFlattenedLevel.
 * @param {number} elevation
 */
export async function flattenDungeonLevel(elevation) {
    const byElevation = getDungeonFloorLevels();
    const tiles = byElevation[elevation];
    if (!tiles?.length) {
        ui.notifications.warn('No dungeon floor tiles found at that elevation.');
        return;
    }

    try {
        ui.notifications.info(`Flattening ${tiles.length} floor tiles at elevation ${elevation}…`);
        const bounds = computeBounds(tiles);
        if (!bounds) throw new Error('Could not compute tile bounds');

        const result = await renderTilesToCanvas(tiles, bounds);
        if (!result?.canvas) throw new Error('Failed to render tiles');

        const cropped = cropTransparentBorders(result.canvas, bounds);
        if (cropped.canvas !== result.canvas) {
            try { result.canvas.width = 0; result.canvas.height = 0; } catch (_) {}
        }

        ui.notifications.info('Saving flattened image…');
        const filePath = await saveAsWebP(cropped.canvas, 1.0);
        try { cropped.canvas.width = 0; cropped.canvas.height = 0; } catch (_) {}

        const originalData = tiles.map(t => ({ data: t.toObject(false) }));

        const tileData = {
            texture: { src: filePath },
            x: cropped.bounds.x,
            y: cropped.bounds.y,
            width: cropped.bounds.width,
            height: cropped.bounds.height,
            rotation: 0,
            alpha: 1,
            elevation,
            sort: 0,
            hidden: false,
            locked: false,
            occlusion: { mode: 0, alpha: 0 },
            flags: {
                [MODULE_ID]: {
                    flattenedTile: true,
                    dungeonFloor: true,
                    dungeonFlattenedLevel: elevation,
                    originalTileCount: tiles.length,
                    flattenedAt: Date.now(),
                    originalPosition: { x: bounds.x, y: bounds.y },
                    tiles: originalData
                }
            }
        };

        await canvas.scene.createEmbeddedDocuments('Tile', [tileData]);
        await canvas.scene.deleteEmbeddedDocuments('Tile', tiles.map(t => t.id).filter(Boolean));
        ui.notifications.info(`Flattened elevation ${elevation} (${tiles.length} tiles) successfully!`);
    } catch (error) {
        console.error(`${MODULE_ID} | FlattenDungeonLevel failed:`, error);
        ui.notifications.error(`Failed to flatten level: ${error.message}`);
    }
}

// Export for use by other modules (e.g., TrayApp)
export { flattenTiles, unflattenTile };
