/**
 * Mass Healing - Item Macro
 * Heals all player character tokens within 5 feet of the caster
 * Healing: 2d6 (doubled on critical)
 * 
 * Set as "On Success" trigger in Item Macro
 */

// Get the caster's token
const casterToken = canvas.tokens.get(speaker.token);
if (!casterToken) {
    ui.notifications.warn("No caster token found!");
    return;
}

// Check if this was a critical success
// isCritical is provided in the macro scope by shadowdark-extras
const critStatus = typeof isCritical !== 'undefined' ? isCritical : false;

// Roll the healing
const healDice = critStatus ? "4d6" : "2d6";
const healRoll = await new Roll(healDice).evaluate();

// Get all tokens within 5 feet (includes caster)
const maxDistance = 5; // feet
const tokensToHeal = canvas.tokens.placeables.filter(token => {
    // Skip the caster's own token (assuming caster doesn't heal self with this spell)
    // speaker.token is the ID of the caster's token document
    if (token.id === speaker.token) return false;

    // Only include player character tokens (not NPCs)
    const actor = token.actor;
    if (!actor || actor.type !== "Player") return false;

    // Calculate distance
    const distance = canvas.grid.measurePath([canvas.tokens.get(speaker.token).center, token.center]).distance;
    return distance <= maxDistance;
});

if (tokensToHeal.length === 0) {
    ui.notifications.info("No player characters within 5 feet to heal.");

    // Still show the roll
    await healRoll.toMessage({
        speaker: speaker,
        flavor: `<strong>Mass Healing</strong> - No targets in range${critStatus ? " (Critical!)" : ""}`
    });
    return;
}

// Apply healing to each token
const healAmount = healRoll.total;
const healedNames = [];

for (const token of tokensToHeal) {
    const actor = token.actor;
    const currentHP = actor.system.attributes.hp.value;
    const maxHP = actor.system.attributes.hp.max;
    const newHP = Math.min(currentHP + healAmount, maxHP);
    const actualHeal = newHP - currentHP;

    if (actualHeal > 0) {
        await actor.update({ "system.attributes.hp.value": newHP });
        healedNames.push(`${token.name} (+${actualHeal} HP)`);
    } else {
        healedNames.push(`${token.name} (already at max)`);
    }
}

// Create chat message with results
const content = `
<div class="mass-healing-result">
    <strong>Mass Healing${critStatus ? " (Critical!)" : ""}</strong>
    <p>Healing: ${healRoll.total} HP</p>
    <hr>
    <p><strong>Healed:</strong></p>
    <ul>
        ${healedNames.map(n => `<li>${n}</li>`).join("")}
    </ul>
</div>
`;

await ChatMessage.create({
    speaker: speaker,
    content: content,
    rolls: [healRoll],
    type: CONST.CHAT_MESSAGE_STYLES.OTHER
});
