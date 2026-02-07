// Scene/Character management and broadcasting system

import { TOM_CONFIG } from './TomConfig.mjs';
import { TomStore } from './data/TomStore.mjs';
import { TomMigrationService } from './data/TomMigrationService.mjs';
import { TomSocketHandler } from './data/TomSocketHandler.mjs';

export class TomSD {
  static ID = TOM_CONFIG.MODULE_ID;
  static FEATURE_ID = TOM_CONFIG.FEATURE_ID;

  static initialize() {
    console.log(`Shadowdark Extras | Tom | Initializing`);

    // Register Handlebars Helpers
    this._registerHandlebarsHelpers();

    // Register Settings
    this._registerSettings();


    // Register Hooks
    Hooks.on('ready', this._onReady.bind(this));

    // Listen for actor HP changes to update arena tokens
    Hooks.on('updateActor', this._onActorUpdate.bind(this));

    // Hook to fix critical failure styling
    Hooks.on('renderChatMessage', (message, html, data) => {
      const diceTotal = html.find('.dice-total.failure');
      if (diceTotal.length > 0) {
        if (diceTotal.text().includes('Critical Failure!')) {
          diceTotal.addClass('fumble');
        }
      }

      const diceTotalSuccess = html.find('.dice-total.success');
      if (diceTotalSuccess.length > 0) {
        if (diceTotalSuccess.text().includes('Critical Success!')) {
          diceTotalSuccess.addClass('critical');
        }
      }
    });
  }

  /**
   * Handle actor updates to sync arena token HP display
   */
  static _onActorUpdate(actor, changes, options, userId) {
    // Only process HP changes
    const hpChanged = foundry.utils.hasProperty(changes, 'system.attributes.hp.value') ||
      foundry.utils.hasProperty(changes, 'system.hp.value');
    if (!hpChanged) return;

    // Import and update arena tokens that use this actor
    import('./apps/TomPlayerView.mjs').then(({ TomPlayerView }) => {
      if (!TomPlayerView._instance) return;

      const arenaTokens = TomPlayerView._instance.uiState.arenaTokens;
      for (const [tokenId, token] of arenaTokens) {
        if (token.actorId === actor.id || token.ownerId === actor.id) {
          // Get new HP values
          const hp = actor.system?.attributes?.hp?.value ?? actor.system?.hp?.value ?? 0;
          const maxHp = actor.system?.attributes?.hp?.max ?? actor.system?.hp?.max ?? 0;

          // Update token state and display
          token.currentHp = hp;
          token.maxHp = maxHp;
          TomPlayerView.updateArenaTokenHp(tokenId, hp, maxHp);
        }
      }
    });
  }

  static _registerHandlebarsHelpers() {
    // Math helpers
    if (!Handlebars.helpers.subtract) {
      Handlebars.registerHelper('subtract', (a, b) => (a || 0) - (b || 0));
    }
    if (!Handlebars.helpers.add) {
      Handlebars.registerHelper('add', (a, b) => (a || 0) + (b || 0));
    }
    if (!Handlebars.helpers.divide) {
      Handlebars.registerHelper('divide', (a, b) => b ? (a || 0) / b : 0);
    }
    if (!Handlebars.helpers.multiply) {
      Handlebars.registerHelper('multiply', (a, b) => (a || 0) * (b || 0));
    }

    // Comparison helpers (if not already registered by Foundry)
    if (!Handlebars.helpers.gt) {
      Handlebars.registerHelper('gt', (a, b) => a > b);
    }
    if (!Handlebars.helpers.eq) {
      Handlebars.registerHelper('eq', (a, b) => a === b);
    }
    if (!Handlebars.helpers.lt) {
      Handlebars.registerHelper('lt', (a, b) => a < b);
    }
  }

  static _registerSettings() {
    // Data storage settings
    game.settings.register(this.ID, TOM_CONFIG.SETTINGS.DATA_VERSION, {
      name: 'Tom Data Version',
      scope: 'world',
      config: false,
      type: Number,
      default: 0
    });

    game.settings.register(this.ID, TOM_CONFIG.SETTINGS.SCENES, {
      scope: 'world',
      config: false,
      type: Array,
      default: []
    });

    game.settings.register(this.ID, 'tom-folders', {
      name: 'Tom Scene Folders',
      scope: 'world',
      config: false,
      type: Array,
      default: []
    });
  }



  static async _onReady() {
    console.log(`Shadowdark Extras | Tom | Ready`);

    // Initialize Store
    await TomStore.initialize();

    // Run Migration
    await TomMigrationService.migrate();

    // Initialize Sockets
    TomSocketHandler.initialize();
  }

  /**
   * Open the appropriate panel based on user role
   */
  static open() {
    // Character management panel has been removed
    // Players can now only view broadcasting scenes
  }

  /**
   * Close all Tom panels
   */
  static close() {
    // Character management panel has been removed
  }

  /**
   * Open Player Panel directly
   */
  static openPlayerPanel() {
    // Character management panel has been removed
  }
}
