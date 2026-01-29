/**
 * Helper class for selecting ammunition during ranged attacks.
 */
export default class AmmunitionSelector {
    /**
     * Prompt the user to select ammunition for a weapon.
     * @param {Actor} actor - The actor making the attack.
     * @param {Item} weapon - The weapon being used.
     * @returns {Promise<Item|undefined>} - The selected ammunition item, or undefined if cancelled.
     */
    static async select(actor, weapon) {
        const ammunition = actor.items.filter(i =>
            i.system.isAmmunition &&
            i.system.quantity > 0
        );

        if (ammunition.length === 0) {
            return undefined;
        }

        if (ammunition.length === 1) {
            return ammunition[0];
        }

        // Prioritize the preferred ammunition if set on the weapon
        const preferredAmmoKey = weapon.system.ammoClass;
        if (preferredAmmoKey) {
            const preferred = ammunition.find(i => i.name.slugify() === preferredAmmoKey);
            if (preferred) {
                // We still might want to show a dialog if there are multiple choices,
                // or maybe just default to the preferred one if it's there?
                // The user wants "Flexible Ammunition Selection", so a dialog is safer 
                // if there are multiple types.
            }
        }

        // Sort to show preferred first
        ammunition.sort((a, b) => {
            const aIsPreferred = a.name.slugify() === preferredAmmoKey;
            const bIsPreferred = b.name.slugify() === preferredAmmoKey;
            if (aIsPreferred && !bIsPreferred) return -1;
            if (!aIsPreferred && bIsPreferred) return 1;
            return a.name.localeCompare(b.name);
        });

        const content = await foundry.applications.handlebars.renderTemplate(
            "modules/shadowdark-extras/templates/ammunition-selector.hbs",
            { ammunition }
        );

        return new Promise(resolve => {
            new Dialog({
                title: game.i18n.localize("SHADOWDARK_EXTRAS.ammunition.selector.title"),
                content: content,
                buttons: {
                    use: {
                        icon: '<i class="fas fa-check"></i>',
                        label: game.i18n.localize("SHADOWDARK_EXTRAS.ammunition.selector.use"),
                        callback: html => {
                            const ammoId = html.find("input[name='ammunition']:checked").val();
                            resolve(actor.items.get(ammoId));
                        }
                    },
                    cancel: {
                        icon: '<i class="fas fa-times"></i>',
                        label: game.i18n.localize("SHADOWDARK.dialog.general.cancel"),
                        callback: () => resolve(undefined)
                    }
                },
                default: "use",
                close: () => resolve(undefined)
            }).render(true);
        });
    }
}
