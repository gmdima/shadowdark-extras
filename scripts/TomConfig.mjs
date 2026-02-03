


export const TOM_CONFIG = {
    MODULE_ID: 'shadowdark-extras',
    FEATURE_ID: 'tom',
    FEATURE_NAME: 'Tom',
    MODULE_NAME: 'shadowdark-extras',
    SOCKET_NAME: 'module.shadowdark-extras',
    UPLOAD_PATH: 'Tom/characters',

    
    TEMPLATES: {
        PLAYER_VIEW: 'modules/shadowdark-extras/templates/tom-player-view.hbs',
        PLAYER_PANEL: 'modules/shadowdark-extras/templates/tom-player-panel.hbs',
        CHARACTER_EDITOR: 'modules/shadowdark-extras/templates/tom-character-editor.hbs',
        SCENE_EDITOR: 'modules/shadowdark-extras/templates/tom-scene-editor.hbs',
        SMART_CREATOR: 'modules/shadowdark-extras/templates/tom-smart-creator.hbs',
        PERMISSION_EDITOR: 'modules/shadowdark-extras/templates/tom-permission-editor.hbs'
    },

    
    SETTINGS: {
        DATA_VERSION: 'tom-dataVersion',
        SCENES: 'tom-scenes',
        CHARACTERS: 'tom-characters',
        FOLDERS: 'tom-folders',
        PREFERENCES: 'tom-preferences',
        CUSTOM_ORDER: 'tom-customOrder'
    },



    
    DEFAULTS: {
        SCENE_BG: 'modules/shadowdark-extras/assets/Tom/banner_tom.png',
        CHAR_IMG: 'icons/svg/mystery-man.svg'
    },

    
    LAYOUT_PRESETS: {
        'bottom-center': {
            name: 'Bottom Center',
            position: 'bottom',
            align: 'center',
            icon: 'fa-arrows-down-to-line'
        },

        'top-center': {
            name: 'Top Center',
            position: 'top',
            align: 'center',
            icon: 'fa-arrows-up-to-line'
        }
    },

    
    SIZE_PRESETS: {
        small: { name: 'Small', value: '12vh' },
        medium: { name: 'Medium', value: '18vh' },
        large: { name: 'Large', value: '24vh' },
        xlarge: { name: 'Extra Large', value: '30vh' }
    },

    
    DEFAULT_LAYOUT: {
        preset: 'bottom-center',
        size: 'medium',
        spacing: 24,
        offsetX: 0,
        offsetY: 5
    },

    
    BORDER_PRESETS: {
        
        obsidian: { name: 'Obsidian', type: 'solid', color: '#1a1a1a' },
        iron: { name: 'Iron', type: 'solid', color: '#5a5a5a' },
        bone: { name: 'Bone', type: 'solid', color: '#e3dac9' },
        blood: { name: 'Blood', type: 'solid', color: '#8a0000' },

        
        deep_dark: { name: 'Deep Dark', type: 'gradient', colors: ['#0f0f0f', '#2a2a2a'] },
        rust: { name: 'Rust', type: 'gradient', colors: ['#8b4513', '#a0522d'] },
        cold_steel: { name: 'Cold Steel', type: 'gradient', colors: ['#2c3e50', '#bdc3c7'] },
        crimson_fog: { name: 'Crimson Fog', type: 'gradient', colors: ['#520000', '#2a0000'] },

        
        pulse_blood: { name: 'Pulse Blood', type: 'animated', animation: 'pulse', color: '#8b0000' },
        shadow_breath: { name: 'Shadow Breath', type: 'animated', animation: 'breathe', color: '#1a1a1a' },
        ghost_glow: { name: 'Ghost Glow', type: 'animated', animation: 'glow', color: '#e0e0e0' },
        molten: { name: 'Molten', type: 'animated', animation: 'pulse', color: '#b22222' },

        
        thick_stone: { name: 'Thick Stone', type: 'styled', style: 'thick', color: '#444444' },
        ornate_iron: { name: 'Ornate Iron', type: 'styled', style: 'ornate', color: '#5a5a5a' },
        runic_ash: { name: 'Runic Ash', type: 'styled', style: 'runic', color: '#dcdcdc' },
        double_steel: { name: 'Double Steel', type: 'styled', style: 'double', color: '#71797e' }
    }
};
