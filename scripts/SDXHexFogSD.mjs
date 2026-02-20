

import { JournalPinRenderer } from "./JournalPinsSD.mjs";

const MODULE_ID = "shadowdark-extras";
const HEX_JOURNAL_NAME = "__sdx_hex_data__";


let fog = null;
let fogMask = null;
let enabled = false;
let _onDownRef = null;
let _onMoveRef = null;
let _onUpRef = null;
let _paintMode = null;
let _paintKeys = null;



export function isHexFogEnabled(sceneId) {
	if (!sceneId) return false;
	const scene = game.scenes.get(sceneId);
	return !!scene?.getFlag(MODULE_ID, "hexFogEnabled");
}

export function isPositionRevealed(x, y) {
	if (!enabled || !canvas.grid?.isHexagonal) return true;
	const offset = canvas.grid.getOffset({ x, y });
	const key = `${offset.i}-${offset.j}`;
	const revealed = canvas.scene.getFlag(MODULE_ID, "hexFogRevealed") || {};
	if (revealed[key]) return true;
	if (key in _paintOverlay) return _paintOverlay[key];
	const exploredKeys = _getExploredHexKeys(canvas.scene.id);
	return exploredKeys.has(key);
}

export async function setHexFogEnabled(sceneId, val) {
	if (!game.user.isGM) return;
	const scene = game.scenes.get(sceneId);
	if (!scene) return;
	await scene.setFlag(MODULE_ID, "hexFogEnabled", !!val);
	return !!val;
}

export function initHexFog() {
	Hooks.on("canvasReady", _onCanvasReady);
	Hooks.on("canvasTearDown", _onCanvasTearDown);
	Hooks.on("updateScene", _onUpdateScene);
	Hooks.on("updateToken", _onUpdateToken);

	Hooks.on("updateJournalEntry", (journal) => {
		if (journal.name !== HEX_JOURNAL_NAME) return;
		if (enabled) {
			_drawFog();
			canvas.perception.update({ refreshVision: true });
		}
	});
}



function _onCanvasReady() {
	_destroyFog();
	enabled = isHexFogEnabled(canvas.scene?.id);
	if (enabled && canvas.grid?.isHexagonal) {
		_initFog();
	}
}

function _onCanvasTearDown() {
	_destroyFog();
	enabled = false;
}

function _onUpdateScene(scene, changes) {
	if (scene.id !== canvas.scene?.id) return;

	const hasOurFlags = changes?.flags?.[MODULE_ID] !== undefined
		|| Object.keys(changes).some(k => k.startsWith(`flags.${MODULE_ID}`));
	if (!hasOurFlags) return;

	const newEnabled = isHexFogEnabled(scene.id);
	if (newEnabled !== enabled) {
		enabled = newEnabled;
		if (enabled && canvas.grid?.isHexagonal) {
			_initFog();
		} else {
			_destroyFog();
		}
		return;
	}

	if (enabled) _drawFog();
}

function _onUpdateToken(tokenDoc, changes) {
	if (!enabled) return;
	if (!canvas.grid?.isHexagonal) return;

	const hasMove = ("x" in changes) || ("y" in changes);
	if (!hasMove) return;

	const tw = tokenDoc.width * canvas.grid.sizeX;
	const th = tokenDoc.height * canvas.grid.sizeY;
	const halfW = tw / 2;
	const halfH = th / 2;

	const oldX = tokenDoc._source?.x ?? tokenDoc.x;
	const oldY = tokenDoc._source?.y ?? tokenDoc.y;
	const newX = tokenDoc.x;
	const newY = tokenDoc.y;

	const origin = { x: oldX + halfW, y: oldY + halfH };
	const destination = { x: newX + halfW, y: newY + halfH };

	// Get all cells along the movement path
	const pathCells = canvas.grid.getDirectPath([origin, destination]);

	// Origin cell key — skip it for roll tables (token is leaving, not entering)
	const originOffset = canvas.grid.getOffset(origin);
	const originKey = `${originOffset.i}_${originOffset.j}`;

	// Default reveal radius from module settings
	const defaultRadius = game.settings.get(MODULE_ID, "hexFog.defaultRevealRadius") ?? 1;

	// Load hex tooltip data for per-hex radius overrides
	const hexData = _getHexSceneData(canvas.scene.id);

	// Collect cells to reveal: path cells + neighbors based on radius
	const toReveal = new Set();
	const rollTableCells = [];  // track cells with roll tables

	for (const cell of pathCells) {
		const cellKey = `${cell.i}-${cell.j}`;
		toReveal.add(cellKey);

		// Check per-hex radius override (tooltip uses i_j format)
		const tooltipKey = `${cell.i}_${cell.j}`;
		const hexRecord = hexData?.[tooltipKey];
		const perHexRadius = hexRecord?.revealRadius ?? -1;
		const radius = perHexRadius >= 0 ? perHexRadius : defaultRadius;

		if (radius > 0) {
			_getNeighborsAtDepth(cell, radius, toReveal);
		}

		// Reveal Cells: extra cells listed in hex data
		if (hexRecord?.revealCells) {
			_parseRevealCells(hexRecord.revealCells, toReveal);
		}

		// Collect cells that have roll tables (only cells being entered, not the origin)
		if (hexRecord?.rollTable && tooltipKey !== originKey) {
			rollTableCells.push({ tooltipKey, hexRecord });
		}
	}

	const scene = canvas.scene;
	const existing = scene.getFlag(MODULE_ID, "hexFogRevealed") || {};
	let changed = false;
	const updated = { ...existing };
	for (const key of toReveal) {
		if (!updated[key]) {
			updated[key] = true;
			changed = true;
		}
	}

	if (changed && game.user.isGM) {
		scene.setFlag(MODULE_ID, "hexFogRevealed", updated);
		// updateScene hook will trigger _drawFog for all clients
	}

	// Roll tables for entered cells (GM only)
	if (game.user.isGM && rollTableCells.length > 0) {
		_processRollTables(scene, rollTableCells);
	}
}

/**
 * Get neighbors up to `depth` rings outward from a cell.
 * Adds all discovered keys to the provided Set.
 */
function _getNeighborsAtDepth(center, depth, resultSet) {
	let frontier = [center];
	const visited = new Set([`${center.i}-${center.j}`]);

	for (let d = 0; d < depth; d++) {
		const nextFrontier = [];
		for (const cell of frontier) {
			try {
				const neighbors = canvas.grid.getAdjacentOffsets(cell);
				for (const n of neighbors) {
					const key = `${n.i}-${n.j}`;
					if (!visited.has(key)) {
						visited.add(key);
						resultSet.add(key);
						nextFrontier.push(n);
					}
				}
			} catch { /* fallback if getAdjacentOffsets unavailable */ }
		}
		frontier = nextFrontier;
	}
}

/**
 * Get hex tooltip scene data (cached read from journal).
 */
function _getHexSceneData(sceneId) {
	const journal = game.journal.find(j => j.name === HEX_JOURNAL_NAME);
	if (!journal) return null;
	const allData = journal.getFlag(MODULE_ID, "hexData") ?? {};
	return allData[sceneId] ?? null;
}

/**
 * Parse "Reveal Cells" string (e.g. "3.5, 4.6, 5.7") into fog-key format and add to Set.
 * Labels use "i.j" format, fog uses "i-j".
 */
function _parseRevealCells(cellStr, resultSet) {
	if (!cellStr) return;
	for (const part of cellStr.split(",")) {
		const trimmed = part.trim();
		if (!trimmed) continue;
		const [i, j] = trimmed.split(".").map(Number);
		if (!isNaN(i) && !isNaN(j)) {
			resultSet.add(`${i}-${j}`);
		}
	}
}

/**
 * Roll tables for cells a token entered/traveled through.
 * Respects "First Time Only" — tracks rolled cells in scene flag.
 */
async function _processRollTables(scene, rollTableCells) {
	const rolledCells = scene.getFlag(MODULE_ID, "hexRolledCells") || {};
	const updatedRolled = { ...rolledCells };
	let rolledChanged = false;

	for (const { tooltipKey, hexRecord } of rollTableCells) {
		if (hexRecord.rollTableFirstOnly && rolledCells[tooltipKey]) continue;

		// Chance check (default 100%)
		const chance = hexRecord.rollTableChance ?? 100;
		if (chance < 100 && Math.random() * 100 >= chance) continue;

		try {
			const table = await fromUuid(hexRecord.rollTable);
			if (table instanceof RollTable) {
				await table.draw();
				if (hexRecord.rollTableFirstOnly) {
					updatedRolled[tooltipKey] = true;
					rolledChanged = true;
				}
			}
		} catch (err) {
			console.warn(`${MODULE_ID} | Failed to roll table for hex ${tooltipKey}:`, err);
		}
	}

	if (rolledChanged) {
		await scene.setFlag(MODULE_ID, "hexRolledCells", updatedRolled);
	}
}

// ─── Hex Tooltip Integration ─────────────────────────────────────────

/**
 * Build a Set of "i-j" keys for hexes that are explored or mapped
 * in the hex tooltip system, so fog is removed from those hexes.
 */
function _getExploredHexKeys(sceneId) {
	const explored = new Set();
	const journal = game.journal.find(j => j.name === HEX_JOURNAL_NAME);
	if (!journal) return explored;
	const allData = journal.getFlag(MODULE_ID, "hexData") ?? {};
	const sceneData = allData[sceneId];
	if (!sceneData) return explored;
	for (const [hexKey, record] of Object.entries(sceneData)) {
		const ex = record?.exploration;
		if (ex === "explored" || ex === "mapped") {
			// Tooltip uses "i_j", fog uses "i-j"
			explored.add(hexKey.replace("_", "-"));
		}
	}
	return explored;
}



function _initFog() {
	if (fog) return;

	fog = new PIXI.Graphics();
	fog.sortLayer = foundry.canvas.groups.PrimaryCanvasGroup.SORT_LAYERS.TILES + 1;
	fog.elevation = 0;
	fog.sort = 1e100;
	canvas.primary.addChild(fog);

	// Vision mask — only if scene has token vision enabled
	if (canvas.scene.tokenVision) {
		fogMask = new PIXI.Graphics();
		canvas.masks.vision.addChild(fogMask);
	}

	// GM: shift+drag to re-fog, ctrl+drag to reveal
	if (game.user.isGM) {
		_onDownRef = _onPaintDown.bind(null);
		_onMoveRef = _onPaintMove.bind(null);
		_onUpRef = _onPaintUp.bind(null);
		canvas.stage.on("mousedown", _onDownRef);
		canvas.stage.on("mousemove", _onMoveRef);
		canvas.stage.on("mouseup", _onUpRef);
	}

	_drawFog();
}

function _destroyFog() {
	if (_onDownRef) {
		canvas.stage.off("mousedown", _onDownRef);
		canvas.stage.off("mousemove", _onMoveRef);
		canvas.stage.off("mouseup", _onUpRef);
		_onDownRef = _onMoveRef = _onUpRef = null;
	}
	_paintMode = null;
	_paintKeys = null;
	if (fog) {
		fog.destroy({ children: true });
		fog = null;
	}
	if (fogMask) {
		fogMask.destroy({ children: true });
		fogMask = null;
	}
}

// ─── GM Paint (shift+drag = re-fog, ctrl+drag = reveal) ─────────────

/** Local overlay of pending paint changes (applied on top of scene flags during draw). */
let _paintOverlay = {};  // key → true (reveal) or false (hide)

function _getHexKeyFromEvent(event) {
	const clientX = event.client?.x ?? 0;
	const clientY = event.client?.y ?? 0;
	const topEl = document.elementFromPoint(clientX, clientY);
	if (topEl?.tagName !== "CANVAS") return null;
	const worldPos = event.getLocalPosition(canvas.stage);
	const offset = canvas.grid.getOffset(worldPos);
	return `${offset.i}-${offset.j}`;
}

function _onPaintDown(event) {
	if (!enabled) return;
	if (!event.shiftKey && !event.ctrlKey) return;

	const key = _getHexKeyFromEvent(event);
	if (!key) return;

	_paintMode = event.ctrlKey ? "reveal" : "hide";
	_paintKeys = new Set();
	_paintOverlay = {};
	_paintHex(key);
}

function _onPaintMove(event) {
	if (!_paintMode) return;
	const key = _getHexKeyFromEvent(event);
	if (!key || _paintKeys.has(key)) return;
	_paintHex(key);
}

function _onPaintUp() {
	if (!_paintMode) return;
	_paintMode = null;
	_paintKeys = null;

	// Batch-save all changes to the scene flag
	const scene = canvas.scene;
	const revealed = { ...(scene.getFlag(MODULE_ID, "hexFogRevealed") || {}) };
	for (const [key, val] of Object.entries(_paintOverlay)) {
		if (val) revealed[key] = true;
		else revealed[key] = false;
	}
	_paintOverlay = {};
	scene.setFlag(MODULE_ID, "hexFogRevealed", revealed);
}

function _paintHex(key) {
	_paintKeys.add(key);
	if (_paintMode === "reveal") {
		_paintOverlay[key] = true;
	} else {
		_paintOverlay[key] = false;
	}
	_drawFog();
	canvas.perception.update({ refreshVision: true });
}

function _drawFog() {
	if (!fog) return;
	if (!canvas.grid?.isHexagonal) return;

	const scene = canvas.scene;
	const revealed = scene.getFlag(MODULE_ID, "hexFogRevealed") || {};
	const exploredKeys = _getExploredHexKeys(scene.id);
	const alpha = game.user.isGM ? 0.5 : 1.0;
	const unexploredColor = scene.fog?.colors?.unexplored?.css || "#000000";

	const rows = scene.dimensions.rows;
	const cols = scene.dimensions.columns;
	const cellShape = canvas.grid.getShape();

	// ── Draw fog overlay ──
	fog.clear();

	for (let i = 0; i < rows; i++) {
		for (let j = 0; j < cols; j++) {
			const key = `${i}-${j}`;

			// Paint overlay takes priority (live preview during drag)
			if (key in _paintOverlay) {
				if (_paintOverlay[key]) continue; // painting reveal → no fog
				// painting hide → fall through to draw fog
			} else if (revealed[key] || exploredKeys.has(key)) {
				continue;
			}

			const center = canvas.grid.getCenterPoint({ i, j });
			const offsetShape = cellShape.map(p => ({
				x: p.x + center.x,
				y: p.y + center.y
			}));

			fog.lineStyle(alpha, unexploredColor, alpha);
			fog.beginFill(unexploredColor, alpha);
			fog.drawPolygon(offsetShape);
			fog.endFill();
		}
	}

	// ── Draw vision mask ──
	_drawFogMask(revealed, exploredKeys, rows, cols, cellShape);

	// ── Update belowFog pin visibility ──
	_updateBelowFogPins();
}

function _drawFogMask(revealed, exploredKeys, rows, cols, cellShape) {
	if (!fogMask) return;
	fogMask.clear();
	fogMask.lineStyle(0, 0x000000, 0);

	for (let i = 0; i < rows; i++) {
		for (let j = 0; j < cols; j++) {
			const key = `${i}-${j}`;
			const isRevealed = (key in _paintOverlay)
				? _paintOverlay[key]
				: (revealed[key] || exploredKeys.has(key));
			const center = canvas.grid.getCenterPoint({ i, j });
			const offsetShape = cellShape.map(p => ({
				x: p.x + center.x,
				y: p.y + center.y
			}));

			fogMask.beginFill(isRevealed ? 0xffffff : 0x000000, 1);
			fogMask.drawPolygon(offsetShape);
			fogMask.endFill();
		}
	}
}

/**
 * Show/hide belowFog pins based on fog state.
 * Players: hidden when fogged, visible when revealed.
 * GM: dimmed (alpha 0.3) when fogged, full when revealed.
 */
function _updateBelowFogPins() {
	let renderer;
	try {
		renderer = JournalPinRenderer;
	} catch {
		return;
	}
	if (!renderer?._pins) return;

	for (const pin of renderer._pins.values()) {
		if (!pin.pinData?.belowFog) continue;
		const revealed = isPositionRevealed(pin.pinData.x, pin.pinData.y);
		if (game.user.isGM) {
			pin.alpha = revealed ? 1.0 : 0.3;
			pin.visible = true;
		} else {
			pin.visible = revealed;
		}
	}
}
