/**
 * SD 4.x / Foundry v14 compatibility helpers for shadowdark-extras.
 *
 * Surgical helpers used by CombatSettingsSD, shadowdark-extras, FocusSpellTrackerSD,
 * and MysteriousCasting to handle Shadowdark v4.x's restructured chat-message data
 * (`flags.shadowdark.rollConfig`) while preserving v3 fallbacks for any unmigrated
 * worlds.
 *
 * Background:
 *   - SD 4.0.0 (May 2026) replaced `.chat-card` containers + `flags.shadowdark.rolls.main`
 *     with `flags.shadowdark.rollConfig` and typed Roll instances on `message.rolls`.
 *   - Foundry v14 retains MeasuredTemplate during a deprecation window; long-term
 *     migration to Regions is tracked separately (Phase 8 in SD4-COMPAT-SWEEP-PLAN.md).
 *
 * Design notes:
 *   - `readSdRollOutcome` distinguishes "masked" rolls (non-recipient clients of a
 *     whispered roll) from explicit failures via `isMasked` — callers must decide
 *     policy explicitly. Default for actor-mutating side effects: skip silently
 *     on `isMasked: true`.
 *   - `readSdDamageRoll` uses `r.type === "damage"` (NOT `rolls[1]` index — order
 *     is not guaranteed).
 *   - `resolveCardContext` queries both `.item-card` and `.chat-card` for the
 *     legacy DOM path to preserve the multi-selector at shadowdark-extras:16210.
 *   - `getActorStats` checks `system.attributes` first (v4) with fallback to flat
 *     `system.hp` / `system.ac` (v3).
 */

/**
 * Read main-roll outcome (success, total, crit, masking state) from a chat message.
 * Handles both SD 4.x (typed Roll instances on `message.rolls`) and SD 3.x
 * (`flags.shadowdark.rolls.main`) shapes.
 *
 * @param {ChatMessage} message
 * @returns {{
 *   mainRoll: Roll|object|null,
 *   total: number|null,
 *   isSuccess: boolean,
 *   isCriticalSuccess: boolean,
 *   isCriticalFailure: boolean,
 *   isMasked: boolean
 * }}
 */
export function readSdRollOutcome(message) {
	// SD 4.x — find the typed Roll instance carrying the main roll
	const mainRoll = message?.rolls?.find(r => (r.type ?? r.options?.type) === "main");
	if (mainRoll) {
		const opts = mainRoll.options ?? {};
		const naturalDie = mainRoll.dice?.[0]?.total;
		const successKnown = typeof mainRoll.success === "boolean";
		return {
			mainRoll,
			total: typeof mainRoll.total === "number" ? mainRoll.total : null,
			isSuccess: successKnown ? mainRoll.success : false,
			isCriticalSuccess: !!opts.canCritical && typeof naturalDie === "number"
				&& naturalDie >= (opts.criticalSuccessAt ?? 20),
			isCriticalFailure: !!opts.canCritical && typeof naturalDie === "number"
				&& naturalDie <= (opts.criticalFailureAt ?? 1),
			isMasked: !successKnown   // true on non-recipient clients of a whispered roll
		};
	}

	// Legacy SD 3.x fallback
	const legacy = message?.flags?.shadowdark?.rolls?.main;
	if (legacy) {
		const successKnown = typeof legacy.success === "boolean";
		return {
			mainRoll: legacy,
			total: legacy.total ?? legacy.roll?.total ?? null,
			isSuccess: successKnown ? legacy.success : false,
			isCriticalSuccess: legacy.critical === "success",
			isCriticalFailure: legacy.critical === "failure",
			isMasked: !successKnown
		};
	}

	// Neither shape present
	return {
		mainRoll: null,
		total: null,
		isSuccess: false,
		isCriticalSuccess: false,
		isCriticalFailure: false,
		isMasked: false
	};
}

/**
 * Read damage-roll instance + total from a chat message.
 * SD 4.x stores damage as a typed Roll with `type === "damage"`. SD 3.x stored
 * the data under `flags.shadowdark.rolls.damage.roll`.
 *
 * @param {ChatMessage} message
 * @returns {{ roll: Roll|object|null, total: number|null }}
 */
export function readSdDamageRoll(message) {
	// SD 4.x — find the typed damage Roll
	const damageRoll = message?.rolls?.find(r => (r.type ?? r.options?.type) === "damage");
	if (damageRoll) {
		return {
			roll: damageRoll,
			total: typeof damageRoll.total === "number" ? damageRoll.total : null
		};
	}

	// Legacy SD 3.x fallback
	const legacy = message?.flags?.shadowdark?.rolls?.damage?.roll;
	if (legacy) {
		return {
			roll: legacy,
			total: typeof legacy.total === "number" ? legacy.total : null
		};
	}

	return { roll: null, total: null };
}

/**
 * Resolve {actorId, itemId, itemUuid, rollConfig} from a chat message + its DOM.
 * Tries SD 4.x `flags.shadowdark.rollConfig` first (with `itemUuid` OR `cast.spellUuid`),
 * then legacy `.item-card, .chat-card` DOM data, then `message.speaker.actor` as a
 * last-resort fallback (item identification will be null).
 *
 * Callers must tolerate `itemId === null` when only speaker info was available —
 * gate behavior that needs an item explicitly.
 *
 * @param {ChatMessage} message
 * @param {HTMLElement|jQuery} html
 * @returns {{ actorId: string, itemUuid: string|null, itemId: string|null, rollConfig: object|null } | null}
 */
export function resolveCardContext(message, html) {
	// SD 4.x: prefer the rollConfig flag path. Spell casts may carry itemUuid OR cast.spellUuid.
	const rc = message?.flags?.shadowdark?.rollConfig;
	const itemUuid = rc?.itemUuid || rc?.cast?.spellUuid || null;
	const actorId  = rc?.actorId  || message?.speaker?.actor || null;
	if (itemUuid && actorId) {
		return {
			actorId,
			itemUuid,
			itemId: itemUuid.split(".").pop(),
			rollConfig: rc ?? null
		};
	}

	// Legacy SD 3.x DOM lookup — accepts jQuery OR raw HTMLElement.
	// Matches both `.item-card` and `.chat-card` to preserve the multi-selector
	// pattern used at shadowdark-extras.mjs:16210.
	const $html = (html instanceof HTMLElement) ? $(html) : html;
	const $card = $html?.find?.('.item-card, .chat-card');
	const data = $card?.data?.();
	if (data?.actorId && data?.itemId) {
		return {
			actorId: data.actorId,
			itemUuid: null,
			itemId: data.itemId,
			rollConfig: null
		};
	}

	// Last resort: speaker actor only (no item identifier). Callers must tolerate itemId=null.
	if (actorId) {
		return {
			actorId,
			itemUuid: null,
			itemId: null,
			rollConfig: rc ?? null
		};
	}

	return null;
}

/**
 * Read HP / AC values from an actor, handling both v4 and v3 data model paths.
 * v4 stores under `system.attributes.{hp,ac}`; v3 stored flat at `system.{hp,ac}`.
 *
 * Returns null for missing fields rather than throwing — callers can default
 * to 0 / max if needed.
 *
 * @param {Actor} actor
 * @returns {{ hp: number|null, hpMax: number|null, ac: number|null }}
 */
export function getActorStats(actor) {
	if (!actor) return { hp: null, hpMax: null, ac: null };
	const sys = actor.system ?? {};

	// SD 4.x — under system.attributes
	if (sys.attributes) {
		return {
			hp: sys.attributes.hp?.value ?? null,
			hpMax: sys.attributes.hp?.max ?? null,
			ac: sys.attributes.ac?.value ?? null
		};
	}

	// Legacy SD 3.x — flat under system
	return {
		hp: sys.hp?.value ?? null,
		hpMax: sys.hp?.max ?? null,
		ac: sys.ac?.value ?? null
	};
}
