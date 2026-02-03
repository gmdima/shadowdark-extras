import { TOM_CONFIG as CONFIG } from '../TomConfig.mjs';
import { TomStore as Store } from '../data/TomStore.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class TomCharacterEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(characterId, options = {}) {
    super(options);
    this.characterId = characterId;
    
    
    const char = Store.characters.get(characterId);
    if (!char) throw new Error(`Character ${characterId} not found`);

    this.uiState = {
      data: {
        name: char.name,
        states: { ...char.states }, 
        locked: char.locked || false 
      }
    };
  }

  static DEFAULT_OPTIONS = {
    tag: 'div',
    id: 'tom-character-editor',
    classes: ['tom-app', 'es-editor'],
    window: {
      title: 'Edit Character',
      icon: 'fas fa-user-edit',
      resizable: true,
      controls: []
    },
    position: {
      width: 600,
      height: 700
    },
    actions: {
      'rename-emotion': TomCharacterEditor._onRenameEmotion,
      'delete-emotion': TomCharacterEditor._onDeleteEmotion,
      'add-emotion': TomCharacterEditor._onAddEmotion,
      'delete-character': TomCharacterEditor._onDeleteCharacter,
      'toggle-lock': TomCharacterEditor._onToggleLock,
      'open-permissions': TomCharacterEditor._onOpenPermissions,
      'save': TomCharacterEditor._onSave,
      'close': TomCharacterEditor._onClose
    }
  };

  static PARTS = {
    main: {
      template: 'modules/shadowdark-extras/templates/tom-character-editor.hbs',
      scrollable: ['.tom-editor-content']
    }
  };

  

  async _prepareContext(options) {
    const char = Store.characters.get(this.characterId);
    if (!char) return {};

    
    const emotions = Object.entries(this.uiState.data.states).map(([key, path]) => ({
      key,
      path
    }));

    
    const canBrowseFiles = game.user.isGM || game.user.can("FILES_BROWSE");

    return {
      character: {
        ...this.uiState.data,
        image: char.image 
      },
      emotions: emotions,
      locked: this.uiState.data.locked,
      canBrowseFiles: canBrowseFiles,
      isGM: game.user.isGM
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);

    
    const nameInput = this.element.querySelector('input[name="name"]');
    if (nameInput) {
      nameInput.addEventListener('input', (e) => {
        this.uiState.data.name = e.target.value;
      });
    }

    
    const pickerBtn = this.element.querySelector('.file-picker');
    if (pickerBtn) {
      pickerBtn.addEventListener('click', (e) => {
        const targetInput = this.element.querySelector('input[name="newEmotionPath"]');
        new FilePicker({
          type: 'image',
          callback: (path) => {
            targetInput.value = path;
          }
        }).render(true);
      });
    }

  }

  

  static _onClose(event, target) {
    this.close();
  }

  

  static _onRenameEmotion(event, target) {
    const originalKey = target.dataset.originalKey;
    const newKey = target.value.trim();
    
    if (newKey && newKey !== originalKey) {
      const path = this.uiState.data.states[originalKey];
      delete this.uiState.data.states[originalKey];
      this.uiState.data.states[newKey] = path;
    }
  }

  static _onDeleteEmotion(event, target) {
    const key = target.dataset.key;
    delete this.uiState.data.states[key];
    this.render();
  }

  static _onAddEmotion(event, target) {
    const nameInput = this.element.querySelector('input[name="newEmotionName"]');
    const pathInput = this.element.querySelector('input[name="newEmotionPath"]');

    const name = nameInput.value.trim();
    const path = pathInput.value.trim();

    if (name && path) {
      this.uiState.data.states[name] = path;
      this.render();
    } else {
      ui.notifications.warn("Please provide both a name and a file path for the emotion.");
    }
  }

  

  static _onToggleLock(event, target) {
    this.uiState.data.locked = !this.uiState.data.locked;
    this.render();
  }

  

  static _onOpenPermissions(event, target) {
    import('./TomPermissionEditor.mjs').then(({ TomPermissionEditor }) => {
      TomPermissionEditor.open(this.characterId);
    });
  }

  

  static async _onSave(event, target) {
    const char = Store.characters.get(this.characterId);
    if (!char) return;

    
    const btn = target;
    const originalHtml = btn.innerHTML;
    btn.classList.add('es-btn-loading');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    btn.disabled = true;

    try {
      
      char.name = this.uiState.data.name;
      char.states = this.uiState.data.states;
      char.locked = this.uiState.data.locked;

      
      if (!char.states[char.currentState]) {
        char.currentState = Object.keys(char.states)[0] || 'normal';
      }

      await Store.saveData();

      
      const { TomSocketHandler } = await import('../data/TomSocketHandler.mjs');
      TomSocketHandler.emitUpdateLock(char.id, char.locked);

      ui.notifications.info(`Saved changes to ${char.name}`);

      this.close();

      
      const { TrayApp } = await import('../TrayApp.mjs');
      if (TrayApp._instance) TrayApp._instance.refreshTomCastPanel();
    } catch (error) {
      console.error('Tom | Error saving character:', error);
      ui.notifications.error('Failed to save character. Check console for details.');
      
      btn.classList.remove('es-btn-loading');
      btn.innerHTML = originalHtml;
      btn.disabled = false;
    }
  }

  static async _onDeleteCharacter(event, target) {
    const char = Store.characters.get(this.characterId);
    
    Dialog.confirm({
      title: `Delete ${char.name}?`,
      content: `<p>Are you sure you want to permanently delete <strong>${char.name}</strong>? This cannot be undone.</p>`,
      yes: async () => {
        Store.deleteItem(this.characterId, 'character');
        ui.notifications.info(`Deleted ${char.name}`);
        this.close();

        
        import('../TrayApp.mjs').then(({ TrayApp }) => {
          if (TrayApp._instance) TrayApp._instance.refreshTomCastPanel();
        });
      },
      no: () => {},
      defaultYes: false
    });
  }
}
