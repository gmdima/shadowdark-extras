---
description: Guide to modifying and maintaining the Custom Journal Pin system, including Image Pins, Hover Animations, and Socket features.
---

# Custom Journal Pin System Workflows

This document outlines the architecture and modification workflows for the Custom Journal Pin system in `shadowdark-extras`.

## Core Files

-   `scripts/JournalPinsSD.mjs`: Main logic for rendering pins (PIXI.js), handling events (hover, click, drag), and managing data.
-   `scripts/PinStyleEditorSD.mjs`: Logic for the Pin Style Editor application (FormApplication).
-   `templates/pin-style-editor.hbs`: Handlebars template for the editor UI.
-   `i18n/en.json`: Lozatliation strings.

## 1. Image Pins Implementation

**Goal**: Allow users to select an image instead of a geometric shape for a pin.

### Logic (`JournalPinsSD.mjs`)
-   **Data**: Added `imagePath` to `DEFAULT_PIN_STYLE`.
-   **Rendering (`_build`)**:
    -   Checks `style.shape === "image"`.
    -   If true, uses `loadTexture(style.imagePath)` and creates a `PIXI.Sprite`.
    -   Scale is adjusted to fit the `size`.
    -   Masking is applied if needed (currently circular mask is optional/implicit).
    -   Content (Text/Number/Icon) is rendered *on top* of the image.

### Editor (`PinStyleEditorSD.mjs` & `.hbs`)
-   **UI**: Added an "Image" option to the Shape dropdown.
-   **Conditional Display**:
    -   When "Image" is selected, standard shape options (fill color, ring width) are hidden.
    -   An `imagePath` file picker input is shown.
-   **Opacity Handling**: Use separate opacity sliders for implementation convenience, but ensure `_getFormData` logic selects the correct one.

## 2. Highlight on Hover Animation

**Goal**: Make pins animate (scale up) when hovered.

### Implementation (`JournalPinsSD.mjs`)
-   **Data**: Added `hoverAnimation` (boolean) to pin style.
-   **Events**:
    -   `_onPointerEnter`: Checks `this.style.hoverAnimation`. If true, tweens scale to `1.2` using `gsap` (or sets directly if no gsap).
    -   `_onPointerLeave`: Tweens scale back to `1.0`.

## 3. "Bring Players Here" (Socket Feature)

**Goal**: Allow GM to pull all players' cameras to a specific pin.

### Implementation
-   **Socket Listener (`initJournalPins`)**:
    -   Registers `game.socket.on("module.shadowdark-extras", ...)` inside `Hooks.once("ready")`.
    -   Listens for `type: "panToPin"`.
    -   Executes `canvas.animatePan` and `canvas.ping`.
-   **Context Menu (`_showContextMenu`)**:
    -   Added "Bring Players Here" option (GM Only).
    *   Emits socket event: `game.socket.emit("module.shadowdark-extras", { type: "panToPin", ... })`.

## 4. Common Workflows

### Adding a New Shape
1.  **Editor UI**: Add option to `pin-style-editor.hbs` select box.
2.  **Preview**: Update `_updatePreview` in `PinStyleEditorSD.mjs` to handle the drawing.
3.  **Rendering**: Update `_build` in `JournalPinsSD.mjs` to draw the new PIXI Graphics shape.

### Adding a New Style Property
1.  **Default**: Add to `DEFAULT_PIN_STYLE` in `JournalPinsSD.mjs`.
2.  **Template**: Add input field to `pin-style-editor.hbs`.
3.  **Form Data**: Update `_getFormData` in `PinStyleEditorSD.mjs` to read the value.
4.  **Rendering**: Update `_build` in `JournalPinsSD.mjs` to use the property.
