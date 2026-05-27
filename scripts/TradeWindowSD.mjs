/**
 * Diablo-style Trading Window for Shadowdark RPG
 * Uses a shared Journal Entry for state synchronization
 * Uses socketlib for direct player-to-player trade requests
 */

import { getSocket } from "./CombatSettingsSD.mjs";

const MODULE_ID = "shadowdark-extras";
const TRADE_JOURNAL_NAME = "__sdx_trade_sync__"; // Internal journal name (hidden from sidebar)


// Active trade windows - keyed by trade ID
const activeTrades = new Map();

// Cached journal reference
let _tradeJournal = null;

/**
 * Generate a unique trade ID
 */
function generateTradeId() {
	return `trade-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get the trade journal entry (creates if needed - GM only)
 */
function getTradeJournal() {
	// Return cached if valid
	if (_tradeJournal && game.journal.get(_tradeJournal.id)) {
		return _tradeJournal;
	}

	// Find by name
	_tradeJournal = game.journal.find(j => j.name === TRADE_JOURNAL_NAME);
	return _tradeJournal;
}

/**
 * Ensure the trade journal exists (called by GM on ready)
 */
export async function ensureTradeJournal() {
	// Only GM can create
	if (!game.user.isGM) return;

	let journal = game.journal.find(j => j.name === TRADE_JOURNAL_NAME);

	if (!journal) {
		console.log(`${MODULE_ID} | Creating trade sync journal...`);

		// Create with default ownership for all players
		journal = await JournalEntry.create({
			name: TRADE_JOURNAL_NAME,
			ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER },
			flags: {
				[MODULE_ID]: {
					isTradeJournal: true
				}
			}
		});

		console.log(`${MODULE_ID} | Trade sync journal created:`, journal.id);
	} else {
		// Ensure ownership is correct (in case it was changed)
		if (journal.ownership.default !== CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) {
			await journal.update({
				ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER }
			});
		}
	}

	_tradeJournal = journal;
	return journal;
}

/**
 * Get trade data from journal
 */
function getTradeData(tradeId) {
	const journal = getTradeJournal();
	if (!journal) return null;
	return journal.getFlag(MODULE_ID, `trade-${tradeId}`);
}

/**
 * Save trade data to journal
 */
async function saveTradeData(tradeId, data) {
	const journal = getTradeJournal();
	if (!journal) {
		console.error(`${MODULE_ID} | Trade journal not found!`);
		return;
	}
	await journal.setFlag(MODULE_ID, `trade-${tradeId}`, data);
}

/**
 * Clear trade data from journal
 */
async function clearTradeData(tradeId) {
	const journal = getTradeJournal();
	if (!journal) return;
	await journal.unsetFlag(MODULE_ID, `trade-${tradeId}`);
}

// Use the Handlebars mixin for AppV2
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Trade Window Application (AppV2 with Handlebars)
 */
export default class TradeWindowSD extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		id: "trade-window-{id}",
		classes: ["shadowdark", "shadowdark-extras", "trade-window"],
		tag: "div",
		window: {
			frame: true,
			positioned: true,
			title: "SHADOWDARK_EXTRAS.trade.title",
			icon: "fas fa-exchange-alt",
			resizable: false,
			minimizable: false
		},
		position: {
			width: 600,
			height: "auto"
		},
		actions: {
			lockOffer: TradeWindowSD.#onLockOffer,
			acceptTrade: TradeWindowSD.#onAcceptTrade,
			cancelTrade: TradeWindowSD.#onCancelTrade,
			removeItem: TradeWindowSD.#onRemoveItem
		}
	};

	static PARTS = {
		trade: {
			template: `modules/${MODULE_ID}/templates/trade-window.hbs`
		}
	};

	/**
	 * @param {Object} options
	 * @param {string} options.tradeId - Unique trade identifier
	 * @param {Actor} options.localActor - The local player's actor
	 * @param {Actor} options.remoteActor - The remote player's actor
	 * @param {boolean} options.isInitiator - Whether this player initiated the trade
	 */
	constructor(options = {}) {
		super(options);

		this.tradeId = options.tradeId;
		this.localActor = options.localActor;
		this.remoteActor = options.remoteActor;
		this.isInitiator = options.isInitiator ?? false;

		// Determine which side we are (initiator = side A, acceptor = side B)
		this.localSide = this.isInitiator ? "A" : "B";
		this.remoteSide = this.isInitiator ? "B" : "A";

		// Register this trade window
		activeTrades.set(this.tradeId, this);
	}

	get title() {
		return game.i18n.format("SHADOWDARK_EXTRAS.trade.title_with_player", {
			player: this.remoteActor?.name ?? "Unknown"
		});
	}

	/**
	 * Get current trade state from journal
	 */
	getTradeState() {
		const data = getTradeData(this.tradeId);
		if (!data) {
			return {
				itemsA: [],
				itemsB: [],
				coinsA: { gp: 0, sp: 0, cp: 0 },
				coinsB: { gp: 0, sp: 0, cp: 0 },
				lockedA: false,
				lockedB: false,
				acceptedA: false,
				acceptedB: false
			};
		}
		// Ensure coins exist (for backwards compatibility)
		if (!data.coinsA) data.coinsA = { gp: 0, sp: 0, cp: 0 };
		if (!data.coinsB) data.coinsB = { gp: 0, sp: 0, cp: 0 };
		return data;
	}

	/**
	 * Get local items/state based on which side we are
	 */
	getLocalState() {
		const state = this.getTradeState();
		return {
			items: this.localSide === "A" ? state.itemsA : state.itemsB,
			coins: this.localSide === "A" ? state.coinsA : state.coinsB,
			locked: this.localSide === "A" ? state.lockedA : state.lockedB,
			accepted: this.localSide === "A" ? state.acceptedA : state.acceptedB
		};
	}

	/**
	 * Get remote items/state based on which side we are
	 */
	getRemoteState() {
		const state = this.getTradeState();
		return {
			items: this.remoteSide === "A" ? state.itemsA : state.itemsB,
			coins: this.remoteSide === "A" ? state.coinsA : state.coinsB,
			locked: this.remoteSide === "A" ? state.lockedA : state.lockedB,
			accepted: this.remoteSide === "A" ? state.acceptedA : state.acceptedB
		};
	}

	async _prepareContext(options) {
		const context = await super._prepareContext(options);

		const localState = this.getLocalState();
		const remoteState = this.getRemoteState();

		context.tradeId = this.tradeId;
		context.localActor = this.localActor;
		context.remoteActor = this.remoteActor;

		// Process items to mask unidentified names for non-GM users
		const processItems = (items) => {
			if (game.user?.isGM) return items;
			return items.map(itemData => {
				const isUnidentified = itemData.flags?.[MODULE_ID]?.unidentified === true;
				if (isUnidentified) {
					// Get custom unidentified name or default
					const customName = itemData.flags?.[MODULE_ID]?.unidentifiedName;
					const maskedName = (customName && customName.trim())
						? customName.trim()
						: game.i18n.localize("SHADOWDARK_EXTRAS.item.unidentified.label");
					return { ...itemData, name: maskedName, _realName: itemData.name };
				}
				return itemData;
			});
		};

		context.localItems = processItems(localState.items);
		context.remoteItems = processItems(remoteState.items);
		context.localCoins = localState.coins;
		context.remoteCoins = remoteState.coins;
		context.localLocked = localState.locked;
		context.remoteLocked = remoteState.locked;
		context.localAccepted = localState.accepted;
		context.remoteAccepted = remoteState.accepted;
		context.bothLocked = localState.locked && remoteState.locked;
		context.canAccept = localState.locked && remoteState.locked && !localState.accepted;

		// Get actor's available coins for validation display
		context.localActorCoins = {
			gp: this.localActor.system?.coins?.gp ?? 0,
			sp: this.localActor.system?.coins?.sp ?? 0,
			cp: this.localActor.system?.coins?.cp ?? 0
		};

		// Calculate total value for each side (items + coins)
		context.localTotalGp = this._calculateTotalValue(localState.items, localState.coins);
		context.remoteTotalGp = this._calculateTotalValue(remoteState.items, remoteState.coins);

		return context;
	}

	_calculateTotalValue(items, coins = { gp: 0, sp: 0, cp: 0 }) {
		let total = 0;
		for (const item of items) {
			const cost = item.system?.cost ?? {};
			const qty = item.system?.quantity ?? 1;
			total += ((cost.gp ?? 0) + (cost.sp ?? 0) / 10 + (cost.cp ?? 0) / 100) * qty;
		}
		// Add coins
		total += (coins.gp ?? 0) + (coins.sp ?? 0) / 10 + (coins.cp ?? 0) / 100;
		return Math.round(total * 100) / 100;
	}

	_onRender(context, options) {
		super._onRender(context, options);

		const html = this.element;

		// Setup drag & drop for local trade area
		const localDropZone = html.querySelector(".trade-local .trade-items");
		if (localDropZone) {
			localDropZone.addEventListener("dragover", this._onDragOver.bind(this));
			localDropZone.addEventListener("drop", this._onDropItem.bind(this));
		}

		// Setup coin input handlers
		const coinInputs = html.querySelectorAll(".trade-local .trade-coin-input");
		coinInputs.forEach(input => {
			input.addEventListener("change", this._onCoinChange.bind(this));
		});
	}

	async _onCoinChange(event) {
		const localState = this.getLocalState();
		if (localState.locked) {
			ui.notifications.warn(game.i18n.localize("SHADOWDARK_EXTRAS.trade.offer_locked"));
			this.render(); // Reset the input to previous value
			return;
		}

		const input = event.target;
		const coinType = input.dataset.coinType;
		let value = parseInt(input.value) || 0;

		// Validate against actor's available coins
		const actorCoins = this.localActor.system?.coins || {};
		const maxAvailable = actorCoins[coinType] ?? 0;

		if (value < 0) value = 0;
		if (value > maxAvailable) {
			ui.notifications.warn(game.i18n.format("SHADOWDARK_EXTRAS.trade.not_enough_coins", {
				type: coinType.toUpperCase(),
				available: maxAvailable
			}));
			value = maxAvailable;
		}

		// Update coins
		const newCoins = { ...localState.coins };
		newCoins[coinType] = value;

		await this._updateLocalState({ coins: newCoins });
	}

	_onDragOver(event) {
		const localState = this.getLocalState();
		if (localState.locked) return;
		event.preventDefault();
		event.dataTransfer.dropEffect = "move";
	}

	async _onDropItem(event) {
		const localState = this.getLocalState();
		if (localState.locked) {
			ui.notifications.warn(game.i18n.localize("SHADOWDARK_EXTRAS.trade.offer_locked"));
			return;
		}

		event.preventDefault();

		let data;
		try {
			data = JSON.parse(event.dataTransfer.getData("text/plain"));
		} catch (e) {
			return;
		}

		if (data.type !== "Item") return;

		// Get the item
		const item = await fromUuid(data.uuid);
		if (!item) return;

		// Verify item belongs to local actor
		if (item.parent?.id !== this.localActor.id) {
			ui.notifications.warn(game.i18n.localize("SHADOWDARK_EXTRAS.trade.wrong_actor"));
			return;
		}

		// Check if item is already in trade
		if (localState.items.some(i => i._id === item.id)) {
			ui.notifications.warn(game.i18n.localize("SHADOWDARK_EXTRAS.trade.already_in_trade"));
			return;
		}

		// Don't allow items inside containers (must remove from container first)
		if (item.getFlag(MODULE_ID, "containerId")) {
			ui.notifications.warn(game.i18n.localize("SHADOWDARK_EXTRAS.trade.item_in_container"));
			return;
		}

		// Don't allow containers (too complex to handle contents)
		if (item.getFlag(MODULE_ID, "isContainer")) {
			ui.notifications.warn(game.i18n.localize("SHADOWDARK_EXTRAS.trade.no_containers"));
			return;
		}

		// Add item to local trade and save to journal
		await this._updateLocalState({
			items: [...localState.items, item.toObject()]
		});
	}

	async _updateLocalState(updates) {
		const state = this.getTradeState();

		if (this.localSide === "A") {
			if (updates.items !== undefined) state.itemsA = updates.items;
			if (updates.coins !== undefined) state.coinsA = updates.coins;
			if (updates.locked !== undefined) state.lockedA = updates.locked;
			if (updates.accepted !== undefined) state.acceptedA = updates.accepted;
		} else {
			if (updates.items !== undefined) state.itemsB = updates.items;
			if (updates.coins !== undefined) state.coinsB = updates.coins;
			if (updates.locked !== undefined) state.lockedB = updates.locked;
			if (updates.accepted !== undefined) state.acceptedB = updates.accepted;
		}

		await saveTradeData(this.tradeId, state);
		// Note: render will be called by the journal update hook
	}

	static async #onRemoveItem(event, target) {
		const localState = this.getLocalState();
		if (localState.locked) {
			ui.notifications.warn(game.i18n.localize("SHADOWDARK_EXTRAS.trade.offer_locked"));
			return;
		}

		const itemId = target.closest(".trade-item")?.dataset.itemId;
		if (!itemId) return;

		// Remove item from local trade
		await this._updateLocalState({
			items: localState.items.filter(i => i._id !== itemId)
		});
	}

	static async #onLockOffer(event, target) {
		const localState = this.getLocalState();

		if (localState.locked) {
			// Unlock - also reset acceptances
			const state = this.getTradeState();
			state.acceptedA = false;
			state.acceptedB = false;
			if (this.localSide === "A") {
				state.lockedA = false;
			} else {
				state.lockedB = false;
			}
			await saveTradeData(this.tradeId, state);
		} else {
			// Lock
			await this._updateLocalState({ locked: true });
		}
	}

	static async #onAcceptTrade(event, target) {
		const localState = this.getLocalState();
		const remoteState = this.getRemoteState();

		if (!localState.locked || !remoteState.locked) {
			ui.notifications.warn(game.i18n.localize("SHADOWDARK_EXTRAS.trade.both_must_lock"));
			return;
		}

		// Get current state and update it directly (avoid race with journal sync)
		const state = this.getTradeState();
		if (this.localSide === "A") {
			state.acceptedA = true;
		} else {
			state.acceptedB = true;
		}

		// Check if both accepted BEFORE saving (using our local update)
		const bothAccepted = state.acceptedA && state.acceptedB;

		// Save the state
		await saveTradeData(this.tradeId, state);

		// If both accepted, execute trade
		if (bothAccepted) {
			await this._executeTrade();
		}
	}

	static async #onCancelTrade(event, target) {
		// Set cancelled flag in journal
		const state = this.getTradeState();
		state.cancelled = true;
		state.cancelledBy = this.localActor.name;
		await saveTradeData(this.tradeId, state);

		// Close our window
		this.close();

		ui.notifications.info(game.i18n.localize("SHADOWDARK_EXTRAS.trade.cancelled"));
	}

	async _executeTrade() {
		const state = this.getTradeState();

		// Only initiator executes the actual trade to prevent double-transfer
		if (!this.isInitiator) {
			// Wait for initiator to complete
			return;
		}

		// Pick a transfer backend: Item Piles if installed and active,
		// otherwise the native fallback (no module dependency).
		const useItemPiles = game.modules.get("item-piles")?.active && !!game.itempiles?.API;

		try {
			// Get actors
			const actorA = game.actors.get(state.actorAId);
			const actorB = game.actors.get(state.actorBId);

			if (!actorA || !actorB) {
				throw new Error("Trade actors not found");
			}

			// Transfer items from A to B
			if (state.itemsA.length > 0) {
				const itemsA = state.itemsA.map(i => ({ _id: i._id, quantity: i.system?.quantity ?? 1 }));
				if (useItemPiles) {
					await game.itempiles.API.transferItems(actorA, actorB, itemsA, { interactionId: false });
				} else {
					await this._nativeTransferItems(actorA, actorB, itemsA);
				}
			}

			// Transfer items from B to A
			if (state.itemsB.length > 0) {
				const itemsB = state.itemsB.map(i => ({ _id: i._id, quantity: i.system?.quantity ?? 1 }));
				if (useItemPiles) {
					await game.itempiles.API.transferItems(actorB, actorA, itemsB, { interactionId: false });
				} else {
					await this._nativeTransferItems(actorB, actorA, itemsB);
				}
			}

			// Transfer coins from A to B
			const coinsA = state.coinsA || { gp: 0, sp: 0, cp: 0 };
			if (coinsA.gp > 0 || coinsA.sp > 0 || coinsA.cp > 0) {
				if (useItemPiles) {
					const attributesA = this._buildCurrencyAttributes(coinsA);
					console.log(`${MODULE_ID} | Transferring currencies from ${actorA.name} to ${actorB.name}:`, attributesA);
					const result = await game.itempiles.API.transferAttributes(actorA, actorB, attributesA, { interactionId: false });
					console.log(`${MODULE_ID} | Currency transfer A->B result:`, result);
				} else {
					await this._nativeTransferCoins(actorA, actorB, coinsA);
				}
			}

			// Transfer coins from B to A
			const coinsB = state.coinsB || { gp: 0, sp: 0, cp: 0 };
			if (coinsB.gp > 0 || coinsB.sp > 0 || coinsB.cp > 0) {
				if (useItemPiles) {
					const attributesB = this._buildCurrencyAttributes(coinsB);
					console.log(`${MODULE_ID} | Transferring currencies from ${actorB.name} to ${actorA.name}:`, attributesB);
					const result = await game.itempiles.API.transferAttributes(actorB, actorA, attributesB, { interactionId: false });
					console.log(`${MODULE_ID} | Currency transfer B->A result:`, result);
				} else {
					await this._nativeTransferCoins(actorB, actorA, coinsB);
				}
			}

			// Mark trade as complete
			state.complete = true;
			await saveTradeData(this.tradeId, state);

		} catch (error) {
			console.error(`${MODULE_ID} | Trade execution failed:`, error);
			ui.notifications.error(game.i18n.localize("SHADOWDARK_EXTRAS.trade.failed"));
		}
	}

	/**
	 * Build an attributes object for Item Piles transferAttributes API
	 * Format: { "system.coins.gp": 5, "system.coins.sp": 10, "system.coins.cp": 3 }
	 */
	_buildCurrencyAttributes(coins) {
		const attributes = {};
		if (coins.gp > 0) attributes["system.coins.gp"] = coins.gp;
		if (coins.sp > 0) attributes["system.coins.sp"] = coins.sp;
		if (coins.cp > 0) attributes["system.coins.cp"] = coins.cp;
		return attributes;
	}

	/**
	 * Native item-transfer fallback used when Item Piles isn't installed.
	 *
	 * For each item to transfer:
	 *  - Read the source item (`{_id, quantity}` from the trade state).
	 *  - If the target already has an item with the same name + matching
	 *    compendium source, merge by bumping the existing quantity.
	 *  - Otherwise create a fresh copy on the target via
	 *    `createEmbeddedDocuments`.
	 *  - Reduce source quantity by the transferred amount; delete the
	 *    source item if quantity reaches 0.
	 *
	 * Doesn't replicate every Item Piles feature (stack limits, slot
	 * checks, currency conversion). For SDX trades — which the chat-card
	 * style trade window does — the simple stack-merge behavior matches
	 * what users expect.
	 */
	async _nativeTransferItems(fromActor, toActor, transferList) {
		for (const entry of transferList) {
			const srcItem = fromActor.items.get(entry._id);
			if (!srcItem) {
				console.warn(`${MODULE_ID} | _nativeTransferItems: source item ${entry._id} not found on ${fromActor.name}`);
				continue;
			}
			const transferQty = Math.max(1, Number(entry.quantity ?? 1));
			const srcQty = Number(srcItem.system?.quantity ?? 1);
			if (transferQty > srcQty) {
				console.warn(`${MODULE_ID} | _nativeTransferItems: requested ${transferQty} of ${srcItem.name} but source has ${srcQty}; clamping`);
			}
			const actualTransfer = Math.min(transferQty, srcQty);

			// Try to merge into an existing stack on the target.
			const sourceUuid = srcItem._stats?.compendiumSource ?? srcItem.flags?.core?.sourceId ?? null;
			const existingStack = toActor.items.find(it =>
				it.type === srcItem.type
				&& it.name === srcItem.name
				&& (it._stats?.compendiumSource ?? it.flags?.core?.sourceId ?? null) === sourceUuid
			);

			if (existingStack) {
				const newQty = Number(existingStack.system?.quantity ?? 1) + actualTransfer;
				await existingStack.update({ "system.quantity": newQty });
			} else {
				const data = srcItem.toObject();
				data.system = data.system ?? {};
				data.system.quantity = actualTransfer;
				delete data._id;
				await toActor.createEmbeddedDocuments("Item", [data]);
			}

			// Reduce source — delete if we transferred everything, else decrement.
			const remaining = srcQty - actualTransfer;
			if (remaining <= 0) {
				await srcItem.delete();
			} else {
				await srcItem.update({ "system.quantity": remaining });
			}
		}
	}

	/**
	 * Native coin-transfer fallback. Reads source coins, subtracts the
	 * transfer amounts, reads target coins, adds them. Single `update()`
	 * per actor to keep history clean.
	 */
	async _nativeTransferCoins(fromActor, toActor, coins) {
		const types = ["gp", "sp", "cp"];
		const fromCoins = fromActor.system?.coins ?? {};
		const toCoins = toActor.system?.coins ?? {};

		const fromUpdate = {};
		const toUpdate = {};
		for (const t of types) {
			const amt = Math.max(0, Number(coins[t] ?? 0));
			if (amt === 0) continue;
			const fromCurrent = Number(fromCoins[t] ?? 0);
			if (amt > fromCurrent) {
				console.warn(`${MODULE_ID} | _nativeTransferCoins: ${fromActor.name} has ${fromCurrent} ${t} but transfer asks for ${amt}; clamping`);
			}
			const actualAmt = Math.min(amt, fromCurrent);
			if (actualAmt <= 0) continue;
			fromUpdate[`system.coins.${t}`] = fromCurrent - actualAmt;
			toUpdate[`system.coins.${t}`] = Number(toCoins[t] ?? 0) + actualAmt;
		}

		if (Object.keys(fromUpdate).length) await fromActor.update(fromUpdate);
		if (Object.keys(toUpdate).length) await toActor.update(toUpdate);
	}

	/**
	 * Called when journal updates - check if we need to re-render or close
	 */
	onJournalUpdate() {
		const state = this.getTradeState();
		if (!state) return;

		// Check if cancelled
		if (state.cancelled && state.cancelledBy !== this.localActor.name) {
			ui.notifications.info(game.i18n.format("SHADOWDARK_EXTRAS.trade.cancelled_by", {
				player: state.cancelledBy
			}));
			this.close({ skipJournalCleanup: true });
			return;
		}

		// Check if complete
		if (state.complete) {
			ui.notifications.info(game.i18n.format("SHADOWDARK_EXTRAS.trade.complete", {
				player: this.remoteActor.name
			}));
			this.close({ skipJournalCleanup: true });
			return;
		}

		// Check if both accepted - initiator should execute trade
		if (state.acceptedA && state.acceptedB && this.isInitiator) {
			this._executeTrade();
			return;
		}

		// Just re-render to show updated state
		this.render();
	}

	async close(options = {}) {
		// Remove from active trades
		activeTrades.delete(this.tradeId);

		// Clean up journal data if we're the one closing (not from remote cancel/complete)
		if (!options.skipJournalCleanup) {
			await clearTradeData(this.tradeId);
		}

		return super.close(options);
	}
}

// ============================================
// SOCKET & JOURNAL HOOKS
// ============================================

/**
 * Initialize trade system - uses socketlib for direct player prompts
 */
export function initializeTradeSocket() {
	// Watch for journal updates to sync trade state
	Hooks.on("updateJournalEntry", (journal, changes, options, userId) => {
		// Check if this is our trade journal
		const tradeJournal = getTradeJournal();
		if (!tradeJournal || journal.id !== tradeJournal.id) return;

		// Check if any trade flags changed
		const flagChanges = changes?.flags?.[MODULE_ID];
		if (!flagChanges) return;

		// Notify all active trade windows
		for (const [tradeId, tradeWindow] of activeTrades) {
			if (flagChanges[`trade-${tradeId}`] !== undefined) {
				tradeWindow.onJournalUpdate();
			}
		}
	});

	// Note: Trade socket handlers (showTradeRequestPrompt, openTradeWindow, notifyTradeDeclined)
	// are registered in setupCombatSocket() in CombatSettingsSD.mjs during socketlib.ready hook
	// This ensures they're available on all clients before any trade is initiated

	console.log(`${MODULE_ID} | Trade system initialized`);
}


// ============================================
// TRADE INITIATION
// ============================================

/**
 * Initiate a trade with another player using socketlib
 */
export async function initiateTradeWithPlayer(localActor, remoteActor) {
	if (!localActor || !remoteActor) {
		ui.notifications.error("Invalid actors for trade");
		return;
	}

	// Check trade journal exists
	const journal = getTradeJournal();
	if (!journal) {
		ui.notifications.error("Trade journal not found. Please ensure journal ID is configured.");
		return;
	}

	// Get the socketlib socket
	const socket = getSocket();
	if (!socket) {
		ui.notifications.error("socketlib not available. Trade system requires socketlib module.");
		return;
	}

	// Find the ONLINE non-GM owner of the remote actor
	let remoteOwner = game.users.find(u =>
		remoteActor.testUserPermission(u, "OWNER") &&
		u.id !== game.user.id &&
		u.active &&
		!u.isGM
	);

	if (!remoteOwner) {
		remoteOwner = game.users.find(u =>
			remoteActor.testUserPermission(u, "OWNER") &&
			u.id !== game.user.id &&
			u.active
		);
	}

	if (!remoteOwner) {
		ui.notifications.error(game.i18n.localize("SHADOWDARK_EXTRAS.trade.no_owner"));
		return;
	}

	// Generate trade ID
	const tradeId = generateTradeId();

	// Notify user that request is being sent
	ui.notifications.info(game.i18n.format("SHADOWDARK_EXTRAS.trade.request_sent", {
		player: remoteActor.name
	}));

	// Send trade request prompt to the remote user via socketlib
	// Use executeAsUser which waits for and returns the result from that specific user
	try {
		console.log(`${MODULE_ID} | Sending trade request to user ${remoteOwner.id}`);
		const result = await socket.executeAsUser("showTradeRequestPrompt", remoteOwner.id, {
			initiatorActorId: localActor.id,
			targetActorId: remoteActor.id,
			initiatorUserId: game.user.id,
			tradeId: tradeId
		});

		console.log(`${MODULE_ID} | Trade request result:`, result);

		// executeAsUser returns the result directly (unlike executeForUsers)
		if (result?.accepted) {
			// Trade accepted! Initialize trade state and open windows for both players
			console.log(`${MODULE_ID} | Trade accepted, initializing trade state`);
			await saveTradeData(tradeId, {
				actorAId: localActor.id,
				actorBId: remoteActor.id,
				itemsA: [],
				itemsB: [],
				lockedA: false,
				lockedB: false,
				acceptedA: false,
				acceptedB: false
			});

			// Open trade window for initiator (this user) - we are side A
			const tradeWindow = new TradeWindowSD({
				tradeId: tradeId,
				localActor: localActor,
				remoteActor: remoteActor,
				isInitiator: true
			});
			tradeWindow.render(true);

			// Open trade window for target user (they are side B)
			console.log(`${MODULE_ID} | Opening trade window for target user`);
			await socket.executeForUsers("openTradeWindow", [remoteOwner.id], {
				tradeId: tradeId,
				localActorId: remoteActor.id,
				remoteActorId: localActor.id,
				isInitiator: false
			});

			ui.notifications.info(game.i18n.localize("SHADOWDARK_EXTRAS.trade.accepted"));
		} else {
			// Trade declined
			ui.notifications.info(game.i18n.format("SHADOWDARK_EXTRAS.trade.declined_by", {
				player: remoteActor.name
			}));
		}

	} catch (error) {
		console.error(`${MODULE_ID} | Error initiating trade:`, error);
		ui.notifications.error(game.i18n.localize("SHADOWDARK_EXTRAS.trade.failed"));
	}
}

/**
 * Show dialog to select player for trading
 * Enhanced with filtering for connected/assigned characters
 * Note: Party actors are excluded from trading - use Transfer to Player for moving items to Party storage
 */
export async function showTradeDialog(localActor) {
	// Get all player characters that are not the source actor and have an active owner
	// Note: Party actors excluded - trading requires another player to accept
	const allPlayers = game.actors.filter(a => {
		if (a.id === localActor.id) return false;
		// Only Player type actors can trade (requires another player)
		if (a.type !== "Player") return false;
		// Check if the actor has any active owner who can trade
		return game.users.some(u => a.testUserPermission(u, "OWNER") && u.id !== game.user.id && u.active);
	});

	if (allPlayers.length === 0) {
		ui.notifications.warn(game.i18n.localize("SHADOWDARK_EXTRAS.trade.no_players"));
		return;
	}

	// Categorize actors
	const connectedAssigned = allPlayers.filter(a => {
		// Check if any connected user (not current user) has this as their assigned character
		return game.users.some(u => u.active && u.id !== game.user.id && u.character?.id === a.id);
	});
	const otherPlayers = allPlayers.filter(a => {
		// Not connected/assigned
		return !game.users.some(u => u.active && u.id !== game.user.id && u.character?.id === a.id);
	});

	// Build options HTML with optgroups and data attributes for searching
	let optionsHtml = '';

	// Connected & Assigned characters
	if (connectedAssigned.length > 0) {
		optionsHtml += `<optgroup label="🟢 Connected Players" data-group="connected">`;
		for (const p of connectedAssigned) {
			const user = game.users.find(u => u.active && u.id !== game.user.id && u.character?.id === p.id);
			const userName = user ? user.name : '';
			const displayUserName = userName ? ` (${userName})` : '';
			const searchText = `${p.name} ${userName}`.toLowerCase();
			optionsHtml += `<option value="${p.id}" data-search="${searchText}">🟢 ${p.name}${displayUserName}</option>`;
		}
		optionsHtml += `</optgroup>`;
	}

	// Other player characters (only shown when filter is unchecked)
	if (otherPlayers.length > 0) {
		optionsHtml += `<optgroup label="⚪ Other Characters" data-group="other">`;
		for (const p of otherPlayers) {
			// Find any owner for search purposes
			const owners = game.users.filter(u => p.testUserPermission(u, "OWNER"));
			const ownerNames = owners.map(u => u.name).join(' ');
			const searchText = `${p.name} ${ownerNames}`.toLowerCase();
			optionsHtml += `<option value="${p.id}" data-search="${searchText}">⚪ ${p.name}</option>`;
		}
		optionsHtml += `</optgroup>`;
	}

	const content = `
		<form>
			<div class="form-group" style="margin-bottom: 8px;">
				<label style="display: flex; align-items: center; gap: 8px;">
					<input type="checkbox" id="sdx-filter-connected" checked />
					Show only connected players
				</label>
			</div>
			<div class="form-group" style="margin-bottom: 8px;">
				<label>Search:</label>
				<input type="text" id="sdx-trade-search" placeholder="Type to filter by name..." 
				       style="width: 100%;" autocomplete="off" />
			</div>
			<div class="form-group">
				<label>${game.i18n.localize("SHADOWDARK_EXTRAS.trade.select_player")}</label>
				<select name="targetActorId" id="sdx-trade-target" style="width: 100%; min-height: 200px;" size="10">
					${optionsHtml}
				</select>
			</div>
		</form>
	`;

	return new Promise((resolve) => {
		const dialog = new foundry.applications.api.DialogV2({
			window: { title: game.i18n.localize("SHADOWDARK_EXTRAS.trade.initiate_title") },
			content,
			buttons: [
				{
					action: "trade",
					icon: "fas fa-exchange-alt",
					label: game.i18n.localize("SHADOWDARK_EXTRAS.trade.start_trade"),
					default: true,
					callback: async (event, button, dlg) => {
						const targetActorId = dlg.element.querySelector('[name="targetActorId"]')?.value;
						const targetActor = game.actors.get(targetActorId);
						if (targetActor) {
							await initiateTradeWithPlayer(localActor, targetActor);
						}
						resolve(true);
					}
				},
				{
					action: "cancel",
					icon: "fas fa-times",
					label: game.i18n.localize("Cancel"),
					callback: () => resolve(false)
				}
			],
			close: () => resolve(false)
		});
		dialog.render({ force: true }).then(() => {
			const root = dialog.element;
			const select = root.querySelector('#sdx-trade-target');
			const filterCheckbox = root.querySelector('#sdx-filter-connected');
			const searchInput = root.querySelector('#sdx-trade-search');

			const updateFilter = () => {
				const showOnlyConnected = !!filterCheckbox?.checked;
				const searchText = (searchInput?.value || "").toLowerCase().trim();

				root.querySelectorAll('#sdx-trade-target optgroup').forEach(group => {
					const groupType = group.dataset.group;
					if (groupType === 'other' && showOnlyConnected) {
						group.hidden = true;
						return;
					}
					let visibleCount = 0;
					group.querySelectorAll('option').forEach(option => {
						const optionSearch = option.dataset.search || '';
						const visible = searchText === '' || optionSearch.includes(searchText);
						option.hidden = !visible;
						if (visible) visibleCount++;
					});
					group.hidden = visibleCount === 0;
				});

				const selected = select?.options[select.selectedIndex];
				if (selected && (selected.hidden || selected.parentElement?.hidden)) {
					const firstVisible = Array.from(select.options).find(o => !o.hidden && !o.parentElement?.hidden);
					if (firstVisible) firstVisible.selected = true;
				}
			};

			updateFilter();
			filterCheckbox?.addEventListener('change', updateFilter);
			searchInput?.addEventListener('input', updateFilter);

			setTimeout(() => searchInput?.focus(), 100);
		});
	});
}
