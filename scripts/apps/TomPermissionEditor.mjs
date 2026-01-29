import { TOM_CONFIG as CONFIG } from '../TomConfig.mjs';
import { TomStore as Store } from '../data/TomStore.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Permission Editor - Allows GM to assign character edit permissions to players
 */
export class TomPermissionEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(characterId, options = {}) {
    super(options);
    this.characterId = characterId;
    this.character = Store.characters.get(characterId);

    if (!this.character) {
      throw new Error(`Character not found: ${characterId}`);
    }

    // Clone permissions for editing
    this.uiState = {
      permissions: JSON.parse(JSON.stringify(this.character.permissions || { default: 'none', players: {} }))
    };
  }

  static DEFAULT_OPTIONS = {
    tag: 'form',
    id: 'tom-permission-editor',
    classes: ['tom-app', 'es-permission-editor'],
    window: {
      title: 'Character Permissions',
      icon: 'fas fa-user-shield',
      resizable: false,
      controls: []
    },
    position: {
      width: 450,
      height: 'auto'
    },
    actions: {
      save: TomPermissionEditor._onSave,
      close: TomPermissionEditor._onClose,
      'set-permission': TomPermissionEditor._onSetPermission
    }
  };

  static PARTS = {
    main: {
      template: 'modules/shadowdark-extras/templates/tom-permission-editor.hbs'
    }
  };

  get title() {
    return `Permissions: ${this.character.name}`;
  }

  async _prepareContext(options) {
    // Get all players (non-GM users)
    const players = game.users.filter(u => !u.isGM && u.active !== false).map(user => {
      const currentLevel = this.uiState.permissions.players[user.id] || this.uiState.permissions.default || 'none';
      return {
        id: user.id,
        name: user.name,
        avatar: user.avatar,
        color: user.color,
        permission: currentLevel,
        isNone: currentLevel === 'none',
        isView: currentLevel === 'view',
        isEmotion: currentLevel === 'emotion',
        isFull: currentLevel === 'full'
      };
    });

    return {
      character: this.character,
      players,
      defaultPermission: this.uiState.permissions.default,
      permissionLevels: [
        { key: 'none', name: 'No Access', icon: 'fa-ban', description: 'Cannot interact with this character' },
        { key: 'view', name: 'View Only', icon: 'fa-eye', description: 'Can see but not modify' },
        { key: 'emotion', name: 'Emotions', icon: 'fa-theater-masks', description: 'Can change emotions' },
        { key: 'full', name: 'Full Control', icon: 'fa-crown', description: 'Can change emotions, borders, and settings' }
      ]
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);

    // Bind default permission select
    const defaultSelect = this.element.querySelector('select[name="defaultPermission"]');
    if (defaultSelect) {
      defaultSelect.addEventListener('change', (e) => {
        this.uiState.permissions.default = e.target.value;
        this.render();
      });
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     ACTIONS
     ═══════════════════════════════════════════════════════════════ */

  static _onSetPermission(event, target) {
    const userId = target.dataset.userId;
    const level = target.dataset.level;

    if (level === this.uiState.permissions.default) {
      // If setting to default, remove from players object
      delete this.uiState.permissions.players[userId];
    } else {
      this.uiState.permissions.players[userId] = level;
    }

    this.render();
  }

  static _onSave(event, target) {
    // Apply permissions to character
    this.character.permissions = this.uiState.permissions;
    Store.saveData();

    ui.notifications.info(`Updated permissions for ${this.character.name}`);
    this.close();

    // Refresh GM Panel
    import('./TomGMPanel.mjs').then(({ TomGMPanel }) => {
      if (TomGMPanel._instance) {
        TomGMPanel._instance.render();
      }
    });
  }

  static _onClose(event, target) {
    this.close();
  }

  /**
   * Static method to open the permission editor for a character
   * @param {string} characterId - The character ID
   */
  static open(characterId) {
    const editor = new TomPermissionEditor(characterId);
    editor.render(true);
    return editor;
  }
}
