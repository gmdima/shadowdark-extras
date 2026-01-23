/**
 * Icon Picker Modal for selecting SVG icons
 * Displays icons from assets/icons folder with search and category filter
 */

const MODULE_ID = "shadowdark-extras";
const ICONS_PATH = `modules/${MODULE_ID}/assets/icons`;

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Icon Picker Application - Fullscreen modal for browsing SVG icons
 */
export class IconPickerApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "sdx-icon-picker",
        classes: ["sdx-icon-picker-app"],
        position: {
            width: "100%",
            height: "100%"
        },
        window: {
            title: "SDX.iconPicker.title",
            icon: "fa-solid fa-icons",
            resizable: false,
            minimizable: false,
            frame: false,
            controls: []
        }
    };

    static PARTS = {
        form: {
            template: `modules/${MODULE_ID}/templates/icon-picker.hbs`
        }
    };

    // Cache for icon list
    static _iconCache = null;
    static _categoriesCache = null;

    constructor(options = {}) {
        super(options);
        this._resolve = null;
        this._reject = null;
        this._selectedCategory = "all";
        this._searchTerm = "";
        this._currentPage = 0;
        this._iconsPerPage = 100;
    }

    /**
     * Open the icon picker and return a promise that resolves with the selected icon path
     * @returns {Promise<string|null>} The selected icon path or null if cancelled
     */
    static async pick() {
        return new Promise((resolve, reject) => {
            const picker = new IconPickerApp();
            picker._resolve = resolve;
            picker._reject = reject;
            picker.render(true);
        });
    }

    /**
     * Load all icons from the assets/icons folder
     */
    static async loadIcons() {
        if (this._iconCache) return this._iconCache;

        const icons = [];
        const categories = new Set();

        try {
            // Get list of category folders (artist folders)
            const response = await FilePicker.browse("data", ICONS_PATH);
            const categoryFolders = response.dirs || [];

            for (const categoryPath of categoryFolders) {
                const categoryName = categoryPath.split("/").pop();
                categories.add(categoryName);

                // Get SVGs in this category
                try {
                    const categoryResponse = await FilePicker.browse("data", categoryPath);
                    const svgFiles = (categoryResponse.files || []).filter(f => f.endsWith(".svg"));

                    for (const filePath of svgFiles) {
                        const fileName = filePath.split("/").pop().replace(".svg", "");
                        icons.push({
                            path: filePath,
                            name: fileName.replace(/-/g, " "),
                            category: categoryName,
                            searchName: fileName.toLowerCase()
                        });
                    }
                } catch (err) {
                    console.warn(`SDX Icon Picker | Could not browse category: ${categoryPath}`, err);
                }
            }

            this._iconCache = icons;
            this._categoriesCache = Array.from(categories).sort();
            console.log(`SDX Icon Picker | Loaded ${icons.length} icons from ${categories.size} categories`);

        } catch (err) {
            console.error("SDX Icon Picker | Failed to load icons:", err);
            this._iconCache = [];
            this._categoriesCache = [];
        }

        return this._iconCache;
    }

    async _prepareContext(options) {
        // Ensure icons are loaded
        await IconPickerApp.loadIcons();

        const allIcons = IconPickerApp._iconCache || [];
        const categories = IconPickerApp._categoriesCache || [];

        // Filter icons
        let filteredIcons = allIcons;

        if (this._selectedCategory !== "all") {
            filteredIcons = filteredIcons.filter(icon => icon.category === this._selectedCategory);
        }

        if (this._searchTerm) {
            const term = this._searchTerm.toLowerCase();
            filteredIcons = filteredIcons.filter(icon => icon.searchName.includes(term));
        }

        // Paginate
        const totalIcons = filteredIcons.length;
        const totalPages = Math.ceil(totalIcons / this._iconsPerPage);
        const startIdx = this._currentPage * this._iconsPerPage;
        const pageIcons = filteredIcons.slice(startIdx, startIdx + this._iconsPerPage);

        return {
            icons: pageIcons,
            categories: categories.map(c => ({
                id: c,
                name: c.replace(/-/g, " "),
                selected: c === this._selectedCategory
            })),
            selectedCategory: this._selectedCategory,
            searchTerm: this._searchTerm,
            totalIcons,
            currentPage: this._currentPage + 1,
            totalPages,
            showPagination: totalPages > 1,
            hasPrevPage: this._currentPage > 0,
            hasNextPage: this._currentPage < totalPages - 1
        };
    }

    _onRender(context, options) {
        const html = this.element;
        if (!html) return;

        // Category filter
        const categorySelect = html.querySelector('[name="category"]');
        if (categorySelect) {
            categorySelect.addEventListener("change", async (e) => {
                this._selectedCategory = e.target.value;
                this._currentPage = 0;
                await this.render();
            });
        }

        // Search input
        const searchInput = html.querySelector('[name="search"]');
        if (searchInput) {
            let searchTimeout;
            searchInput.addEventListener("input", (e) => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(async () => {
                    this._searchTerm = e.target.value;
                    this._currentPage = 0;
                    await this.render();
                }, 300);
            });
            // Focus search on open
            searchInput.focus();
        }

        // Icon selection
        html.querySelectorAll(".icon-item").forEach(item => {
            item.addEventListener("click", (e) => {
                const iconPath = e.currentTarget.dataset.path;
                this._selectIcon(iconPath);
            });
        });

        // Pagination
        html.querySelector('[data-action="prev-page"]')?.addEventListener("click", async () => {
            if (this._currentPage > 0) {
                this._currentPage--;
                await this.render();
            }
        });

        html.querySelector('[data-action="next-page"]')?.addEventListener("click", async () => {
            this._currentPage++;
            await this.render();
        });

        // Cancel button
        html.querySelector('[data-action="cancel"]')?.addEventListener("click", () => {
            this._cancel();
        });

        // ESC key to cancel
        html.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                e.preventDefault();
                this._cancel();
            }
        });
    }

    _selectIcon(iconPath) {
        if (this._resolve) {
            this._resolve(iconPath);
        }
        this.close({ animate: false });
    }

    _cancel() {
        if (this._resolve) {
            this._resolve(null);
        }
        this.close({ animate: false });
    }

    async close(options = {}) {
        options.animate = false;
        return super.close(options);
    }
}

/**
 * Clear the icon cache (useful for development/testing)
 */
export function clearIconCache() {
    IconPickerApp._iconCache = null;
    IconPickerApp._categoriesCache = null;
}
