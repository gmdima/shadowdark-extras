/**
 * Diablo-style Trading Window for Shadowdark RPG
 * Uses a shared Journal Entry for state synchronization
 */

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
		context.localItems = localState.items;
		context.remoteItems = remoteState.items;
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
		
		// Check if Item Piles is available
		if (!game.modules.get("item-piles")?.active || !game.itempiles?.API) {
			ui.notifications.error("Item Piles module is required for trading.");
			return;
		}
		
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
				await game.itempiles.API.transferItems(actorA, actorB, itemsA, { interactionId: false });
			}
			
			// Transfer items from B to A
			if (state.itemsB.length > 0) {
				const itemsB = state.itemsB.map(i => ({ _id: i._id, quantity: i.system?.quantity ?? 1 }));
				await game.itempiles.API.transferItems(actorB, actorA, itemsB, { interactionId: false });
			}
			
			// Transfer coins from A to B using Item Piles transferAttributes API
			const coinsA = state.coinsA || { gp: 0, sp: 0, cp: 0 };
			if (coinsA.gp > 0 || coinsA.sp > 0 || coinsA.cp > 0) {
				const attributesA = this._buildCurrencyAttributes(coinsA);
				console.log(`${MODULE_ID} | Transferring currencies from ${actorA.name} to ${actorB.name}:`, attributesA);
				const result = await game.itempiles.API.transferAttributes(actorA, actorB, attributesA, { interactionId: false });
				console.log(`${MODULE_ID} | Currency transfer A->B result:`, result);
			}
			
			// Transfer coins from B to A using Item Piles transferAttributes API
			const coinsB = state.coinsB || { gp: 0, sp: 0, cp: 0 };
			if (coinsB.gp > 0 || coinsB.sp > 0 || coinsB.cp > 0) {
				const attributesB = this._buildCurrencyAttributes(coinsB);
				console.log(`${MODULE_ID} | Transferring currencies from ${actorB.name} to ${actorA.name}:`, attributesB);
				const result = await game.itempiles.API.transferAttributes(actorB, actorA, attributesB, { interactionId: false });
				console.log(`${MODULE_ID} | Currency transfer B->A result:`, result);
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
 * Initialize trade system - hooks for journal updates and chat buttons
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
	
	// Hook into chat message rendering for trade buttons
	Hooks.on("renderChatMessage", (message, html, data) => {
		// Handle trade request message (Accept/Decline buttons)
		// Only show to the target (whisper recipient), not the sender
		const tradeRequestDiv = html.find(".trade-request-message");
		if (tradeRequestDiv.length) {
			const initiatorUserId = html.find(".trade-accept-btn").data("initiatorUser");
			
			// If current user is the initiator (sender), hide the buttons
			if (initiatorUserId === game.user.id) {
				html.find(".trade-request-buttons").html(`<em>${game.i18n.localize("SHADOWDARK_EXTRAS.trade.waiting_for_response")}</em>`);
			} else {
				// Show buttons for the target
				html.find(".trade-accept-btn").on("click", async (event) => {
					event.preventDefault();
					const btn = event.currentTarget;
					const tradeId = btn.dataset.tradeId;
					const initiatorActorId = btn.dataset.initiatorActor;
					const targetActorId = btn.dataset.targetActor;
					
					// Hide buttons immediately in DOM
					html.find(".trade-request-buttons").html(`<div class="trade-request-accepted"><i class="fas fa-check"></i> ${game.i18n.localize("SHADOWDARK_EXTRAS.trade.accepted")}</div>`);
					
					await acceptTradeFromChat(tradeId, initiatorActorId, targetActorId, message.id);
				});
				
				html.find(".trade-decline-btn").on("click", async (event) => {
					event.preventDefault();
					const btn = event.currentTarget;
					const tradeId = btn.dataset.tradeId;
					const initiatorUserId = btn.dataset.initiatorUser;
					
					// Hide buttons immediately in DOM
					html.find(".trade-request-buttons").html(`<div class="trade-request-declined"><i class="fas fa-times"></i> ${game.i18n.localize("SHADOWDARK_EXTRAS.trade.declined")}</div>`);
					
					await declineTradeFromChat(tradeId, initiatorUserId, message.id);
				});
			}
		}
		
		// Handle trade accepted message (Open Trade Window button)
		// Only show to the initiator, not the acceptor who sent it
		const tradeAcceptedDiv = html.find(".trade-accepted-message");
		if (tradeAcceptedDiv.length) {
			const initiatorActorId = html.find(".trade-open-btn").data("initiatorActor");
			const initiatorActor = game.actors.get(initiatorActorId);
			
			// Check if current user owns the initiator actor
			const isInitiator = initiatorActor && initiatorActor.isOwner;
			
			if (!isInitiator) {
				// Hide button for the acceptor (they already have their window open)
				html.find(".trade-request-buttons").html(`<em>${game.i18n.localize("SHADOWDARK_EXTRAS.trade.trade_in_progress")}</em>`);
			} else {
				html.find(".trade-open-btn").on("click", async (event) => {
					event.preventDefault();
					const btn = event.currentTarget;
					const tradeId = btn.dataset.tradeId;
					const initiatorActorId = btn.dataset.initiatorActor;
					const targetActorId = btn.dataset.targetActor;
					
					// Hide button immediately in DOM
					html.find(".trade-request-buttons").html(`<div class="trade-request-accepted"><i class="fas fa-check"></i> ${game.i18n.localize("SHADOWDARK_EXTRAS.trade.window_opened")}</div>`);
					
					await openTradeWindowFromChat(tradeId, initiatorActorId, targetActorId, message.id);
				});
			}
		}
	});
	
	console.log(`${MODULE_ID} | Trade system initialized (journal-based)`);
}

// ============================================
// CHAT BUTTON HANDLERS
// ============================================

/**
 * Accept trade from chat button - opens window for acceptor
 */
async function acceptTradeFromChat(tradeId, initiatorActorId, targetActorId, messageId) {
	const initiatorActor = game.actors.get(initiatorActorId);
	const targetActor = game.actors.get(targetActorId);
	
	if (!initiatorActor || !targetActor) {
		ui.notifications.error("Trade actors not found");
		return;
	}
	
	// Initialize trade state in journal
	await saveTradeData(tradeId, {
		actorAId: initiatorActorId,
		actorBId: targetActorId,
		itemsA: [],
		itemsB: [],
		lockedA: false,
		lockedB: false,
		acceptedA: false,
		acceptedB: false
	});
	
	// Open trade window for acceptor (they are side B)
	const tradeWindow = new TradeWindowSD({
		tradeId: tradeId,
		localActor: targetActor,
		remoteActor: initiatorActor,
		isInitiator: false
	});
	tradeWindow.render(true);
	
	// Find initiator and send them a message
	let initiatorOwner = game.users.find(u => 
		initiatorActor.testUserPermission(u, "OWNER") && 
		u.id !== game.user.id && 
		u.active && 
		!u.isGM
	);
	if (!initiatorOwner) {
		initiatorOwner = game.users.find(u => 
			initiatorActor.testUserPermission(u, "OWNER") && 
			u.id !== game.user.id && 
			u.active
		);
	}
	
	if (initiatorOwner) {
		const acceptMessageContent = `
			<div class="trade-accepted-message" data-trade-id="${tradeId}">
				<h3><i class="fas fa-check-circle"></i> ${game.i18n.localize("SHADOWDARK_EXTRAS.trade.accepted")}</h3>
				<p>${game.i18n.format("SHADOWDARK_EXTRAS.trade.accepted_by_message", { player: targetActor.name })}</p>
				<div class="trade-request-buttons">
					<button type="button" class="trade-open-btn" data-trade-id="${tradeId}" data-initiator-actor="${initiatorActorId}" data-target-actor="${targetActorId}">
						<i class="fas fa-exchange-alt"></i> ${game.i18n.localize("SHADOWDARK_EXTRAS.trade.open_trade_window")}
					</button>
				</div>
			</div>
		`;
		
		await ChatMessage.create({
			content: acceptMessageContent,
			whisper: [initiatorOwner.id],
			speaker: { alias: targetActor.name }
		});
	}
}

/**
 * Decline trade from chat button
 */
async function declineTradeFromChat(tradeId, initiatorUserId, messageId) {
	// Send decline message to initiator
	const declineMessageContent = `
		<div class="trade-declined-message">
			<p><i class="fas fa-times-circle"></i> ${game.i18n.format("SHADOWDARK_EXTRAS.trade.declined_by", { player: game.user.name })}</p>
		</div>
	`;
	
	await ChatMessage.create({
		content: declineMessageContent,
		whisper: [initiatorUserId],
		speaker: { alias: game.user.name }
	});
	
	ui.notifications.info(game.i18n.localize("SHADOWDARK_EXTRAS.trade.you_declined"));
}

/**
 * Open trade window from chat button (for initiator after acceptance)
 */
async function openTradeWindowFromChat(tradeId, initiatorActorId, targetActorId, messageId) {
	const initiatorActor = game.actors.get(initiatorActorId);
	const targetActor = game.actors.get(targetActorId);
	
	if (!initiatorActor || !targetActor) {
		ui.notifications.error("Trade actors not found");
		return;
	}
	
	// Check if window already exists
	let tradeWindow = activeTrades.get(tradeId);
	if (!tradeWindow) {
		tradeWindow = new TradeWindowSD({
			tradeId: tradeId,
			localActor: initiatorActor,
			remoteActor: targetActor,
			isInitiator: true
		});
	}
	tradeWindow.render(true);
}

// ============================================
// TRADE INITIATION
// ============================================

/**
 * Initiate a trade with another player
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
	
	// Send trade request via whispered chat message
	const messageContent = `
		<div class="trade-request-message" data-trade-id="${tradeId}">
			<h3><i class="fas fa-exchange-alt"></i> ${game.i18n.localize("SHADOWDARK_EXTRAS.trade.request_title")}</h3>
			<p>${game.i18n.format("SHADOWDARK_EXTRAS.trade.request_message", { player: localActor.name })}</p>
			<div class="trade-request-buttons">
				<button type="button" class="trade-accept-btn" data-trade-id="${tradeId}" data-initiator-user="${game.user.id}" data-initiator-actor="${localActor.id}" data-target-actor="${remoteActor.id}">
					<i class="fas fa-check"></i> ${game.i18n.localize("SHADOWDARK_EXTRAS.trade.accept")}
				</button>
				<button type="button" class="trade-decline-btn" data-trade-id="${tradeId}" data-initiator-user="${game.user.id}">
					<i class="fas fa-times"></i> ${game.i18n.localize("SHADOWDARK_EXTRAS.trade.decline")}
				</button>
			</div>
		</div>
	`;
	
	await ChatMessage.create({
		content: messageContent,
		whisper: [remoteOwner.id],
		speaker: { alias: localActor.name }
	});
	
	ui.notifications.info(game.i18n.format("SHADOWDARK_EXTRAS.trade.request_sent", {
		player: remoteActor.name
	}));
}

/**
 * Show dialog to select player for trading
 */
export async function showTradeDialog(localActor) {
	const players = game.actors.filter(a => {
		if (a.type !== "Player" || a.id === localActor.id) return false;
		return game.users.some(u => a.testUserPermission(u, "OWNER") && u.id !== game.user.id && u.active);
	});
	
	if (players.length === 0) {
		ui.notifications.warn(game.i18n.localize("SHADOWDARK_EXTRAS.trade.no_players"));
		return;
	}
	
	const options = players.map(p => `<option value="${p.id}">${p.name}</option>`).join("");
	
	const content = `
		<form>
			<div class="form-group">
				<label>${game.i18n.localize("SHADOWDARK_EXTRAS.trade.select_player")}</label>
				<select name="targetActorId" style="width: 100%;">
					${options}
				</select>
			</div>
		</form>
	`;
	
	return new Promise((resolve) => {
		new Dialog({
			title: game.i18n.localize("SHADOWDARK_EXTRAS.trade.initiate_title"),
			content: content,
			buttons: {
				trade: {
					icon: '<i class="fas fa-exchange-alt"></i>',
					label: game.i18n.localize("SHADOWDARK_EXTRAS.trade.start_trade"),
					callback: async (html) => {
						const targetActorId = html.find('[name="targetActorId"]').val();
						const targetActor = game.actors.get(targetActorId);
						if (targetActor) {
							await initiateTradeWithPlayer(localActor, targetActor);
						}
						resolve(true);
					}
				},
				cancel: {
					icon: '<i class="fas fa-times"></i>',
					label: game.i18n.localize("Cancel"),
					callback: () => resolve(false)
				}
			},
			default: "trade"
		}).render(true);
	});
}
