const MODULE_ID = "shadowdark-extras";

/**
 * We import style logic from JournalPinsSD to avoid circular dependencies
 */
import { getPinStyle, JournalPinManager, JournalPinRenderer, DEFAULT_PIN_STYLE } from "./JournalPinsSD.mjs";
import { IconPickerApp } from "./IconPickerSD.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Pin Style Editor Application
 */
export class PinStyleEditorApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "sdx-pin-style-editor",
        classes: ["sdx-pin-style-editor-app"],
        position: {
            width: 420,
            height: "auto"
        },
        window: {
            title: "SDX.pinStyleEditor.title",
            icon: "fa-solid fa-map-pin",
            resizable: true,
            animations: false,
            controls: []
        }
    };

    static PARTS = {
        form: {
            template: `modules/${MODULE_ID}/templates/pin-style-editor.hbs`
        }
    };

    constructor(options = {}) {
        super(options);
        this.pinId = options.pinId || null;
        this._previewPin = null;

        if (this.pinId) {
            this.options.window.title = "SDX.pinStyleEditor.titleIndividual";
        }
    }

    async _prepareContext(options) {
        let style;
        let journalPages = null;
        let currentPageId = null;
        let journalId = null;
        let currentJournalId = null;
        let allJournals = null;
        let requiresVision = false;
        let tooltipTitle = "";
        let tooltipContent = "";

        if (this.pinId) {
            const pin = JournalPinManager.get(this.pinId);
            style = { ...DEFAULT_PIN_STYLE, ...getPinStyle(), ...(pin?.style || {}) };

            // Load all journals for the dropdown
            allJournals = game.journal.contents
                .filter(j => j.pages.size > 0)
                .sort((a, b) => a.name.localeCompare(b.name))
                .map(j => ({
                    id: j.id,
                    name: j.name
                }));

            // Load journal pages for individual pin editor
            if (pin?.journalId) {
                journalId = pin.journalId;
                currentJournalId = pin.journalId;
                currentPageId = pin.pageId;
                requiresVision = pin.requiresVision || false;
                tooltipTitle = pin.tooltipTitle || "";
                tooltipContent = pin.tooltipContent || "";
                const journal = game.journal.get(pin.journalId);
                if (journal) {
                    journalPages = journal.pages.contents
                        .sort((a, b) => a.sort - b.sort)
                        .map(page => ({
                            id: page.id,
                            name: page.name
                        }));
                }
            }
        } else {
            style = getPinStyle();
        }

        const fontFamilies = [
            { value: "Arial", label: "Arial" },
            { value: "Verdana", label: "Verdana" },
            { value: "Georgia", label: "Georgia" },
            { value: "Times New Roman", label: "Times New Roman" },
            { value: "Courier New", label: "Courier New" },
            { value: "'Old Newspaper Font'", label: "Old Newspaper Font" },
            { value: "'Montserrat-medium'", label: "Montserrat" },
            { value: "'JSL Blackletter'", label: "JSL Blackletter" }
        ];

        const shapes = [
            { value: "circle", label: game.i18n.localize("SDX.pinStyleEditor.shapeCircle") },
            { value: "square", label: game.i18n.localize("SDX.pinStyleEditor.shapeSquare") },
            { value: "diamond", label: game.i18n.localize("SDX.pinStyleEditor.shapeDiamond") },
            { value: "hexagon", label: game.i18n.localize("SDX.pinStyleEditor.shapeHexagon") }
        ];

        const ringStyles = [
            { value: "solid", label: "Solid" },
            { value: "dashed", label: "Dashed" },
            { value: "dotted", label: "Dotted" }
        ];

        const iconOptions = [
            { value: "fa-solid fa-book-open", label: "Book Open" },
            { value: "fa-solid fa-book", label: "Book" },
            { value: "fa-solid fa-scroll", label: "Scroll" },
            { value: "fa-solid fa-map", label: "Map" },
            { value: "fa-solid fa-landmark", label: "Landmark" },
            { value: "fa-solid fa-dungeon", label: "Dungeon" },
            { value: "fa-solid fa-tower-observation", label: "Tower" },
            { value: "fa-solid fa-skull", label: "Skull" },
            { value: "fa-solid fa-star", label: "Star" },
            { value: "fa-solid fa-gem", label: "Gem" },
            { value: "fa-solid fa-coins", label: "Coins" },
            { value: "fa-solid fa-crown", label: "Crown" },
            { value: "fa-solid fa-shield", label: "Shield" },
            { value: "fa-solid fa-sword", label: "Sword" },
            { value: "fa-solid fa-wand-sparkles", label: "Wand" },
            { value: "fa-solid fa-fire", label: "Fire" },
            { value: "fa-solid fa-droplet", label: "Water" },
            { value: "fa-solid fa-tree", label: "Tree" },
            { value: "fa-solid fa-mountain", label: "Mountain" },
            { value: "fa-solid fa-house", label: "House" }
        ];

        return {
            style,
            fontFamilies,
            shapes,
            ringStyles,
            iconOptions,
            journalPages,
            currentPageId,
            journalId,
            currentJournalId,
            allJournals,
            requiresVision,
            tooltipTitle,
            tooltipContent,
            isGM: game.user?.isGM
        };
    }

    _onRender(context, options) {
        const html = this.element;
        const form = html.querySelector('form');
        if (!form) return;

        // All inputs - update preview on change
        form.querySelectorAll('input, select').forEach(input => {
            input.addEventListener("change", () => this._updatePreview());
        });

        // Range sliders - show value and update preview on input
        form.querySelectorAll('input[type="range"]').forEach(input => {
            const valueDisplay = form.querySelector(`[data-for="${input.name}"]`);
            if (valueDisplay) {
                valueDisplay.textContent = input.value;
                input.addEventListener("input", () => {
                    valueDisplay.textContent = input.value;
                    this._updatePreview();
                });
            }
        });

        // Color pickers - update preview on input (for font color)
        form.querySelectorAll('input[type="color"]').forEach(input => {
            input.addEventListener("input", () => this._updatePreview());
        });

        // Save button
        form.querySelector('[data-action="save"]')?.addEventListener("click", () => this._onSave());

        // Reset button
        form.querySelector('[data-action="reset"]')?.addEventListener("click", () => this._onReset());

        // Show/hide content options based on contentType selection
        const contentTypeSelect = form.querySelector('[name="contentType"]');
        const textSection = form.querySelector('.text-options');
        const iconSection = form.querySelector('.icon-options');
        const fontSection = form.querySelector('.font-options');
        const symbolSection = form.querySelector('.symbol-options');
        const customIconSection = form.querySelector('.custom-icon-options');

        if (contentTypeSelect && textSection && fontSection) {
            const updateVisibility = () => {
                const type = contentTypeSelect.value;
                console.log(`SDX Pin Editor | Content Type changed to: ${type}`);

                // Toggle sections based on type
                textSection.style.display = type === "text" ? "block" : "none";

                if (symbolSection) {
                    symbolSection.style.display = (type === "symbol" || type === "icon") ? "block" : "none";
                }

                if (customIconSection) {
                    customIconSection.style.display = type === "customIcon" ? "block" : "none";
                }

                if (iconSection) {
                    iconSection.style.display = (type === "icon") ? "block" : "none"; // Legacy
                }

                // Font options only for text and number
                const isMedia = (type === "symbol" || type === "icon" || type === "customIcon");
                fontSection.style.display = isMedia ? "none" : "block";
            };
            updateVisibility();
            contentTypeSelect.addEventListener("change", updateVisibility);
        }

        // Browse icons button - open icon picker modal
        const browseIconsBtn = form.querySelector('[data-action="browse-icons"]');
        if (browseIconsBtn) {
            browseIconsBtn.addEventListener("click", async () => {
                const selectedPath = await IconPickerApp.pick();
                if (selectedPath) {
                    // Update hidden input
                    const pathInput = form.querySelector('[name="customIconPath"]');
                    if (pathInput) pathInput.value = selectedPath;

                    // Update preview image
                    const previewContainer = form.querySelector('.selected-icon-preview');
                    if (previewContainer) {
                        previewContainer.innerHTML = `<img src="${selectedPath}" alt="Selected Icon" />`;
                    }

                    // Update the pin preview
                    this._updatePreview();
                }
            });
        }

        // Show/hide border radius options based on shape selection
        const shapeSelect = form.querySelector('[name="shape"]');
        const borderRadiusSection = form.querySelector('.border-radius-options');
        if (shapeSelect && borderRadiusSection) {
            const updateBorderRadiusVisibility = () => {
                borderRadiusSection.style.display = shapeSelect.value === "square" ? "flex" : "none";
            };
            updateBorderRadiusVisibility();
            shapeSelect.addEventListener("change", updateBorderRadiusVisibility);
        }

        // Journal dropdown changes - update page options
        const journalSelect = form.querySelector('[name="journalId"]');
        const pageSelect = form.querySelector('[name="pageId"]');
        if (journalSelect && pageSelect) {
            journalSelect.addEventListener("change", () => {
                const selectedJournalId = journalSelect.value;
                const journal = game.journal.get(selectedJournalId);
                if (journal) {
                    // Clear existing options
                    pageSelect.innerHTML = "";
                    // Add new page options
                    const sortedPages = journal.pages.contents.sort((a, b) => a.sort - b.sort);
                    sortedPages.forEach(page => {
                        const option = document.createElement("option");
                        option.value = page.id;
                        option.textContent = page.name;
                        pageSelect.appendChild(option);
                    });
                    // Select first page by default
                    if (sortedPages.length > 0) {
                        pageSelect.value = sortedPages[0].id;
                    }
                }
            });
        }

        // Initial preview
        this._updatePreview();
    }

    _updatePreview() {
        const html = this.element;
        if (!html) return;

        const preview = html.querySelector('.pin-preview-canvas');
        if (!preview) return;

        const style = this._getFormData();

        // Update preview display
        const size = parseInt(style.size) || 32;
        const previewPin = html.querySelector('.preview-pin');
        if (previewPin) {
            previewPin.style.width = `${size}px`;
            previewPin.style.height = `${size}px`;
            const baseOpacity = parseFloat(style.opacity) || 1.0;
            const fillOpacity = (parseFloat(style.fillOpacity) ?? 1.0) * baseOpacity;
            const ringOpacity = (parseFloat(style.ringOpacity) ?? 1.0) * baseOpacity;

            previewPin.style.backgroundColor = style.fillColor || "#000000";
            previewPin.style.borderColor = style.ringColor || "#ffffff";
            previewPin.style.borderWidth = `${style.ringWidth}px`;
            previewPin.style.borderStyle = style.ringStyle || "solid";

            // Apply opacities to preview via background and border colors
            // Note: This is an approximation for CSS preview
            const parseHex = (hex) => {
                const r = parseInt(hex.slice(1, 3), 16);
                const g = parseInt(hex.slice(3, 5), 16);
                const b = parseInt(hex.slice(5, 7), 16);
                return `${r}, ${g}, ${b}`;
            };

            previewPin.style.backgroundColor = `rgba(${parseHex(style.fillColor)}, ${fillOpacity})`;
            previewPin.style.borderColor = `rgba(${parseHex(style.ringColor)}, ${ringOpacity})`;


            // Shape
            // Reset clip-path and transform for non-hexagon/diamond shapes
            previewPin.style.clipPath = "none";
            const borderRadius = parseInt(style.borderRadius) || 4;

            switch (style.shape) {
                case "circle":
                    previewPin.style.borderRadius = "50%";
                    previewPin.style.transform = "rotate(0deg)";
                    break;
                case "square":
                    previewPin.style.borderRadius = `${borderRadius}px`;
                    previewPin.style.transform = "rotate(0deg)";
                    break;
                case "diamond":
                    previewPin.style.borderRadius = `${borderRadius}px`;
                    previewPin.style.transform = "rotate(45deg)";
                    break;
                case "hexagon":
                    previewPin.style.borderRadius = "0";
                    previewPin.style.transform = "rotate(0deg)";
                    // Use clip-path for true hexagon shape
                    previewPin.style.clipPath = "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)";
                    break;
            }

            // Content (number, symbol, custom icon, or text)
            const content = previewPin.querySelector('.preview-content');
            if (content) {
                const type = style.contentType || (style.showIcon ? "symbol" : "number");

                if (type === "symbol" || type === "icon") {
                    // FontAwesome icon (now Symbol)
                    const symbolClass = style.symbolClass || style.iconClass || "fa-solid fa-book-open";
                    content.innerHTML = `<i class="${symbolClass}"></i>`;
                    content.style.fontSize = `${size * 0.5}px`;
                    content.style.color = style.symbolColor || "#ffffff";
                }
                else if (type === "customIcon") {
                    // Custom SVG icon
                    if (style.customIconPath) {
                        content.innerHTML = `<img src="${style.customIconPath}" style="width: 70%; height: 70%; filter: invert(1);" />`;
                    } else {
                        content.innerHTML = `<i class="fa-solid fa-image"></i>`;
                        content.style.fontSize = `${size * 0.5}px`;
                    }
                    content.style.color = style.iconColor || "#ffffff";
                    // Note: Inverting SVG preview as a simple way to show on dark background, 
                    // real PIXI rendering handles the color properly.
                }
                else {
                    if (type === "text") {
                        content.textContent = style.customText || "";
                    } else {
                        content.textContent = "3";
                    }
                    content.style.fontSize = `${style.fontSize}px`;
                    content.style.fontFamily = style.fontFamily;
                    content.style.fontWeight = style.fontWeight;
                    content.style.color = style.fontColor || "#ffffff";
                }
                content.style.transform = style.shape === "diamond" ? "rotate(-45deg)" : "none";
            }
        }
    }

    _getFormData() {
        const html = this.element;
        const form = html?.querySelector('form');
        if (!form) {
            if (this.pinId) {
                const pin = JournalPinManager.get(this.pinId);
                return { ...getPinStyle(), ...(pin?.style || {}) };
            }
            return getPinStyle();
        }

        const formData = {
            size: parseInt(form.querySelector('[name="size"]')?.value) || 32,
            shape: form.querySelector('[name="shape"]')?.value || "circle",
            ringColor: form.querySelector('[name="ringColor"]')?.value || "#ffffff",
            fillColor: form.querySelector('[name="fillColor"]')?.value || "#000000",
            ringWidth: parseInt(form.querySelector('[name="ringWidth"]')?.value) || 3,
            ringStyle: form.querySelector('[name="ringStyle"]')?.value || "solid",
            opacity: parseFloat(form.querySelector('[name="opacity"]')?.value) || 1.0,
            fillOpacity: parseFloat(form.querySelector('[name="fillOpacity"]')?.value) || 1.0,
            ringOpacity: parseFloat(form.querySelector('[name="ringOpacity"]')?.value) || 1.0,
            contentType: form.querySelector('[name="contentType"]')?.value || "number",
            customText: form.querySelector('[name="customText"]')?.value || "",
            // Symbol (FontAwesome icons)
            symbolClass: form.querySelector('[name="symbolClass"]')?.value || form.querySelector('[name="iconClass"]')?.value || "fa-solid fa-book-open",
            symbolColor: form.querySelector('[name="symbolColor"]')?.value || "#ffffff",
            // Custom Icon (SVG from assets)
            customIconPath: form.querySelector('[name="customIconPath"]')?.value || "",
            iconColor: form.querySelector('[name="iconColor"]')?.value || "#ffffff",
            // Legacy support
            iconClass: form.querySelector('[name="symbolClass"]')?.value || form.querySelector('[name="iconClass"]')?.value || "fa-solid fa-book-open",
            fontSize: parseInt(form.querySelector('[name="fontSize"]')?.value) || 14,
            fontFamily: form.querySelector('[name="fontFamily"]')?.value || "Arial",
            fontColor: form.querySelector('[name="fontColor"]')?.value || "#ffffff",
            fontWeight: form.querySelector('[name="fontWeight"]')?.checked ? "bold" : "normal",
            borderRadius: parseInt(form.querySelector('[name="borderRadius"]')?.value) || 4
        };

        // Add pageId if editing individual pin
        if (this.pinId) {
            const pageIdSelect = form.querySelector('[name="pageId"]');
            if (pageIdSelect) {
                formData.pageId = pageIdSelect.value || null;
            }

            const requiresVisionCheckbox = form.querySelector('[name="requiresVision"]');
            if (requiresVisionCheckbox) {
                formData.requiresVision = requiresVisionCheckbox.checked;
            }

            const journalIdSelect = form.querySelector('[name="journalId"]');
            if (journalIdSelect) {
                formData.journalId = journalIdSelect.value || null;
            }

            const tooltipTitleInput = form.querySelector('[name="tooltipTitle"]');
            if (tooltipTitleInput) {
                formData.tooltipTitle = tooltipTitleInput.value || "";
            }

            const tooltipContentInput = form.querySelector('[name="tooltipContent"]');
            if (tooltipContentInput) {
                formData.tooltipContent = tooltipContentInput.value || "";
            }
        }

        return formData;
    }

    async _onSave() {
        const style = this._getFormData();
        const pinId = this.pinId;

        // Close window IMMEDIATELY to feel snappy
        this.close({ animate: false });

        // Run the update in the background
        try {
            if (pinId) {
                // Save to individual pin
                const updateData = { style };

                // Include pageId and requiresVision if they were changed
                if (style.pageId !== undefined) {
                    updateData.pageId = style.pageId;
                    delete style.pageId;
                }

                if (style.requiresVision !== undefined) {
                    updateData.requiresVision = style.requiresVision;
                    delete style.requiresVision;
                }

                if (style.journalId !== undefined) {
                    updateData.journalId = style.journalId;
                    delete style.journalId;
                }

                if (style.tooltipTitle !== undefined) {
                    updateData.tooltipTitle = style.tooltipTitle;
                    delete style.tooltipTitle;
                }

                if (style.tooltipContent !== undefined) {
                    updateData.tooltipContent = style.tooltipContent;
                    delete style.tooltipContent;
                }

                console.log("SDX Pin Style Editor | Saving pin update:", { pinId, updateData });
                await JournalPinManager.update(pinId, updateData);
                ui.notifications.info(game.i18n.localize("SDX.pinStyleEditor.savedIndividual"));
            } else {
                // Save to global defaults
                await game.settings.set(MODULE_ID, "pinStyleDefaults", style);
                ui.notifications.info(game.i18n.localize("SDX.pinStyleEditor.saved"));

                // Refresh all pins on the current scene (only for global save)
                if (canvas?.scene) {
                    const pins = JournalPinManager.list({ sceneId: canvas.scene.id });
                    JournalPinRenderer.loadScenePins(canvas.scene.id, pins);
                }
            }
        } catch (err) {
            console.error("SDX | Error saving pin style:", err);
            ui.notifications.error("Error saving pin style settings.");
        }
    }

    /**
     * Override close to ensure it's always instant
     */
    async close(options = {}) {
        if (this.element) this.element.style.display = "none"; // Vanish immediately
        options.animate = false;
        return super.close(options);
    }


    async _onReset() {
        if (this.pinId) {
            // Reset individual pin style by clearing overrides
            await JournalPinManager.update(this.pinId, { style: {} });
            ui.notifications.info(game.i18n.localize("SDX.pinStyleEditor.resetIndividualMsg"));
        } else {
            // Reset global defaults
            await game.settings.set(MODULE_ID, "pinStyleDefaults", DEFAULT_PIN_STYLE);
            ui.notifications.info(game.i18n.localize("SDX.pinStyleEditor.resetMsg"));
        }
        this.render();
    }
}

/**
 * Open the pin style editor
 */
export function openPinStyleEditor() {
    new PinStyleEditorApp().render(true);
}

/**
 * Register the pin style settings
 */
export function registerPinStyleSettings() {
    game.settings.register(MODULE_ID, "pinStyleDefaults", {
        name: "Pin Style Defaults",
        hint: "Default style settings for journal pins",
        scope: "world",
        config: false,
        type: Object,
        default: DEFAULT_PIN_STYLE
    });

    game.settings.registerMenu(MODULE_ID, "pinStyleEditorMenu", {
        name: game.i18n.localize("SDX.pinStyleEditor.menuName"),
        label: game.i18n.localize("SDX.pinStyleEditor.menuLabel"),
        hint: game.i18n.localize("SDX.pinStyleEditor.menuHint"),
        icon: "fa-solid fa-palette",
        type: PinStyleEditorApp,
        restricted: true
    });
}
