/**
 * Sdx Roll Application for Shadowdark
 * The fullscreen rolling animation display
 */

import { SocketSD } from "./SocketSD.mjs";
import { MODULE_ID, getSDXROLLSSetting } from "./SdxRollsSD.mjs";

export class SdxRollSD extends Application {
    constructor(rollData) {
        super();
        this.rollData = rollData;
        this._resolve;
        this._reject;
        this.promise = new Promise((resolve, reject) => {
            this._resolve = resolve;
            this._reject = reject;
        });
    }

    init() {
        const recovered = this.rollData.recovered;
        this.prepareData();
        ui.SdxRollsSD._currentRoll = this;
        this._results = {};
        this._rolls = {};
        this._messageIds = new Set();
        if (recovered) {
            this._recovered = true;
            this._results = recovered.results;
            this._rolls = recovered.rolls;
            this._messageIds = new Set(recovered.messageIds);
        }
        return this;
    }

    static get APP_ID() {
        return "sdx-roll-sd";
    }

    get APP_ID() {
        return this.constructor.APP_ID;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: this.APP_ID,
            template: `modules/${MODULE_ID}/templates/sdx-rolls/sdx-roll-sd.hbs`,
            popOut: false,
            title: game.i18n.localize(`SHADOWDARK_EXTRAS.SDXROLLS.title`),
        });
    }

    prepareData() {
        this.actors = this.rollData.actors.map((actor) => fromUuidSync(actor));
        this.contestants = this.rollData.contestants.map((actor) => fromUuidSync(actor));
        this.rollOptions = this.rollData.options;
        this.rollOptions.showDC = this.rollOptions.showDC || game.user.isGM;
        this.rollOptions.hideNames = this.rollOptions.hideNames;
        this.type = this.rollData.type;
        this.contest = this.rollData.contest;
        
        // Set banner color from settings or options
        const bannerColor = this.rollOptions.color || getSDXROLLSSetting("bannerColor") || "#8b0000";
        const bannerImage = getSDXROLLSSetting("bannerImage");
        
        document.documentElement.style.setProperty("--sdx-banner-color", bannerColor);
        if (bannerImage) {
            // Ensure the path starts with / for absolute URL resolution
            const imagePath = bannerImage.startsWith("/") ? bannerImage : `/${bannerImage}`;
            document.documentElement.style.setProperty("--sdx-banner-image", `url("${imagePath}")`);
        } else {
            document.documentElement.style.setProperty("--sdx-banner-image", "none");
        }
    }

    async getData() {
        const showDC = this.rollOptions.showDC || game.user.isGM;
        const introLabel = SdxRollSD.getRollLabel(
            this.rollData.type, 
            showDC ? this.rollData.options.DC : null, 
            this.rollData.contest, 
            this.rollData.options
        );
        this._introLabel = introLabel;
        return { 
            introLabel, 
            actors: this.actors, 
            contestants: this.contestants, 
            options: this.rollOptions, 
            isGM: game.user.isGM 
        };
    }

    activateListeners(html) {
        super.activateListeners(html);
        html = html[0] ?? html;
        this.executeIntroAnimation(html);
        
        html.querySelectorAll("span.adv, span.dis").forEach((span) => {
            span.addEventListener("click", this._onClickAdvDis.bind(this));
        });
        
        html.querySelectorAll(".roll").forEach((roll) => {
            roll.addEventListener("click", this.roll.bind(this));
        });
        
        if (this.rollOptions.allowReroll || game.user.isGM) {
            html.querySelectorAll(".result").forEach((roll) => {
                roll.addEventListener("click", this.roll.bind(this));
            });
        }
        
        html.querySelector(".end-sdx-roll").addEventListener("click", () => {
            SocketSD.endSdxRoll({ abort: true });
        });
        
        html.querySelector(".end-sdx-roll-manual").addEventListener("click", (e) => {
            e.preventDefault();
            SocketSD.endSdxRoll({ button: true });
            e.currentTarget.classList.add("sdx-hidden-2");
        });
        
        this.recoverState();
        this.setAdvDis();
    }

    setAdvDis() {
        const rollSettings = this.rollOptions.rollSettings;
        if (!rollSettings?.length) return;
        
        for (const rollSetting of rollSettings) {
            const uuid = rollSetting.uuid;
            const actorCard = this.element[0].querySelector(`.actor-card[data-uuid="${uuid}"]`);
            if (!actorCard) continue;
            const rollBadge = actorCard.querySelector(".roll-badge");
            if (!rollBadge) continue;
            const adv = rollBadge.querySelector("span.adv");
            const dis = rollBadge.querySelector("span.dis");
            if (rollSetting.advantage) adv.classList.add("active");
            if (rollSetting.disadvantage) dis.classList.add("active");
            if (rollSetting.autoRoll && game.users.activeGM === game.user) {
                setTimeout(() => {
                    this.roll({ currentTarget: actorCard.querySelector(".roll") });
                }, 1000);
            }
        }
    }

    _onClickAdvDis(e) {
        const span = e.currentTarget;
        const other = Array.from(span.closest(".roll-badge").querySelectorAll("span.adv, span.dis")).find((s) => s !== span);
        if (other.classList.contains("active")) {
            other.classList.remove("active");
        }
        span.classList.toggle("active");
    }

    async executeIntroAnimation(html) {
        const soundPath = getSDXROLLSSetting("introSound");
        console.log("SDX Rolls - Intro sound path:", soundPath);
        if (soundPath) {
            try {
                await foundry.audio.AudioHelper.play({ src: soundPath, volume: 0.8, autoplay: true, loop: false }, false);
            } catch (e) {
                console.error("SDX Rolls - Error playing intro sound:", e);
            }
        }

        const introText = html.querySelector(".intro-text");
        const introTextPromise = new Promise((resolve) => {
            introText.addEventListener("animationend", () => {
                introText.remove();
                resolve();
            });
        });
        await introTextPromise;
        
        const actorCardsContainer = html.querySelector(".actor-cards");
        actorCardsContainer.classList.remove("sdx-hidden");
        
        const actorCards = actorCardsContainer.querySelectorAll(".actor-card");
        const cardCount = actorCards.length;
        actorCards.forEach((card, index) => {
            card.animate([{ transform: `translateX(-${100 * (index + 1)}vw)` }, { transform: "translateX(0)" }], {
                duration: 700,
                easing: "ease-in-out",
                fill: "forwards",
                delay: (cardCount - index) * 150,
            });
        });
    }

    async executeOutroAnimation(html, isSuccess) {
        const soundPath = isSuccess ? getSDXROLLSSetting("successSound") : getSDXROLLSSetting("failureSound");

        await SdxRollSD.wait(2000);
        const actorCardsContainer = html.querySelector(".actor-cards");
        const actorCards = actorCardsContainer.querySelectorAll(".actor-card");
        const cardCount = actorCards.length;
        
        actorCards.forEach((card, index) => {
            card.animate([{ transform: "translateX(0)" }, { transform: `translateX(100vw)` }], {
                duration: 500,
                easing: "ease-in-out",
                fill: "forwards",
                delay: (cardCount - index) * 100,
            });
        });
        
        await SdxRollSD.wait(500 + cardCount * 100);
        actorCardsContainer.remove();

        if (this.rollOptions.showRollResults && isSuccess !== undefined) {
            const outroText = html.querySelector(".outro-text");
            outroText.textContent = game.i18n.localize(`SHADOWDARK_EXTRAS.SDXROLLS.${isSuccess ? "success" : "failure"}`) + "!";
            outroText.classList.remove("sdx-hidden");
            outroText.animate([{ opacity: 0 }, { opacity: 1 }], {
                duration: 300,
                easing: "ease-in-out",
                fill: "forwards",
            });
            if (soundPath) {
                console.log("SDX Rolls - Outro sound path:", soundPath);
                try {
                    await foundry.audio.AudioHelper.play({ src: soundPath, volume: 0.8, autoplay: true, loop: false }, false);
                } catch (e) {
                    console.error("SDX Rolls - Error playing outro sound:", e);
                }
            }
            await SdxRollSD.wait(3000);
        }
        
        html.animate([{ opacity: 1 }, { opacity: 0 }], {
            duration: 500,
            easing: "ease-in-out",
            fill: "forwards",
        });
        await SdxRollSD.wait(500);
        await this.close();
        return true;
    }

    async roll(e) {
        const rollButton = e.currentTarget;
        const uuid = rollButton.closest(".actor-card").dataset.uuid;
        const adv = rollButton.closest(".roll-badge").querySelector("span.adv").classList.contains("active");
        const dis = rollButton.closest(".roll-badge").querySelector("span.dis").classList.contains("active");
        
        SocketSD.toggleRollButton({ uuid, rolling: true });
        
        const ff = adv || dis || !e.shiftKey;
        if (ff) e = null;
        
        const actor = fromUuidSync(uuid);
        const isContestant = this.contestants.some((c) => c.uuid === uuid);
        const rollType = isContestant ? this.contest : this.type;
        const [type, key] = rollType.split(".");
        const isBlind = this.rollOptions.blindRoll;
        const rollMode = isBlind ? "blindroll" : "publicroll";

        let result;

        // Shadowdark stat check - uses d20 + stat modifier
        if (type === "stat") {
            // Get the stat modifier from the actor
            const statValue = actor.system.abilities?.[key]?.mod ?? 0;
            
            // Build the roll formula
            let formula = "1d20";
            if (adv && !dis) formula = "2d20kh";
            else if (dis && !adv) formula = "2d20kl";
            
            formula += ` + ${statValue}`;
            
            const roll = new Roll(formula, actor.getRollData());
            await roll.evaluate();
            result = roll;
            
        } else if (type === "custom") {
            // Custom formula roll
            const roll = new Roll(this.rollOptions.formula || "1d20", actor.getRollData());
            await roll.evaluate();
            result = roll;
        }

        if (!result) {
            SocketSD.toggleRollButton({ uuid, rolling: false });
            return;
        }

        result = Array.isArray(result) ? result[0] : result;
        const value = Math.round(result.total);
        
        // Create the chat message
        const message = await result.toMessage(
            { speaker: ChatMessage.getSpeaker({ actor }) }, 
            { rollMode, create: true }
        );

        if (!isBlind) await this.waitForMessageRender(message?.id);

        SocketSD.toggleRollButton({ uuid, rolling: false });
        
        // Check for natural 20 or natural 1
        const die = result.dice[0];
        const isCritical = die && die.total === 20;
        const isFumble = die && die.total === 1;

        SocketSD.updateSdxRoll({ 
            uuid, 
            value, 
            isCritical, 
            isFumble, 
            rollData: result, 
            messageId: message?.id 
        });
    }

    async waitForMessageRender(messageId) {
        if (!messageId) return true;

        const timeoutMs = 5000;
        const pollInterval = 50;
        let elapsed = 0;

        return new Promise((resolve) => {
            const check = () => {
                const msgEl = document.querySelector(`.chat-log .message[data-message-id="${messageId}"]`);
                if (
                    msgEl &&
                    msgEl.offsetParent !== null &&
                    window.getComputedStyle(msgEl).display !== "none" &&
                    window.getComputedStyle(msgEl).visibility !== "hidden" &&
                    msgEl.offsetWidth > 0 &&
                    msgEl.offsetHeight > 0
                ) {
                    resolve(true);
                } else if (elapsed >= timeoutMs) {
                    console.warn("Sdx Rolls SD: waitForMessageRender timed out for message ID:", messageId);
                    resolve(true);
                } else {
                    elapsed += pollInterval;
                    setTimeout(check, pollInterval);
                }
            };
            check();
        });
    }

    toggleRollButton(uuid, rolling = false) {
        const actorCard = this.element[0].querySelector(`.actor-card[data-uuid="${uuid}"]`);
        const rollButton = actorCard.querySelector(".roll");
        rollButton.style.pointerEvents = rolling ? "none" : "auto";
        rollButton.classList.toggle("fa-shake", rolling);
    }

    recoverState() {
        if (!this._recovered) return;
        for (const [uuid, value] of Object.entries(this._results)) {
            const actorCard = this.element[0].querySelector(`.actor-card[data-uuid="${uuid}"]`);
            const data = this._rolls[uuid];
            const resultEl = actorCard.querySelector(".result");
            const hideResult = this.rollOptions.blindRoll && !game.user.isGM;
            resultEl.textContent = hideResult ? "?" : value;
            resultEl.classList.remove("sdx-hidden");
            if (data.isCritical && !hideResult) resultEl.classList.add("critical");
            if (data.isFumble && !hideResult) resultEl.classList.add("fumble");
            actorCard.querySelector(".roll").classList.add("sdx-hidden");
            if (this.rollOptions.blindRoll) resultEl.classList.add("blind");
        }
        delete this._recovered;
    }

    update(data) {
        this._results[data.uuid] = data.value;
        this._rolls[data.uuid] = data.rollData;
        if (data.messageId) this._messageIds.add(data.messageId);
        
        const actorCard = this.element[0].querySelector(`.actor-card[data-uuid="${data.uuid}"]`);
        const resultEl = actorCard.querySelector(".result");
        resultEl.textContent = this.rollOptions.blindRoll && !game.user.isGM ? "?" : data.value;
        resultEl.classList.remove("sdx-hidden");
        actorCard.querySelector(".roll").classList.add("sdx-hidden");
        if (data.isCritical) resultEl.classList.add("critical");
        if (data.isFumble) resultEl.classList.add("fumble");
        if (this.rollOptions.blindRoll) resultEl.classList.add("blind");
        
        actorCard.animate([{ transform: "scale(1.0)" }, { transform: "scale(1.1)" }, { transform: "scale(1.0)" }], {
            duration: 500,
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            fill: "forwards",
        });
        
        const allActors = this.actors.concat(this.contestants);
        const allResults = allActors.every((actor) => Number.isNumeric(this._results[actor.uuid]));
        if (allResults) {
            SocketSD.endSdxRoll({ abort: false });
        }
    }

    async endSdxRoll({ abort, button }) {
        if (this._ending) return;
        this._ending = true;
        if (abort) {
            this.resolveRoll(abort);
            return this.close();
        }
        const allowReroll = this.rollOptions.allowReroll;
        if (!button && allowReroll) {
            if (game.user.isGM) this.element[0].querySelector(".end-sdx-roll-manual").classList.remove("sdx-hidden-2");
            this._ending = false;
            return;
        }
        const isSuccess = this.computeSuccess();
        this.resolveRoll(abort, isSuccess);
        await this.executeOutroAnimation(this.element[0], isSuccess);
    }

    computeSuccess() {
        if (game.user === game.users.activeGM && getSDXROLLSSetting("cleanupMessages")) {
            ChatMessage.deleteDocuments(Array.from(this._messageIds));
        }
        if (!Number.isNumeric(this.rollOptions.DC) && !this.contestants.length) {
            this.createChatRecap(null, null);
            return undefined;
        }
        const dc = this.contestants.length 
            ? this.contestants.reduce((acc, c) => acc + this._results[c.uuid], 0) / this.contestants.length 
            : this.rollOptions.DC;
        let success;
        if (this.rollOptions.useAverage) {
            const average = this.actors.reduce((acc, a) => acc + this._results[a.uuid], 0) / this.actors.length;
            success = average >= dc;
        } else {
            const successCount = this.actors.filter((a) => this._results[a.uuid] >= dc).length;
            const half = Math.ceil(this.actors.length / 2);
            success = successCount >= half;
        }
        this.createChatRecap(dc, success);
        return success;
    }

    async createChatRecap(dc, success) {
        if (game.user !== game.users.activeGM) return;
        if (this.rollOptions.noMessage) return;
        const recapSetting = getSDXROLLSSetting("recapMessage");

        if (recapSetting === "none") return;

        const resultLabel = game.i18n.localize(`SHADOWDARK_EXTRAS.SDXROLLS.${success ? "success" : "failure"}`);

        const actorEntries = [];
        const contestantEntries = [];
        
        for (const actor of this.actors) {
            const result = this._results[actor.uuid];
            const roll = this._rolls[actor.uuid];
            const entry = {
                actor,
                result,
                roll,
                success: result >= dc,
            };
            actorEntries.push(entry);
        }
        
        for (const contestant of this.contestants) {
            const result = this._results[contestant.uuid];
            const roll = this._rolls[contestant.uuid];
            const entry = {
                actor: contestant,
                result,
                roll,
                success: result >= dc,
            };
            contestantEntries.push(entry);
        }

        const template = `modules/${MODULE_ID}/templates/sdx-rolls/chat-recap-sd.hbs`;
        const html = await renderTemplate(template, {
            label: this._introLabel,
            dc,
            successLabel: success !== undefined ? resultLabel : null,
            success,
            actors: actorEntries,
            contestants: contestantEntries,
            noDC: !Number.isNumeric(dc),
        });

        ChatMessage.create({
            user: game.user.id,
            whisper: recapSetting === "gm" || this.rollOptions.hideNames ? ChatMessage.getWhisperRecipients("GM") : null,
            speaker: { alias: game.i18n.localize(`SHADOWDARK_EXTRAS.SDXROLLS.SdxRoll`) },
            content: html,
        });
    }

    async resolveRoll(abort, isSuccess) {
        const results = [];
        for (const uuid of Object.keys(this._results)) {
            const actor = fromUuidSync(uuid);
            results.push({ actor, value: this._results[uuid], roll: this._rolls[uuid] });
        }
        this._resolve({ canceled: abort, results, success: isSuccess });
    }

    static async wait(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Generate a label for the roll
     * @param {string} rollKey - The roll type key (e.g., "stat.str")
     * @param {number|null} dc - The DC for the roll
     * @param {string|null} vs - The contest roll type
     * @param {object} options - Roll options
     * @returns {string} The roll label
     */
    static getRollLabel(rollKey, dc, vs, options = {}) {
        if (options.customLabel) return options.customLabel;
        
        const formula = options.formula;
        let rollName = "";
        
        if (Number.isNumeric(dc) && !vs) {
            rollName = `DC ${dc} `;
        }

        const getLabel = (rKey) => {
            const [type, key] = rKey.split(".");
            let label = "";
            
            if (type === "stat") {
                // Get the stat name from Shadowdark
                const statLabels = {
                    str: "SHADOWDARK.ability_strength",
                    dex: "SHADOWDARK.ability_dexterity",
                    con: "SHADOWDARK.ability_constitution",
                    int: "SHADOWDARK.ability_intelligence",
                    wis: "SHADOWDARK.ability_wisdom",
                    cha: "SHADOWDARK.ability_charisma"
                };
                label += game.i18n.localize(statLabels[key] || key.toUpperCase());
            }
            
            if (formula) {
                label += formula;
            }

            label += " ";

            if (type === "stat" || type === "custom") {
                label += game.i18n.localize(`SHADOWDARK_EXTRAS.SDXROLLS.check`);
            }

            label = label.replace(/\s+/g, " ");
            return label;
        };

        if (vs) {
            rollName += getLabel(rollKey) + " vs " + getLabel(vs);
        } else {
            rollName += getLabel(rollKey);
        }
        return rollName.trim();
    }

    async close(...args) {
        ui.SdxRollsSD._currentRoll = null;
        const res = await super.close(...args);
        if (ui.SdxRollsSD._queue.length) {
            const next = ui.SdxRollsSD._queue.shift();
            next.init().render(true);
        }
        return res;
    }
}
