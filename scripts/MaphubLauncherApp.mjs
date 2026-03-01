const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class MaphubLauncherApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "maphub-launcher",
        tag: "div",
        classes: ["maphub-launcher-app"],
        position: {
            width: 580,
            height: "auto",
        },
        window: {
            title: "Maphub Generators",
            icon: "fas fa-map-location-dot",
            resizable: false,
            frame: true,
        },
    };

    static PARTS = {
        main: {
            template: "modules/shadowdark-extras/templates/maphub-launcher.hbs"
        }
    };

    constructor(options = {}) {
        super(options);
    }

    _onRender(context, options) {
        super._onRender(context, options);

        const html = this.element;

        html.querySelector("[data-action='open-mfcg']")?.addEventListener("click", async (e) => {
            e.preventDefault();
            this._openGenerator("mfcg");
        });

        html.querySelector("[data-action='open-village']")?.addEventListener("click", async (e) => {
            e.preventDefault();
            this._openGenerator("village");
        });

        html.querySelector("[data-action='open-dwellings']")?.addEventListener("click", async (e) => {
            e.preventDefault();
            this._openGenerator("dwellings");
        });

        html.querySelector("[data-action='open-cave']")?.addEventListener("click", async (e) => {
            e.preventDefault();
            this._openGenerator("cave");
        });
    }

    async _openGenerator(generatorType) {
        const { MaphubViewerApp } = await import("./MaphubViewerApp.mjs");

        let externalBase = "";
        switch (generatorType) {
            case "mfcg": externalBase = "https://watabou.github.io/city-generator/"; break;
            case "village": externalBase = "https://watabou.github.io/village-generator/"; break;
            case "dwellings": externalBase = "https://watabou.github.io/dwellings/"; break;
            case "cave": externalBase = "https://watabou.github.io/cave-generator/"; break;
        }

        new MaphubViewerApp({
            type: generatorType,
            queryString: "",
            externalBase: externalBase
        }).render(true);
        this.close();
    }
}
