# 3D Product Configurator

> **This is a learning project.** I'm using it to get hands-on with React Three Fiber, so expect rough edges and experiments rather than production-ready code.

A browser-based product configurator built with React Three Fiber. Orbit, click, recolor, and take apart two glTF models in real time.

## What it demonstrates

- **glTF pipeline**: models optimized with `gltf-transform` (meshopt compression, WebP textures at 1024px). 4.1 MB and 7.8 MB source files ship at 743 KB and 546 KB.
- **KHR_materials_variants**: three.js's `GLTFLoader` doesn't implement this extension, so variant mappings are read from the parsed glTF JSON and resolved to materials per mesh (`src/components/Model.tsx`).
- **Per-part editing**: raycast picking (click a part in the scene or choose it in the panel), color tint, roughness and metalness overrides, visibility toggles.
- **Explode view**: each mesh eases along a direction computed from its bounding box relative to the model center.
- **Lighting**: a procedural studio environment built from `Lightformer`s (no network request), plus HDRI presets.
- **Export**: transparent-background PNG capture from the live canvas.
- **Performance**: adaptive DPR via `PerformanceMonitor`, private material clones so cached GLTFs aren't mutated, no per-frame allocations in the render loop.
- **Accessibility**: the canvas is focusable with arrow-key orbiting, all controls are native form elements with labels, auto-rotate defaults off when `prefers-reduced-motion` is set.

## Stack

Vite, React 19, TypeScript, three.js, `@react-three/fiber`, `@react-three/drei`, Zustand.

## Run it

```bash
npm install
npm run dev
```

## Known limits

- Color tints multiply with baked textures, so dark textures stay dark. A real product pipeline would expose a dedicated tint mask.
- The sneaker is a single mesh, so it has no separate parts to hide or explode.
- Hotspot positions are hand-placed as fractions of each model's bounding box.

## Credits

Models are from the [Khronos glTF Sample Assets](https://github.com/KhronosGroup/glTF-Sample-Assets) (MaterialsVariantsShoe and SheenChair), licensed CC-BY 4.0. Check each model's license file before redistributing.
