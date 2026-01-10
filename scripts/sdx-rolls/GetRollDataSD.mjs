/**
 * GetRollData Dialog for Shadowdark
 * The configuration dialog for setting up an Sdx Roll
 */

import { MODULE_ID, getSDXROLLSSetting, setSDXROLLSSetting } from "./SdxRollsSD.mjs";
import { SocketSD } from "./SocketSD.mjs";
import { SdxRollSD } from "./SdxRollSD.mjs";

export class GetRollDataSD extends FormApplication {
    constructor(data = {}) {
        super();
        const defaultOptions = getSDXROLLSSetting("defaultOptions") ?? {};
        this.rollData = data;
        this.rollData.options ??= defaultOptions;
    }

    static get APP_ID() {
        return "get-roll-data-sd";
    }

    get APP_ID() {
        return this.constructor.APP_ID;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: MODULE_ID + "-" + this.APP_ID,
            template: `modules/${MODULE_ID}/templates/sdx-rolls/get-roll-data-sd.hbs`,
            popOut: true,
            resizable: false,
            minimizable: true,
            width: 700,
            height: 750,
            title: game.i18n.localize(`SHADOWDARK_EXTRAS.SDXROLLS.getRollData.title`),
        });
    }

    async getData() {
        const actors = this.getActors();
        const rolls = this.getRolls();
        return { actors, rolls, rollData: this.rollData };
    }

    getActors() {
        const useCanvasTokens = canvas.tokens.controlled.length > 0;
        const selected = [];
        const notSelected = [];

        if (this.rollData.actors) {
            const dataActors = this.rollData.actors.concat(this.rollData.contestants ?? []).map((uuid) => fromUuidSync(uuid));
            dataActors.sort((a, b) => a.name.localeCompare(b.name));
            dataActors.sort((a, b) => a.hasPlayerOwner - b.hasPlayerOwner);
            selected.push(...dataActors);
        } else {
            if (!useCanvasTokens) {
                // Get active party members
                const activeParty = Array.from(game.users)
                    .filter((user) => !user.isGM && user.active && user.character)
                    .map((user) => user.character);
                activeParty.sort((a, b) => a.name.localeCompare(b.name));
                selected.push(...activeParty);
            } else {
                const canvasSelected = canvas.tokens.controlled.map((token) => token.actor).filter((actor) => actor);
                canvasSelected.sort((a, b) => a.name.localeCompare(b.name));
                canvasSelected.sort((a, b) => a.hasPlayerOwner - b.hasPlayerOwner);
                selected.push(...canvasSelected);
            }
        }

        // Build available actors list
        const allAvailable = [];
        
        // Add party characters first
        const allParty = Array.from(game.users)
            .filter((user) => !user.isGM && user.character)
            .map((user) => user.character);
        allParty.sort((a, b) => a.name.localeCompare(b.name));
        allAvailable.push(...allParty);
        
        // Add player-owned actors
        const allPlayerOwned = Array.from(game.actors)
            .filter((actor) => actor.hasPlayerOwner && actor.type === "Player")
            .filter((actor) => !allAvailable.includes(actor));
        allPlayerOwned.sort((a, b) => a.name.localeCompare(b.name));
        allAvailable.push(...allPlayerOwned);
        
        // Add canvas tokens
        const allCanvas = canvas.tokens.placeables
            .map((token) => token.actor)
            .filter((actor) => actor)
            .filter((actor) => !allAvailable.includes(actor));
        allCanvas.sort((a, b) => a.name.localeCompare(b.name));
        allAvailable.push(...allCanvas);
        
        notSelected.push(...allAvailable.filter((actor) => !selected.includes(actor)));

        if (this.rollData.contestants) {
            selected.forEach((actor) => {
                actor.SDXContestant = this.rollData.contestants.includes(actor.uuid);
            });
        }

        // Add isPlayer flag for template
        selected.forEach((actor) => {
            actor.SDXIsPlayer = actor.type === "Player";
        });
        notSelected.forEach((actor) => {
            actor.SDXIsPlayer = actor.type === "Player";
        });

        return { selected, notSelected };
    }

    getRolls() {
        // Shadowdark stat checks - single list combining ability checks and saving throws
        const stats = [
            { key: "str", label: game.i18n.localize("SHADOWDARK.ability_strength") },
            { key: "dex", label: game.i18n.localize("SHADOWDARK.ability_dexterity") },
            { key: "con", label: game.i18n.localize("SHADOWDARK.ability_constitution") },
            { key: "int", label: game.i18n.localize("SHADOWDARK.ability_intelligence") },
            { key: "wis", label: game.i18n.localize("SHADOWDARK.ability_wisdom") },
            { key: "cha", label: game.i18n.localize("SHADOWDARK.ability_charisma") }
        ].map((stat) => ({
            type: "stat",
            key: stat.key,
            label: stat.label,
            selected: this.rollData.type === "stat." + stat.key,
            contest: this.rollData.contest === "stat." + stat.key,
        }));

        return {
            stats: {
                icon: "fas fa-dice-d20",
                label: game.i18n.localize("SHADOWDARK_EXTRAS.SDXROLLS.getRollData.statCheck"),
                list: stats,
            },
        };
    }

    activateListeners(html) {
        super.activateListeners(html);
        html = html[0] ?? html;
        
        html.querySelectorAll(".add-remove").forEach((button) => {
            button.addEventListener("click", this._onAddRemove.bind(this));
        });
        
        html.querySelectorAll(`input[type="search"]`).forEach((input) => {
            input.addEventListener("input", this._onSearch.bind(this));
        });
        
        html.querySelectorAll("li.actor").forEach((li) => {
            li.addEventListener("contextmenu", this._onActorRightClick.bind(this));
        });
        
        html.querySelectorAll(".roll").forEach((li) => {
            li.addEventListener("click", this._onRollTypeClick.bind(this));
            li.addEventListener("contextmenu", this._onRollTypeRightClick.bind(this));
        });
        
        html.querySelectorAll(".toggle").forEach((button) => {
            button.addEventListener("click", this._onToggle.bind(this));
        });
        
        html.querySelector("#start-sdx-roll").addEventListener("click", this.startSdxRoll.bind(this));
        html.querySelector("#macro").addEventListener("click", this.saveToMacro.bind(this));
        
        html.querySelector("#color").addEventListener("input", (event) => {
            html.querySelector(".color-preview").style.backgroundColor = event.target.value;
        });
        
        html.querySelector(".save-default").addEventListener("click", this._saveDefault.bind(this));
    }

    async _saveDefault() {
        const data = this._compileRollData(true);
        const options = data.options;
        await setSDXROLLSSetting("defaultOptions", options);
        ui.notifications.info(game.i18n.localize(`SHADOWDARK_EXTRAS.SDXROLLS.getRollData.saveDefaultOptionsNotification`));
    }

    _onAddRemove(event) {
        const currentList = event.currentTarget.closest("ul");
        const targetList = Array.from(currentList.closest(".roll-actor-list").querySelectorAll("ul")).find((list) => list !== currentList);
        const li = event.currentTarget.closest("li");
        targetList.prepend(li);
        event.currentTarget.classList.toggle("fa-plus");
        event.currentTarget.classList.toggle("fa-minus");
    }

    _onActorRightClick(event) {
        const li = event.currentTarget;
        li.classList.toggle("contestant");
    }

    _onRollTypeClick(event) {
        this.element[0].querySelectorAll(".roll").forEach((li) => {
            if (li !== event.currentTarget) {
                li.classList.remove("selected");
            }
        });
        const li = event.currentTarget;
        li.classList.remove("contestant");
        li.classList.toggle("selected");
    }

    _onRollTypeRightClick(event) {
        this.element[0].querySelectorAll(".roll").forEach((li) => {
            if (li !== event.currentTarget) {
                li.classList.remove("contestant");
            }
        });
        const li = event.currentTarget;
        li.classList.remove("selected");
        li.classList.toggle("contestant");
    }

    _onToggle(event) {
        event.currentTarget.classList.toggle("fa-toggle-on");
        event.currentTarget.classList.toggle("fa-toggle-off");
    }

    _onSearch(event) {
        const container = event.currentTarget.closest(".roll-section");
        const search = event.currentTarget.value.toLowerCase();
        const lis = container.querySelectorAll("li");
        
        for (const li of lis) {
            if (!search) {
                li.classList.remove("sdx-hidden");
                continue;
            }
            const name = li.dataset.name?.toLowerCase() || "";
            const subtitle = li.querySelector(".subtitle")?.innerText.toLowerCase() ?? "";
            if (name.includes(search) || subtitle.includes(search)) {
                li.classList.remove("sdx-hidden");
            } else {
                li.classList.add("sdx-hidden");
            }
        }
    }

    saveToMacro(e) {
        e.preventDefault();
        const rollData = this._compileRollData();
        const rollLabel = SdxRollSD.getRollLabel(rollData.type, rollData.options.DC, rollData.contest, rollData.options);
        if (!rollData) return;
        Macro.create({
            name: rollLabel,
            type: "script",
            scope: "global",
            command: `ui.SdxRollsSD.requestRoll(${JSON.stringify(rollData)})`,
        });
        ui.notifications.info(game.i18n.localize(`SHADOWDARK_EXTRAS.SDXROLLS.getRollData.saveMacro`) + rollLabel);
    }

    startSdxRoll(e) {
        e.preventDefault();
        const rollData = this._compileRollData();
        if (!rollData) return;
        
        const recentRolls = getSDXROLLSSetting("recentRolls");
        try {
            const recentRollsLabels = recentRolls.map((roll) => SdxRollSD.getRollLabel(roll.type, roll.options.DC, roll.contest, roll.options));
            const currentRollLabel = SdxRollSD.getRollLabel(rollData.type, rollData.options.DC, rollData.contest, rollData.options);
            if (!recentRollsLabels.includes(currentRollLabel)) {
                recentRolls.unshift(rollData);
                recentRolls.splice(10);
                setSDXROLLSSetting("recentRolls", recentRolls);
            }
        } catch (e) {
            console.error("Sdx Rolls SD: Error encountered parsing recent rolls. Recent rolls will be reset.");
            setSDXROLLSSetting("recentRolls", []);
        }
        
        SocketSD.dispatchSdxRoll(rollData);
        this.close();
    }

    _compileRollData(ignoreErrors = false) {
        const selectedActors = this.element[0].querySelectorAll(".selected-actors .actor:not(.contestant)");
        const contestants = this.element[0].querySelectorAll(".selected-actors .contestant");
        const rollType = this.element[0].querySelector(".roll-types .selected");
        const rollContest = this.element[0].querySelector(".roll-types .contestant");
        const rollOptions = {};
        
        const formGroups = Array.from(this.element[0].querySelectorAll(".form-group"));
        for (const group of formGroups) {
            const input = group.querySelector("input");
            if (input) {
                if (input.type === "number") {
                    rollOptions[group.dataset.name] = parseInt(input.value) || 0;
                } else if (input.type === "color") {
                    rollOptions[group.dataset.name] = input.value;
                } else {
                    rollOptions[group.dataset.name] = input.value;
                }
            } else {
                const checkbox = group.querySelector("i.toggle");
                if (checkbox) {
                    rollOptions[group.dataset.name] = checkbox.classList.contains("fa-toggle-on");
                }
            }
        }

        const rollData = {
            actors: Array.from(selectedActors).map((li) => li.dataset.uuid),
            contestants: Array.from(contestants).map((li) => li.dataset.uuid),
            type: rollType ? rollType.dataset.type + "." + rollType.dataset.key : null,
            contest: rollContest ? rollContest.dataset.type + "." + rollContest.dataset.key : null,
            options: rollOptions,
        };

        if (rollData.contestants.length && !rollData.contest) {
            rollData.contest = rollData.type;
        }

        if (ignoreErrors) return rollData;

        let error;

        if (!rollData.actors.length) {
            error = "noActors";
        }
        if (!rollData.type) {
            error = "noType";
        }
        if (rollData.contest && !rollData.contestants.length) {
            error = "noContestants";
        }

        if (error) {
            ui.notifications.error(game.i18n.localize(`SHADOWDARK_EXTRAS.SDXROLLS.getRollData.ERROR.${error}`));
            return null;
        }

        return rollData;
    }

    _updateObject(event, formData) {}

    _getHeaderButtons() {
        const buttons = super._getHeaderButtons();
        buttons.forEach((button) => {
            button.label = "";
        });
        return buttons;
    }
}
