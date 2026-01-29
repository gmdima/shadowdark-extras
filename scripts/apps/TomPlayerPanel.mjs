import { TOM_CONFIG as CONFIG } from '../TomConfig.mjs';
import { TomStore as Store } from '../data/TomStore.mjs';
import { TomSocketHandler } from '../data/TomSocketHandler.mjs';
import { TomCharacterEditor } from './TomCharacterEditor.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * PlayerPanel - A simplified panel for players to manage their assigned characters
 * Shows only characters the player has permission to edit (emotion or full access)
 */
export class TomPlayerPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this.uiState = {
      emotionPicker: { open: false, characterId: null, x: 0, y: 0 },
      borderPicker: { open: false, characterId: null, x: 0, y: 0 }
    };
  }

  static DEFAULT_OPTIONS = {
    tag: 'div',
    id: 'tom-player-panel',
    classes: ['tom-app', 'player-panel'],
    window: {
      title: 'My Characters',
      icon: 'fas fa-users',
      resizable: true,
      controls: []
    },
    position: {
      width: 400,
      height: 500
    },
    actions: {
      'character-click': TomPlayerPanel._onCharacterClick,
      'select-emotion': TomPlayerPanel._onSelectEmotion,
      'close-picker': TomPlayerPanel._onClosePicker,
      'open-border-picker': TomPlayerPanel._onOpenBorderPicker,
      'close-border-picker': TomPlayerPanel._onCloseBorderPicker,
      'back-to-emotions': TomPlayerPanel._onBackToEmotions,
      'select-border': TomPlayerPanel._onSelectBorder,
      'edit-character': TomPlayerPanel._onEditCharacter
    }
  };

  static PARTS = {
    main: {
      template: 'modules/shadowdark-extras/templates/tom-player-panel.hbs'
    }
  };

  /* ═══════════════════════════════════════════════════════════════
     SINGLETON PATTERN
     ═══════════════════════════════════════════════════════════════ */

  static _instance = null;

  static show() {
    console.log('Tom | PlayerPanel.show() called');
    console.log('Tom | Store initialized:', Store.isInitialized);
    console.log('Tom | Store.characters size:', Store.characters.size);

    if (!this._instance) {
      this._instance = new TomPlayerPanel();
    }
    this._instance.render(true);
    return this._instance;
  }

  /* ═══════════════════════════════════════════════════════════════
     RENDER CONTEXT
     ═══════════════════════════════════════════════════════════════ */

  async _prepareContext(options) {
    const userId = game.user.id;
    console.log('Tom | PlayerPanel._prepareContext for userId:', userId);

    // Get all characters the player has permission to edit
    const myCharacters = [];
    Store.characters.forEach((char, id) => {
      console.log(`Tom | Checking character ${char.name}, permissions:`, char.permissions);
      const permLevel = char.hasPermission(userId, 'emotion');
      console.log(`Tom | hasPermission result:`, permLevel);
      if (permLevel) {
        const canEditBorder = char.hasPermission(userId, 'full');
        myCharacters.push({
          id: char.id,
          name: char.name,
          image: char.image,
          currentState: char.currentState,
          borderStyle: char.borderStyle || 'gold',
          locked: char.locked || false,
          canEditBorder: canEditBorder
        });
      }
    });
    console.log('Tom | myCharacters found:', myCharacters.length);

    // Prepare Emotion Picker Context
    let pickerContext = null;
    if (this.uiState.emotionPicker.open && this.uiState.emotionPicker.characterId) {
      const char = Store.characters.get(this.uiState.emotionPicker.characterId);
      if (char) {
        const favoriteEmotions = char.favoriteEmotions || new Set();
        const emotions = Object.entries(char.states).map(([key, path]) => ({
          key,
          path,
          isFavorite: favoriteEmotions.has(key)
        }));
        emotions.sort((a, b) => {
          if (a.isFavorite && !b.isFavorite) return -1;
          if (!a.isFavorite && b.isFavorite) return 1;
          return a.key.localeCompare(b.key);
        });

        const canEditBorder = char.hasPermission(userId, 'full');

        pickerContext = {
          character: char,
          emotions: emotions,
          x: this.uiState.emotionPicker.x,
          y: this.uiState.emotionPicker.y,
          canEditBorder: canEditBorder
        };
      }
    }

    // Prepare Border Picker Context
    let borderPickerContext = null;
    if (this.uiState.borderPicker.open && this.uiState.borderPicker.characterId) {
      const char = Store.characters.get(this.uiState.borderPicker.characterId);
      if (char) {
        const currentBorder = char.borderStyle || 'gold';
        const presets = CONFIG.BORDER_PRESETS;

        const solid = [];
        const gradient = [];
        const animated = [];
        const styled = [];

        for (const [key, preset] of Object.entries(presets)) {
          const item = {
            key,
            name: preset.name,
            active: currentBorder === key,
            color: preset.color || '#888'
          };

          if (preset.type === 'solid') solid.push(item);
          else if (preset.type === 'gradient') gradient.push(item);
          else if (preset.type === 'animated') animated.push(item);
          else if (preset.type === 'styled') styled.push(item);
        }

        borderPickerContext = {
          character: char,
          solid,
          gradient,
          animated,
          styled,
          x: this.uiState.borderPicker.x,
          y: this.uiState.borderPicker.y
        };
      }
    }

    return {
      characters: myCharacters,
      hasCharacters: myCharacters.length > 0,
      emotionPicker: pickerContext,
      borderPicker: borderPickerContext,
      isBroadcasting: Store.isBroadcasting
    };
  }

  /* ═══════════════════════════════════════════════════════════════
     ACTIONS
     ═══════════════════════════════════════════════════════════════ */

  static _onCharacterClick(event, target) {
    const charId = target.dataset.id;
    const character = Store.characters.get(charId);

    if (character?.locked) {
      ui.notifications.warn(`${character.name} is locked. Only the GM can change emotions.`);
      return;
    }

    const rect = target.getBoundingClientRect();

    this.uiState.emotionPicker = {
      open: true,
      characterId: charId,
      x: rect.left + (rect.width / 2),
      y: rect.top
    };
    this.render();
  }

  static _onClosePicker(event, target) {
    this.uiState.emotionPicker.open = false;
    this.render();
  }

  static _onSelectEmotion(event, target) {
    const charId = this.uiState.emotionPicker.characterId;
    const state = target.dataset.state;

    TomSocketHandler.emitUpdateEmotion(charId, state);

    this.uiState.emotionPicker.open = false;
    this.render();
  }

  static _onOpenBorderPicker(event, target) {
    const charId = this.uiState.emotionPicker.characterId;
    const x = this.uiState.emotionPicker.x;
    const y = this.uiState.emotionPicker.y;

    this.uiState.emotionPicker.open = false;
    this.uiState.borderPicker = {
      open: true,
      characterId: charId,
      x: x,
      y: y
    };
    this.render();
  }

  static _onCloseBorderPicker(event, target) {
    this.uiState.borderPicker.open = false;
    this.render();
  }

  static _onBackToEmotions(event, target) {
    const charId = this.uiState.borderPicker.characterId;
    const x = this.uiState.borderPicker.x;
    const y = this.uiState.borderPicker.y;

    this.uiState.borderPicker.open = false;
    this.uiState.emotionPicker = {
      open: true,
      characterId: charId,
      x: x,
      y: y
    };
    this.render();
  }

  static _onSelectBorder(event, target) {
    const charId = this.uiState.borderPicker.characterId;
    const preset = target.dataset.preset;

    TomSocketHandler.emitUpdateBorder(charId, preset);

    this.render();
  }

  static _onEditCharacter(event, target) {
    event.stopPropagation();
    const charId = target.dataset.id;
    new TomCharacterEditor(charId).render(true);
  }

  /* ═══════════════════════════════════════════════════════════════
     REFRESH
     ═══════════════════════════════════════════════════════════════ */

  static refresh() {
    if (this._instance) {
      this._instance.render();
    }
  }
}
