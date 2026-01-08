---
description: How to customize sheet frame borders with advanced CSS border-image options
---

# Sheet Frame Border Customization

The Sheet Editor provides advanced border-image customization for player sheets.

## Available Options in Sheet Frame Tweaking

1. **Border Width (px)** - The transparent border width (0-200px)
2. **Border Image Width (px)** - Width of the border image (1-200px)
3. **Border Image Slice (px)** - How the border image is sliced (1-200px)
4. **Border Image Outset (px)** - Extends border outside the box (0-50px)
5. **Border Image Repeat Mode** - How edges are handled:
   - `stretch` - Default, stretches the image
   - `repeat` - Repeats the image pattern
   - `round` - Repeats and scales to fit
   - `space` - Repeats with spacing between
6. **Border Background Color** - Color behind the border (transparent by default)

## CSS Variables Injected

```css
--sdx-border-width: 10px;
--sdx-border-image-width: 16px;
--sdx-border-image-slice: 12;
--sdx-border-image-outset: 0px;
--sdx-border-image-repeat: stretch;
--sdx-border-background-color: transparent;
```

## Key Files
- `scripts/SheetEditorConfig.mjs` - Sheet Editor dialog with live preview
- `scripts/shadowdark-extras.mjs` - Settings registration and `applySheetDecorationStyles()`
- `templates/sheet-editor-config.hbs` - Template with border controls
- `styles/shadowdark-extras.css` - CSS using the variables
