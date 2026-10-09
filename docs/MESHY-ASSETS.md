# Meshy logistics assets

The runtime uses Three.js only. Original OBJ/MTL/JPEG assets now live in
`src/assets/Meshy`; the 2026-10-02 move preserved every asset byte. The old Unity
project, editor metadata, WebGL runtime and build script have been removed.

## Packaging contents cutaway — 2026-10-09

The packaging inspection dialog reuses the existing `carton` OBJ and original
texture, scaled to the selected carton's outer dimensions. Per-view materials
clip the physical inner volume and the top/front/right surfaces to show products
inside. This is an **open cutaway of the existing closed Meshy carton**, not a
newly generated open-box model. No new generation or credit spending occurred.
The cached source geometry, UVs and texture remain unchanged; clipping is visual
only and does not participate in packing, collision or safety checks. Failed asset
loads show a disclosed procedural fallback.

## Pallet replacement — 2026-09-29

The wood and plastic pallet source assets were regenerated with Meshy 7.1 in
https://www.meshy.ai/ko/agent/4RMArYCNcRfXhMqXMBIWH.
Two reference images (18 credits) and two textured models (60 credits) used the
owner-approved total of 78 existing credits. Both remeshing passes were free.
The 3,000-triangle targets lost deck/opening detail; the selected 10,000-triangle
targets produced **8,671 wood** and **10,105 plastic** triangles. These remain
illustrative skins: deck grids and fork openings are approximate, not CAD.

The saved pallet specification now carries visual material metadata. Main,
detail and restored inertia views use `wood-pallet` or `plastic-pallet` from that
saved specification; legacy specifications default to wood. Packing dimensions,
weights, collisions and Rapier poses are unchanged.

Only the two pallet entries and assets are replaced. Their source hashes, dates
and generation project are recorded per model in `meshy-models.json`; the
top-level project/date/credits describe the original eight-asset batch below.

```powershell
python scripts/prepare-meshy.py --input <downloaded-web-GLB-folder> --keys wood-pallet plastic-pallet --project-url https://www.meshy.ai/ko/agent/4RMArYCNcRfXhMqXMBIWH --date 2026-09-29
npm run build
```

Inputs must be named `04-wood-pallet-web.glb` and `05-plastic-pallet-web.glb`.
The import retains UVs and normalizes each model to centered unit bounds, with
1024px base-color textures. The Three.js loader references these exports directly.

**Build status:** Vite packages the original exports directly for the Three.js
viewer. No external editor or separate WebGL runtime build is required.

## Original asset batch

Eight logistics assets were generated with Meshy 7.1 on 2026-09-22 and remeshed by Meshy for WebGL. Generation used 312 of the authorized 600 existing credits; remeshing cost 0 credits. No purchase or subscription change.

Project: https://www.meshy.ai/ko/agent/Tsl1JIvwlAmalMl-F4NJe

Runtime assets are normalized, UV-preserving OBJ/MTL/JPEG exports of the downloaded remeshed GLBs. Provenance, source SHA256 and triangle counts are recorded in `meshy-models.json`. High-resolution originals and web GLBs are delivered separately, not bundled into the website.

## Rebuild

Install Python packages `trimesh`, `numpy`, `Pillow`, `scipy`, then run:

```
python scripts/prepare-meshy.py --input <downloaded-web-GLB-folder>
npm run build
```

The GLB filenames must be `01-truck-cab-web.glb` through `08-dunnage-airbag-web.glb` as recorded in the manifest. Import validates centered unit bounds and texture references before the Vite build.

Cargo, supports, corner protectors and timber blocking use model skins. Truck cab is shown for truck equipment. A cutaway Meshy container shell is used for compatible rectangular equipment; platforms, flat racks and tank equipment retain their existing geometry treatment. Plastic pallet and dunnage airbag are included as additional assets; they do not introduce new physical materials or restraint rules.

The truck rear chassis is cropped; shell floor, door-side and near-side triangles are removed for inspection. The exact floor and loading-volume wireframe remain dimension-based. Mesh skins have no physics colliders: original selection box colliders and Rapier dimensions/poses are preserved. Source model details are illustrative, not dimensional CAD.

Base-color textures are rendered through a shared instancing-capable shader with directional shading. PBR source maps remain in the downloadable GLBs; runtime uses the base color at 1024px to limit browser load. SKU tints and red invalid-cargo feedback remain visible.

The Three.js scene renders on demand when stationary. Camera movement, resize, selection and physics replay invalidate the scene as needed without changing bulk loading certification checks.
