/**
 * Weapon Animation Configuration Dialog
 * AppV2 dialog for configuring weapon animations on items
 */

const MODULE_ID = "shadowdark-extras";

// Use the Handlebars mixin for AppV2
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

// Import the image scanner
import { scanItemImages } from "./WeaponAnimationSD.mjs";

/**
 * Configuration dialog for weapon animations
 */
export default class WeaponAnimationConfig extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "weapon-animation-config-{id}",
        classes: ["shadowdark", "shadowdark-extras", "weapon-animation-config"],
        tag: "div",
        window: {
            frame: true,
            positioned: true,
            title: "SHADOWDARK_EXTRAS.weaponAnimation.title",
            icon: "fas fa-wand-magic-sparkles",
            resizable: false,
            minimizable: false
        },
        position: {
            width: 500,
            height: "auto"
        },
        actions: {
            save: WeaponAnimationConfig.#onSave,
            cancel: WeaponAnimationConfig.#onCancel
        },
        tabGroups: {
            primary: "general"
        }
    };

    static PARTS = {
        form: {
            template: `modules/${MODULE_ID}/templates/weapon-animation-config.hbs`
        }
    };

    /**
     * @param {Object} options
     * @param {Item} options.item - The weapon item to configure
     */
    constructor(options = {}) {
        super(options);
        this.item = options.item;
        this._cachedImages = null;
    }

    get title() {
        return game.i18n.format("SHADOWDARK_EXTRAS.weaponAnimation.title_with_item", {
            item: this.item?.parent?.name
                ? `${this.item.parent.name} - ${this.item.name}`
                : this.item.name
        });
    }

    /**
     * Get cached weapon images or scan for them
     */
    async getWeaponImages() {
        if (!this._cachedImages) {
            this._cachedImages = await scanItemImages();
        }
        return this._cachedImages;
    }

    async _prepareContext(options) {
        const context = await super._prepareContext(options);

        // Get current config from item
        const config = this.item.getFlag(MODULE_ID, "weaponAnimation") ?? {
            enabled: false,
            imagePath: "",
            offsetX: 0.35,
            offsetY: 0.1,
            rotation: 0,
            scale: 1.0,
            animationType: "wobble",
            flipX: false,
            flipY: false,
            filters: {
                colorMatrix: {
                    hue: 0,
                    brightness: 1,
                    contrast: 1,
                    saturate: 0
                },
                glow: {
                    enabled: false,
                    distance: 10,
                    outerStrength: 4,
                    innerStrength: 0,
                    color: "#ffffff",
                    quality: 0.1,
                    knockout: false
                },
                dropShadow: {
                    enabled: false,
                    color: "#000000",
                    alpha: 0.5,
                    blur: 2,
                    distance: 5,
                    rotation: 45
                }
            }
        };

        // Ensure defaults for new fields and filters
        if (config.rotation === undefined) config.rotation = 0;
        if (config.animationType === undefined) config.animationType = "wobble";
        if (config.flipX === undefined) config.flipX = false;
        if (config.flipY === undefined) config.flipY = false;

        if (!config.filters) config.filters = {};
        if (!config.filters.colorMatrix) {
            config.filters.colorMatrix = { hue: 0, brightness: 1, contrast: 1, saturate: 0 };
        }
        if (!config.filters.glow) {
            config.filters.glow = { enabled: false, distance: 10, outerStrength: 4, innerStrength: 0, color: "#ffffff", quality: 0.1, knockout: false };
        }
        if (!config.filters.dropShadow) {
            config.filters.dropShadow = { enabled: false, color: "#000000", alpha: 0.5, blur: 2, distance: 5, rotation: 45 };
        }

        // Get token data for accurate preview
        let tokenImg = "icons/svg/mystery-man.svg";
        let tokenRotation = 0;
        let tokenWidth = 1;
        const actor = this.item.actor;
        if (actor) {
            tokenImg = actor.prototypeToken?.texture?.src || actor.img || tokenImg;
            const activeScene = game.scenes.active;
            const tokens = activeScene?.tokens.filter(t => t.actorId === actor.id);
            if (tokens?.length) {
                const firstToken = tokens[0];
                tokenRotation = firstToken.rotation ?? 0;
                tokenWidth = firstToken.width ?? 1;
                tokenImg = firstToken.texture?.src || tokenImg;
            } else {
                tokenRotation = actor.prototypeToken?.rotation ?? 0;
                tokenWidth = actor.prototypeToken?.width ?? 1;
            }
        }

        const images = await this.getWeaponImages();
        const imagesByCategory = {};
        const categoryCounts = {};
        for (const img of images) {
            if (!imagesByCategory[img.category]) {
                imagesByCategory[img.category] = [];
                categoryCounts[img.category] = 0;
            }
            imagesByCategory[img.category].push(img);
            categoryCounts[img.category]++;
        }

        const sortedCategories = Object.keys(imagesByCategory).sort();
        const animationTypes = {
            none: "SHADOWDARK_EXTRAS.weaponAnimation.animNone",
            wobble: "SHADOWDARK_EXTRAS.weaponAnimation.animWobble",
            bobbing: "SHADOWDARK_EXTRAS.weaponAnimation.animBobbing",
            floating: "SHADOWDARK_EXTRAS.weaponAnimation.animFloating",
            rotating: "SHADOWDARK_EXTRAS.weaponAnimation.animRotating"
        };

        // Get the currently selected image name
        let imageName = "";
        if (config.imagePath) {
            const selectedImg = images.find(i => i.path === config.imagePath);
            imageName = selectedImg?.name || config.imagePath.split('/').pop().replace(/\.(webp|png|jpg)$/i, '');
            config.imageName = imageName;
        }

        context.item = this.item;
        context.config = config;
        context.tokenImg = tokenImg;
        context.tokenRotation = tokenRotation;
        context.tokenWidth = tokenWidth;
        context.imagesByCategory = imagesByCategory;
        context.sortedCategories = sortedCategories;
        context.categoryCounts = categoryCounts;
        context.animationTypes = animationTypes;
        context.hasImages = images.length > 0;
        context.imageCount = images.length;

        return context;
    }

    _onRender(context, options) {
        super._onRender(context, options);
        this.context = context;

        const html = this.element;
        this._updatePreview();

        const inputs = html.querySelectorAll('input, select');
        inputs.forEach(input => {
            input.addEventListener("input", () => this._updatePreview());
            input.addEventListener("change", () => this._updatePreview());
        });

        const rangeInputs = html.querySelectorAll('input[type="range"]');
        rangeInputs.forEach(slider => {
            const valueSpan = slider.parentElement.querySelector(".slider-value");
            if (valueSpan) {
                slider.addEventListener("input", (e) => {
                    let val = e.target.value;
                    if (e.target.name.includes("rotation") || e.target.name.includes("hue")) {
                        valueSpan.textContent = `${val}°`;
                    } else if (e.target.name.includes("distance")) {
                        valueSpan.textContent = `${val}px`;
                    } else {
                        valueSpan.textContent = parseFloat(val).toFixed(2);
                    }
                });
            }
        });

        // Setup color picker syncing
        const colorInput = html.querySelector('input[type="color"][data-edit]');
        if (colorInput) {
            const editName = colorInput.dataset.edit;
            const textInput = html.querySelector(`input[name="${editName}"]`);
            if (textInput) {
                colorInput.addEventListener("input", (e) => {
                    textInput.value = e.target.value;
                    this._updatePreview();
                });
                textInput.addEventListener("input", (e) => {
                    if (/^#[0-9A-F]{6}$/i.test(e.target.value)) {
                        colorInput.value = e.target.value;
                        this._updatePreview();
                    }
                });
            }
        }

        // ===== Image Browser Event Handlers =====

        // Toggle image browser panel
        const currentBtn = html.querySelector('.weapon-image-current');
        const browserPanel = html.querySelector('.weapon-image-browser');
        if (currentBtn && browserPanel) {
            currentBtn.addEventListener('click', () => {
                const isOpen = browserPanel.style.display !== 'none';
                browserPanel.style.display = isOpen ? 'none' : 'block';
            });
        }

        // Category header click to expand/collapse
        const categoryHeaders = html.querySelectorAll('.weapon-image-category-header');
        categoryHeaders.forEach(header => {
            header.addEventListener('click', () => {
                const category = header.closest('.weapon-image-category');
                const grid = category.querySelector('.weapon-image-grid');
                const toggle = header.querySelector('.category-toggle');
                const icon = header.querySelector('.category-icon');

                const isExpanded = grid.style.display !== 'none';
                grid.style.display = isExpanded ? 'none' : 'grid';
                toggle.classList.toggle('fa-chevron-right', isExpanded);
                toggle.classList.toggle('fa-chevron-down', !isExpanded);
                icon.classList.toggle('fa-folder', isExpanded);
                icon.classList.toggle('fa-folder-open', !isExpanded);
            });
        });

        // Thumbnail click to select
        const thumbs = html.querySelectorAll('.weapon-image-thumb');
        thumbs.forEach(thumb => {
            thumb.addEventListener('click', () => {
                // Remove previous selection
                html.querySelectorAll('.weapon-image-thumb.selected').forEach(t => t.classList.remove('selected'));
                thumb.classList.add('selected');

                const path = thumb.dataset.path;
                const name = thumb.dataset.name;

                // Update hidden input
                const hiddenInput = html.querySelector('.weapon-image-select');
                if (hiddenInput) hiddenInput.value = path;

                // Update current display
                const currentDisplay = html.querySelector('.weapon-image-current');
                if (currentDisplay) {
                    currentDisplay.innerHTML = `
                        <img src="${path}" alt="Selected">
                        <span class="weapon-image-name">${name}</span>
                        <i class="fas fa-folder-open weapon-image-browse-icon"></i>
                    `;
                }

                // Update preview
                this._updatePreview();
            });
        });

        // Search filter
        const searchInput = html.querySelector('.weapon-image-filter');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase().trim();
                const categories = html.querySelectorAll('.weapon-image-category');
                let visibleCount = 0;

                categories.forEach(category => {
                    const thumbnails = category.querySelectorAll('.weapon-image-thumb');
                    let categoryHasMatch = false;

                    thumbnails.forEach(thumb => {
                        const name = thumb.dataset.name.toLowerCase();
                        const matches = !query || name.includes(query);
                        thumb.style.display = matches ? '' : 'none';
                        if (matches) {
                            categoryHasMatch = true;
                            visibleCount++;
                        }
                    });

                    // Show/hide entire category
                    category.style.display = categoryHasMatch ? '' : 'none';

                    // Auto-expand matching categories when searching
                    if (query && categoryHasMatch) {
                        const grid = category.querySelector('.weapon-image-grid');
                        const toggle = category.querySelector('.category-toggle');
                        const icon = category.querySelector('.category-icon');
                        if (grid) grid.style.display = 'grid';
                        if (toggle) {
                            toggle.classList.remove('fa-chevron-right');
                            toggle.classList.add('fa-chevron-down');
                        }
                        if (icon) {
                            icon.classList.remove('fa-folder');
                            icon.classList.add('fa-folder-open');
                        }
                    }
                });

                // Update count
                const countSpan = html.querySelector('.weapon-image-count');
                if (countSpan) {
                    countSpan.textContent = query
                        ? `${visibleCount} / ${this.context.imageCount} images`
                        : `${this.context.imageCount} images`;
                }
            });
        }

        // Hover preview tooltip
        thumbs.forEach(thumb => {
            thumb.addEventListener('mouseenter', (e) => {
                // Create tooltip if not exists
                let tooltip = document.getElementById('weapon-image-tooltip');
                if (!tooltip) {
                    tooltip = document.createElement('div');
                    tooltip.id = 'weapon-image-tooltip';
                    tooltip.className = 'weapon-image-tooltip';
                    document.body.appendChild(tooltip);
                }

                const path = thumb.dataset.path;
                const name = thumb.dataset.name;
                tooltip.innerHTML = `
                    <img src="${path}" alt="${name}">
                    <span>${name}</span>
                `;
                tooltip.style.display = 'block';

                // Position tooltip
                const rect = thumb.getBoundingClientRect();
                tooltip.style.left = `${rect.right + 10}px`;
                tooltip.style.top = `${rect.top}px`;
            });

            thumb.addEventListener('mouseleave', () => {
                const tooltip = document.getElementById('weapon-image-tooltip');
                if (tooltip) tooltip.style.display = 'none';
            });
        });
    }

    _updatePreview() {
        const html = this.element;
        if (!html) return;

        const previewBox = html.querySelector(".weapon-preview-box");
        const previewImg = html.querySelector(".weapon-preview-img");
        const previewPlaceholder = html.querySelector(".weapon-preview-placeholder");
        const settings = html.querySelector(".weapon-animation-settings");
        const enabled = html.querySelector(".weapon-animation-enabled")?.checked;

        if (settings) settings.style.display = enabled ? "block" : "none";

        const imagePath = html.querySelector(".weapon-image-select")?.value;
        if (!imagePath || !enabled) {
            if (previewImg) previewImg.style.display = "none";
            if (previewPlaceholder) previewPlaceholder.style.display = "block";
            return;
        }

        if (previewImg) {
            previewImg.src = imagePath;
            previewImg.style.display = "block";
        }
        if (previewPlaceholder) previewPlaceholder.style.display = "none";

        const offsetX = parseFloat(html.querySelector('input[name="offsetX"]')?.value ?? 0.35);
        const offsetY = parseFloat(html.querySelector('input[name="offsetY"]')?.value ?? 0.1);
        const rotation = parseInt(html.querySelector('input[name="rotation"]')?.value ?? 0);
        const scale = parseFloat(html.querySelector('input[name="scale"]')?.value ?? 1.0);
        const flipX = html.querySelector('input[name="flipX"]')?.checked;
        const flipY = html.querySelector('input[name="flipY"]')?.checked;

        const tw = this.context.tokenWidth || 1;
        const tx = offsetX * 120 * tw;
        const ty = offsetY * 120 * tw;
        const sx = scale * (flipX ? -1 : 1);
        const sy = scale * (flipY ? -1 : 1);

        if (previewImg) {
            previewImg.style.transform = `translate(${tx}px, ${ty}px) rotate(${rotation}deg) scale(${sx}, ${sy})`;

            const hue = html.querySelector('input[name="filters.colorMatrix.hue"]')?.value ?? 0;
            const brightness = html.querySelector('input[name="filters.colorMatrix.brightness"]')?.value ?? 1;
            const contrast = html.querySelector('input[name="filters.colorMatrix.contrast"]')?.value ?? 1;
            const saturate = parseFloat(html.querySelector('input[name="filters.colorMatrix.saturate"]')?.value ?? 0) + 1;

            const glowEnabled = html.querySelector('input[name="filters.glow.enabled"]')?.checked;
            const glowSettings = html.querySelector(".glow-settings");
            if (glowSettings) glowSettings.style.display = glowEnabled ? "block" : "none";

            const dropShadowEnabled = html.querySelector('input[name="filters.dropShadow.enabled"]')?.checked;
            const dropShadowSettings = html.querySelector(".drop-shadow-settings");
            if (dropShadowSettings) dropShadowSettings.style.display = dropShadowEnabled ? "block" : "none";

            let filterStr = `hue-rotate(${hue}deg) brightness(${brightness}) contrast(${contrast}) saturate(${saturate})`;
            if (glowEnabled) {
                const glowDistance = html.querySelector('input[name="filters.glow.distance"]')?.value ?? 10;
                const glowColor = html.querySelector('input[name="filters.glow.color"]')?.value ?? "#ffffff";
                const glowKnockout = html.querySelector('input[name="filters.glow.knockout"]')?.checked;
                previewImg.style.opacity = glowKnockout ? "0" : "1";
                filterStr += ` drop-shadow(0 0 ${glowDistance}px ${glowColor})`;
            } else {
                previewImg.style.opacity = "1";
            }
            if (dropShadowEnabled) {
                const dsDistance = html.querySelector('input[name="filters.dropShadow.distance"]')?.value ?? 5;
                const dsBlur = html.querySelector('input[name="filters.dropShadow.blur"]')?.value ?? 2;
                const dsColor = html.querySelector('input[name="filters.dropShadow.color"]')?.value ?? "#000000";
                const dsRotation = html.querySelector('input[name="filters.dropShadow.rotation"]')?.value ?? 45;
                const dsAlpha = html.querySelector('input[name="filters.dropShadow.alpha"]')?.value ?? 0.5;
                // Convert rotation to x/y offset for CSS
                const radians = dsRotation * (Math.PI / 180);
                const offsetX = Math.cos(radians) * dsDistance;
                const offsetY = Math.sin(radians) * dsDistance;
                filterStr += ` drop-shadow(${offsetX}px ${offsetY}px ${dsBlur}px ${dsColor})`;
            }
            previewImg.style.filter = filterStr;
        }
    }

    static async #onSave(event, target) {
        const html = this.element;
        const enabled = html.querySelector(".weapon-animation-enabled")?.checked ?? false;
        const imagePath = html.querySelector(".weapon-image-select")?.value ?? "";
        const offsetX = parseFloat(html.querySelector('input[name="offsetX"]')?.value ?? 0.35);
        const offsetY = parseFloat(html.querySelector('input[name="offsetY"]')?.value ?? 0.1);
        const rotation = parseInt(html.querySelector('input[name="rotation"]')?.value ?? 0);
        const scale = parseFloat(html.querySelector('input[name="scale"]')?.value ?? 1.0);
        const animationType = html.querySelector('select[name="animationType"]')?.value ?? "none";
        const flipX = html.querySelector('input[name="flipX"]')?.checked ?? false;
        const flipY = html.querySelector('input[name="flipY"]')?.checked ?? false;

        const existingFlags = this.item.getFlag(MODULE_ID, "weaponAnimation") || {};
        const newConfig = {
            enabled, imagePath, offsetX, offsetY, rotation, scale, animationType, flipX, flipY,
            filters: {
                colorMatrix: {
                    hue: parseInt(html.querySelector('input[name="filters.colorMatrix.hue"]')?.value ?? 0),
                    brightness: parseFloat(html.querySelector('input[name="filters.colorMatrix.brightness"]')?.value ?? 1),
                    contrast: parseFloat(html.querySelector('input[name="filters.colorMatrix.contrast"]')?.value ?? 1),
                    saturate: parseFloat(html.querySelector('input[name="filters.colorMatrix.saturate"]')?.value ?? 0)
                },
                glow: {
                    enabled: html.querySelector('input[name="filters.glow.enabled"]')?.checked ?? false,
                    distance: parseInt(html.querySelector('input[name="filters.glow.distance"]')?.value ?? 10),
                    outerStrength: parseInt(html.querySelector('input[name="filters.glow.outerStrength"]')?.value ?? 4),
                    innerStrength: parseInt(html.querySelector('input[name="filters.glow.innerStrength"]')?.value ?? 0),
                    color: html.querySelector('input[name="filters.glow.color"]')?.value || "#ffffff",
                    quality: parseFloat(html.querySelector('input[name="filters.glow.quality"]')?.value ?? 0.1),
                    knockout: html.querySelector('input[name="filters.glow.knockout"]')?.checked ?? false
                },
                dropShadow: {
                    enabled: html.querySelector('input[name="filters.dropShadow.enabled"]')?.checked ?? false,
                    color: html.querySelector('input[name="filters.dropShadow.color"]')?.value || "#000000",
                    alpha: parseFloat(html.querySelector('input[name="filters.dropShadow.alpha"]')?.value ?? 0.5),
                    blur: parseFloat(html.querySelector('input[name="filters.dropShadow.blur"]')?.value ?? 2),
                    distance: parseInt(html.querySelector('input[name="filters.dropShadow.distance"]')?.value ?? 5),
                    rotation: parseInt(html.querySelector('input[name="filters.dropShadow.rotation"]')?.value ?? 45)
                }
            }
        };

        const merged = foundry.utils.mergeObject(existingFlags, newConfig, { inplace: false });
        await this.item.setFlag(MODULE_ID, "weaponAnimation", merged);

        ui.notifications.info(game.i18n.localize("SHADOWDARK_EXTRAS.weaponAnimation.saved"));
        this.close();
    }

    static #onCancel(event, target) {
        this.close();
    }
}

export function openWeaponAnimationConfig(item) {
    if (item.type !== "Weapon" && item.type !== "Armor") {
        ui.notifications.warn("Animation configuration is only available for weapons and shields.");
        return;
    }
    new WeaponAnimationConfig({ item }).render(true);
}
