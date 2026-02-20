

const MODULE_ID = "shadowdark-extras";

/**
 * Register the journal narration setting
 */
function registerSettings() {
    game.settings.register(MODULE_ID, "enableJournalNarration", {
        name: game.i18n.localize("SHADOWDARK_EXTRAS.settings.enable_journal_narration.name"),
        hint: game.i18n.localize("SHADOWDARK_EXTRAS.settings.enable_journal_narration.hint"),
        scope: "world",
        config: true,
        type: Boolean,
        default: true,
        requiresReload: false
    });
}

/**
 * Check if the journal narration feature is enabled
 * @returns {boolean}
 */
function isEnabled() {
    return game.settings.get(MODULE_ID, "enableJournalNarration");
}

/**
 * Add toolbar with narration button to blockquotes in journal pages
 * @param {HTMLElement} html - The journal page HTML element
 */
function addToolbarToBlockquotes(html) {
    // Search for blockquotes in journal-page-content
    let blockquotes = html.querySelectorAll(".journal-page-content blockquote");

    // Fallback: search for any blockquotes
    if (blockquotes.length === 0) {
        blockquotes = html.querySelectorAll("blockquote");
    }

    blockquotes.forEach((blockquote) => {
        // Skip if toolbar already exists
        if (blockquote.querySelector('.sdx-journal-buttons-wrapper')) {
            return;
        }

        // Create toolbar wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'sdx-journal-buttons-wrapper';

        const container = document.createElement('div');
        container.className = 'sdx-journal-buttons-container';

        // Create narration button
        const narrationButton = document.createElement('button');
        narrationButton.className = 'sdx-journal-narration-button';
        narrationButton.type = 'button';
        narrationButton.title = game.i18n.localize("SHADOWDARK_EXTRAS.journal_narration.button_title");
        narrationButton.innerHTML = '<i class="fa-solid fa-masks-theater"></i>';

        // Add click handler
        narrationButton.addEventListener('click', () => {
            sendNarrationToChat(blockquote);
        });

        container.appendChild(narrationButton);
        wrapper.appendChild(container);
        blockquote.appendChild(wrapper);
    });
}

/**
 * Send blockquote content to chat as a narration message
 * @param {HTMLElement} blockquote - The blockquote element
 */
function sendNarrationToChat(blockquote) {
    // Clone blockquote and remove toolbar wrapper
    const cloneWithoutButtons = blockquote.cloneNode(true);
    const toolbarWrapper = cloneWithoutButtons.querySelector('.sdx-journal-buttons-wrapper');
    if (toolbarWrapper) {
        toolbarWrapper.remove();
    }

    // Build the chat content with custom wrapper class for styling
    const content = `<div class="sdx-narration-card"><blockquote>${cloneWithoutButtons.innerHTML}</blockquote></div>`;

    const chatData = {
        user: game.user.id,
        content: content,
        speaker: { alias: game.i18n.localize("SHADOWDARK_EXTRAS.journal_narration.speaker_alias") || "Narration" }
    };

    ChatMessage.create(chatData, {});

    // Optional: Play a sound effect if available
    // This can be expanded later if desired
}

/**
 * Debounce function to limit call frequency
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in ms
 * @returns {Function}
 */
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

/**
 * Initialize the journal narration feature
 * Call this from the main module's init hook
 */
export function initJournalNarration() {
    // Register settings
    Hooks.once("init", () => {
        registerSettings();
    });

    // Register the journal page sheet hook
    Hooks.on("renderJournalPageSheet", (journalPageSheet, html, data) => {
        // Check if feature is enabled
        if (!isEnabled()) return;

        // Convert jQuery to native DOM if needed (for v12/v13 compatibility)
        let nativeHtml = html;
        if (html && (html.jquery || typeof html.find === 'function')) {
            nativeHtml = html[0] || html.get?.(0) || html;
        }

        // Check if we're in edit mode - don't add toolbar if editing
        const editor = nativeHtml.querySelector('.editor');
        if (editor !== null) {
            return;
        }

        // Only allow GMs to see the narration button
        if (!game.user.isGM) {
            return;
        }

        // Add toolbar to blockquotes
        addToolbarToBlockquotes(nativeHtml);

        // Set up MutationObserver to handle dynamic content updates
        const debouncedAdd = debounce(() => {
            const isCurrentlyEditing = nativeHtml.querySelector('.editor') !== null;
            if (!isCurrentlyEditing) {
                addToolbarToBlockquotes(nativeHtml);
            }
        }, 100);

        const observer = new MutationObserver(debouncedAdd);
        observer.observe(nativeHtml, { childList: true, subtree: true });
    });

    // Also observe document for journal sheets opening (fallback for v13)
    Hooks.once("ready", () => {
        const checkJournalSheets = debounce(() => {
            if (!isEnabled()) return;
            if (!game.user.isGM) return;

            const journalSheets = document.querySelectorAll('.journal-sheet.journal-entry');
            journalSheets.forEach((sheet) => {
                const editor = sheet.querySelector('.editor');
                if (editor) return;

                const blockquotes = sheet.querySelectorAll('.journal-page-content blockquote, blockquote');
                const hasToolbar = Array.from(blockquotes).some(bq => bq.querySelector('.sdx-journal-buttons-wrapper'));

                if (blockquotes.length > 0 && !hasToolbar) {
                    addToolbarToBlockquotes(sheet);
                }
            });
        }, 200);

        // Set up a global observer for journal sheets
        const globalObserver = new MutationObserver(checkJournalSheets);
        globalObserver.observe(document.body, { childList: true, subtree: true });

        // Check immediately for existing journal sheets
        checkJournalSheets();
    });
}
