/**
 * Sheet Editor Configuration Dialog
 * AppV2 dialog for configuring player sheet visual styles with live preview
 */

const MODULE_ID = "shadowdark-extras";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Default style values
 */
const DEFAULTS = {
    sheetBorderStyle: "panel-border-004.png",
    abilityPanelStyle: "panel-013.png",
    acPanelStyle: "panel-transparent-center-004.png",
    statPanelStyle: "panel-transparent-center-015.png",
    borderImageWidth: 16,
    borderImageSlice: 12,
    borderImageOutset: 0,
    borderImageRepeat: "stretch",
    borderBackgroundColor: "",
    borderWidth: 10,
    sdBoxBorderStyle: "panel-border-001.png",
    sdBoxBorderWidth: 16,
    sdBoxBorderSlice: 12,
    sdBoxBorderTransparencyWidth: 10,
    // Journal border settings
    journalBorderStyle: "panel-border-004.png",
    journalBorderImageWidth: 16,
    journalBorderImageSlice: 12,
    journalBorderImageOutset: 0,
    journalBorderImageRepeat: "repeat",
    abilityModColor: "#000000",
    levelValueColor: "#000000",
    acValueColor: "#000000",
    initModColor: "#000000",
    luckValueColor: "#000000",
    // Tab background gradient settings
    tabGradientStart: "#000000",
    tabGradientEnd: "#2f2b2b"
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
            loadDefaults: SheetEditorConfig.#onLoadDefaults
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
}

/**
 * Open the sheet editor configuration
 */
export function openSheetEditor() {
    new SheetEditorConfig().render(true);
}
