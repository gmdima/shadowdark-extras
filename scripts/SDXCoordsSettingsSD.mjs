/**
 * SDX Coords Settings — AppV2 dialog for coordinate overlay configuration
 */

const MODULE_ID = "shadowdark-extras";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

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

/**
 * Build the full sorted font list (standard + SDX + core custom fonts)
 */
function buildFontList(selectedFont) {
    const coreFonts = game.settings.get("core", "fonts") || {};
    const allCustom = Object.keys(coreFonts);
    const standard = [
        "Arial", "Verdana", "Georgia", "Times New Roman", "Courier New",
        "Old Newspaper Font", "Montserrat-medium", "JSL Blackletter"
    ];
    const combined = [...new Set([...standard, ...SDX_FONTS, ...allCustom])];
    return combined.map(f => {
        const cleanLabel = f.replace(/['"]/g, "")
            .split(/[-_]/)
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ");
        return {
            value: f.includes(" ") ? `'${f}'` : f,
            label: cleanLabel,
            selected: f === selectedFont || `'${f}'` === selectedFont
        };
    }).sort((a, b) => a.label.localeCompare(b.label));
}

export class SDXCoordsSettingsApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "sdx-coords-settings",
        classes: ["sdx-coords-settings"],
        position: {
            width: 460,
            height: "auto"
        },
        window: {
            title: "Map Coordinates Settings",
            resizable: false,
        },
        tag: "form",
        form: {
            closeOnSubmit: true,
        },
        actions: {
            save: SDXCoordsSettingsApp._onSave,
        },
    };

    static PARTS = {
        form: {
            template: `modules/${MODULE_ID}/templates/sdx-coords-settings.hbs`,
        },
    };

    async _prepareContext(options) {
        const settings = game.settings.get(MODULE_ID, "sdxCoordsSettings") || {};
        const defaults = {
            fontFamily: "Signika-Bold",
            fillColor: "#ffffff",
            strokeColor: "#000000",
            strokeThickness: 3,
            xValue: "let",
            yValue: "num",
            offset: 0,
            cellFontScale: 14,
            cellAlpha: 0.9,
            leadingZeroes: false,
            keybindModifier: "Alt",
            clickTimeout: 1500,
        };
        const s = foundry.utils.mergeObject(defaults, settings);

        const fontFamilies = buildFontList(s.fontFamily);

        return {
            settings: s,
            fontFamilies,
            valueTypes: [
                { value: "num", label: "Number", selected: s.xValue === "num" },
                { value: "let", label: "Letter", selected: s.xValue === "let" },
            ],
            valueTypesY: [
                { value: "num", label: "Number", selected: s.yValue === "num" },
                { value: "let", label: "Letter", selected: s.yValue === "let" },
            ],
            modifiers: [
                { value: "Control", label: "Ctrl", selected: s.keybindModifier === "Control" },
                { value: "Shift", label: "Shift", selected: s.keybindModifier === "Shift" },
                { value: "Alt", label: "Alt", selected: s.keybindModifier === "Alt" },
            ],
        };
    }

    _onRender(context, options) {
        // Wire up range sliders to show live value
        const html = this.element;
        html.querySelectorAll('input[type="range"]').forEach(slider => {
            const display = slider.nextElementSibling;
            if (display?.classList.contains("range-value")) {
                slider.addEventListener("input", () => {
                    display.textContent = slider.value;
                });
            }
        });

        // Sync color picker ↔ text input
        html.querySelectorAll('input[type="color"]').forEach(picker => {
            const text = picker.nextElementSibling;
            if (text?.type === "text") {
                picker.addEventListener("input", () => { text.value = picker.value; });
                text.addEventListener("input", () => {
                    if (/^#[0-9a-fA-F]{6}$/.test(text.value)) picker.value = text.value;
                });
            }
        });
    }

    static async _onSave(event, target) {
        event.preventDefault();
        const form = this.element.querySelector("form") || this.element;
        const fd = new FormDataExtended(form);
        const data = fd.object;

        // Coerce numeric types
        data.strokeThickness = Number(data.strokeThickness) || 3;
        data.offset = Number(data.offset) || 0;
        data.cellFontScale = Number(data.cellFontScale) || 14;
        data.cellAlpha = Number(data.cellAlpha) || 0.9;
        data.clickTimeout = Number(data.clickTimeout) || 1500;
        data.leadingZeroes = !!data.leadingZeroes;

        await game.settings.set(MODULE_ID, "sdxCoordsSettings", data);
        ui.notifications.info("Map Coordinates settings saved. Reload to apply changes.");
        this.close();
    }
}
