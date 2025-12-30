/**
 * Mirror Image - Item Macro
 * Creates illusory duplicates equal to half your level (min 1).
 * Duplicates evaporate when targeted by an attack, causing the attack to miss.
 * 
 * Set as "On Success" trigger in Item Macro
 */

const MODULE_ID = "shadowdark-extras";

// Get caster level and calculate duplicates
const casterLevel = actor?.system?.attributes?.level?.value || 1;
const numDuplicates = Math.max(1, Math.floor(casterLevel / 2));

// Set actor flag for automation to pick up
await actor.setFlag(MODULE_ID, "mirrorImages", numDuplicates);

// Add visual effect for tracking
const effectData = {
    name: "Mirror Image",
    icon: "icons/magic/control/silhouette-grow-white.webp",
    origin: item.uuid,
    duration: {
        rounds: 5,
        seconds: 30
    },
    flags: {
        [MODULE_ID]: {
            isMirrorImage: true,
            duplicates: numDuplicates
        }
    },
    statuses: ["mirror-image"]
};

// Check if effect already exists, if so update it, otherwise create
const existingEffect = actor.effects.find(e => e.getFlag(MODULE_ID, "isMirrorImage"));
if (existingEffect) {
    await existingEffect.update({
        "flags.shadowdark-extras.duplicates": numDuplicates,
        "duration.rounds": 5
    });
} else {
    await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
}

// Start duration tracking if API is available
const sdxModule = game.modules.get(MODULE_ID);
if (sdxModule?.api?.startDurationSpell) {
    // If we have a token, we can use it for location-based tracking if needed
    // But Mirror Image is person-centered
    const targetIds = token ? [token.id] : [];
    await sdxModule.api.startDurationSpell(actor, item, targetIds, {
        duplicates: numDuplicates
    });
}

// Post result to chat
const content = `
<div class="shadowdark chat-card">
    <h3><i class="fas fa-clone"></i> Mirror Image</h3>
    <p><strong>${actor.name}</strong> creates <strong>${numDuplicates}</strong> illusory duplicate${numDuplicates > 1 ? 's' : ''}!</p>
    <p><em>The duplicates surround the caster and mimic their movements. Each time a creature attacks, one duplicate evaporates and the attack misses.</em></p>
</div>
`;

await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: content
});

ui.notifications.info(`${actor.name} created ${numDuplicates} mirror images.`);
