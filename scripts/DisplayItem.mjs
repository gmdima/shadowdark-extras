/**
 * Display Item Card Enricher for Shadowdark Extras
 * 
 * Allows journal pages to display styled item cards using:
 * @DisplayItemCard[Item.UUID]{Display Name}
 * 
 * Supports different item types: Weapon, Armor, Spell, and generic items.
 */

const MODULE_ID = "shadowdark-extras";

/**
 * Parse the brackets content to extract UUID and optional flags
 * @param {String} match - The part between brackets
 * @returns {Object} Contains uuid and flag booleans
 */
function parseMatch(match) {
    const words = match.split(" ");
    let result = {};
    if (words.length) {
        result.uuid = words[0];
    }
    for (let i = 1; i < words.length; i++) {
        result[words[i]] = true;
    }
    return result;
}

/**
 * Get an item from a UUID
 * @param {String} uuid - The item UUID
 * @returns {Item|null} The item document or null
 */
async function getItemFromUUID(uuid) {
    try {
        let item = fromUuidSync(uuid);
        if (!item) {
            item = await fromUuid(uuid);
        }
        return item;
    } catch (e) {
        console.warn(`SDX DisplayItemCard: Could not find item for UUID: ${uuid}`);
        return null;
    }
}

/**
 * Format cost display
 * @param {Object} cost - The cost object with gp, sp, cp
 * @returns {String} Formatted cost string
 */
function formatCost(cost) {
    if (!cost) return "";
    const parts = [];
    if (cost.gp > 0) parts.push(`${cost.gp} gp`);
    if (cost.sp > 0) parts.push(`${cost.sp} sp`);
    if (cost.cp > 0) parts.push(`${cost.cp} cp`);
    return parts.join(", ") || "—";
}

/**
 * Get range label
 * @param {String} rangeKey - The range key
 * @returns {String} Localized range string
 */
function getRangeLabel(rangeKey) {
    const rangeLabels = {
        "close": "Close",
        "near": "Near",
        "far": "Far",
        "doubleNear": "Double Near",
        "tripleNear": "Triple Near",
        "self": "Self"
    };
    return rangeLabels[rangeKey] || rangeKey || "—";
}

/**
 * Format modifier display string
 * @param {number|string} mod - The modifier value
 * @returns {string} Formatted modifier (e.g., "+2" or "-1")
 */
function formatModifier(mod) {
    const num = parseInt(mod);
    if (isNaN(num)) return "";
    if (num === 0) return "";
    return num >= 0 ? `+${num}` : `${num}`;
}

/**
 * Build weapon-specific stats HTML
 * @param {Item} item - The weapon item
 * @returns {String} HTML string
 */
function buildWeaponStatsHtml(item) {
    const system = item.system;

    // Damage
    const oneHanded = system.damage?.oneHanded || "";
    const twoHanded = system.damage?.twoHanded || "";
    let damageStr = "";
    if (oneHanded && twoHanded) {
        damageStr = `${oneHanded}/${twoHanded}`;
    } else if (twoHanded) {
        damageStr = twoHanded;
    } else if (oneHanded) {
        damageStr = oneHanded;
    }

    // Bonuses
    const atkBonus = formatModifier(system.bonuses?.attackBonus || system.attackBonus);
    const dmgBonus = formatModifier(system.bonuses?.damageBonus);

    // Range and Type
    const range = getRangeLabel(system.range);
    const weaponType = system.type === "melee" ? "Melee" : system.type === "ranged" ? "Ranged" : system.type || "";

    // Base weapon
    const baseWeapon = system.baseWeapon ? system.baseWeapon.charAt(0).toUpperCase() + system.baseWeapon.slice(1).replace(/([A-Z])/g, ' $1') : "";

    // Slots
    const slots = system.slots?.slots_used || 1;

    let html = `<div class="sdx-item-stats-grid sdx-item-weapon-grid">`;

    // Row 1: Damage, Attack Bonus
    if (damageStr) {
        html += `<div class="sdx-item-stat">
            <span class="sdx-item-stat-label">Damage</span>
            <span class="sdx-item-stat-value">${damageStr}${dmgBonus}</span>
        </div>`;
    }
    if (atkBonus) {
        html += `<div class="sdx-item-stat">
            <span class="sdx-item-stat-label">Attack</span>
            <span class="sdx-item-stat-value">${atkBonus}</span>
        </div>`;
    }

    // Row 2: Range, Type
    html += `<div class="sdx-item-stat">
        <span class="sdx-item-stat-label">Range</span>
        <span class="sdx-item-stat-value">${range}</span>
    </div>`;
    html += `<div class="sdx-item-stat">
        <span class="sdx-item-stat-label">Type</span>
        <span class="sdx-item-stat-value">${weaponType}</span>
    </div>`;

    // Row 3: Slots, Base
    html += `<div class="sdx-item-stat">
        <span class="sdx-item-stat-label">Slots</span>
        <span class="sdx-item-stat-value">${slots}</span>
    </div>`;
    if (baseWeapon) {
        html += `<div class="sdx-item-stat">
            <span class="sdx-item-stat-label">Base</span>
            <span class="sdx-item-stat-value">${baseWeapon}</span>
        </div>`;
    }

    html += `</div>`;
    return html;
}

/**
 * Build armor-specific stats HTML
 * @param {Item} item - The armor item
 * @returns {String} HTML string
 */
function buildArmorStatsHtml(item) {
    const system = item.system;

    // AC
    const acBase = system.ac?.base ?? "—";
    const acAttr = system.ac?.attribute ? system.ac.attribute.toUpperCase() : "";
    const acModifier = system.ac?.modifier || 0;

    // Cost
    const cost = formatCost(system.cost);

    // Slots
    const slots = system.slots?.slots_used || 1;

    let html = `<div class="sdx-item-stats-grid sdx-item-armor-grid">`;

    html += `<div class="sdx-item-stat">
        <span class="sdx-item-stat-label">AC</span>
        <span class="sdx-item-stat-value">${acBase}${acModifier ? ` (${formatModifier(acModifier)})` : ""}</span>
    </div>`;

    if (acAttr) {
        html += `<div class="sdx-item-stat">
            <span class="sdx-item-stat-label">Attribute</span>
            <span class="sdx-item-stat-value">${acAttr}</span>
        </div>`;
    }

    html += `<div class="sdx-item-stat">
        <span class="sdx-item-stat-label">Slots</span>
        <span class="sdx-item-stat-value">${slots}</span>
    </div>`;

    html += `<div class="sdx-item-stat">
        <span class="sdx-item-stat-label">Cost</span>
        <span class="sdx-item-stat-value">${cost}</span>
    </div>`;

    html += `</div>`;
    return html;
}

/**
 * Build spell-specific stats HTML
 * @param {Item} item - The spell item
 * @returns {String} HTML string
 */
function buildSpellStatsHtml(item) {
    const system = item.system;

    // Tier
    const tier = system.tier ?? "—";

    // Duration
    let durationStr = "—";
    if (system.duration) {
        const durType = system.duration.type || "";
        const durValue = system.duration.value || "";
        if (durType === "instant") {
            durationStr = "Instant";
        } else if (durType === "focus") {
            durationStr = "Focus";
        } else if (durValue) {
            const typeLabel = durType === "rounds" ? "rounds" : durType === "realTime" ? "real time" : durType;
            durationStr = `${durValue} ${typeLabel}`;
        }
    }

    // Range
    const range = getRangeLabel(system.range);

    let html = `<div class="sdx-item-stats-grid sdx-item-spell-grid">`;

    html += `<div class="sdx-item-stat">
        <span class="sdx-item-stat-label">Tier</span>
        <span class="sdx-item-stat-value">${tier}</span>
    </div>`;

    html += `<div class="sdx-item-stat">
        <span class="sdx-item-stat-label">Duration</span>
        <span class="sdx-item-stat-value">${durationStr}</span>
    </div>`;

    html += `<div class="sdx-item-stat">
        <span class="sdx-item-stat-label">Range</span>
        <span class="sdx-item-stat-value">${range}</span>
    </div>`;

    html += `</div>`;
    return html;
}

/**
 * Build description section
 * @param {Item} item - The item
 * @returns {String} HTML string for description
 */
async function buildDescriptionHtml(item) {
    const description = item.system.description ?? "";
    if (!description || description.trim() === "") return "";

    const enrichedDesc = await TextEditor.enrichHTML(description, { async: true });

    return `<div class="sdx-item-description">
        ${enrichedDesc}
    </div>`;
}

/**
 * Get item type label
 * @param {String} type - The item type
 * @returns {String} Display label
 */
function getItemTypeLabel(type) {
    const labels = {
        "Weapon": "Weapon",
        "Armor": "Armor",
        "Spell": "Spell",
        "Scroll": "Scroll",
        "Wand": "Wand",
        "Potion": "Potion",
        "Basic": "Item",
        "Gem": "Gem",
        "Talent": "Talent",
        "Ancestry": "Ancestry",
        "Class": "Class",
        "Language": "Language",
        "Deity": "Deity",
        "Class Ability": "Class Ability",
        "Boon": "Boon",
        "Property": "Property",
        "Effect": "Effect"
    };
    return labels[type] || type || "Item";
}

/**
 * Main enricher function for @DisplayItemCard
 * @param {RegExpMatchArray} match - The regex match array
 * @param {Object} _options - Enricher options
 * @returns {HTMLElement} The rendered element
 */
export async function enrichDisplayItemCard(match, _options) {
    const parsedMatch = parseMatch(match[1]);
    const item = await getItemFromUUID(parsedMatch.uuid);
    const itemName = match[2] ?? item?.name;

    const container = document.createElement("div");
    container.classList.add("sdx-display-item-container");

    if (item) {
        const itemType = item.type;
        const typeLabel = getItemTypeLabel(itemType);
        const isMagic = item.system.magicItem ?? false;

        // Build title content - linked or named
        let titleContent;
        if (parsedMatch.named) {
            titleContent = `<span class="sdx-item-name">${itemName}</span>`;
        } else {
            titleContent = `@UUID[${item.uuid}]{${itemName}}`;
        }

        // Add magic indicator if applicable
        const magicClass = isMagic ? " sdx-item-magic" : "";

        // Build type-specific stats
        let statsHtml = "";
        if (itemType === "Weapon") {
            statsHtml = buildWeaponStatsHtml(item);
            container.classList.add("sdx-display-item-weapon");
        } else if (itemType === "Armor") {
            statsHtml = buildArmorStatsHtml(item);
            container.classList.add("sdx-display-item-armor");
        } else if (itemType === "Spell" || itemType === "Scroll" || itemType === "Wand") {
            statsHtml = buildSpellStatsHtml(item);
            container.classList.add("sdx-display-item-spell");
        }

        // Description
        const descriptionHtml = await buildDescriptionHtml(item);

        let html = `
        <div class="sdx-display-item${magicClass}" data-item-uuid="${item.uuid}">
            <div class="sdx-item-header">
                <div class="sdx-item-title">${titleContent}</div>
                <div class="sdx-item-type">${typeLabel}</div>
            </div>
            ${statsHtml}
            ${descriptionHtml}
        </div>`;

        container.innerHTML = await TextEditor.enrichHTML(html, { async: true });
    } else {
        // Broken link fallback
        container.dataset.itemId = parsedMatch.uuid;
        if (match[2]) container.dataset.itemName = match[2];
        container.classList.add("content-link", "broken");
        container.innerHTML = `<i class="fas fa-unlink"></i> ${itemName ?? "Unknown Item"}`;
    }

    return container;
}

/**
 * Register the DisplayItemCard enricher with Foundry
 */
export function registerDisplayItemEnricher() {
    CONFIG.TextEditor.enrichers.push({
        pattern: /@DisplayItemCard\[(.+?)\](?:\{(.+?)\})?/gm,
        enricher: enrichDisplayItemCard
    });

    console.log("SDX | Registered DisplayItemCard enricher");
}
