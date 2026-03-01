/**
 * MaphubViewerApp.mjs
 * ApplicationV2 window that displays a settlement map in an iframe.
 * The iframe is created entirely via DOM (not via HTML string / innerHTML) so
 * that sandbox="allow-same-origin" is never stripped by FoundryVTT's journal
 * HTML sanitizer.
 *
 * For local maphub: serves index.html directly from the module's static path.
 * express.static does NOT add X-Frame-Options, so the iframe loads fine.
 * Using a server URL (not a blob:) also keeps relative asset paths inside
 * Village.js (Assets/village_default.json, etc.) resolving correctly.
 *
 * For external fallback: uses the watabou.github.io URL directly.
 */

const MODULE_ID = "shadowdark-extras";
const { ApplicationV2 } = foundry.applications.api;

export class MaphubViewerApp extends ApplicationV2 {

	/** @param {{ type: string, queryString: string, externalBase: string }} options */
	constructor({ type, queryString = "", externalBase = "" } = {}) {
		super({});
		this._mapType = type;
		this._queryString = queryString;
		this._externalBase = externalBase;

		this._onMessage = this._onMessage.bind(this);
	}

	static DEFAULT_OPTIONS = {
		id: "sdx-maphub-viewer",
		classes: ["sdx-maphub-viewer"],
		tag: "div",
		window: {
			frame: true,
			positioned: true,
			title: "Settlement Map",
			resizable: true,
		},
		position: {
			width: 900,
			height: 660,
			top: 60,
		},
		actions: {
			exportToChat: MaphubViewerApp.#onExportToChat,
			showToPlayers: MaphubViewerApp.#onShowToPlayers,
			saveMapState: MaphubViewerApp.#onSaveMapState,
			setAsBackground: MaphubViewerApp.#onSetAsBackground,
			addAsTile: MaphubViewerApp.#onAddAsTile,
		},
	};

	// ── Render pipeline ───────────────────────────────────────────────────────

	/**
	 * Return a simple container div — the iframe is injected in _onRender
	 * so we can use async and are guaranteed the element is in the DOM.
	 */
	async _renderHTML(_context, _options) {
		const container = document.createElement("div");
		container.className = "sdx-maphub-container";
		container.style.cssText = "width:100%;height:100%;overflow:hidden;position:relative;";
		return container;
	}

	/**
	 * result = return value of _renderHTML (our container div)
	 * content = the application's .window-content element
	 */
	_replaceHTML(result, content, _options) {
		content.replaceChildren(result);
	}

	/**
	 * After the container div is in the DOM, build the src and inject the
	 * iframe entirely via DOM — iframe.sandbox is a DOMTokenList, so values
	 * set here are NEVER passed through FoundryVTT's HTML sanitizer.
	 */
	async _onRender(_context, _options) {
		window.addEventListener("message", this._onMessage);

		const container = this.element.querySelector(".sdx-maphub-container");
		if (!container) return;

		const src = await this._buildSrc();
		if (!src) {
			container.textContent = "Failed to load settlement map.";
			return;
		}

		let loadedJsonText = null;

		// Clear Maphub buffers from Foundry's localStorage to prevent 
		// ghost maps from loading via Watabou's auto-restore behavior.
		const watabouKeys = [
			"_toy_town_buf_",
			"{{LOCALSTORAGE_TOWN_BUF}}",
			"town_buf",
			"village_buf",
			"cave_buf",
			"dwellings_buf"
		];
		watabouKeys.forEach(k => window.localStorage.removeItem(k));

		// Preload saved map state (if it exists) into localStorage
		try {
			const mapId = this._getMapIdFromQuery();
			const saveStr = `data/maps/maphub/maphub_${mapId}.json`;
			const reqUrl = window.location.origin + "/" + saveStr.replace("data/", "");
			const headRes = await fetch(reqUrl, { method: "HEAD" });
			if (headRes.ok) {
				const res = await fetch(reqUrl);
				loadedJsonText = await res.text();
				window.localStorage.setItem("_toy_town_buf_", "j" + loadedJsonText);
				ui.notifications.info("Loaded Maphub saved state!");
			}
		} catch (err) {
			// No saved file exists, ignore
		}

		const iframe = document.createElement("iframe");
		iframe.style.cssText = "width:100%;height:100%;border:none;display:block;";
		iframe.title = "Settlement Map";
		// DOMTokenList — bypasses all string-based sanitization
		iframe.sandbox.add("allow-scripts");
		iframe.sandbox.add("allow-same-origin");
		iframe.sandbox.add("allow-forms");
		iframe.sandbox.add("allow-popups");
		iframe.sandbox.add("allow-downloads");

		if (loadedJsonText) {
			iframe.onload = () => {
				console.log(`SDX | Iframe finished loading, dispatching maphub_load_json!`);
				iframe.contentWindow?.postMessage({
					type: 'maphub_load_json',
					json: loadedJsonText
				}, '*');
			};
		}

		iframe.src = src;

		container.replaceChildren(iframe);
		this._iframe = iframe;
	}

	// ── Header controls ───────────────────────────────────────────────────────

	/** Add header controls. */
	_getHeaderControls() {
		const controls = super._getHeaderControls?.() ?? [];

		// Add "Set as Background"
		controls.unshift({
			icon: "fa-solid fa-image",
			label: "Set as BG",
			action: "setAsBackground",
		});

		// Add "Add as Tile"
		controls.unshift({
			icon: "fa-solid fa-cubes",
			label: "Add as Tile",
			action: "addAsTile",
		});

		// Add "Show to Players"
		controls.unshift({
			icon: "fa-solid fa-eye",
			label: "Show to Players",
			action: "showToPlayers",
		});

		// Add "Export to Chat"
		controls.unshift({
			icon: "fa-solid fa-comment-dots", // changed icon so it does not conflict
			label: "Export to Chat",
			action: "exportToChat",
		});

		// Add "Save Map State"
		controls.unshift({
			icon: "fa-solid fa-floppy-disk",
			label: "Save Map State",
			action: "saveMapState",
		});

		return controls;
	}

	/** Action handler for Export to Chat header button. */
	static async #onExportToChat() {
		await this._exportToChat();
	}

	/** Action handler for Show to Players header button. */
	static async #onShowToPlayers() {
		await this._showToPlayers();
	}

	/** Action handler for Set as BG header button. */
	static async #onSetAsBackground() {
		await this._setAsBackground();
	}

	/** Action handler for Add as Tile header button. */
	static async #onAddAsTile() {
		await this._addAsTile();
	}

	/** Action handler for Save Map State header button. */
	static async #onSaveMapState() {
		ui.notifications.info("To save the map state, Right-Click the map, go to Export as -> JSON. The state will silently save to the server instead of downloading.", { permanent: true });
	}

	_getMapIdFromQuery() {
		try {
			const params = new URLSearchParams(this._queryString);
			const seed = params.get("seed") || "noseed";
			const name = params.get("name") || "noname";
			return `${this._mapType}_${seed}_${name}`.replace(/[^a-zA-Z0-9_\-]/g, "");
		} catch (e) {
			return `unknown_${Date.now()}`;
		}
	}

	async _onMessage(event) {
		if (event.data && event.data.type === "maphub_save_json") {
			const { blob, filename } = event.data;

			const mapId = this._getMapIdFromQuery();
			const saveFilename = `maphub_${mapId}.json`;
			const uploadPath = `maps/maphub`;

			try {
				await FilePicker.createDirectory("data", "maps").catch(() => { });
				await FilePicker.createDirectory("data", uploadPath).catch(() => { });

				const file = new File([blob], saveFilename, { type: "application/json" });
				const response = await FilePicker.upload("data", uploadPath, file, {});
				if (response?.path) {
					ui.notifications.info(`Map state saved to ${saveFilename}!`);
				} else {
					ui.notifications.error("Failed to upload map state.");
				}
			} catch (e) {
				console.error(`${MODULE_ID} | Failed to save map state`, e);
				ui.notifications.error("Failed to upload map state.");
			}
		} else if (event.data && event.data.type === "maphub_save_image") {
			const { blob, filename, format } = event.data;

			const mapId = this._getMapIdFromQuery();
			const timestamp = Date.now();
			const saveFilename = `maphub_${mapId}_${timestamp}.${format}`;
			const uploadPath = `maps/maphub`;

			try {
				await FilePicker.createDirectory("data", "maps").catch(() => { });
				await FilePicker.createDirectory("data", uploadPath).catch(() => { });

				let fileBlob = blob;
				if (typeof blob === "string") {
					fileBlob = new Blob([blob], { type: format === "svg" ? "image/svg+xml" : "image/png" });
				}

				const file = new File([fileBlob], saveFilename, { type: format === "svg" ? "image/svg+xml" : "image/png" });
				const response = await FilePicker.upload("data", uploadPath, file, {});
				if (response?.path) {
					if (this._pendingCaptureResolve) {
						this._pendingCaptureResolve(response.path);
						this._pendingCaptureResolve = null;
					} else {
						ui.notifications.info(`Image saved to ${saveFilename}!`);
					}
				} else {
					if (this._pendingCaptureResolve) {
						this._pendingCaptureResolve(null);
						this._pendingCaptureResolve = null;
					}
					ui.notifications.error("Failed to upload map image.");
				}
			} catch (e) {
				console.error(`${MODULE_ID} | Failed to save map image`, e);
				if (this._pendingCaptureResolve) {
					this._pendingCaptureResolve(null);
					this._pendingCaptureResolve = null;
				}
				ui.notifications.error("Failed to upload map image.");
			}
		}
	}

	// ── Export and Share ──────────────────────────────────────────────────────

	/**
	 * Common helper to capture the canvas, convert to PNG, and upload.
	 * Returns the uploaded file path, or null on failure.
	 */
	async _captureAndUploadMap() {
		const iframe = this._iframe;
		if (!iframe) {
			ui.notifications.warn("Map not loaded yet.");
			return null;
		}

		const cw = iframe.contentWindow;

		let exportFn = null;
		if (cw?.maphubVillageAppInstance?.view?.exportPNG) {
			exportFn = () => cw.maphubVillageAppInstance.view.exportPNG();
		} else if (cw?.maphubCaveAppInstance?.exportPNG) {
			exportFn = () => cw.maphubCaveAppInstance.exportPNG();
		} else if (cw?.maphubDwellingsAppInstance?.exportAsPNG) {
			// Note: Dwellings might not have a working exportAsPNG natively, but we hook it if it does
			exportFn = () => cw.maphubDwellingsAppInstance.exportAsPNG();
		} else if (cw?.maphubAppInstance?.asPNG) { // MFCG
			exportFn = () => cw.maphubAppInstance.asPNG();
		}

		if (exportFn) {
			ui.notifications.info("Generating high-resolution map...");
			return new Promise((resolve) => {
				this._pendingCaptureResolve = resolve;
				try {
					exportFn();
				} catch (e) {
					console.error("Failed to run high-res export", e);
					this._pendingCaptureResolve = null;
					resolve(null);
				}
				// 15 second timeout to prevent hanging if the generator fails silently
				setTimeout(() => {
					if (this._pendingCaptureResolve === resolve) {
						ui.notifications.error("High-res export timed out.");
						this._pendingCaptureResolve = null;
						resolve(null);
					}
				}, 15000);
			});
		}

		let canvas;
		try {
			canvas = iframe.contentDocument?.querySelector("canvas");
		} catch (e) {
			ui.notifications.error("Cannot access map canvas (cross-origin).");
			return null;
		}
		if (!canvas) {
			ui.notifications.warn("No canvas found in the map viewer.");
			return null;
		}

		ui.notifications.info("Capturing map...");

		try {
			const blob = await new Promise((resolve, reject) => {
				canvas.toBlob(b => b ? resolve(b) : reject(new Error("toBlob failed")), "image/png");
			});

			const timestamp = Date.now();
			const genType = this._mapType || "map";
			const filename = `${genType}_${timestamp}.png`;
			const uploadPath = `maps/maphub`;

			// Foundry's createDirectory isn't recursive, so we create parent first
			await FilePicker.createDirectory("data", "maps").catch(() => { });
			await FilePicker.createDirectory("data", uploadPath).catch(() => { });

			const file = new File([blob], filename, { type: "image/png" });
			const response = await FilePicker.upload("data", uploadPath, file, {});
			if (!response?.path) {
				ui.notifications.error("Failed to upload map image.");
				return null;
			}
			return response.path;
		} catch (e) {
			console.error(`${MODULE_ID} | Map capture failed:`, e);
			ui.notifications.error(`Capture failed: ${e.message}`);
			return null;
		}
	}

	/** Export to chat. */
	async _exportToChat() {
		const imgPath = await this._captureAndUploadMap();
		if (!imgPath) return;

		try {
			await ChatMessage.create({
				content: `<div style="text-align:center;">
					<p><strong>🗺️ ${this._getMapLabel()}</strong></p>
					<img src="${imgPath}" style="max-width:100%;border-radius:6px;border:1px solid #555;" />
				</div>`,
				speaker: ChatMessage.getSpeaker(),
			});
			ui.notifications.info("Map exported to chat!");
		} catch (e) {
			ui.notifications.error("Failed to create chat message.");
		}
	}

	/** Show image to players using ImagePopout. */
	async _showToPlayers() {
		const imgPath = await this._captureAndUploadMap();
		if (!imgPath) return;

		try {
			const ip = new ImagePopout(imgPath, { title: this._getMapLabel() });
			ip.render(true);
			ip.shareImage();
			ui.notifications.info("Map shared with players!");
		} catch (e) {
			ui.notifications.error("Failed to share image.");
		}
	}

	/**
	 * Force the application window to a massive size (2000x2000 minimum)
	 * to ensure the internal map canvas redraws at high resolution.
	 * @returns {Promise<{ position: object, style: object }>} The previous window state.
	 */
	async _maximizeForCapture() {
		ui.notifications.info("Preparing map for high-res capture...");

		const oldState = {
			position: foundry.utils.deepClone(this.position),
			style: this.element ? {
				minHeight: this.element.style.minHeight,
				minWidth: this.element.style.minWidth,
				maxWidth: this.element.style.maxWidth,
				maxHeight: this.element.style.maxHeight,
				left: this.element.style.left,
				top: this.element.style.top,
				zIndex: this.element.style.zIndex
			} : null
		};

		try {
			if (typeof this.setPosition === "function") {
				this.setPosition({ left: 0, top: 0 });
			}
			if (this.element) {
				this.element.style.minHeight = "2000px";
				this.element.style.minWidth = "2000px";
				this.element.style.maxWidth = "none";
				this.element.style.maxHeight = "none";
				this.element.style.left = "0px";
				this.element.style.top = "0px";
				this.element.style.zIndex = "9999";
			}
		} catch (e) {
			console.warn("Failed to maximize dialog window:", e);
		}
		// Give the iframe/canvas time to resize and redraw completely
		await new Promise(r => setTimeout(r, 1500));
		return oldState;
	}

	/**
	 * Restore the application window to its previous state.
	 * @param {{ position: object, style: object }} state The state to restore.
	 */
	_restoreAfterCapture(state) {
		if (!state) return;
		if (state.position) {
			this.setPosition(state.position);
		}
		if (this.element && state.style) {
			Object.assign(this.element.style, state.style);
		}
	}

	/** Set the map image as the current scene's background. */
	async _setAsBackground() {
		if (!game.user.isGM) return;
		if (!canvas?.scene) {
			ui.notifications.warn("No active scene to set background for!");
			return;
		}

		const isDwellings = this._mapType === "dwellings";
		const oldState = await this._maximizeForCapture();

		const imgPath = await this._captureAndUploadMap();
		if (!imgPath) {
			if (isDwellings) this._restoreAfterCapture(oldState);
			return;
		}

		try {
			// Create a temporary image to determine dimensions before applying
			const img = new Image();
			img.onload = async () => {
				const sceneUpdateData = {
					background: {
						src: imgPath
					},
					width: img.width,
					height: img.height,
					padding: 0,
					grid: { size: isDwellings ? 260 : 50 }
				};

				await canvas.scene.update(sceneUpdateData);
				ui.notifications.info(`Scene background updated to ${img.width}x${img.height}!`);

				if (isDwellings) {
					this._restoreAfterCapture(oldState);
				} else {
					this.close(); // Close the dialog
				}
			};
			img.onerror = () => {
				// Fallback if we can't load the image dimensions for some reason
				canvas.scene.update({ background: { src: imgPath } });
				ui.notifications.info("Scene background updated (kept previous dimensions).");

				if (isDwellings) {
					this._restoreAfterCapture(oldState);
				} else {
					this.close(); // Close the dialog
				}
			};
			img.src = imgPath;
		} catch (e) {
			console.error(`${MODULE_ID} | Failed to set scene background`, e);
			ui.notifications.error("Failed to set scene background.");
			if (isDwellings) this._restoreAfterCapture(oldState);
		}
	}

	/** Export the map as a Tile on the active scene. */
	async _addAsTile() {
		if (!game.user.isGM) return;
		if (!canvas?.scene) {
			ui.notifications.warn("No active scene to add tile to!");
			return;
		}

		const isDwellings = this._mapType === "dwellings";
		const oldState = await this._maximizeForCapture();

		const imgPath = await this._captureAndUploadMap();
		if (!imgPath) {
			if (isDwellings) this._restoreAfterCapture(oldState);
			return;
		}

		try {
			// Create a temporary image to determine dimensions before applying
			const img = new Image();
			img.onload = async () => {
				const tileData = {
					texture: { src: imgPath },
					width: img.width,
					height: img.height,
					x: canvas.stage.pivot.x - (img.width / 2),
					y: canvas.stage.pivot.y - (img.height / 2)
				};

				await canvas.scene.createEmbeddedDocuments("Tile", [tileData]);
				ui.notifications.info(`Map added as a ${img.width}x${img.height} tile!`);

				if (isDwellings) {
					this._restoreAfterCapture(oldState);
				} else {
					this.close(); // Close the dialog
				}
			};
			img.onerror = () => {
				ui.notifications.error("Failed to load map image dimensions for Tile.");
				if (isDwellings) this._restoreAfterCapture(oldState);
			};
			img.src = imgPath;
		} catch (e) {
			console.error(`${MODULE_ID} | Failed to add map as tile`, e);
			ui.notifications.error("Failed to add map as tile.");
			if (isDwellings) this._restoreAfterCapture(oldState);
		}
	}

	/** Human-readable label for the map type. */
	_getMapLabel() {
		const labels = {
			mfcg: "City Map",
			village: "Village Map",
			cave: "Cave Map",
			dwellings: "Dwelling Map",
			viewer: "3D City View",
		};
		return labels[this._mapType] || "Settlement Map";
	}

	/**
	 * Override close() — NOT _onClose() — because ApplicationV2 destroys the
	 * DOM element BEFORE _onClose fires.  We must rescue the iframe out of
	 * Foundry's element tree first, then let super.close() safely tear down
	 * the now-empty application window.
	 *
	 * The rescued iframe lives in a hidden off-screen div where the mfcg.js
	 * OpenFL rAF loop can finish its current frame harmlessly.  After a short
	 * delay we navigate to about:blank to unload the JS context, then remove
	 * the hidden div.
	 */
	async close(options) {
		window.removeEventListener("message", this._onMessage);

		const iframe = this.element?.querySelector("iframe");
		if (iframe) {
			// Park the iframe off-screen before Foundry nukes the app element
			const graveyard = document.createElement("div");
			graveyard.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden;pointer-events:none;";
			document.body.appendChild(graveyard);
			graveyard.appendChild(iframe);

			// Kill JS context after the rAF loop settles, then clean up
			setTimeout(() => {
				try { iframe.src = "about:blank"; } catch (_) { }
				setTimeout(() => graveyard.remove(), 500);
			}, 100);
		}
		return super.close(options);
	}

	/** Build the iframe src. */
	async _buildSrc() {
		// Use the direct server URL for local maphub files.
		// Static module files are served by express.static and do NOT carry
		// FoundryVTT's X-Frame-Options: deny header (that only applies to the
		// app's own HTML routes).  Using a direct URL also keeps relative asset
		// paths in Village.js working correctly.
		const BASE = `modules/${MODULE_ID}/scripts/maphub`;
		const localBase = `${window.location.origin}/${BASE}/to/${this._mapType}/index.html`;
		const localParams = this._queryString ? `cb=${Date.now()}&${this._queryString}` : `cb=${Date.now()}`;
		const localUrl = `${localBase}?${localParams}`;

		// Quick HEAD probe to confirm the file exists locally.
		try {
			const r = await fetch(localUrl, { method: "HEAD" });
			if (r.ok) {
				console.log(`${MODULE_ID} | MaphubViewerApp: using local URL ${localUrl}`);
				return localUrl;
			}
		} catch (_) { /* network error → fall through */ }

		// Local files not present — fall back to external URL.
		const ext = this._queryString ? `${this._externalBase}?${this._queryString}` : this._externalBase;
		console.warn(`${MODULE_ID} | MaphubViewerApp: local files missing, using external: ${ext}`);
		return ext;
	}

}
