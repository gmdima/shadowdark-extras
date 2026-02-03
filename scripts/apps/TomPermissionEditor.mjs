import { TOM_CONFIG as CONFIG } from '../TomConfig.mjs';
import { TomStore as Store } from '../data/TomStore.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class TomPermissionEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(characterId, options = {}) {
    super(options);
    this.characterId = characterId;
    this.character = Store.characters.get(characterId);

    if (!this.character) {
      throw new Error(`Character not found: ${characterId}`);
    }

    
    this.uiState = {
      permissions: JSON.parse(JSON.stringify(this.character.permissions || { default: 'none', players: {} })),
      canSpawnToken: JSON.parse(JSON.stringify(this.character.canSpawnToken || {})),
      showOffline: false
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
    const players = game.users.filter(u => {
      if (u.isGM) return false;
      if (!this.uiState.showOffline && !u.active) return false;
      return true;
    }).map(user => {
      const currentLevel = this.uiState.permissions.players[user.id] || this.uiState.permissions.default || 'none';
      const canSpawn = this.uiState.canSpawnToken[user.id] || false;
      return {
        id: user.id,
        name: user.name,
        avatar: user.avatar,
        color: user.color,
        online: user.active,
        permission: currentLevel,
        isNone: currentLevel === 'none',
        isView: currentLevel === 'view',
        isEmotion: currentLevel === 'emotion',
        isFull: currentLevel === 'full',
        canSpawnToken: canSpawn
      };
    });

    return {
      character: this.character,
      players,
      showOffline: this.uiState.showOffline,
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

    
    const defaultSelect = this.element.querySelector('select[name="defaultPermission"]');
    if (defaultSelect) {
      defaultSelect.addEventListener('change', (e) => {
        this.uiState.permissions.default = e.target.value;
        this.render();
      });
    }

    
    const offlineCheckbox = this.element.querySelector('.tom-perm-offline-input');
    if (offlineCheckbox) {
      offlineCheckbox.addEventListener('change', (e) => {
        this.uiState.showOffline = e.target.checked;
        this.render();
      });
    }

    
    const crownButtons = this.element.querySelectorAll('.tom-perm-btn[data-level="full"]');
    for (const btn of crownButtons) {
      btn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const userId = btn.dataset.userId;
        this.uiState.canSpawnToken[userId] = !this.uiState.canSpawnToken[userId];
        this.render();
      });
    }
  }

  

  static _onSetPermission(event, target) {
    const userId = target.dataset.userId;
    const level = target.dataset.level;

    if (level === this.uiState.permissions.default) {
      
      delete this.uiState.permissions.players[userId];
    } else {
      this.uiState.permissions.players[userId] = level;
    }

    this.render();
  }

  static _onSave(event, target) {
    
    this.character.permissions = this.uiState.permissions;
    this.character.canSpawnToken = this.uiState.canSpawnToken;
    Store.saveData();

    ui.notifications.info(`Updated permissions for ${this.character.name}`);
    this.close();
  }

  static _onClose(event, target) {
    this.close();
  }

  
  static open(characterId) {
    const editor = new TomPermissionEditor(characterId);
    editor.render(true);
    return editor;
  }
}
