import { TOM_CONFIG as CONFIG } from '../TomConfig.mjs';
import { TomStore as Store } from './TomStore.mjs';

export class TomMigrationService {
  static async migrate() {

    if (!game.user.isGM) return;

    if (!CONFIG.SETTINGS.SCENES) return;

    console.log(`${CONFIG.MODULE_NAME} | Checking for data...`);


    const v4Scenes = game.settings.get(CONFIG.MODULE_ID, CONFIG.SETTINGS.SCENES);


    if (v4Scenes && v4Scenes.length > 0) {
      // V4/V5 data exists, no legacy migration needed
      return;
    }


    // Check for legacy data (V2/V3) to migrate into Scenes

    let legacyData = null;
    try {
      legacyData = game.settings.get(CONFIG.MODULE_ID, 'data-v3');
    } catch (e) {
      try {
        legacyData = game.settings.get(CONFIG.MODULE_ID, 'data-v2');
      } catch (e2) {
        // No legacy data
      }
    }

    if (!legacyData) return;

    console.log(`${CONFIG.MODULE_NAME} | Migrating legacy data...`);

    // Migrate Scenes
    if (legacyData.scenes) {
      for (const s of legacyData.scenes) {
        Store.createScene({
          id: s.id,
          name: s.name,
          background: s.background,
          bgType: s.bgType || 'image',
          favorite: s.favorite || false, // Ignored by new model but kept for read safety
          isArena: s.isArena || false
        });
      }
    }

    console.log(`${CONFIG.MODULE_NAME} | Migration Complete.`);
    ui.notifications.info("Tom: Legacy data migrated.");
  }
}
