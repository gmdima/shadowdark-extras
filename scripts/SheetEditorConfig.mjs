/**
 * Sheet Editor Configuration Dialog
 * AppV2 dialog for configuring player sheet visual styles with live preview
 */

const MODULE_ID = "shadowdark-extras";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Default style values (Dark theme - matches dark mode)
 */
const DEFAULTS = {
    sheetBorderStyle: "skulls.png",
    abilityPanelStyle: "skulls.png",
    acPanelStyle: "round1.png",
    statPanelStyle: "round1.png",
    borderImageWidth: 15,
    borderImageSlice: 80,
    borderImageOutset: 1,
    borderImageRepeat: "repeat",
    borderBackgroundColor: "",
    sheetHeaderBackgroundColor: "#000000",
    borderWidth: 10,
    sdBoxBorderStyle: "stat.png",
    sdBoxBorderWidth: 1,
    sdBoxBorderSlice: 71,
    sdBoxBorderTransparencyWidth: 10,
    // Journal border settings
    journalBorderStyle: "stat.png",
    journalBorderImageWidth: 24,
    journalBorderImageSlice: 200,
    journalBorderImageOutset: 0,
    journalBorderImageRepeat: "repeat",
    abilityModColor: "#ffffff",
    levelValueColor: "#ffffff",
    acValueColor: "#ffffff",
    initModColor: "#ffffff",
    luckValueColor: "#ffffff",
    tabGradientStart: "#000000",
    tabGradientEnd: "#2f2b2b",
    // Condition Modal border settings
    conditionModalBorderStyle: "panel-border-004.png",
    conditionModalBorderImageWidth: 16,
    conditionModalBorderImageSlice: 12,
    conditionModalBorderImageOutset: 0,
    conditionModalBorderImageRepeat: "repeat",
    // Extended Text Color Settings
    navLinkColor: "#ffffff",
    navLinkActiveColor: "#ffffff",
    detailsRowColor: "#ffffff",
    luckContainerColor: "#ffffff",
    actorNameColor: "#ffffff",
    windowHeaderColor: "#ffffff",
    navBackgroundColor: "#131010",
    navBorderColor: "rgba(0, 0, 0, 0.5)",
    effectsTextColor: "#ffffff",
    talentsTextColor: "#ffffff",
    xpRowColor: "#ffffff",
    windowTitleBarBackgroundColor: "#000000",
    statsLabelColor: "#ffffff",
    actorNameShadowColor: "#000000",
    actorNameShadowAlpha: 0.8,
    actorNameFontWeight: "bold"
};

/**
 * Configuration dialog for sheet visual styles
 */
export default class SheetEditorConfig extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "sheet-editor-config",
        classes: ["shadowdark", "shadowdark-extras", "sheet-editor-config"],
        tag: "div",
        window: {
            frame: true,
            positioned: true,
            title: "Sheet Style Editor",
            icon: "fas fa-paint-brush",
            resizable: false,
            minimizable: false
        },
        position: {
            width: 700,
            height: "auto"
        },
        actions: {
            save: SheetEditorConfig.#onSave,
            cancel: SheetEditorConfig.#onCancel,
            loadDefaults: SheetEditorConfig.#onLoadDefaults,
            exportTheme: SheetEditorConfig.#onExportTheme,
            importTheme: SheetEditorConfig.#onImportTheme
        }
    };

    static PARTS = {
        form: {
            template: `modules/${MODULE_ID}/templates/sheet-editor-config.hbs`
        }
    };

    constructor(options = {}) {
        super(options);
        // Store original values (to revert on cancel)
        this._originalState = {};
        for (const key of Object.keys(DEFAULTS)) {
            this._originalState[key] = game.settings.get(MODULE_ID, key);
        }
        // Store current preview state (separate from saved settings)
        this._previewState = { ...this._originalState };
    }

    get title() {
        return game.i18n.localize("SHADOWDARK_EXTRAS.sheetEditor.title");
    }

    /**
     * Scan a folder for panel images
     */
    async _scanPanelImages(folderPath, prefix) {
        const images = [];
        try {
            const response = await FilePicker.browse("data", folderPath);
            for (const file of response.files) {
                const filename = file.split('/').pop();
                if (filename.endsWith('.png') || filename.endsWith('.webp')) {
                    // Extract number from filename for display
                    const match = filename.match(/(\d+)/);
                    const num = match ? parseInt(match[1]) : 0;
                    images.push({
                        path: file,
                        filename: filename,
                        name: `Style ${num}`,
                        number: num
                    });
                }
            }
            // Sort by number
            images.sort((a, b) => a.number - b.number);
        } catch (err) {
            console.warn(`${MODULE_ID} | Failed to scan ${folderPath}:`, err);
        }
        return images;
    }

    async _prepareContext(options) {
        const context = await super._prepareContext(options);

        // Scan all image folders
        const basePath = `modules/${MODULE_ID}/art/PNG/Default`;

        const [borderImages, panelImages, transparentImages] = await Promise.all([
            this._scanPanelImages(`${basePath}/Border`, "panel-border"),
            this._scanPanelImages(`${basePath}/Panel`, "panel"),
            this._scanPanelImages(`${basePath}/Transparent center`, "panel-transparent-center")
        ]);

        context.borderImages = borderImages;
        context.panelImages = panelImages;
        context.transparentImages = transparentImages;

        // Spread all preview state into context for the template
        Object.assign(context, this._previewState);

        // Paths for current image selections
        context.borderPath = `/${basePath}/Border/${this._previewState.sheetBorderStyle}`;
        context.abilityPath = `/${basePath}/Panel/${this._previewState.abilityPanelStyle}`;
        context.acPath = `/${basePath}/Transparent center/${this._previewState.acPanelStyle}`;
        context.statPath = `/${basePath}/Transparent center/${this._previewState.statPanelStyle}`;
        context.boxBorderPath = `/${basePath}/Border/${this._previewState.sdBoxBorderStyle}`;
        context.journalBorderPath = `/${basePath}/Border/${this._previewState.journalBorderStyle}`;
        context.conditionModalBorderPath = `/${basePath}/Border/${this._previewState.conditionModalBorderStyle}`;

        context.defaults = DEFAULTS;

        return context;
    }

    _onRender(context, options) {
        super._onRender(context, options);
        const html = this.element;

        // Apply initial preview styles
        this._updatePreview();

        // Category header click to expand/collapse
        const categoryHeaders = html.querySelectorAll('.sheet-editor-category-header');
        categoryHeaders.forEach(header => {
            header.addEventListener('click', () => {
                const category = header.closest('.sheet-editor-category');
                const grid = category.querySelector('.sheet-editor-grid');
                const toggle = header.querySelector('.category-toggle');
                const icon = header.querySelector('.category-icon');

                const isExpanded = grid.style.display !== 'none';
                grid.style.display = isExpanded ? 'none' : 'grid';
                toggle?.classList.toggle('fa-chevron-right', isExpanded);
                toggle?.classList.toggle('fa-chevron-down', !isExpanded);
                icon?.classList.toggle('fa-folder', isExpanded);
                icon?.classList.toggle('fa-folder-open', !isExpanded);
            });
        });

        // Thumbnail click to select
        const thumbs = html.querySelectorAll('.sheet-editor-thumb');
        thumbs.forEach(thumb => {
            thumb.addEventListener('click', () => {
                const settingKey = thumb.dataset.setting;
                const filename = thumb.dataset.filename;
                const category = thumb.closest('.sheet-editor-category');

                // Remove previous selection in this category
                category.querySelectorAll('.sheet-editor-thumb.selected').forEach(t => t.classList.remove('selected'));
                thumb.classList.add('selected');

                // Update preview state
                this._previewState[settingKey] = filename;

                // Update preview immediately
                this._updatePreview();
            });
        });

        // Search filters
        const searchInputs = html.querySelectorAll('.sheet-editor-filter');
        searchInputs.forEach(input => {
            input.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase().trim();
                const category = input.closest('.sheet-editor-category');
                const grid = category.querySelector('.sheet-editor-grid');
                const thumbs = grid.querySelectorAll('.sheet-editor-thumb');

                thumbs.forEach(thumb => {
                    const name = thumb.dataset.name?.toLowerCase() || '';
                    const matches = !query || name.includes(query);
                    thumb.style.display = matches ? '' : 'none';
                });

                // Auto-expand when searching
                if (query) {
                    grid.style.display = 'grid';
                    const toggle = category.querySelector('.category-toggle');
                    const icon = category.querySelector('.category-icon');
                    toggle?.classList.remove('fa-chevron-right');
                    toggle?.classList.add('fa-chevron-down');
                    icon?.classList.remove('fa-folder');
                    icon?.classList.add('fa-folder-open');
                }
            });
        });

        // Hover preview tooltip
        thumbs.forEach(thumb => {
            thumb.addEventListener('mouseenter', (e) => {
                let tooltip = document.getElementById('sheet-editor-tooltip');
                if (!tooltip) {
                    tooltip = document.createElement('div');
                    tooltip.id = 'sheet-editor-tooltip';
                    tooltip.className = 'sheet-editor-tooltip';
                    document.body.appendChild(tooltip);
                }

                const path = thumb.dataset.path;
                const name = thumb.dataset.name;
                tooltip.innerHTML = `
					<img src="${path}" alt="${name}">
					<span>${name}</span>
				`;
                tooltip.style.display = 'block';

                const rect = thumb.getBoundingClientRect();
                tooltip.style.left = `${rect.right + 10}px`;
                tooltip.style.top = `${rect.top}px`;
            });

            thumb.addEventListener('mouseleave', () => {
                const tooltip = document.getElementById('sheet-editor-tooltip');
                if (tooltip) tooltip.style.display = 'none';
            });
        });

        // Frame tweak inputs (number, select, color)
        const frameInputs = html.querySelectorAll('.frame-controls input, .frame-controls select, .box-frame-controls input');
        frameInputs.forEach(input => {
            input.addEventListener('input', (e) => {
                const settingKey = input.dataset.setting;
                let value;
                if (input.type === 'number') {
                    value = parseInt(e.target.value) || 0;
                } else {
                    value = e.target.value;
                }

                // Update preview state
                this._previewState[settingKey] = value;

                // Update preview immediately
                this._updatePreview();
            });

            // Also handle change event for select elements
            if (input.tagName === 'SELECT') {
                input.addEventListener('change', (e) => {
                    const settingKey = input.dataset.setting;
                    this._previewState[settingKey] = e.target.value;
                    this._updatePreview();
                });
            }
        });
    }

    _updatePreview() {
        const html = this.element;
        if (!html) return;

        const basePath = `/modules/${MODULE_ID}/art/PNG/Default`;

        // Update preview CSS variables on the preview element
        const preview = html.querySelector('.sheet-editor-preview');
        if (preview) {
            preview.style.setProperty('--preview-border', `url('${basePath}/Border/${this._previewState.sheetBorderStyle}')`);
            preview.style.setProperty('--preview-ability', `url('${basePath}/Panel/${this._previewState.abilityPanelStyle}')`);
            preview.style.setProperty('--preview-ac', `url('${basePath}/Transparent center/${this._previewState.acPanelStyle}')`);
            preview.style.setProperty('--preview-stat', `url('${basePath}/Transparent center/${this._previewState.statPanelStyle}')`);
            preview.style.setProperty('--preview-border-width', `${this._previewState.borderWidth}px`);
            preview.style.setProperty('--preview-border-image-width', `${this._previewState.borderImageWidth}px`);
            preview.style.setProperty('--preview-border-slice', this._previewState.borderImageSlice);
            preview.style.setProperty('--preview-border-outset', `${this._previewState.borderImageOutset}px`);
            preview.style.setProperty('--preview-border-repeat', this._previewState.borderImageRepeat);
            preview.style.setProperty('--preview-border-bg', this._previewState.borderBackgroundColor || 'transparent');

            // Box Border Preview
            preview.style.setProperty('--preview-box-border', `url('${basePath}/Border/${this._previewState.sdBoxBorderStyle}')`);
            preview.style.setProperty('--preview-box-border-width', `${this._previewState.sdBoxBorderTransparencyWidth}px`);
            preview.style.setProperty('--preview-box-border-image-width', `${this._previewState.sdBoxBorderWidth}px`);
            preview.style.setProperty('--preview-box-border-slice', this._previewState.sdBoxBorderSlice);

            // Color customization
            preview.style.setProperty('--preview-ability-mod-color', this._previewState.abilityModColor || '#000000');
            preview.style.setProperty('--preview-level-value-color', this._previewState.levelValueColor || '#000000');
            preview.style.setProperty('--preview-ac-value-color', this._previewState.acValueColor || '#000000');
            preview.style.setProperty('--preview-stats-label-color', this._previewState.statsLabelColor || '#ffffff');

            // Condition Modal Preview
            preview.style.setProperty('--preview-condition-modal-border', `url('${basePath}/Border/${this._previewState.conditionModalBorderStyle}')`);
            preview.style.setProperty('--preview-condition-modal-border-image-width', `${this._previewState.conditionModalBorderImageWidth}px`);
            preview.style.setProperty('--preview-condition-modal-border-slice', this._previewState.conditionModalBorderImageSlice);
            preview.style.setProperty('--preview-condition-modal-border-outset', `${this._previewState.conditionModalBorderImageOutset}px`);
            preview.style.setProperty('--preview-condition-modal-border-repeat', this._previewState.conditionModalBorderImageRepeat);
        }

        // Update current selection displays
        const currentBorderImg = html.querySelector('.current-border-img');
        const currentAbilityImg = html.querySelector('.current-ability-img');
        const currentACImg = html.querySelector('.current-ac-img');
        const currentStatImg = html.querySelector('.current-stat-img');

        if (currentBorderImg) currentBorderImg.src = `${basePath}/Border/${this._previewState.sheetBorderStyle}`;
        if (currentAbilityImg) currentAbilityImg.src = `${basePath}/Panel/${this._previewState.abilityPanelStyle}`;
        if (currentACImg) currentACImg.src = `${basePath}/Transparent center/${this._previewState.acPanelStyle}`;
        if (currentStatImg) currentStatImg.src = `${basePath}/Transparent center/${this._previewState.statPanelStyle}`;

        const currentBoxBorderImg = html.querySelector('.current-box-border-img');
        if (currentBoxBorderImg) currentBoxBorderImg.src = `${basePath}/Border/${this._previewState.sdBoxBorderStyle}`;

        const currentJournalBorderImg = html.querySelector('.current-journal-border-img');
        if (currentJournalBorderImg) currentJournalBorderImg.src = `${basePath}/Border/${this._previewState.journalBorderStyle}`;

        const currentConditionModalBorderImg = html.querySelector('.current-condition-modal-border-img');
        if (currentConditionModalBorderImg) currentConditionModalBorderImg.src = `${basePath}/Border/${this._previewState.conditionModalBorderStyle}`;

        // Also apply to actual player sheets (live preview)
        this._applyLiveStyles();
    }

    /**
     * Apply styles live to actual sheets without saving to settings
     */
    _applyLiveStyles() {
        const basePath = `/modules/${MODULE_ID}/art/PNG/Default`;

        // Build paths
        const borderPath = `${basePath}/Border/${this._previewState.sheetBorderStyle}`;
        const abilityPanelPath = `${basePath}/Panel/${this._previewState.abilityPanelStyle}`;
        const acPanelPath = `${basePath}/Transparent center/${this._previewState.acPanelStyle}`;
        const statPanelPath = `${basePath}/Transparent center/${this._previewState.statPanelStyle}`;
        const boxBorderPath = `${basePath}/Border/${this._previewState.sdBoxBorderStyle}`;
        const journalBorderPath = `${basePath}/Border/${this._previewState.journalBorderStyle}`;
        const conditionModalBorderPath = `${basePath}/Border/${this._previewState.conditionModalBorderStyle}`;

        // Inject/update the live preview style element
        let liveStyle = document.getElementById('sdx-decoration-styles-preview');
        if (!liveStyle) {
            liveStyle = document.createElement('style');
            liveStyle.id = 'sdx-decoration-styles-preview';
            document.head.appendChild(liveStyle);
        }

        liveStyle.textContent = `
            :root {
                --sdx-sheet-border: url('${borderPath}');
                --sdx-ability-panel: url('${abilityPanelPath}');
                --sdx-ac-panel: url('${acPanelPath}');
                --sdx-stat-panel: url('${statPanelPath}');
                --sdx-border-width: ${this._previewState.borderWidth}px;
                --sdx-border-image-width: ${this._previewState.borderImageWidth}px;
                --sdx-border-image-slice: ${this._previewState.borderImageSlice};
                --sdx-border-image-outset: ${this._previewState.borderImageOutset}px;
                --sdx-border-image-repeat: ${this._previewState.borderImageRepeat};
                --sdx-border-background-color: ${this._previewState.borderBackgroundColor || 'transparent'};
                --sdx-sheet-header-bg: ${this._previewState.sheetHeaderBackgroundColor || 'transparent'};
                --sdx-box-border: url('${boxBorderPath}');
                --sdx-box-border-image-width: ${this._previewState.sdBoxBorderWidth}px;
                --sdx-box-border-image-slice: ${this._previewState.sdBoxBorderSlice};
                --sdx-box-border-width: ${this._previewState.sdBoxBorderTransparencyWidth}px;
                --sdx-journal-border: url('${journalBorderPath}');
                --sdx-journal-border-image-width: ${this._previewState.journalBorderImageWidth}px;
                --sdx-journal-border-image-slice: ${this._previewState.journalBorderImageSlice};
                --sdx-journal-border-image-outset: ${this._previewState.journalBorderImageOutset}px;
                --sdx-journal-border-image-repeat: ${this._previewState.journalBorderImageRepeat};
                --sdx-ability-mod-color: ${this._previewState.abilityModColor || '#000000'};
                --sdx-level-value-color: ${this._previewState.levelValueColor || '#000000'};
                --sdx-ac-value-color: ${this._previewState.acValueColor || '#000000'};
                --sdx-init-mod-color: ${this._previewState.initModColor || '#000000'};
                --sdx-luck-value-color: ${this._previewState.luckValueColor || '#000000'};
                --sdx-tab-gradient-start: ${this._previewState.tabGradientStart || '#000000'};
                --sdx-tab-gradient-end: ${this._previewState.tabGradientEnd || '#2f2b2b'};
                --sdx-condition-modal-border: url('${conditionModalBorderPath}');
                --sdx-condition-modal-border-image-width: ${this._previewState.conditionModalBorderImageWidth}px;
                --sdx-condition-modal-border-image-slice: ${this._previewState.conditionModalBorderImageSlice};
                --sdx-condition-modal-border-image-outset: ${this._previewState.conditionModalBorderImageOutset}px;
                --sdx-condition-modal-border-image-outset: ${this._previewState.conditionModalBorderImageOutset}px;
                --sdx-condition-modal-border-image-repeat: ${this._previewState.conditionModalBorderImageRepeat};
                --sdx-nav-link-color: ${this._previewState.navLinkColor || '#ffffff'};
                --sdx-nav-link-active-color: ${this._previewState.navLinkActiveColor || '#ffffff'};
                --sdx-details-row-color: ${this._previewState.detailsRowColor || '#ffffff'};
                --sdx-luck-container-color: ${this._previewState.luckContainerColor || '#ffffff'};
                --sdx-actor-name-color: ${this._previewState.actorNameColor || '#ffffff'};
                --sdx-window-header-color: ${this._previewState.windowHeaderColor || '#ffffff'};
                --sdx-window-header-color: ${this._previewState.windowHeaderColor || '#ffffff'};
                --sdx-nav-bg: ${this._previewState.navBackgroundColor || '#ffffff'};
                --sdx-nav-border-color: ${this._previewState.navBorderColor || 'rgba(0, 0, 0, 0.5)'};
                --sdx-effects-text-color: ${this._previewState.effectsTextColor || '#ffffff'};
                --sdx-talents-text-color: ${this._previewState.talentsTextColor || '#000000'};
                --sdx-xp-row-color: ${this._previewState.xpRowColor || '#ffffff'};
                --sdx-window-title-bar-bg: ${this._previewState.windowTitleBarBackgroundColor || '#ffffff'};
                --sdx-stats-label-color: ${this._previewState.statsLabelColor || '#ffffff'};
                --sdx-actor-name-shadow: 1px 1px 3px ${this._hexToRgba(this._previewState.actorNameShadowColor || '#000000', this._previewState.actorNameShadowAlpha ?? 0.8)};
                --sdx-actor-name-font-weight: ${this._previewState.actorNameFontWeight || 'bold'};
            }
        `;
    }

    /**
     * Revert live styles back to the original saved settings
     */
    _revertLiveStyles() {
        // Remove the preview style element
        const liveStyle = document.getElementById('sdx-decoration-styles-preview');
        if (liveStyle) liveStyle.remove();

        // The original saved styles are still in sdx-decoration-styles
    }

    static async #onSave(event, target) {
        // Save all settings based on current preview state
        for (const key of Object.keys(DEFAULTS)) {
            await game.settings.set(MODULE_ID, key, this._previewState[key]);
        }

        // Remove live preview style element (the saved settings will take over)
        this._revertLiveStyles();

        ui.notifications.info(game.i18n.localize("SHADOWDARK_EXTRAS.sheetEditor.saved"));
        this.close();
    }

    static #onCancel(event, target) {
        // Revert live styles back to original
        this._revertLiveStyles();
        this.close();
    }

    static #onLoadDefaults(event, target) {
        // Reset preview state to defaults
        this._previewState = { ...DEFAULTS };

        // Update preview immediately
        this._updatePreview();

        // Re-render the application to update all inputs/selections
        this.render();

        ui.notifications.info(game.i18n.localize("SHADOWDARK_EXTRAS.sheetEditor.defaultsLoaded"));
    }

    static async #onExportTheme(event, target) {
        const data = { ...this._previewState };
        const filename = `shadowdark-extras-theme.json`;
        saveDataToFile(JSON.stringify(data, null, 2), "text/json", filename);
    }

    static async #onImportTheme(event, target) {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";

        input.onchange = async () => {
            const file = input.files[0];
            if (!file) return;

            const readJSON = (file) => new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(JSON.parse(e.target.result));
                reader.onerror = (e) => reject(e);
                reader.readAsText(file);
            });

            try {
                const json = await readJSON(file);
                const missingAssets = [];
                const basePath = `modules/${MODULE_ID}/art/PNG/Default`;

                // Map settings to their folder types for validation
                const IMAGE_SETTINGS = {
                    sheetBorderStyle: { folder: "Border", prefix: "panel-border" },
                    sdBoxBorderStyle: { folder: "Border", prefix: "panel-border" },
                    journalBorderStyle: { folder: "Border", prefix: "panel-border" },
                    conditionModalBorderStyle: { folder: "Border", prefix: "panel-border" },
                    abilityPanelStyle: { folder: "Panel", prefix: "panel" },
                    acPanelStyle: { folder: "Transparent center", prefix: "panel-transparent-center" },
                    statPanelStyle: { folder: "Transparent center", prefix: "panel-transparent-center" }
                };

                // Pre-fetch valid images for each category to avoid repetitive API calls
                const validImages = {};
                const categories = ["Border", "Panel", "Transparent center"];

                for (const cat of categories) {
                    try {
                        const result = await FilePicker.browse("data", `${basePath}/${cat}`);
                        validImages[cat] = new Set(result.files.map(f => f.split('/').pop()));
                    } catch (e) {
                        console.warn(`${MODULE_ID} | Failed to scan ${cat} for validation`, e);
                        validImages[cat] = new Set();
                    }
                }

                // Update preview state with imported values, validating images
                for (const key of Object.keys(DEFAULTS)) {
                    if (json[key] !== undefined) {
                        let value = json[key];

                        // If this is an image setting, validate it
                        if (IMAGE_SETTINGS[key]) {
                            const { folder } = IMAGE_SETTINGS[key];
                            if (!validImages[folder].has(value)) {
                                missingAssets.push(`${key}: ${value}`);
                                value = DEFAULTS[key]; // Fallback to default
                            }
                        }

                        this._previewState[key] = value;
                    }
                }

                // Update preview and re-render
                this._updatePreview();
                this.render();

                if (missingAssets.length > 0) {
                    ui.notifications.warn(game.i18n.format("SHADOWDARK_EXTRAS.sheetEditor.importMissingAssets", {
                        count: missingAssets.length
                    }));
                    console.warn("Shadowdark Extras | The following assets were missing in the imported theme and reset to defaults:", missingAssets);
                } else {
                    ui.notifications.info(game.i18n.localize("SHADOWDARK_EXTRAS.sheetEditor.themeImported"));
                }
            } catch (err) {
                console.error("Shadowdark Extras | Failed to import theme:", err);
                ui.notifications.error(game.i18n.localize("SHADOWDARK_EXTRAS.sheetEditor.importError"));
            }
        };

        input.click();
    }

    /**
     * Convert hex color and alpha to rgba string
     * @param {string} hex - Hex color string
     * @param {number} alpha - Alpha value (0-1)
     * @returns {string} - rgba string
     */
    _hexToRgba(hex, alpha) {
        if (!hex) return `rgba(0, 0, 0, ${alpha})`;

        // Handle rgba strings if already present
        if (hex.startsWith('rgba')) return hex;

        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);

        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
}

/**
 * Open the sheet editor configuration
 */
export function openSheetEditor() {
    new SheetEditorConfig().render(true);
}
