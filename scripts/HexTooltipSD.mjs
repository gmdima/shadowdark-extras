

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const MODULE_ID = "shadowdark-extras";
export const HEX_JOURNAL_NAME = "__sdx_hex_data__";

const EXPLORATION_OPTIONS = [
	{ value: "unexplored", label: "Unexplored" },
	{ value: "explored", label: "Explored" },
	{ value: "mapped", label: "Mapped" },
];

const ZONE_COLORS = [
	{ value: "", label: "Default", hex: "#00cc44" },
	{ value: "#e74c3c", label: "Red", hex: "#e74c3c" },
	{ value: "#e67e22", label: "Orange", hex: "#e67e22" },
	{ value: "#f1c40f", label: "Yellow", hex: "#f1c40f" },
	{ value: "#1abc9c", label: "Teal", hex: "#1abc9c" },
	{ value: "#3498db", label: "Blue", hex: "#3498db" },
	{ value: "#9b59b6", label: "Purple", hex: "#9b59b6" },
	{ value: "#e91e9b", label: "Pink", hex: "#e91e9b" },
	{ value: "#ecf0f1", label: "White", hex: "#ecf0f1" },
	{ value: "#95a5a6", label: "Gray", hex: "#95a5a6" },
	{ value: "#8b6914", label: "Brown", hex: "#8b6914" },
	{ value: "#2c3e50", label: "Dark", hex: "#2c3e50" },
];

const FEATURE_TYPES = [
	"dungeon", "settlement", "landmark", "ruins", "temple",
	"fort", "cave", "road", "hazard", "resource", "other", "journal",
];

// ─── Data Layer ───────────────────────────────────────────────────────────────

async function ensureHexJournal() {
	let journal = game.journal.find(j => j.name === HEX_JOURNAL_NAME);
	if (!journal && game.user.isGM) {
		journal = await JournalEntry.create({
			name: HEX_JOURNAL_NAME,
			ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER },
		});
	}
	return journal;
}

function loadAllHexDataSync() {
	const journal = game.journal.find(j => j.name === HEX_JOURNAL_NAME);
	if (!journal) return {};
	return foundry.utils.deepClone(journal.getFlag(MODULE_ID, "hexData") ?? {});
}

export async function saveHexRecord(sceneId, hexKey, record) {
	const journal = await ensureHexJournal();
	if (!journal) return;
	const allData = loadAllHexDataSync();
	if (!allData[sceneId]) allData[sceneId] = {};
	allData[sceneId][hexKey] = record;
	await journal.setFlag(MODULE_ID, "hexData", allData);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hexKeyToLabel(hexKey) {
	const [r, c] = hexKey.split("_").map(Number);
	return `${r}.${c}`;
}

/** Resolve display label for any feature (including journal type). */
function featureLabel(f) {
	if (f.type === "journal") {
		const j = game.journal?.get(f.journalId);
		if (!j) return f.name || "Journal";
		const p = f.pageId ? j.pages.get(f.pageId) : null;
		return f.name || (p ? p.name : j.name);
	}
	return f.name || (f.type.charAt(0).toUpperCase() + f.type.slice(1));
}

// ─── Tooltip HTML Builder ─────────────────────────────────────────────────────

function buildTooltipHtml(hexKey, record, isGM) {
	const r = record ?? {};
	const name = r.name ?? "";
	const exploration = r.exploration ?? "unexplored";
	const zone = r.zone ?? "";
	const terrain = r.terrain ?? "";
	const travel = r.travel ?? "";
	const cleared = r.cleared ?? false;
	const claimed = r.claimed ?? false;
	const features = r.features ?? [];
	const notes = r.notes ?? [];

	const visibleFeatures = isGM ? features : features.filter(f => f.discovered);
	const visibleNotes = isGM ? notes : notes.filter(n => n.visible);
	const exploLabel = EXPLORATION_OPTIONS.find(o => o.value === exploration)?.label ?? exploration;

	let html = `<div class="sdx-hex-tt-inner">`;

	// Header
	const hiddenIcon = (isGM && !r.showToPlayers) ? `<i class="fas fa-eye-slash sdx-hex-tt-hidden-icon"></i> ` : "";
	if (name) html += `<div class="sdx-hex-tt-head"><span class="sdx-hex-tt-name">${hiddenIcon}${name}</span></div>`;

	// Exploration badge
	html += `<div class="sdx-hex-tt-badge sdx-hex-badge-${exploration}">${exploLabel.toUpperCase()}</div>`;

	// Data rows
	const rows = [];
	if (zone) rows.push(["Zone", zone]);
	if (terrain) rows.push(["Terrain", terrain]);
	if (travel) rows.push(["Travel", travel]);
	if (cleared) rows.push(["Cleared", '<i class="fas fa-check" style="color:#4ade80"></i>']);
	if (claimed) rows.push(["Claimed", '<i class="fas fa-flag"  style="color:#60a5fa"></i>']);

	if (rows.length) {
		html += `<div class="sdx-hex-tt-rows">`;
		for (const [label, value] of rows) {
			html += `<div class="sdx-hex-tt-row">
				<span class="sdx-hex-tt-rlabel">${label}</span>
				<span class="sdx-hex-tt-rvalue">${value}</span>
			</div>`;
		}
		html += `</div>`;
	}

	// Notes — golden italic quote style
	if (visibleNotes.length) {
		html += `<div class="sdx-hex-tt-notes">`;
		for (const n of visibleNotes) {
			if (!n.text) continue;
			const hidden = (isGM && !n.visible) ? " sdx-hex-note-gm-hidden" : "";
			html += `<div class="sdx-hex-tt-note${hidden}">${n.text}</div>`;
		}
		html += `</div>`;
	}

	// Feature pills
	if (visibleFeatures.length) {
		html += `<div class="sdx-hex-tt-features">`;
		for (const f of visibleFeatures) {
			const label = featureLabel(f);
			const hidden = (isGM && !f.discovered) ? " sdx-hex-feat-gm-hidden" : "";
			html += `<span class="sdx-hex-tt-feat${hidden}">${label}</span>`;
		}
		html += `</div>`;
	}

	if (isGM) html += `<div class="sdx-hex-tt-hint">Double-click to edit · Right-click for menu</div>`;

	html += `</div>`;
	return html;
}

// ─── Manager ──────────────────────────────────────────────────────────────────

export class SDXHexTooltip {
	#enabled = false;
	#tooltipEl = null;
	#imgTooltipEl = null;
	#allData = {};
	#lastKey = null;
	#lastOffset = null;
	#clickTime = 0;
	#clickKey = null;
	#hlName = "SDXHexTooltip";
	#hlAllName = "SDXHexTooltipAll";
	#altHeld = false;
	#ctxMenuEl = null;

	#onMoveRef = null;
	#onDownRef = null;
	#onRightDownRef = null;
	#onJournalRef = null;
	#onKeyDownRef = null;
	#onKeyUpRef = null;

	constructor() {
		// Players always have tooltips active; GMs toggle manually
		this.#enabled = !game.user.isGM;

		// Tooltip DOM elements
		this.#tooltipEl = document.createElement("div");
		this.#tooltipEl.className = "sdx-hex-tooltip";
		this.#tooltipEl.style.display = "none";
		document.body.appendChild(this.#tooltipEl);

		this.#imgTooltipEl = document.createElement("div");
		this.#imgTooltipEl.className = "sdx-hex-img-tooltip";
		this.#imgTooltipEl.style.display = "none";
		document.body.appendChild(this.#imgTooltipEl);

		// Initial data load
		this.#allData = loadAllHexDataSync();

		// Hex highlight layer
		try {
			if (canvas.grid.highlightLayers?.[this.#hlName]) canvas.grid.destroyHighlightLayer(this.#hlName);
			canvas.grid.addHighlightLayer(this.#hlName);
		} catch { this.#hlName = null; }

		// "Show all" highlight layer
		try {
			if (canvas.grid.highlightLayers?.[this.#hlAllName]) canvas.grid.destroyHighlightLayer(this.#hlAllName);
			canvas.grid.addHighlightLayer(this.#hlAllName);
		} catch { this.#hlAllName = null; }

		// Canvas events
		this.#onMoveRef = this.#onMouseMove.bind(this);
		this.#onDownRef = this.#onMouseDown.bind(this);
		this.#onRightDownRef = this.#onRightDown.bind(this);
		canvas.stage.on("mousemove", this.#onMoveRef);
		canvas.stage.on("mousedown", this.#onDownRef);
		canvas.stage.on("rightdown", this.#onRightDownRef);

		// Alt key — show all hex highlights
		this.#onKeyDownRef = this.#onKeyDown.bind(this);
		this.#onKeyUpRef = this.#onKeyUp.bind(this);
		document.addEventListener("keydown", this.#onKeyDownRef);
		document.addEventListener("keyup", this.#onKeyUpRef);

		// Sync cache when any client updates the journal
		this.#onJournalRef = (journal) => {
			if (journal.name !== HEX_JOURNAL_NAME) return;
			this.#allData = loadAllHexDataSync();
			this.#lastKey = null;
		};
		Hooks.on("updateJournalEntry", this.#onJournalRef);
	}

	get enabled() { return this.#enabled; }

	toggle() {
		this.#enabled = !this.#enabled;
		if (!this.#enabled) this.#hide();
		return this.#enabled;
	}

	notifyDataChanged(sceneId, hexKey, record) {
		if (!this.#allData[sceneId]) this.#allData[sceneId] = {};
		this.#allData[sceneId][hexKey] = record;
		if (this.#enabled && this.#lastKey === hexKey) this.#show(hexKey, record);
	}

	finalize() {
		canvas.stage.off("mousemove", this.#onMoveRef);
		canvas.stage.off("mousedown", this.#onDownRef);
		canvas.stage.off("rightdown", this.#onRightDownRef);
		document.removeEventListener("keydown", this.#onKeyDownRef);
		document.removeEventListener("keyup", this.#onKeyUpRef);
		this.#closeContextMenu();
		this.#hide();
		if (this.#hlName) try { canvas.grid.destroyHighlightLayer(this.#hlName); } catch { }
		if (this.#hlAllName) try { canvas.grid.destroyHighlightLayer(this.#hlAllName); } catch { }
		if (this.#onJournalRef) Hooks.off("updateJournalEntry", this.#onJournalRef);
		this.#tooltipEl?.remove();
		this.#tooltipEl = null;
		this.#imgTooltipEl?.remove();
		this.#imgTooltipEl = null;
	}

	// ── Private ──

	#getOffset(worldPos) {
		try { return canvas.grid.getOffset(worldPos); }
		catch { return null; }
	}

	#inSceneBounds(offset) {
		const tl = canvas.grid.getTopLeftPoint(offset);
		const d = canvas.dimensions;
		return !(tl.x < d.sceneX || tl.y < d.sceneY ||
			tl.x >= d.sceneX + d.sceneWidth ||
			tl.y >= d.sceneY + d.sceneHeight);
	}

	#onMouseMove(event) {
		if (!this.#enabled) return;

		const clientX = event.client?.x ?? 0;
		const clientY = event.client?.y ?? 0;

		const topEl = document.elementFromPoint(clientX, clientY);
		if (topEl?.tagName !== "CANVAS") {
			this.#clearHighlight();
			this.#hide();
			return;
		}

		const worldPos = event.getLocalPosition(canvas.stage);
		const offset = this.#getOffset(worldPos);
		if (!offset || !this.#inSceneBounds(offset)) {
			this.#clearHighlight();
			this.#hide();
			return;
		}

		const hexKey = `${offset.i}_${offset.j}`;
		const isGM = game.user.isGM;
		const sceneId = canvas.scene?.id;
		const record = this.#allData[sceneId]?.[hexKey] ?? null;

		this.#drawHighlight(offset, record?.zoneColor);
		const canShow = isGM || record?.showToPlayers;

		if (hexKey !== this.#lastKey) {
			this.#lastKey = hexKey;
			this.#lastOffset = offset;
			if (canShow) this.#show(hexKey, record);
			else this.#tooltipEl && (this.#tooltipEl.style.display = "none");
		}

		if (this.#tooltipEl?.style.display !== "none") {
			this.#positionAtHex(this.#lastOffset);
		}
		if (this.#imgTooltipEl?.style.display !== "none") {
			this.#positionImageAtHex(this.#lastOffset);
		}
	}

	#onMouseDown(event) {
		if (!this.#enabled || !game.user.isGM) return;

		const clientX = event.client?.x ?? 0;
		const clientY = event.client?.y ?? 0;
		const topEl = document.elementFromPoint(clientX, clientY);
		if (topEl?.tagName !== "CANVAS") return;

		const worldPos = event.getLocalPosition(canvas.stage);
		const offset = this.#getOffset(worldPos);
		if (!offset || !this.#inSceneBounds(offset)) return;

		const hexKey = `${offset.i}_${offset.j}`;
		const now = Date.now();
		const prev = this.#clickTime;
		const prevKey = this.#clickKey;
		this.#clickTime = now;
		this.#clickKey = hexKey;

		if (now - prev <= 250 && prevKey === hexKey) {
			this.#openEdit(hexKey, event);
		}
	}

	#onRightDown(event) {
		if (!this.#enabled) return;

		const clientX = event.client?.x ?? 0;
		const clientY = event.client?.y ?? 0;
		const topEl = document.elementFromPoint(clientX, clientY);
		if (topEl?.tagName !== "CANVAS") return;

		const worldPos = event.getLocalPosition(canvas.stage);
		const offset = this.#getOffset(worldPos);
		if (!offset || !this.#inSceneBounds(offset)) return;

		event.stopPropagation();
		const hexKey = `${offset.i}_${offset.j}`;
		this.#showContextMenu(hexKey, clientX, clientY);
	}

	#showContextMenu(hexKey, clientX, clientY) {
		this.#closeContextMenu();

		const sceneId = canvas.scene?.id;
		const record = this.#allData[sceneId]?.[hexKey] ?? null;
		const isGM = game.user.isGM;

		// Collect journal features — GM sees all, players see only discovered
		const journalFeats = (record?.features ?? []).filter(
			f => f.type === "journal" && f.journalId && (isGM || f.discovered)
		);

		// Players get no menu if there's nothing to show
		if (!isGM && journalFeats.length === 0) return;

		const menu = document.createElement("div");
		menu.className = "sdx-hex-ctx-menu";

		let html = `<div class="sdx-hex-ctx-header">Hex ${hexKeyToLabel(hexKey)}</div>`;
		for (const f of journalFeats) {
			const j = game.journal.get(f.journalId);
			if (!j) continue;
			const p = f.pageId ? j.pages.get(f.pageId) : null;
			const label = f.name || (p ? p.name : j.name);
			const dim = (isGM && !f.discovered) ? " sdx-hex-ctx-item-dim" : "";
			html += `<div class="sdx-hex-ctx-item${dim}" data-jid="${f.journalId}" data-pid="${f.pageId ?? ""}">
				<i class="fas fa-book-open"></i>${label}
			</div>`;
		}
		menu.innerHTML = html;

		document.body.appendChild(menu);
		this.#ctxMenuEl = menu;

		// Position — clamp to viewport
		const W = window.innerWidth;
		const H = window.innerHeight;
		menu.style.left = `${Math.min(clientX, W - 190)}px`;
		menu.style.top = `${Math.min(clientY, H - menu.offsetHeight - 8)}px`;

		// Journal click handlers
		menu.querySelectorAll(".sdx-hex-ctx-item").forEach(item => {
			item.addEventListener("click", async () => {
				const j = game.journal.get(item.dataset.jid);
				if (!j) { this.#closeContextMenu(); return; }
				const pid = item.dataset.pid || "";

				if (game.user.isGM) {
					// GM renders directly with TOC navigation
					await j.sheet.render(true);
					if (pid) {
						await new Promise(r => setTimeout(r, 200));
						const el = j.sheet.element;
						(el?.querySelector(`[data-page-id="${pid}"] a`)
							?? el?.querySelector(`a[data-page-id="${pid}"]`)
							?? el?.querySelector(`[data-entry-id="${pid}"] a`)
							?? el?.querySelector(`li[data-page-id="${pid}"]`))?.click();
					}
				} else {
					// Players always go through the GM — ensures journal is set to LIMITED
					// and the specific page to OBSERVER before rendering
					game.socket.emit("module.shadowdark-extras", {
						action: "sdxHexShowJournal",
						userId: game.user.id,
						journalId: j.id,
						pageId: pid,
					});
				}
				this.#closeContextMenu();
			});
		});

		// Close on outside click
		const onClose = (e) => {
			if (!menu.contains(e.target)) {
				this.#closeContextMenu();
				document.removeEventListener("mousedown", onClose, true);
			}
		};
		setTimeout(() => document.addEventListener("mousedown", onClose, true), 0);
	}

	#closeContextMenu() {
		this.#ctxMenuEl?.remove();
		this.#ctxMenuEl = null;
	}

	#show(hexKey, record) {
		if (!this.#tooltipEl) return;
		this.#tooltipEl.innerHTML = buildTooltipHtml(hexKey, record, game.user.isGM);
		this.#tooltipEl.style.display = "block";

		// Image tooltip
		const img = record?.image;
		if (img && this.#imgTooltipEl) {
			this.#imgTooltipEl.innerHTML = `<img src="${img}">`;
			this.#imgTooltipEl.style.display = "block";
			requestAnimationFrame(() => this.#imgTooltipEl?.classList.add("sdx-visible"));
		} else if (this.#imgTooltipEl) {
			this.#imgTooltipEl.classList.remove("sdx-visible");
			this.#imgTooltipEl.style.display = "none";
		}
	}

	#hide() {
		if (this.#tooltipEl) this.#tooltipEl.style.display = "none";
		if (this.#imgTooltipEl) {
			this.#imgTooltipEl.classList.remove("sdx-visible");
			this.#imgTooltipEl.style.display = "none";
		}
		this.#lastKey = null;
		this.#lastOffset = null;
		this.#clearHighlight();
	}

	#drawHighlight(offset, zoneColor) {
		if (!this.#hlName) return;
		try {
			const tl = canvas.grid.getTopLeftPoint(offset);
			canvas.grid.clearHighlightLayer(this.#hlName);
			const base = zoneColor ? Color.from(zoneColor) : Color.from("#00cc44");
			const border = base.mix(Color.from("#000000"), 0.3);
			canvas.grid.highlightPosition(this.#hlName, {
				x: tl.x, y: tl.y,
				color: base, alpha: 0.25,
				border: border, borderAlpha: 1.0,
			});
		} catch { }
	}

	#clearHighlight() {
		if (!this.#hlName) return;
		try { canvas.grid.clearHighlightLayer(this.#hlName); } catch { }
	}

	#onKeyDown(e) {
		if (e.key !== "Alt" || e.repeat || this.#altHeld || !this.#enabled) return;
		this.#altHeld = true;
		this.#drawAllHighlights();
	}

	#onKeyUp(e) {
		if (e.key !== "Alt" || !this.#altHeld) return;
		this.#altHeld = false;
		this.#clearAllHighlights();
	}

	#drawAllHighlights() {
		if (!this.#hlAllName) return;
		try { canvas.grid.clearHighlightLayer(this.#hlAllName); } catch { return; }
		const sceneId = canvas.scene?.id;
		const hexes = this.#allData[sceneId];
		if (!hexes) return;
		const isGM = game.user.isGM;
		for (const [hexKey, record] of Object.entries(hexes)) {
			if (!isGM && !record.showToPlayers) continue;
			const [i, j] = hexKey.split("_").map(Number);
			const tl = canvas.grid.getTopLeftPoint({ i, j });
			const base = record.zoneColor ? Color.from(record.zoneColor) : Color.from("#00cc44");
			const border = base.mix(Color.from("#000000"), 0.3);
			canvas.grid.highlightPosition(this.#hlAllName, {
				x: tl.x, y: tl.y,
				color: base, alpha: 0.25,
				border: border, borderAlpha: 1.0,
			});
		}
	}

	#clearAllHighlights() {
		if (!this.#hlAllName) return;
		try { canvas.grid.clearHighlightLayer(this.#hlAllName); } catch { }
	}

	#positionAtHex(offset) {
		const el = this.#tooltipEl;
		if (!el || !offset) return;

		// Get hex center in world coords
		const center = canvas.grid.getCenterPoint(offset);
		// Get hex size for placing tooltip at the right edge
		const hexW = canvas.grid.sizeX;
		const hexH = canvas.grid.sizeY;
		// World-to-screen transform
		const t = canvas.stage.worldTransform;
		const screenX = t.a * (center.x + hexW / 2) + t.tx;
		const screenY = t.d * center.y + t.ty;

		const W = window.innerWidth;
		const H = window.innerHeight;
		const w = el.offsetWidth || 260;
		const h = el.offsetHeight || 120;
		const gap = 8;

		// Default: right of hex, vertically centered
		let x = screenX + gap;
		let y = screenY - h / 2;

		// If overflows right, flip to left of hex
		if (x + w > W - 8) {
			const leftEdge = t.a * (center.x - hexW / 2) + t.tx;
			x = leftEdge - w - gap;
		}
		// Clamp vertically
		if (y + h > H - 8) y = H - h - 8;
		if (y < 5) y = 5;

		el.style.left = `${x}px`;
		el.style.top = `${y}px`;
	}

	#positionImageAtHex(offset) {
		const el = this.#imgTooltipEl;
		if (!el || !offset) return;

		const center = canvas.grid.getCenterPoint(offset);
		const hexW = canvas.grid.sizeX;
		const t = canvas.stage.worldTransform;

		const W = window.innerWidth;
		const H = window.innerHeight;
		const w = el.offsetWidth || 200;
		const h = el.offsetHeight || 200;
		const gap = 8;

		// Screen position of hex left edge
		const leftEdge = t.a * (center.x - hexW / 2) + t.tx;
		const screenY = t.d * center.y + t.ty;

		// Default: left of hex, vertically centered
		let x = leftEdge - w - gap;
		let y = screenY - h / 2;

		// If overflows left, flip to right of hex
		if (x < 5) {
			const rightEdge = t.a * (center.x + hexW / 2) + t.tx;
			x = rightEdge + gap;
		}

		// Clamp vertically
		if (y + h > H - 8) y = H - h - 8;
		if (y < 5) y = 5;

		el.style.left = `${x}px`;
		el.style.top = `${y}px`;
	}

	async #openEdit(hexKey, event) {
		const sceneId = canvas.scene?.id;
		const existing = this.#allData[sceneId]?.[hexKey] ?? null;
		const record = existing
			? foundry.utils.deepClone(existing)
			: {
				name: "", zone: "", terrain: "", travel: "",
				exploration: "unexplored", cleared: false, claimed: false,
				showToPlayers: false, features: [], notes: []
			};

		// Backwards compat — existing records may not have notes
		if (!record.notes) record.notes = [];

		const cx = event.client?.x ?? window.innerWidth / 2;
		const cy = event.client?.y ?? window.innerHeight / 2;
		const left = Math.min(cx + 20, window.innerWidth - 420);
		const top = Math.max(cy - 60, 10);

		new HexEditApp({
			hexKey, sceneId, record,
			hexLabel: hexKeyToLabel(hexKey),
			manager: this,
			position: { left, top, width: 420, height: "auto" },
		}).render(true);
	}
}

// ─── Edit Dialog ──────────────────────────────────────────────────────────────

class HexEditApp extends HandlebarsApplicationMixin(ApplicationV2) {
	#opts;

	constructor({ hexKey, sceneId, record, hexLabel, manager, position = {} } = {}) {
		super({ position });
		this.#opts = { hexKey, sceneId, record, hexLabel, manager };
	}

	static DEFAULT_OPTIONS = {
		id: "sdx-hex-edit",
		classes: ["shadowdark-extras", "sdx-hex-edit-app"],
		tag: "div",
		window: { title: "Edit Hex", resizable: false },
		position: { width: 420, height: "auto" },
	};

	static PARTS = {
		main: { template: "modules/shadowdark-extras/templates/sdx-hex-tooltip/hex-edit.hbs" },
	};

	get title() { return `Edit Hex #${this.#opts.hexLabel}`; }

	async _prepareContext() {
		const record = { ...this.#opts.record };
		record.zoneColor = record.zoneColor ?? "";
		record.image = record.image ?? "";
		return {
			record,
			explorationOptions: EXPLORATION_OPTIONS,
			featureTypes: FEATURE_TYPES,
			zoneColors: ZONE_COLORS,
		};
	}

	_onRender(_context, _options) {
		const el = this.element;

		// Populate existing notes
		for (const n of (this.#opts.record.notes ?? [])) this.#appendNoteRow(n);

		// Populate existing features
		for (const f of (this.#opts.record.features ?? [])) this.#appendFeatureRow(f);

		// Browse image
		el.querySelector("[data-action='browse-image']")?.addEventListener("click", () => {
			const input = el.querySelector("[name='hex-image']");
			new FilePicker({ type: "image", current: input.value, callback: (path) => { input.value = path; } }).browse();
		});

		// Add note
		el.querySelector("[data-action='add-note']")?.addEventListener("click", () => {
			this.#appendNoteRow(null);
		});

		// Add feature
		el.querySelector("[data-action='add-feature']")?.addEventListener("click", () => {
			this.#appendFeatureRow(null);
		});

		// Remove note / feature (delegated)
		el.addEventListener("click", (e) => {
			if (e.target.closest("[data-action='remove-note']")) e.target.closest(".sdx-hex-note-row").remove();
			if (e.target.closest("[data-action='remove-feature']")) e.target.closest(".sdx-hex-feat-row").remove();
		});

		// Zone color swatches
		el.querySelector(".sdx-hex-color-swatches")?.addEventListener("click", (e) => {
			const swatch = e.target.closest(".sdx-hex-color-swatch");
			if (!swatch) return;
			el.querySelectorAll(".sdx-hex-color-swatch").forEach(s => s.classList.remove("active"));
			swatch.classList.add("active");
			el.querySelector(".sdx-hex-color-swatches").dataset.selected = swatch.dataset.color;
		});

		el.querySelector("[data-action='save-hex']")?.addEventListener("click", async () => { await this.#save(); });
		el.querySelector("[data-action='cancel-hex']")?.addEventListener("click", () => { this.close(); });
	}

	// ── Notes ──

	#appendNoteRow(note) {
		const container = this.element.querySelector(".sdx-hex-notes-list");
		if (!container) return;
		const id = note?.id ?? foundry.utils.randomID();
		const text = note?.text ?? "";
		const visible = note?.visible ?? false;
		const row = document.createElement("div");
		row.className = "sdx-hex-note-row";
		row.dataset.nid = id;
		row.innerHTML = `
			<input  class="sdx-hex-note-text" type="text" placeholder="Note text..." value="${text.replace(/"/g, "&quot;")}">
			<label  class="sdx-hex-feat-vis" title="Visible to players">
				<input type="checkbox"${visible ? " checked" : ""}><i class="fas fa-eye"></i>
			</label>
			<button type="button" class="sdx-hex-feat-del" data-action="remove-note" title="Remove">
				<i class="fas fa-times"></i>
			</button>`;
		container.appendChild(row);
	}

	// ── Features ──

	#appendFeatureRow(feature) {
		const container = this.element.querySelector(".sdx-hex-feats-list");
		if (!container) return;

		const id = feature?.id ?? foundry.utils.randomID();
		const type = feature?.type ?? "dungeon";
		const name = feature?.name ?? "";
		const discovered = feature?.discovered ?? false;
		const isJournal = type === "journal";

		const typeOpts = FEATURE_TYPES.map(t => {
			const label = t.charAt(0).toUpperCase() + t.slice(1);
			return `<option value="${t}"${type === t ? " selected" : ""}>${label}</option>`;
		}).join("");

		// Build journal list (exclude internal SDX journals)
		const journals = game.journal
			.filter(j => !j.name.startsWith("__sdx_"))
			.sort((a, b) => a.name.localeCompare(b.name));
		const journalOpts = journals.map(j =>
			`<option value="${j.id}"${feature?.journalId === j.id ? " selected" : ""}>${j.name}</option>`
		).join("");

		const row = document.createElement("div");
		row.className = "sdx-hex-feat-row";
		row.dataset.fid = id;
		row.innerHTML = `
			<select class="sdx-hex-feat-type">${typeOpts}</select>
			<input  class="sdx-hex-feat-name${isJournal ? " sdx-hidden" : ""}" type="text" placeholder="Label..." value="${name.replace(/"/g, "&quot;")}">
			<div    class="sdx-hex-feat-journal-wrap${isJournal ? "" : " sdx-hidden"}">
				<select class="sdx-hex-feat-journal">
					<option value="">— Journal —</option>
					${journalOpts}
				</select>
				<select class="sdx-hex-feat-page">
					<option value="">— Page (optional) —</option>
				</select>
			</div>
			<label  class="sdx-hex-feat-vis" title="Visible to players">
				<input type="checkbox"${discovered ? " checked" : ""}><i class="fas fa-eye"></i>
			</label>
			<button type="button" class="sdx-hex-feat-del" data-action="remove-feature" title="Remove">
				<i class="fas fa-times"></i>
			</button>`;

		// Pre-populate pages if this is an existing journal feature
		if (isJournal && feature?.journalId) {
			this.#populatePageSelect(row.querySelector(".sdx-hex-feat-page"), feature.journalId, feature.pageId ?? "");
		}

		// Switch between name input and journal selects on type change
		row.querySelector(".sdx-hex-feat-type").addEventListener("change", (e) => {
			const isJ = e.target.value === "journal";
			row.querySelector(".sdx-hex-feat-name").classList.toggle("sdx-hidden", isJ);
			row.querySelector(".sdx-hex-feat-journal-wrap").classList.toggle("sdx-hidden", !isJ);
		});

		// Populate page select when journal changes
		row.querySelector(".sdx-hex-feat-journal").addEventListener("change", (e) => {
			this.#populatePageSelect(row.querySelector(".sdx-hex-feat-page"), e.target.value, "");
		});

		container.appendChild(row);
	}

	#populatePageSelect(selectEl, journalId, selectedPageId) {
		selectEl.innerHTML = `<option value="">— Page (optional) —</option>`;
		if (!journalId) return;
		const journal = game.journal.get(journalId);
		if (!journal) return;
		for (const page of journal.pages) {
			const opt = document.createElement("option");
			opt.value = page.id;
			opt.textContent = page.name;
			if (page.id === selectedPageId) opt.selected = true;
			selectEl.appendChild(opt);
		}
	}

	// ── Collect & Save ──

	#collectData() {
		const el = this.element;
		const record = {
			name: el.querySelector("[name='hex-name']")?.value?.trim() ?? "",
			zone: el.querySelector("[name='hex-zone']")?.value?.trim() ?? "",
			zoneColor: el.querySelector(".sdx-hex-color-swatches")?.dataset.selected ?? "",
			terrain: el.querySelector("[name='hex-terrain']")?.value?.trim() ?? "",
			travel: el.querySelector("[name='hex-travel']")?.value?.trim() ?? "",
			exploration: el.querySelector("[name='hex-exploration']")?.value ?? "unexplored",
			cleared: el.querySelector("[name='hex-cleared']")?.checked ?? false,
			claimed: el.querySelector("[name='hex-claimed']")?.checked ?? false,
			showToPlayers: el.querySelector("[name='hex-show-players']")?.checked ?? false,
			image: el.querySelector("[name='hex-image']")?.value?.trim() ?? "",
			notes: [],
			features: [],
		};

		el.querySelectorAll(".sdx-hex-note-row").forEach(row => {
			record.notes.push({
				id: row.dataset.nid,
				text: row.querySelector(".sdx-hex-note-text")?.value?.trim() ?? "",
				visible: row.querySelector(".sdx-hex-feat-vis input")?.checked ?? false,
			});
		});

		el.querySelectorAll(".sdx-hex-feat-row").forEach(row => {
			const type = row.querySelector(".sdx-hex-feat-type")?.value ?? "dungeon";
			const f = {
				id: row.dataset.fid,
				type,
				discovered: row.querySelector(".sdx-hex-feat-vis input")?.checked ?? false,
			};
			if (type === "journal") {
				f.journalId = row.querySelector(".sdx-hex-feat-journal")?.value ?? "";
				f.pageId = row.querySelector(".sdx-hex-feat-page")?.value ?? "";
				f.name = "";
			} else {
				f.name = row.querySelector(".sdx-hex-feat-name")?.value?.trim() ?? "";
			}
			record.features.push(f);
		});

		return record;
	}

	async #save() {
		const record = this.#collectData();
		await saveHexRecord(this.#opts.sceneId, this.#opts.hexKey, record);
		this.#opts.manager?.notifyDataChanged(this.#opts.sceneId, this.#opts.hexKey, record);
		this.close();
	}
}

// ─── Initialization ───────────────────────────────────────────────────────────

export function initHexTooltip() {
	// Must wait for "ready" — game.socket is undefined before that hook fires
	Hooks.once("ready", () => {
		game.socket.on("module.shadowdark-extras", async (data) => {

			// GM side: player requests journal access without OBSERVER permission.
			// Only the first active GM handles it to avoid duplicate updates.
			if (data?.action === "sdxHexShowJournal") {
				const firstGM = game.users.find(u => u.isGM && u.active);
				if (!game.user.isGM || firstGM !== game.user) return;

				const j = game.journal.get(data.journalId);
				if (!j) return;
				const userId = data.userId;
				const pid = data.pageId || "";
				const LEVELS = CONST.DOCUMENT_OWNERSHIP_LEVELS;

				if (pid) {
					// Page specified: grant LIMITED on journal (just enough to open the sheet)
					// and OBSERVER only on the specific page — player sees only that page
					await j.update({ ownership: { ...j.ownership, [userId]: LEVELS.LIMITED } });
					const page = j.pages.get(pid);
					if (page) await page.update({ ownership: { ...page.ownership, [userId]: LEVELS.OBSERVER } });
				} else {
					// No page — grant OBSERVER on the whole journal
					await j.update({ ownership: { ...j.ownership, [userId]: LEVELS.OBSERVER } });
				}

				// Give ownership updates time to propagate to all clients
				await new Promise(resolve => setTimeout(resolve, 300));

				// Tell only that player to render the journal at the specific page
				game.socket.emit("module.shadowdark-extras", {
					action: "sdxHexRenderJournal",
					targetUserId: userId,
					journalId: j.id,
					pageId: pid,
				});
				return;
			}

			// Player-side: GM has granted access — wait for both journal + page updates, then render
			if (data?.action === "sdxHexRenderJournal" && game.user.id === data.targetUserId) {
				const pid = data.pageId || "";
				const journalId = data.journalId;

				const openPage = async () => {
					const j = game.journal.get(journalId);
					if (!j) return;
					await j.sheet.render(true);
					if (!pid) return;
					// Navigate to the specific page via TOC click (pageId in render options is unreliable in v13)
					await new Promise(r => setTimeout(r, 200));
					const el = j.sheet.element;
					(el?.querySelector(`[data-page-id="${pid}"] a`)
						?? el?.querySelector(`a[data-page-id="${pid}"]`)
						?? el?.querySelector(`[data-entry-id="${pid}"] a`)
						?? el?.querySelector(`li[data-page-id="${pid}"]`))?.click();
				};

				const j = game.journal.get(journalId);
				if (!j) return;
				const page = pid ? j.pages.get(pid) : null;

				let journalOk = j.testUserPermission(game.user, "LIMITED");
				let pageOk = !pid || page?.testUserPermission(game.user, "OBSERVER");

				if (journalOk && pageOk) {
					openPage();
				} else {
					// One or both ownership updates haven't reached this client yet — wait for them
					const tryOpen = () => {
						if (!journalOk || !pageOk) return;
						Hooks.off("updateJournalEntry", jHookId);
						if (pHookId !== null) Hooks.off("updateJournalEntryPage", pHookId);
						clearTimeout(bail);
						openPage();
					};

					const jHookId = Hooks.on("updateJournalEntry", (doc) => {
						if (doc.id !== journalId) return;
						journalOk = doc.testUserPermission(game.user, "LIMITED");
						tryOpen();
					});

					const pHookId = pid ? Hooks.on("updateJournalEntryPage", (doc) => {
						if (doc.id !== pid) return;
						pageOk = doc.testUserPermission(game.user, "OBSERVER");
						tryOpen();
					}) : null;

					const bail = setTimeout(() => {
						Hooks.off("updateJournalEntry", jHookId);
						if (pHookId !== null) Hooks.off("updateJournalEntryPage", pHookId);
					}, 8000);
				}
			}
		});
	});

	Hooks.on("canvasReady", () => {
		window.SDXHexTooltip?.finalize();
		window.SDXHexTooltip = new SDXHexTooltip();
	});
}
