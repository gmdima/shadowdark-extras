/**
 * GM display patch for unidentified items.
 *
 * When system.identification.identified === false:
 *   item.name                    = unidentified name ("Unidentified Armor")
 *   system.identification.name   = real/identified name ("Chainmail +1")
 *
 * GMs see:  Unidentified Armor (Chainmail +1)
 * Players see the plain unidentified name as usual.
 */

export function initUnidentifiedGMDisplay() {
    Hooks.on("renderActorSheet", _patchActorSheet);
    Hooks.on("renderItemDirectory", _patchItemDirectory);
    Hooks.on("renderCompendiumDirectory", _patchCompendiumDirectory);
    Hooks.on("renderCompendium", _patchCompendiumDirectory); // v12 compat alias
}

// ─── Helpers ─────────────────────────────────────────────────────────

function _isSystemUnidentified(item) {
    return item?.system?.identification?.identified === false;
}

function _gmName(unidentifiedName, realName) {
    return realName?.trim()
        ? `${unidentifiedName} (${realName})`
        : unidentifiedName;
}

/** Normalise the html argument to a plain HTMLElement regardless of Foundry version. */
function _root(html) {
    if (html instanceof HTMLElement) return html;
    if (html?.[0] instanceof HTMLElement) return html[0]; // jQuery
    return html;
}

/**
 * Replace only the text content of an element, preserving any child icon nodes
 * (e.g. <i class="fas …">) that live alongside the text.
 */
function _setNameText(el, text) {
    const textNode = [...el.childNodes].find(n => n.nodeType === Node.TEXT_NODE);
    if (textNode) {
        textNode.textContent = text;
    } else {
        el.textContent = text;
    }
}

// ─── Actor sheet ─────────────────────────────────────────────────────

function _patchActorSheet(app, html) {
    if (!game.user.isGM) return;
    const actor = app.actor ?? app.document;
    if (!actor?.items) return;

    _root(html).querySelectorAll("[data-item-id]").forEach(el => {
        const item = actor.items.get(el.dataset.itemId);
        if (!item || !_isSystemUnidentified(item)) return;

        // Shadowdark inventory rows: name sits in an <h4> inside .item-name,
        // or directly in .item-name.  Try the most specific selector first.
        const nameEl =
            el.querySelector(".item-name h4") ??
            el.querySelector("h4.item-name") ??
            el.querySelector(".item-name") ??
            el.querySelector("h4");
        if (!nameEl) return;

        _setNameText(nameEl, _gmName(item.name, item.system.identification.name));
    });
}

// ─── Item sidebar directory ───────────────────────────────────────────

function _patchItemDirectory(app, html) {
    if (!game.user.isGM) return;

    _root(html).querySelectorAll(".directory-item[data-document-id]").forEach(el => {
        const item = game.items.get(el.dataset.documentId);
        if (!item || !_isSystemUnidentified(item)) return;

        const nameEl = el.querySelector(".document-name") ?? el.querySelector(".entry-name");
        if (!nameEl) return;

        _setNameText(nameEl, _gmName(item.name, item.system.identification.name));
    });
}

// ─── Compendium browser ───────────────────────────────────────────────

function _patchCompendiumDirectory(app, html) {
    if (!game.user.isGM) return;

    const pack = app.collection ?? app.compendium;
    if (!pack) return;

    _root(html).querySelectorAll("[data-document-id]").forEach(el => {
        const docId = el.dataset.documentId;
        if (!docId) return;

        const entry = pack.index?.get(docId);
        if (!entry) return;

        // system.identification may not be indexed — skip gracefully if absent
        if (entry.system?.identification?.identified !== false) return;

        const nameEl = el.querySelector(".document-name") ?? el.querySelector(".entry-name");
        if (!nameEl) return;

        _setNameText(nameEl, _gmName(entry.name, entry.system.identification.name));
    });
}
