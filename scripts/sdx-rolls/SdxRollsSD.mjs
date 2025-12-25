import { SdxRollSD } from "./SdxRollSD.mjs";
import { GetRollDataSD } from "./GetRollDataSD.mjs";
import { SocketSD } from "./SocketSD.mjs";
import { APIQueueSD } from "./APIQueueSD.mjs";

export const MODULE_ID = "shadowdark-extras";
export const SDX_ROLLS_ID = "sdx-rolls-sd";

const API_REQUEST_QUEUE = new APIQueueSD();

/**
 * Initialize Sdx Rolls for Shadowdark
 */
export function initSDXROLLS() {
    globalThis.ui.SdxRollsSD = {
        SdxRoll: SdxRollSD,
        GetRollData: GetRollDataSD,
        Socket: SocketSD,
        _queue: [],
        requestRoll: async (data) => {
            const firstActiveUser = game.users.find((u) => u.active);
            const res = await SocketSD.routeRequest(data, { users: [firstActiveUser.id] });
            return res[0].response;
        },
    };
    registSDXXROLLSSettings();
}

/**
 * Setup Sdx Rolls sockets on ready
 */
export function setupSDXROLLSSockets() {
    SocketSD.register("updateSdxRoll", (data) => {
        ui.SdxRollsSD._currentRoll.update(data);
    });
    
    SocketSD.register(
        "routeRequest",
        async (data) => {
            const response = await API_REQUEST_QUEUE.queueResponse(data);
            if (response.error) return { error: response.error };
            if (response.queue) {
                return await ui.SdxRollsSD._queue[response.index].promise;
            }
            return await ui.SdxRollsSD._currentRoll.promise;
        },
        { response: true },
    );
    
    SocketSD.register(
        "dispatchSdxRoll",
        (data) => {
            if (data.actors) data.actors = data.actors.map((a) => a?.uuid || a);
            if (data.contestants) data.contestants = data.contestants.map((a) => a?.uuid || a);
            if (ui.SdxRollsSD._currentRoll) {
                const er = new SdxRollSD(data);
                ui.SdxRollsSD._queue.push(er);
                const index = ui.SdxRollsSD._queue.length - 1;
                return { queue: true, index };
            }
            new SdxRollSD(data).init().render(true);
            return { response: true };
        },
        { response: true },
    );
    
    SocketSD.register("endSdxRoll", (data) => {
        ui.SdxRollsSD._currentRoll.endSdxRoll(data);
    });
    
    SocketSD.register("toggleRollButton", (data) => {
        ui.SdxRollsSD._currentRoll.toggleRollButton(data.uuid, data.rolling);
    });
    
    SocketSD.register(
        "recoverQueue",
        (data) => {
            let currentRollData = null;
            if (ui.SdxRollsSD._currentRoll) {
                const rollData = { ...ui.SdxRollsSD._currentRoll.rollData };
                const results = ui.SdxRollsSD._currentRoll._results;
                const rolls = ui.SdxRollsSD._currentRoll._rolls;
                const messageIds = Array.from(ui.SdxRollsSD._currentRoll._messageIds);
                rollData.recovered = {
                    results,
                    rolls,
                    messageIds,
                };
                currentRollData = rollData;
            }
            return { queue: ui.SdxRollsSD._queue.map((er) => er.rollData), current: currentRollData };
        },
        { response: true },
    );

    recoverQueue();
}

async function recoverQueue() {
    const res = await SocketSD.recoverQueue({});
    const queues = res.map((r) => r.response.queue);
    const current = res.map((r) => r.response.current).find((r) => r);
    
    if (queues.length) {
        let longestQueue = queues[0];
        queues.forEach((queue) => {
            if (queue.length > longestQueue.length) {
                longestQueue = queue;
            }
        });
        longestQueue.forEach((data) => {
            ui.SdxRollsSD._queue.push(new SdxRollSD(data));
        });
    }
    
    if (current) {
        new SdxRollSD(current).init().render(true);
    }
}

/**
 * Inject the Sdx Roll button into the chat sidebar
 */
export function injectSdxRollButton() {
    if (!game.user.isGM) return;
    
    // Find the control-buttons within #chat-controls
    const target = document.querySelector("#chat-controls .control-buttons");
    if (!target) {
        return;
    }
    const existing = target.querySelector(".sdx-roll-sd-chat-control");
    if (existing) return;
    
    const label = document.createElement("button");
    label.type = "button";
    label.classList.add("sdx-roll-sd-chat-control", "ui-control", "icon", "fa-solid", "fa-dice-d20");
    label.dataset.tooltip = game.i18n.localize(`SHADOWDARK_EXTRAS.SDXROLLS.buttonTooltip`);
    label.dataset.tooltipDirection = "LEFT";
    
    label.addEventListener("click", () => {
        new GetRollDataSD().render(true);
    });
    
    label.addEventListener("contextmenu", (e) => {
        const existingMenu = document.querySelector(".sdx-recent-rolls");
        if (existingMenu) return;
        
        const recentRolls = getSDXROLLSSetting("recentRolls");
        const wrapper = document.createElement("div");
        const ul = document.createElement("ul");
        wrapper.appendChild(ul);
        wrapper.classList.add("sdx-recent-rolls");

        recentRolls.forEach((roll) => {
            const li = document.createElement("li");
            li.innerHTML = SdxRollSD.getRollLabel(roll.type, roll.options.DC, roll.contest, roll.options);
            ul.appendChild(li);
            li.addEventListener("click", () => {
                new GetRollDataSD(roll).render(true);
            });
        });
        
        const labelPos = label.getBoundingClientRect();
        wrapper.style.bottom = `${window.innerHeight - labelPos.bottom + labelPos.height + 2}px`;
        wrapper.style.right = `${window.innerWidth - labelPos.right}px`;
        document.body.appendChild(wrapper);
        
        const listener = () => {
            wrapper.remove();
            document.removeEventListener("click", listener);
        };
        document.addEventListener("click", listener);
    });
    
    target.prepend(label);
}

/**
 * Register Sdx Rolls settings
 */
function registSDXXROLLSSettings() {
    const settings = {
        SDXROLLSRecentRolls: {
            scope: "world",
            config: false,
            type: Array,
            default: [],
        },
        SDXROLLSDefaultOptions: {
            scope: "world",
            config: false,
            type: Object,
            default: {
                showRollResults: true,
                color: 0,
                autoColor: true,
            },
        },
        SDXROLLSRecapMessage: {
            name: `SHADOWDARK_EXTRAS.SDXROLLS.settings.recapMessage.name`,
            hint: `SHADOWDARK_EXTRAS.SDXROLLS.settings.recapMessage.hint`,
            scope: "world",
            config: true,
            type: String,
            choices: {
                none: `SHADOWDARK_EXTRAS.SDXROLLS.settings.recapMessage.options.none`,
                gm: `SHADOWDARK_EXTRAS.SDXROLLS.settings.recapMessage.options.gm`,
                public: `SHADOWDARK_EXTRAS.SDXROLLS.settings.recapMessage.options.public`,
            },
            default: "gm",
        },
        SDXROLLSCleanupMessages: {
            name: `SHADOWDARK_EXTRAS.SDXROLLS.settings.cleanupMessages.name`,
            hint: `SHADOWDARK_EXTRAS.SDXROLLS.settings.cleanupMessages.hint`,
            scope: "world",
            config: true,
            type: Boolean,
            default: false,
        },
        SDXROLLSIntroSound: {
            name: `SHADOWDARK_EXTRAS.SDXROLLS.settings.introSound.name`,
            hint: `SHADOWDARK_EXTRAS.SDXROLLS.settings.introSound.hint`,
            scope: "world",
            config: true,
            type: String,
            default: "sounds/notify.wav",
            filePicker: "audio",
        },
        SDXROLLSSuccessSound: {
            name: `SHADOWDARK_EXTRAS.SDXROLLS.settings.successSound.name`,
            hint: `SHADOWDARK_EXTRAS.SDXROLLS.settings.successSound.hint`,
            scope: "world",
            config: true,
            type: String,
            default: "sounds/drums.wav",
            filePicker: "audio",
        },
        SDXROLLSFailureSound: {
            name: `SHADOWDARK_EXTRAS.SDXROLLS.settings.failureSound.name`,
            hint: `SHADOWDARK_EXTRAS.SDXROLLS.settings.failureSound.hint`,
            scope: "world",
            config: true,
            type: String,
            default: "sounds/lock.wav",
            filePicker: "audio",
        },
        SDXROLLSBannerColor: {
            name: `SHADOWDARK_EXTRAS.SDXROLLS.settings.bannerColor.name`,
            hint: `SHADOWDARK_EXTRAS.SDXROLLS.settings.bannerColor.hint`,
            scope: "world",
            config: true,
            type: String,
            default: "#8b0000",
        },
        SDXROLLSBannerImage: {
            name: `SHADOWDARK_EXTRAS.SDXROLLS.settings.bannerImage.name`,
            hint: `SHADOWDARK_EXTRAS.SDXROLLS.settings.bannerImage.hint`,
            scope: "world",
            config: true,
            type: String,
            default: "",
            filePicker: "image",
        },
    };
    
    for (const [key, value] of Object.entries(settings)) {
        game.settings.register(MODULE_ID, key, value);
    }
}

/**
 * Get an Sdx Rolls setting
 * @param {string} key - The setting key (without prefix)
 * @returns {*} The setting value
 */
export function getSDXROLLSSetting(key) {
    const settingKey = `SDXROLLS${key.charAt(0).toUpperCase() + key.slice(1)}`;
    return game.settings.get(MODULE_ID, settingKey);
}

/**
 * Set an Sdx Rolls setting
 * @param {string} key - The setting key (without prefix)
 * @param {*} value - The value to set
 * @returns {Promise<*>} The set value
 */
export async function setSDXROLLSSetting(key, value) {
    const settingKey = `SDXROLLS${key.charAt(0).toUpperCase() + key.slice(1)}`;
    return await game.settings.set(MODULE_ID, settingKey, value);
}
