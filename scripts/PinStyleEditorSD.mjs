const MODULE_ID = "shadowdark-extras";

/**
 * We import style logic from JournalPinsSD to avoid circular dependencies
 */
import { getPinStyle, JournalPinManager, JournalPinRenderer, DEFAULT_PIN_STYLE } from "./JournalPinsSD.mjs";
import { IconPickerApp } from "./IconPickerSD.mjs";
import { FilterEditor, getCloneFilterParams } from "./TMFXFilterEditor.mjs";

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
        let hideTooltip = false;

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

            // Add "None" option
            allJournals.unshift({ id: "", name: "- None -" });

            // Load pin-specific settings (independent of journal linkage)
            requiresVision = pin.requiresVision || false;
            tooltipTitle = pin.tooltipTitle || "";
            tooltipContent = pin.tooltipContent || "";
            hideTooltip = pin.hideTooltip || false;

            // Load journal pages for individual pin editor
            if (pin?.journalId) {
                journalId = pin.journalId;
                currentJournalId = pin.journalId;
                currentPageId = pin.pageId;

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

        const SDX_FONTS = [
            "ACaslonPro-Bold", "ArabDances", "BaksoSapi", "BalletHarmony", "Cardinal", "CaslonAntique-Bold",
            "Cathallina", "ChildWriting-Regular", "Comic-ink", "DREAMERS-BRUSH", "DSnet_Stamped", "DUNGRG",
            "DancingVampyrish", "Dreamy-Land-Medium", "FairProsper", "Fast-In-My-Car", "FuturaHandwritten",
            "GODOFWAR", "Galactico-Basic", "Ghost-theory-2", "GhostChase", "Good-Brush", "Hamish", "Headache",
            "Hiroshio", "HoneyScript-SemiBold", "IronSans", "JIANGKRIK", "LPEducational", "LUMOS", "Lemon-Tuesday",
            "LinLibertine_RB", "Luna", "MLTWNII_", "Magiera_Script", "OldLondon", "Paul-Signature",
            "RifficFree-Bold", "Rooters", "STAMPACT", "SUBSCRIBER-Regular", "Signika-Bold",
            "Suplexmentary_Comic_NC", "Syemox-italic", "Times-New-Romance", "TrashHand", "Valentino",
            "VarsityTeam-Bold", "WEST", "YIKES!", "YOZAKURA-Regular", "Younger-than-me", "alamain1",
            "breakaway", "bwptype", "codex", "college", "ethnocentric-rg", "exmouth_", "fewriter_memesbruh03",
            "fontopoSUBWAY-Regular", "fontopoSunnyDay-Regular", "glashou", "go3v2", "happyfrushzero",
            "himagsikan", "kindergarten", "kirsty-rg", "makayla", "oko", "shoplift", "stereofidelic",
            "stonehen", "times_new_yorker", "venus-rising-rg"
        ];

        const fontFamilies = [
            { value: "Arial", label: "Arial" },
            { value: "Verdana", label: "Verdana" },
            { value: "Georgia", label: "Georgia" },
            { value: "Times New Roman", label: "Times New Roman" },
            { value: "Courier New", label: "Courier New" },
            { value: "'Old Newspaper Font'", label: "Old Newspaper Font" },
            { value: "'Montserrat-medium'", label: "Montserrat" },
            { value: "'JSL Blackletter'", label: "JSL Blackletter" },
            ...SDX_FONTS.map(f => ({
                value: f,
                label: f.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
            }))
        ];

        const shapes = [
            { value: "circle", label: game.i18n.localize("SDX.pinStyleEditor.shapeCircle") },
            { value: "square", label: game.i18n.localize("SDX.pinStyleEditor.shapeSquare") },
            { value: "diamond", label: game.i18n.localize("SDX.pinStyleEditor.shapeDiamond") },
            { value: "hexagon", label: game.i18n.localize("SDX.pinStyleEditor.shapeHexagon") },
            { value: "image", label: game.i18n.localize("SDX.pinStyleEditor.shapeImage") }
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

        // Generate list of border styles (0-36)
        const borderStyles = [];
        for (let i = 0; i < 37; i++) {
            borderStyles.push({
                value: i,
                label: `Style ${i + 1}`
            });
        }

        // Normalize hoverAnimation to string for select compatibility
        if (typeof style.hoverAnimation === "boolean") {
            style.hoverAnimation = style.hoverAnimation ? "scale" : "none";
        }
        if (!style.hoverAnimation) style.hoverAnimation = "none";

        return {
            style,
            fontFamilies,
            shapes,
            ringStyles,
            iconOptions,
            borderStyles,
            journalPages,
            currentPageId,
            journalId,
            currentJournalId,
            allJournals,
            requiresVision,
            tooltipContent,
            hideTooltip,
            isGM: game.user?.isGM,
            pinId: this.pinId,
            tmfxPresets: this._getTMFXPresets(),
            activeFilters: this._getActiveFilters()
        };
    }

    _getTMFXPresets() {
        if (!game.modules.get("tokenmagic")?.active || !window.TokenMagic) return [];

        try {
            // Fetch presets from libraries
            const mainPresets = window.TokenMagic.getPresets("tmfx-main") || [];
            const sdxPresets = window.TokenMagic.getPresets("sdx-presets") || [];

            const allPresets = [
                ...mainPresets.map(p => ({ ...p, library: "tmfx-main", removable: false })),
                ...sdxPresets.map(p => ({ ...p, library: "sdx-presets", removable: true }))
            ];

            return allPresets.map(p => ({
                name: p.name,
                library: p.library,
                removable: p.removable,
                label: p.name.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
            })).sort((a, b) => a.label.localeCompare(b.label));
        } catch (err) {
            console.error("SDX | Error fetching TMFX presets:", err);
            return [];
        }
    }
    _getActiveFilters() {
        if (!this.pinId) return [];
        const pin = JournalPinManager.get(this.pinId);
        const filters = pin?.flags?.tokenmagic?.filters;
        if (!filters || !Array.isArray(filters)) return [];

        console.log(`SDX Pin Editor | Active TMFX Filters for ${this.pinId}:`, filters);

        return filters.map(f => {
            // TokenMagic might nest data under tmFilters or use top-level tmFilterId/tmFilterType
            // We'll search both levels for anything that looks like a type or ID
            const data = f.tmFilters || f;

            const id = data.tmFilterId || data.filterId || data.id || f.id || "";
            const type = data.tmFilterType || data.filterType || data.type || data.tmType || f.filterType || "unknown";

            // Check for common TMFX internal type names if still unknown
            let label = "Unknown";
            const rawType = type.toLowerCase();

            if (rawType !== "unknown") {
                label = type.charAt(0).toUpperCase() + type.slice(1);
            } else if (id && id.toLowerCase() !== "unknown") {
                label = id.charAt(0).toUpperCase() + id.slice(1);
            }

            return {
                id: id,
                type: type,
                internalId: data.tmFilterInternalId || data.filterInternalId || "",
                label: label
            };
        });
    }

    _onRender(context, options) {
        const html = this.element;
        const form = html.querySelector('form');
        if (!form) return;

        // All inputs - update preview on change
        form.querySelectorAll('input, select').forEach(input => {
            input.addEventListener("change", async () => await this._updatePreview());
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
            input.addEventListener("input", async () => await this._updatePreview());
        });

        // Save button
        form.querySelector('[data-action="save"]')?.addEventListener("click", () => this._onSave());

        // Reset button
        form.querySelector('[data-action="reset"]')?.addEventListener("click", () => this._onReset());

        // TMFX Preset dropdown change
        const tmfxSelect = form.querySelector('[name="tmfxPreset"]');
        if (tmfxSelect) {
            const deleteBtn = form.querySelector('[data-action="delete-tmfx-preset"]');
            const toggleDelete = () => {
                const opt = tmfxSelect.options[tmfxSelect.selectedIndex];
                const isRemovable = opt?.dataset.removable === "true";
                if (deleteBtn) deleteBtn.style.display = isRemovable ? "block" : "none";
            };
            tmfxSelect.addEventListener("change", toggleDelete);
            toggleDelete();
        }

        // TMFX Application button
        form.querySelector('[data-action="apply-tmfx"]')?.addEventListener("click", () => this._onApplyTMFX());

        // TMFX Save Preset button
        form.querySelector('[data-action="save-tmfx-preset"]')?.addEventListener("click", () => this._onSaveTMFXPreset());

        // TMFX Delete Preset button
        form.querySelector('[data-action="delete-tmfx-preset"]')?.addEventListener("click", () => this._onDeleteTMFXPreset());

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

        // Generic File Picker buttons
        const filePickerBtns = form.querySelectorAll('.file-picker-btn');
        filePickerBtns.forEach(btn => {
            btn.addEventListener('click', (ev) => {
                const targetName = btn.dataset.target;
                const currentInput = form.querySelector(`[name="${targetName}"]`);

                new FilePicker({
                    type: "image",
                    callback: (path) => {
                        if (currentInput) {
                            currentInput.value = path;
                            // Trigger preview update
                            this._updatePreview();
                        }
                    }
                }).browse(currentInput ? currentInput.value : "");
            });
        });

        // Show/hide label background options
        const labelBgSelect = form.querySelector('[name="labelBackground"]');
        const labelBgOptions = form.querySelector('.label-bg-options');
        const labelImageOptions = form.querySelector('.label-image-options');

        if (labelBgSelect) {
            const updateLabelBgVisibility = () => {
                const val = labelBgSelect.value;
                if (labelBgOptions) labelBgOptions.style.display = val === "solid" ? "block" : "none";
                if (labelImageOptions) labelImageOptions.style.display = val === "image" ? "block" : "none";
            };
            // Initial state set by handle bars, but helpful to ensure
            labelBgSelect.addEventListener("change", updateLabelBgVisibility);
            updateLabelBgVisibility();
        }

        // TokenMagic FX listeners
        form.querySelector('[data-action="apply-tmfx"]')?.addEventListener("click", () => this._onApplyTMFX());
        form.querySelector('[data-action="clear-tmfx"]')?.addEventListener("click", () => this._onClearTMFX());

        // Individual TMFX remove buttons
        form.querySelectorAll('[data-action="remove-tmfx"]').forEach(btn => {
            btn.addEventListener("click", (ev) => {
                ev.preventDefault();
                const filterId = btn.dataset.filterId;
                this._onRemoveTMFX(filterId);
            });
        });

        // Individual TMFX edit buttons
        form.querySelectorAll('[data-action="edit-tmfx"]').forEach(btn => {
            btn.addEventListener("click", (ev) => {
                ev.preventDefault();
                const { filterId, filterType, filterInternalId } = btn.dataset;
                this._onEditTMFXFilter({ filterId, filterType, filterInternalId });
            });
        });

        // Show/hide options based on shape selection
        const shapeSelect = form.querySelector('[name="shape"]');
        const borderRadiusSection = form.querySelector('.border-radius-options');
        const standardStyleSection = form.querySelector('.standard-style-options');
        const imageShapeOptions = form.querySelector('.image-shape-options');

        if (shapeSelect) {
            const updateShapeVisibility = () => {
                const shape = shapeSelect.value;

                // Toggle Border Radius (Square only)
                if (borderRadiusSection) {
                    borderRadiusSection.style.display = shape === "square" ? "flex" : "none";
                }

                // Toggle Standard Options vs Image Options
                if (shape === "image") {
                    if (standardStyleSection) standardStyleSection.style.display = "none";
                    if (imageShapeOptions) imageShapeOptions.style.display = "block";
                } else {
                    if (standardStyleSection) standardStyleSection.style.display = "block";
                    if (imageShapeOptions) imageShapeOptions.style.display = "none";
                }
            };
            updateShapeVisibility();
            shapeSelect.addEventListener("change", updateShapeVisibility);
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

    async _updatePreview() {
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
                case "image":
                    previewPin.style.backgroundColor = "transparent";
                    previewPin.style.border = "none";
                    previewPin.style.borderRadius = "0";
                    previewPin.style.transform = "rotate(0deg)";

                    // Add background image to preview
                    if (style.imagePath) {
                        previewPin.style.backgroundImage = `url("${style.imagePath}")`;
                        previewPin.style.backgroundSize = "contain";
                        previewPin.style.backgroundPosition = "center";
                        previewPin.style.backgroundRepeat = "no-repeat";
                    } else {
                        // Fallback placeholder
                        previewPin.style.backgroundImage = "none";
                        previewPin.style.border = "1px dashed #666";
                    }
                    return; // Skip content addition for image shape background
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

                    // Await font loading if it's a custom font
                    if (style.fontFamily && style.fontFamily !== "Arial") {
                        try {
                            await document.fonts.load(`16px ${style.fontFamily}`);
                        } catch (e) {
                            console.warn(`SDX Pin Editor | Failed to load font: ${style.fontFamily}`);
                        }
                    }

                    content.style.fontSize = `${style.fontSize}px`;
                    content.style.fontFamily = style.fontFamily;
                    content.style.fontWeight = style.fontWeight;
                    content.style.fontStyle = style.fontItalic ? "italic" : "normal";
                    content.style.color = style.fontColor || "#ffffff";

                    // Apply stroke (outline)
                    if (style.fontStrokeThickness > 0) {
                        content.style.webkitTextStroke = `${style.fontStrokeThickness}px ${style.fontStroke || "#000000"}`;
                        content.style.paintOrder = "stroke fill";
                    } else {
                        content.style.webkitTextStroke = "unset";
                    }
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
            imagePath: form.querySelector('[name="imagePath"]')?.value || "",
            hoverAnimation: form.querySelector('[name="hoverAnimation"]')?.value || "none",
            pingAnimation: form.querySelector('[name="pingAnimation"]')?.value || "ripple",
            bringAnimation: form.querySelector('[name="bringAnimation"]')?.value || "ripple",
            ringColor: form.querySelector('[name="ringColor"]')?.value || "#ffffff",
            fillColor: form.querySelector('[name="fillColor"]')?.value || "#000000",
            ringWidth: parseInt(form.querySelector('[name="ringWidth"]')?.value) || 3,
            ringStyle: form.querySelector('[name="ringStyle"]')?.value || "solid",

            // Get opacity based on shape (handle duplicate inputs)
            opacity: (() => {
                const shape = form.querySelector('[name="shape"]')?.value;
                if (shape === "image") {
                    return parseFloat(form.querySelector('.image-opacity-option [name="opacity"]')?.value) ?? 1.0;
                } else {
                    return parseFloat(form.querySelector('.standard-style-options [name="opacity"]')?.value) ?? 1.0;
                }
            })(),

            fillOpacity: parseFloat(form.querySelector('[name="fillOpacity"]')?.value) ?? 1.0,
            ringOpacity: parseFloat(form.querySelector('[name="ringOpacity"]')?.value) ?? 1.0,
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
            fontStroke: form.querySelector('[name="fontStroke"]')?.value || "#000000",
            fontStrokeThickness: parseInt(form.querySelector('[name="fontStrokeThickness"]')?.value) || 0,
            fontWeight: form.querySelector('[name="fontWeight"]')?.checked ? "bold" : "normal",
            fontItalic: form.querySelector('[name="fontItalic"]')?.checked || false,
            borderRadius: parseInt(form.querySelector('[name="borderRadius"]')?.value) || 4,
            // Label Settings
            labelText: form.querySelector('[name="labelText"]')?.value || "",
            labelShowOnHover: form.querySelector('[name="labelShowOnHover"]')?.checked || false,
            labelFontFamily: form.querySelector('[name="labelFontFamily"]')?.value || "Arial",
            labelFontSize: parseInt(form.querySelector('[name="labelFontSize"]')?.value) || 16,
            labelColor: form.querySelector('[name="labelColor"]')?.value || "#ffffff",
            labelStroke: form.querySelector('[name="labelStroke"]')?.value || "#000000",
            labelStrokeThickness: parseInt(form.querySelector('[name="labelStrokeThickness"]')?.value) || 0,
            labelBold: form.querySelector('[name="labelBold"]')?.checked || false,
            labelItalic: form.querySelector('[name="labelItalic"]')?.checked || false,
            labelBackground: form.querySelector('[name="labelBackground"]')?.value || "none",
            labelBackgroundColor: form.querySelector('[name="labelBackgroundColor"]')?.value || "#000000",
            labelBorderColor: form.querySelector('[name="labelBorderColor"]')?.value || "#ffffff",
            labelBorderWidth: parseInt(form.querySelector('[name="labelBorderWidth"]')?.value) || 0,
            labelBorderRadius: parseInt(form.querySelector('[name="labelBorderRadius"]')?.value) || 4,
            labelBorderImageIndex: parseInt(form.querySelector('[name="labelBorderImageIndex"]')?.value) || 0,
            labelBorderImagePath: form.querySelector('[name="labelBorderImagePath"]')?.value || "",
            labelAnchor: form.querySelector('[name="labelAnchor"]')?.value || "bottom",
            hideTooltip: form.querySelector('[name="hideTooltip"]')?.checked || false
        };

        // Handle conditional Background Color and Opacity inputs due to split UI
        if (formData.labelBackground === "image") {
            formData.labelBackgroundColor = form.querySelector('[name="labelImageBackgroundColor"]')?.value || "#000000";
            formData.labelBackgroundOpacity = parseFloat(form.querySelector('[name="labelImageBackgroundOpacity"]')?.value) ?? 0.8;
        } else {
            // Default/Solid inputs
            formData.labelBackgroundColor = form.querySelector('[name="labelBackgroundColor"]')?.value || "#000000";
            formData.labelBackgroundOpacity = parseFloat(form.querySelector('[name="labelBackgroundOpacity"]')?.value) ?? 0.8;
        }

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
                    updateData.journalId = style.journalId || null;
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

                if (style.hideTooltip !== undefined) {
                    updateData.hideTooltip = style.hideTooltip;
                    delete style.hideTooltip;
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

    async _onApplyTMFX() {
        if (!this.pinId) return;
        const select = this.element.querySelector('[name="tmfxPreset"]');
        const presetName = select?.value;
        const option = select?.options[select.selectedIndex];
        const library = option?.dataset.library || "tmfx-main";

        if (!presetName) {
            ui.notifications.warn("Please select a preset first.");
            return;
        }

        const graphics = JournalPinRenderer.getPin(this.pinId);
        if (!graphics) {
            ui.notifications.error("Could not find the pin on the canvas.");
            return;
        }

        try {
            // Fetch preset from TokenMagic library
            const libraryPresets = window.TokenMagic.getPresets(library) || [];
            const preset = libraryPresets.find(p => p.name === presetName);

            if (!preset) {
                ui.notifications.error(`Could not find TokenMagic preset: ${presetName} in library ${library}`);
                return;
            }

            // Apply preset via TokenMagic API
            await window.TokenMagic.addFilters(graphics, preset.params);

            ui.notifications.info(`Applied TokenMagic FX: ${presetName}`);

            // Small delay to ensure flag updates propagate before re-render
            setTimeout(() => this.render(), 100);
        } catch (err) {
            console.error("SDX | Error applying TMFX preset:", err);
            ui.notifications.error("Failed to apply TokenMagic FX preset.");
        }
    }

    async _onSaveTMFXPreset() {
        if (!this.pinId) return;
        const pin = JournalPinManager.get(this.pinId);
        if (!pin) return;

        const params = getCloneFilterParams(pin);
        if (!params || params.length === 0) {
            ui.notifications.warn("No active filters to save.");
            return;
        }

        const name = await foundry.applications.api.DialogV2.prompt({
            window: { title: "Save as Token Magic Preset" },
            content: `
                <div class="form-group">
                    <label>Preset Name</label>
                    <div class="form-fields">
                        <input type="text" name="name" placeholder="sdx-my-preset" autofocus />
                    </div>
                </div>
                <p class="hint">Prefix 'sdx-' will be added automatically if not provided.</p>
            `,
            ok: {
                label: "Save",
                callback: (event, button, dialog) => button.form.elements.name.value
            }
        });

        if (!name) return;

        // Add prefix if missing
        const finalName = name.startsWith("sdx-") ? name : `sdx-${name}`;

        try {
            await window.TokenMagic.addPreset({
                name: finalName,
                library: "sdx-presets"
            }, params);
            ui.notifications.info(`Saved preset: ${finalName}`);
            this.render();
        } catch (err) {
            console.error("SDX | Error saving TMFX preset:", err);
            ui.notifications.error("Failed to save preset.");
        }
    }

    async _onDeleteTMFXPreset() {
        const select = this.element.querySelector('[name="tmfxPreset"]');
        const option = select?.options[select.selectedIndex];
        if (!option || !option.value) return;

        const presetName = option.value;
        const library = option.dataset.library;
        const removable = option.dataset.removable === "true";

        if (!removable) {
            ui.notifications.warn("Cannot delete built-in presets.");
            return;
        }

        const confirm = await foundry.applications.api.DialogV2.confirm({
            window: { title: "Delete Preset" },
            content: `<p>Are you sure you want to delete the preset <strong>${presetName}</strong>?</p>`
        });

        if (!confirm) return;

        try {
            await window.TokenMagic.deletePreset({
                name: presetName,
                library: library
            });
            ui.notifications.info(`Deleted preset: ${presetName}`);
            this.render();
        } catch (err) {
            console.error("SDX | Error deleting TMFX preset:", err);
            ui.notifications.error("Failed to delete preset.");
        }
    }

    async _onRemoveTMFX(filterId) {
        if (!this.pinId) return;
        const graphics = JournalPinRenderer.getPin(this.pinId);
        if (!graphics) return;

        try {
            await window.TokenMagic.deleteFilters(graphics, filterId);
            ui.notifications.info(`Removed filter: ${filterId}`);

            // Force a sync of the graphics object with the database state
            const updatedPin = JournalPinManager.get(this.pinId);
            if (updatedPin) graphics.update(updatedPin);

            // Small delay to ensure flag updates propagate before re-render
            setTimeout(() => this.render(), 100);
        } catch (err) {
            console.error(`SDX Pin Editor | Error removing TMFX filter ${filterId}:`, err);
        }
    }

    async _onClearTMFX() {
        if (!this.pinId) return;
        const graphics = JournalPinRenderer.getPin(this.pinId);
        if (!graphics) return;

        try {
            await window.TokenMagic.deleteFilters(graphics);
            ui.notifications.info("Cleared all TokenMagic FX effects.");

            // Force a sync of the graphics object with the database state
            const updatedPin = JournalPinManager.get(this.pinId);
            if (updatedPin) graphics.update(updatedPin);

            // Small delay to ensure flag updates propagate before re-render
            setTimeout(() => this.render(), 100);
        } catch (err) {
            console.error("SDX | Error clearing TMFX filters:", err);
        }
    }

    async _onEditTMFXFilter({ filterId, filterType, filterInternalId }) {
        if (!this.pinId) return;
        const pin = JournalPinManager.get(this.pinId);
        if (!pin) return;

        const filterIdentifier = { filterId, filterType, filterInternalId };

        // Create a proxy object that mimics a Foundry Document for TokenMagic
        const proxy = {
            id: pin.id,
            get documentName() { return "SDXPin"; },
            get isOwner() { return game.user.isGM; },
            getFlag: (scope, key) => {
                if (scope === "tokenmagic" && key === "filters") {
                    return pin.flags?.tokenmagic?.filters || [];
                }
                return pin.flags?.[scope]?.[key];
            },
            update: async (data, options) => {
                console.log("SDX Pin Editor | Proxy update called with:", data);

                // Check if this is a TMFX filter parameter update
                // TMFXFilterEditor sends flat params like {rotation: 35, filterId: "...", filterType: "...", filterInternalId: "..."}
                if (data.filterInternalId && data.filterType) {
                    // Get the current filters from the pin
                    const currentFilters = foundry.utils.deepClone(pin.flags?.tokenmagic?.filters || []);
                    console.log("SDX Pin Editor | Current filters:", currentFilters);

                    // Find the filter to update by its internal ID
                    // TokenMagic stores filters with nested structure: {tmFilters: {tmFilterInternalId: "..."}}
                    // or flat structure: {filterInternalId: "..."}
                    const filterIndex = currentFilters.findIndex(f => {
                        // Check nested structure first (tmFilters.tmFilterInternalId)
                        if (f.tmFilters?.tmFilterInternalId === data.filterInternalId) return true;
                        // Check flat structure
                        if (f.filterInternalId === data.filterInternalId) return true;
                        // Also check tmParams which may contain the filterInternalId
                        if (f.tmParams?.filterInternalId === data.filterInternalId) return true;
                        return false;
                    });

                    if (filterIndex >= 0) {
                        // Merge the new parameters into the existing filter
                        // For nested structure, we need to update tmParams
                        const existingFilter = currentFilters[filterIndex];
                        let updatedFilter;

                        if (existingFilter.tmFilters?.tmParams) {
                            // Deeply nested structure: tmFilters.tmParams
                            updatedFilter = {
                                ...existingFilter,
                                ...data,  // Update top-level properties
                                tmFilters: {
                                    ...existingFilter.tmFilters,
                                    tmParams: foundry.utils.mergeObject(existingFilter.tmFilters.tmParams, data)
                                }
                            };
                        } else if (existingFilter.tmParams) {
                            // Nested structure - update BOTH top-level AND tmParams
                            updatedFilter = {
                                ...existingFilter,
                                ...data,  // Update top-level properties
                                tmParams: foundry.utils.mergeObject(existingFilter.tmParams, data)  // Update tmParams
                            };
                        } else {
                            // Flat structure - direct merge
                            updatedFilter = { ...existingFilter, ...data };
                        }
                        currentFilters[filterIndex] = updatedFilter;

                        console.log("SDX Pin Editor | Updating filter at index", filterIndex, "with:", updatedFilter);

                        // Use the correct flag format for JournalPinManager.update
                        await JournalPinManager.update(pin.id, {
                            "flags.tokenmagic.filters": currentFilters
                        });

                        // Also update the local pin reference so subsequent calls have fresh data
                        if (pin.flags) {
                            if (!pin.flags.tokenmagic) pin.flags.tokenmagic = {};
                            pin.flags.tokenmagic.filters = currentFilters;
                        }
                    } else {
                        console.warn("SDX Pin Editor | Filter not found for update:", data.filterInternalId);
                        console.warn("SDX Pin Editor | Available filters:", currentFilters.map(f => ({
                            tmFilterInternalId: f.tmFilters?.tmFilterInternalId,
                            filterInternalId: f.filterInternalId,
                            tmParamsFilterInternalId: f.tmParams?.filterInternalId
                        })));
                    }
                } else {
                    // Standard update (non-TMFX data)
                    await JournalPinManager.update(pin.id, data);
                }
            }
        };

        const appId = FilterEditor.genId(proxy, filterIdentifier);
        const activeInstance = foundry.applications.instances.get(appId);

        if (activeInstance) {
            activeInstance.close();
        } else {
            // Position the editor near the styling app
            const { left, top, width } = this.position;
            new FilterEditor(
                { document: proxy, filterIdentifier },
                {
                    id: appId,
                    position: {
                        left: left + width + 10,
                        top: top
                    }
                }
            ).render(true);
        }
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
