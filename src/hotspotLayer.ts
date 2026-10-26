/**
 * Bridge between the 3D scene and the hotspot buttons, which live in normal DOM.
 * The model publishes where each hotspot is in world space; the viewer projects those points
 * to the screen every frame and moves the matching button. Plain tuples keep three.js out of
 * the main bundle.
 */
export const hotspotAnchors = new Map<string, [number, number, number]>()
export const hotspotEls = new Map<string, HTMLElement>()
