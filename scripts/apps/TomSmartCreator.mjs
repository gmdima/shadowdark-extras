import { TOM_CONFIG as CONFIG } from '../TomConfig.mjs';
import { TomStore as Store } from '../data/TomStore.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class TomSmartCreator extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this.uiState = {
      data: {
        name: '',
        emotions: {}, 
        defaultEmotion: null
      },
      uploadProgress: 0
    };
  }

  static DEFAULT_OPTIONS = {
    tag: 'div',
    id: 'tom-smart-creator',
    classes: ['tom-app'],
    window: {
      title: 'Character Creator',
      icon: 'fas fa-user-circle',
      resizable: true,
      controls: []
    },
    position: {
      width: 468,
      height: 624
    },
    actions: {
      'trigger-upload': TomSmartCreator._onTriggerUpload,
      'toggle-exclude': TomSmartCreator._onToggleExclude,
      'set-default': TomSmartCreator._onSetDefault,
      'rename-emotion': TomSmartCreator._onRenameEmotion,
      'finish': TomSmartCreator._onFinish
    }
  };

  static PARTS = {
    main: {
      template: 'modules/shadowdark-extras/templates/tom-smart-creator.hbs'
    }
  };

  

  async _prepareContext(options) {
    const hasEmotions = Object.keys(this.uiState.data.emotions).length > 0;
    return {
      data: this.uiState.data,
      uploadProgress: this.uiState.uploadProgress,
      hasEmotions
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
  }

  

  static _onTriggerUpload(event, target) {
    const input = this.element.querySelector('.tom-file-input');

    input.onchange = async (e) => {
      const files = Array.from(e.target.files);
      if (files.length === 0) return;

      await this._processUpload(files);
    };

    
    input.value = '';
    input.click();
  }

  async _processUpload(files) {
    const charName = this.uiState.data.name;
    if (!charName) {
      ui.notifications.warn("Please enter a character name first.");
      return;
    }

    
    const folderName = charName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const targetDir = `${CONFIG.UPLOAD_PATH}/${folderName}`;

    
    try {
      const parts = targetDir.split('/');
      let currentPath = "";
      for (const part of parts) {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        await this._ensureDirectory(currentPath);
      }
    } catch (e) {
      console.error("Failed to create directory structure:", e);
      ui.notifications.error(`Could not create directory ${targetDir}. Check console for details.`);
      return;
    }

    let processedCount = 0;
    const emotions = {};

    for (const file of files) {
      try {
        const basename = file.name.split('/').pop().split('\\').pop();
        const cleanFile = new File([file], basename, { type: file.type });

        await FilePicker.upload('data', targetDir, cleanFile);

        const path = `${targetDir}/${basename}`;
        const emotionKey = this._parseEmotionName(file.name);

        emotions[emotionKey] = {
          key: emotionKey,
          path: path,
          excluded: false,
          isDefault: false
        };

      } catch (e) {
        console.error(`Failed to upload ${file.name}`, e);
      }

      processedCount++;
      this.uiState.uploadProgress = Math.round((processedCount / files.length) * 100);
      this.render();
    }

    
    const keys = Object.keys(emotions);
    if (keys.length > 0) {
      emotions[keys[0]].isDefault = true;
      this.uiState.data.defaultEmotion = keys[0];
    }

    this.uiState.data.emotions = emotions;
    this.render();
  }

  async _ensureDirectory(path) {
    try {
      await FilePicker.browse('data', path);
    } catch (e) {
      console.log(`Tom | Creating directory: ${path}`);
      try {
        await FilePicker.createDirectory('data', path);
      } catch (createError) {
        if (!createError.message.includes("EEXIST") && !createError.message.includes("already exists")) {
          throw createError;
        }
      }
    }
  }

  _parseEmotionName(filename) {
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
    const underscoreIndex = nameWithoutExt.indexOf('_');

    if (underscoreIndex !== -1) {
      return nameWithoutExt.substring(underscoreIndex + 1).replace(/_/g, ' ').trim();
    }
    return nameWithoutExt;
  }

  

  static _onToggleExclude(event, target) {
    const key = target.dataset.key;
    if (this.uiState.data.emotions[key]) {
      this.uiState.data.emotions[key].excluded = !this.uiState.data.emotions[key].excluded;
      this.render();
    }
  }

  static _onSetDefault(event, target) {
    const key = target.dataset.key;
    if (this.uiState.data.emotions[key] && !this.uiState.data.emotions[key].excluded) {
      this.uiState.data.defaultEmotion = key;
      this.render();
    }
  }

  static _onRenameEmotion(event, target) {
    const originalKey = target.dataset.originalKey;
    const newKey = target.value.trim();

    if (newKey && newKey !== originalKey) {
      const entry = this.uiState.data.emotions[originalKey];
      delete this.uiState.data.emotions[originalKey];
      entry.key = newKey;
      this.uiState.data.emotions[newKey] = entry;

      if (this.uiState.data.defaultEmotion === originalKey) {
        this.uiState.data.defaultEmotion = newKey;
      }

      this.render();
    }
  }

  

  static async _onFinish(event, target) {
    const { name, emotions, defaultEmotion } = this.uiState.data;

    if (!name) {
      ui.notifications.warn("Please enter a character name.");
      return;
    }

    
    const finalStates = {};
    for (const [key, data] of Object.entries(emotions)) {
      if (!data.excluded) {
        finalStates[key] = data.path;
      }
    }

    if (Object.keys(finalStates).length === 0) {
      ui.notifications.warn("No emotions selected.");
      return;
    }

    
    const character = Store.createCharacter({
      name: name,
      states: finalStates,
      currentState: defaultEmotion || Object.keys(finalStates)[0],
      tags: []
    });

    ui.notifications.info(`Character "${name}" created successfully!`);
    this.close();

    
    import('../TrayApp.mjs').then(({ TrayApp }) => {
      if (TrayApp._instance) TrayApp._instance.refreshTomCastPanel();
    });
  }
}
