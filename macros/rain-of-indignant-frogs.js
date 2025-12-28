// Rain of Indignant Frogs - Item Macro
// System: Shadowdark | Foundry VTT V13
// Uses SDX.templates API for template placement
// Template: 30x30 square, 1d6 damage (2d6 on critical)

// Get critical status from itemMacro context
const isCritical = args?.critical === "success" || args?.isCritical || false;
const caster = args?.actor || canvas.tokens.controlled[0]?.actor;

if (!caster) {
    ui.notifications.warn("No caster found!");
    return;
}

// Check if SDX.templates is available
if (!globalThis.SDX?.templates) {
    ui.notifications.error("SDX.templates API not found. Make sure shadowdark-extras is enabled.");
    return;
}

// 1. Place template and get tokens using the SDX API
const { template, tokens } = await SDX.templates.placeAndTarget({
    type: "rect",
    size: 30,
    fillColor: "#4e9a06",
    autoDelete: 3000  // Delete template after 3 seconds
});

if (!template) {
    ui.notifications.info("Spell cancelled.");
    return;
}

// 2. Roll damage (1d6, or 2d6 on critical)
const damageFormula = isCritical ? "2d6" : "1d6";
const damageRoll = await new Roll(damageFormula).evaluate();

// 3. Create chat message with results
const targetNames = tokens.map(t => t.name).join(", ") || "No targets";
const critText = isCritical ? " <strong style='color: #90EE90;'>(CRITICAL!)</strong>" : "";

const chatContent = `
<div style="background: linear-gradient(135deg, #1a472a 0%, #2d5a27 100%); 
            padding: 10px; border-radius: 8px; border: 2px solid #4CAF50; color: #e0ffe0;">
    <h3 style="margin: 0 0 8px 0; text-align: center; color: #90EE90;">
        🐸 Rain of Indignant Frogs! 🐸
    </h3>
    <p style="margin: 4px 0; font-style: italic; text-align: center;">
        Angry frogs rain down from above!${critText}
    </p>
    <hr style="border-color: #4CAF50; margin: 8px 0;">
    <p style="margin: 4px 0;"><strong>Damage:</strong> ${damageRoll.total} (${damageRoll.formula})</p>
    <p style="margin: 4px 0;"><strong>Targets (${tokens.length}):</strong> ${targetNames}</p>
</div>
`;

await ChatMessage.create({
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor: caster }),
    content: chatContent,
    rolls: [damageRoll]
});

// 4. Apply damage to each target (Shadowdark method)
for (const token of tokens) {
    if (token.actor?.applyDamage) {
        await token.actor.applyDamage(damageRoll.total, 1);
    }
}

// 5. Optional: Sequencer animation (if module is active)
if (game.modules.get("sequencer")?.active) {
    new Sequence()
        .effect()
        .file("jb2a.impact.003.green")
        .atLocation(template.object)
        .scale(2.5)
        .play();
}
