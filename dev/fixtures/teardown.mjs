// FIXTURES: Remove the SDX test fixtures created by setup.mjs.
// Deletes the folder + every actor in it (including embedded items).

const FOLDER_NAME = "_SDX Test Fixtures";
const folder = game.folders.find(f => f.name === FOLDER_NAME && f.type === "Actor");
if (!folder) return { skipped: true, reason: "fixture folder not present" };

const actorsInFolder = game.actors.filter(a => a.folder?.id === folder.id);
const actorIds = actorsInFolder.map(a => a.id);
if (actorIds.length) await Actor.deleteDocuments(actorIds);
await folder.delete();

return {
  deleted: true,
  removedActors: actorIds.length,
  removedFolder: folder.name,
};
