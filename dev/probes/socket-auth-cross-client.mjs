// PROBE: Verify the GM auth gate fires when a non-owner player invokes a handler.
// Uses dev/fixtures: _SDX TestPC (owned by all players) and _SDX TestNPC (owned by none).
// Run dev/fixtures/setup.mjs first if fixtures are missing.
//
// Two-part probe:
//   1. GM side (default targetUser): register the probe handler.
//   2. Player side (targetUser=Player1 or any non-GM): call the probe twice
//      — once with TestPC.uuid (should AUTHORIZE) and once with TestNPC.uuid
//      (should REJECT-unauthorized).

// --- PART 1: run on GM side ---
const SDX = game.modules.get("shadowdark-extras");
if (!SDX?.socket) return { error: "no module.socket" };

const probeName = "__sdxXClientAuthProbe";
SDX.socket.register(probeName, async function(docUuid) {
  const sender = game.users.get(this.socketdata?.userId);
  if (!sender) return { phase: "REJECTED-no-sender" };
  const doc = docUuid ? await fromUuid(docUuid) : null;
  if (!sender.isGM && (!doc || !doc.testUserPermission(sender, "OWNER"))) {
    console.warn(`shadowdark-extras | Unauthorized test from ${sender.name} on ${doc?.name ?? docUuid}`);
    return { phase: "REJECTED-unauthorized", senderName: sender.name, docName: doc?.name ?? null };
  }
  return { phase: "AUTHORIZED", senderName: sender.name, docName: doc?.name ?? null };
});

const pc = game.actors.find(a => a.name === "_SDX TestPC");
const npc = game.actors.find(a => a.name === "_SDX TestNPC");
if (!pc || !npc) return {
  error: "fixtures missing — run dev/fixtures/setup.mjs first",
  pcFound: !!pc, npcFound: !!npc,
};

return {
  registered: true,
  probeName,
  testPcUuid: pc.uuid,
  testNpcUuid: npc.uuid,
  instructions: `Now run from a player client with targetUser=<player name>:
    const SDX = game.modules.get("shadowdark-extras");
    const owned    = await SDX.socket.executeAsGM("${probeName}", "${pc.uuid}");
    const notOwned = await SDX.socket.executeAsGM("${probeName}", "${npc.uuid}");
    return { owned, notOwned };`,
};
