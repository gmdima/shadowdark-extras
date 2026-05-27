/**
 * Persistent elevation badge on placed MeasuredTemplates.
 *
 * Renders a small "el N" label centered on any template whose elevation
 * is non-zero, so a GM can see at a glance what level a Web/Sleep/Cloud
 * Kill template is on without opening its config sheet.
 *
 * Rationale: SDX's place() already shows an elevation overlay during
 * placement (Alt+wheel), but that overlay is destroyed once the template
 * commits. Without it the only feedback for "this template is at the
 * wrong z" is "the spell affected no one" — silent failure.
 *
 * The badge is attached as a PIXI.Text child of the placeable's container
 * (not canvas.stage), so it moves with the template, cleans up when the
 * template is destroyed, and doesn't need a separate scene-tick hook.
 */

const BADGE_KEY = "_sdxElevationBadge";

export function initTemplateElevationBadge() {
    Hooks.on("drawMeasuredTemplate", _updateBadge);
    Hooks.on("refreshMeasuredTemplate", _updateBadge);
}

function _updateBadge(template) {
    if (!template) return;

    const elevation = template.document?.elevation ?? 0;

    // Strip any existing badge first — handles elevation changes via the
    // template's config sheet, where the same placeable refreshes with a
    // new value and we need to redraw the label.
    const existing = template[BADGE_KEY];
    if (existing) {
        template[BADGE_KEY] = null;
        if (!existing.destroyed) {
            try {
                existing.parent?.removeChild(existing);
                existing.destroy({ children: true });
            } catch (e) { /* ignore destroy races */ }
        }
    }

    // No badge at ground level — avoid clutter on single-floor scenes.
    if (!elevation) return;

    const badge = new PIXI.Text(`el ${elevation}`, {
        fontFamily: "Arial",
        fontSize: 18,
        fill: 0xFFFFFF,
        stroke: 0x000000,
        strokeThickness: 3,
        align: "center"
    });
    badge.anchor.set(0.5, 0.5);
    badge.position.set(0, 0); // template-local origin = placement point in world coords
    badge.zIndex = 100;

    template.addChild(badge);
    template[BADGE_KEY] = badge;
}
