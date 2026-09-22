# Meshy logistics assets

Eight logistics assets were generated with Meshy 7.1 on 2026-09-22 and remeshed by Meshy for WebGL. Generation used 312 of the authorized 600 existing credits; remeshing cost 0 credits. No purchase or subscription change.

Project: https://www.meshy.ai/ko/agent/Tsl1JIvwlAmalMl-F4NJe

Runtime assets are normalized, UV-preserving OBJ/MTL/JPEG exports of the downloaded remeshed GLBs. Provenance, source SHA256 and triangle counts are recorded in `meshy-models.json`. High-resolution originals and web GLBs are delivered separately, not bundled into the website.

## Rebuild

Install Python packages `trimesh`, `numpy`, `Pillow`, `scipy`, then run:

```
python scripts/prepare-meshy.py --input <downloaded-web-GLB-folder>
powershell -File scripts/build-unity.ps1
```

The GLB filenames must be `01-truck-cab-web.glb` through `08-dunnage-airbag-web.glb` as recorded in the manifest. Import validates centered unit bounds and texture references before building Unity.

Cargo, supports, corner protectors and timber blocking use model skins. Truck cab is shown for truck equipment. A cutaway Meshy container shell is used for compatible rectangular equipment; platforms, flat racks and tank equipment retain their existing geometry treatment. Plastic pallet and dunnage airbag are included as additional assets; they do not introduce new physical materials or restraint rules.

The truck rear chassis is cropped; shell floor, door-side and near-side triangles are removed for inspection. The exact floor and loading-volume wireframe remain dimension-based. Mesh skins have no physics colliders: original selection box colliders and Rapier dimensions/poses are preserved. Source model details are illustrative, not dimensional CAD.

Base-color textures are rendered through a shared instancing-capable shader with directional shading. PBR source maps remain in the downloadable GLBs; runtime uses the base color at 1024px to limit browser load. SKU tints and red invalid-cargo feedback remain visible.
