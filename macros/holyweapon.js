// Holy Weapon Spell Macro
// Adds +1 to hit and +1 to damage to a chosen non-magical weapon
// Bonuses are removed when the spell ends
const MODULE_ID = "shadowdark-extras";
// Get the first target
const target = Array.from(game.user.targets)[0];
if (!target) {
    ui.notifications.warn("You must target a creature to cast Holy Weapon!");
    return;
}
const targetActor = target.actor;
if (!targetActor) {
    ui.notifications.warn("Target has no actor!");
    return;
}
// Get all weapons from the target
const weapons = targetActor.items.filter(item => item.type === "Weapon");
if (weapons.length === 0) {
    ui.notifications.warn(`${targetActor.name} has no weapons!`);
    return;
}
// Filter for non-magical weapons only
// Check if weapon has any existing bonuses or magical properties
const nonMagicalWeapons = weapons.filter(weapon => {
    // Check if weapon has the magical property or existing bonuses
    const hasExistingBonuses = weapon.getFlag(MODULE_ID, "weaponBonus")?.enabled;
    const isMagical = weapon.system?.magicItem || false;
    return !hasExistingBonuses && !isMagical;
});
if (nonMagicalWeapons.length === 0) {
    ui.notifications.warn(`${targetActor.name} has no non-magical weapons available!`);
    return;
}
// Create weapon selection dialog
const weaponChoices = nonMagicalWeapons.map(w => `
	<option value="${w.id}">${w.name}</option>
`).join('');
const content = `
	<form>
		<div class="form-group">
			<label>Choose a weapon to bless:</label>
			<select name="weaponId" style="width: 100%; margin-top: 5px;">
				${weaponChoices}
			</select>
		</div>
		<p style="margin-top: 10px; font-style: italic; font-size: 0.9em;">
			The chosen weapon will gain +1 to attack and damage rolls for the spell's duration.
		</p>
	</form>
`;
new Dialog({
    title: "Holy Weapon - Choose Weapon",
    content: content,
    buttons: {
        bless: {
            icon: '<i class="fas fa-hand-sparkles"></i>',
            label: "Bless Weapon",
            callback: async (html) => {
                const weaponId = html.find('[name="weaponId"]').val();
                const weapon = targetActor.items.get(weaponId);
                if (!weapon) {
                    ui.notifications.error("Weapon not found!");
                    return;
                }
                // Create the weapon bonus structure (correct format)
                const holyWeaponBonus = {
                    enabled: true,
                    hitBonuses: [{
                        formula: "1",
                        label: "Holy Weapon",
                        exclusive: false,
                        requirements: []
                    }],
                    damageBonuses: [{
                        formula: "1",
                        label: "Holy Weapon",
                        exclusive: false,
                        requirements: []
                    }],
                    damageBonus: "",
                    criticalExtraDice: "",
                    criticalExtraDamage: "",
                    requirements: [],
                    effects: [],
                    itemMacro: {
                        enabled: false,
                        runAsGm: false,
                        triggers: []
                    }
                };
                // Apply the bonuses to the weapon and mark as magical
                await weapon.update({
                    "system.magicItem": true,
                    [`flags.${MODULE_ID}.weaponBonus`]: holyWeaponBonus,
                    [`flags.${MODULE_ID}.holyWeaponSpellId`]: item.id,
                    [`flags.${MODULE_ID}.holyWeaponCasterId`]: actor.id
                });
                // Start duration tracking so the spell shows in the tracker
                // Access the exported function from the module's API
                const sdxModule = game.modules.get("shadowdark-extras");
                if (sdxModule?.api?.startDurationSpell) {
                    await sdxModule.api.startDurationSpell(actor, item, [target.id], {});
                } else {
                    ui.notifications.warn("Could not start duration tracking - module API not available");
                    console.warn("shadowdark-extras | startDurationSpell not found in module API");
                }
                // Notify success
                ui.notifications.info(`${weapon.name} has been blessed with holy power!`);
                // Post to chat
                ChatMessage.create({
                    speaker: ChatMessage.getSpeaker({ actor: actor }),
                    content: `<div class="shadowdark chat-card">
						<h3><i class="fas fa-hand-sparkles"></i> Holy Weapon</h3>
						<p><strong>${actor.name}</strong> blesses <strong>${targetActor.name}'s ${weapon.name}</strong> with holy power!</p>
						<p><em>The weapon glows with divine energy, granting +1 to attack and damage rolls for ${item.system.duration.value} rounds.</em></p>
					</div>`
                });
            }
        },
        cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel"
        }
    },
    default: "bless"
}).render(true);