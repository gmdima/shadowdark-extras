import { TOM_CONFIG as CONFIG } from '../TomConfig.mjs';
import { TomStore as Store } from './TomStore.mjs';

export class TomMigrationService {
  static async migrate() {
    
    if (!game.user.isGM) return;

    console.log(`${CONFIG.MODULE_NAME} | Checking for migration...`);

    
    const v4Scenes = game.settings.get(CONFIG.MODULE_ID, CONFIG.SETTINGS.SCENES);
    const v4Characters = game.settings.get(CONFIG.MODULE_ID, CONFIG.SETTINGS.CHARACTERS);

    let needsSave = false;

    
    if (v4Scenes && v4Scenes.length > 0) {
      for (const scene of v4Scenes) {
        if (!scene.layoutSettings) {
          scene.layoutSettings = {
            preset: 'bottom-center',
            size: 'medium',
            spacing: 24,
            offsetX: 0,
            offsetY: 5
          };
          needsSave = true;
        }
      }
    }

    
    if (v4Characters && v4Characters.length > 0) {
      for (const char of v4Characters) {
        if (!char.permissions) {
          char.permissions = {
            default: 'none',
            players: {}
          };
          needsSave = true;
        }

        
        if (char.states) {
          for (const [key, path] of Object.entries(char.states)) {
            if (path && path.includes('exalted-scenes/')) {
              char.states[key] = path.replace('exalted-scenes/', 'Tom/');
              needsSave = true;
            }
          }
        }
      }
    }

    
    if (needsSave) {
      console.log(`${CONFIG.MODULE_NAME} | Normalizing data for v4.1 features...`);
      await game.settings.set(CONFIG.MODULE_ID, CONFIG.SETTINGS.SCENES, v4Scenes);
      await game.settings.set(CONFIG.MODULE_ID, CONFIG.SETTINGS.CHARACTERS, v4Characters);
      console.log(`${CONFIG.MODULE_NAME} | Data normalization complete.`);
      await Store._loadData(); 
    }

    
    if (v4Scenes && v4Scenes.length > 0) {
      console.log(`${CONFIG.MODULE_NAME} | V4 data found. Skipping legacy migration.`);
      return;
    }

    
    
    

    
    let legacyData = null;
    try {
      legacyData = game.settings.get(CONFIG.MODULE_ID, 'data-v3');
    } catch (e) {
      try {
        legacyData = game.settings.get(CONFIG.MODULE_ID, 'data-v2');
      } catch (e2) {
        console.log(`${CONFIG.MODULE_NAME} | No legacy data found.`);
      }
    }

    if (!legacyData) return;

    console.log(`${CONFIG.MODULE_NAME} | Migrating legacy data...`);

    
    

    if (legacyData.scenes) {
      for (const s of legacyData.scenes) {
        Store.createScene({
          id: s.id,
          name: s.name,
          background: s.background,
          bgType: s.bgType || 'image',
          favorite: s.favorite || false,
          folder: s.folder,
          cast: s.characters || [] 
        });
      }
    }

    if (legacyData.characters) {
      for (const c of legacyData.characters) {
        Store.createCharacter({
          id: c.id,
          name: c.name,
          states: c.states || { normal: c.image },
          currentState: c.currentState || 'normal',
          folder: c.folder,
          favorite: c.favorite || false
        });
      }
    }

    console.log(`${CONFIG.MODULE_NAME} | Migration Complete.`);
    ui.notifications.info("Tom: Data migrated successfully to v4.0");
  }
}
