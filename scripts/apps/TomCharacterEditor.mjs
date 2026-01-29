import { TOM_CONFIG as CONFIG } from '../TomConfig.mjs';
import { TomStore as Store } from '../data/TomStore.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class TomCharacterEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(characterId, options = {}) {
    super(options);
    this.characterId = characterId;
    
    // Clone data for editing to avoid direct mutation until save
    const char = Store.characters.get(characterId);
    if (!char) throw new Error(`Character ${characterId} not found`);

    this.uiState = {
      activeTab: 'identity',
      data: {
        name: char.name,
        tags: Array.from(char.tags),
        states: { ...char.states }, // Clone states
        locked: char.locked || false // Lock state
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
      'tab-switch': TomCharacterEditor._onTabSwitch,
      'remove-tag': TomCharacterEditor._onRemoveTag,
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

  /* ═══════════════════════════════════════════════════════════════
     RENDER CONTEXT
     ═══════════════════════════════════════════════════════════════ */

  async _prepareContext(options) {
    const char = Store.characters.get(this.characterId);
    if (!char) return {};

    // Prepare emotions list
    const emotions = Object.entries(this.uiState.data.states).map(([key, path]) => ({
      key,
      path
    }));

    // Check if user can browse files (players typically can't)
    const canBrowseFiles = game.user.isGM || game.user.can("FILES_BROWSE");

    return {
      character: {
        ...this.uiState.data,
        image: char.image // Use current image for avatar
      },
      emotions: emotions,
      activeTab: this.uiState.activeTab,
      locked: this.uiState.data.locked,
      canBrowseFiles: canBrowseFiles,
      isGM: game.user.isGM
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);

    // Bind Name Input
    const nameInput = this.element.querySelector('input[name="name"]');
    if (nameInput) {
      nameInput.addEventListener('input', (e) => {
        this.uiState.data.name = e.target.value;
      });
    }

    // Bind File Picker for New Emotion
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

    // Bind Tag Input (Enter Key)
    const tagInput = this.element.querySelector('.tom-tag-input');
    if (tagInput) {
      tagInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const tag = e.target.value.trim();
          if (tag && !this.uiState.data.tags.includes(tag)) {
            this.uiState.data.tags.push(tag);
            e.target.value = '';
            this.render();
          }
        }
      });
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     ACTIONS
     ═══════════════════════════════════════════════════════════════ */

  static _onTabSwitch(event, target) {
    this.uiState.activeTab = target.dataset.tab;
    this.render();
  }

  static _onClose(event, target) {
    this.close();
  }

  // --- TAGS ---

  static _onRemoveTag(event, target) {
    const tag = target.dataset.tag;
    this.uiState.data.tags = this.uiState.data.tags.filter(t => t !== tag);
    this.render();
  }

  // --- EMOTIONS ---

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

  // --- LOCK ---

  static _onToggleLock(event, target) {
    this.uiState.data.locked = !this.uiState.data.locked;
    this.render();
  }

  // --- PERMISSIONS ---

  static _onOpenPermissions(event, target) {
    import('./TomPermissionEditor.mjs').then(({ TomPermissionEditor }) => {
      TomPermissionEditor.open(this.characterId);
    });
  }

  // --- SAVE & DELETE ---

  static async _onSave(event, target) {
    const char = Store.characters.get(this.characterId);
    if (!char) return;

    // Add loading state to button
    const btn = target;
    const originalHtml = btn.innerHTML;
    btn.classList.add('es-btn-loading');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    btn.disabled = true;

    try {
      // Update Character Model
      char.name = this.uiState.data.name;
      char.tags = new Set(this.uiState.data.tags);
      char.states = this.uiState.data.states;
      char.locked = this.uiState.data.locked;

      // Ensure current state is valid
      if (!char.states[char.currentState]) {
        char.currentState = Object.keys(char.states)[0] || 'normal';
      }

      await Store.saveData();

      // Broadcast lock change to all clients
      const { TomSocketHandler } = await import('../data/TomSocketHandler.mjs');
      TomSocketHandler.emitUpdateLock(char.id, char.locked);

      ui.notifications.info(`Saved changes to ${char.name}`);

      this.close();

      // Refresh GM Panel
      const gmPanel = foundry.applications.instances.get('tom-gm-panel');
      if (gmPanel) gmPanel.render();
    } catch (error) {
      console.error('Tom | Error saving character:', error);
      ui.notifications.error('Failed to save character. Check console for details.');
      // Restore button state on error
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
        
        // Refresh GM Panel
        const gmPanel = foundry.applications.instances.get('tom-gm-panel');
        if (gmPanel) gmPanel.render();
      },
      no: () => {},
      defaultYes: false
    });
  }
}
