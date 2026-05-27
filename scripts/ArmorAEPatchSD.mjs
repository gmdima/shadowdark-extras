/**
 * Enhancement to Shadowdark active-effect suppression logic.
 *
 * Shadowdark 4.0.x natively suppresses effects for stashed and unequipped
 * items. This patch extends that logic to also suppress effects for
 * unidentified items (e.g., hiding a curse until it is identified).
 *
 * We patch the prototype once during `init` and delegate to the native
 * getter for standard behavior.
 */

export function patchArmorActiveEffects() {
    const cls = CONFIG.ActiveEffect.documentClass;
    if (!cls) {
        console.warn("shadowdark-extras | ArmorAEPatch: CONFIG.ActiveEffect.documentClass not found, skipping patch.");
        return;
    }

    const proto = cls.prototype;

    // Capture whatever getter already exists up the chain so we can delegate to it.
    let originalGetter = null;
    let p = Object.getPrototypeOf(proto);
    while (p && p !== Object.prototype) {
        const desc = Object.getOwnPropertyDescriptor(p, "isSuppressed");
        if (desc?.get) { originalGetter = desc.get; break; }
        p = Object.getPrototypeOf(p);
    }

    Object.defineProperty(proto, "isSuppressed", {
        configurable: true,
        enumerable: false,
        get() {
            // SD v4.0.x natively covers stashed + equipped — we only add unidentified
            if (this.parent?.system?.identification?.identified === false) return true;

            // Defer everything else (stashed, equipped, etc.) to the native getter
            return originalGetter ? originalGetter.call(this) : false;
        }
    });

    console.log("shadowdark-extras | ArmorAEPatch: isSuppressed patched — effects suppressed for unidentified items.");
}
