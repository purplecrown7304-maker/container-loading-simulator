# Cosmetic vehicle models

The four original GLBs are user-supplied Meshy assets from the Drive folder linked in
`provenance.json`. They are local, self-contained glTF 2.0 files with embedded
textures. They do not call Meshy or any other external service at runtime.

- `cargo-1ton-cab-v2-clean.glb`: 10,886 triangles; 2,610,968 bytes
- `cargo-container-tractor-v2-web.glb`: 19,841 triangles; 3,847,552 bytes
- `cargo-truck-underbody-v2-web.glb`: 14,645 triangles; 2,941,020 bytes
- `cargo-container-chassis-v2-web.glb`: 19,483 triangles; 3,432,972 bytes
- `cargo-rigid-heavy-cab-v1.glb`: 9,124 triangles; 3,168,260 bytes; local tractor derivative

Only the selected assets are loaded (approximately 5.6 MB for a small truck,
6.1 MB for a medium/heavy truck, or 7.3 MB for a container/semitrailer).
The cache shares decoded
assets across repeated plans. Original uploaded files remain preserved at their
source URLs; the existing eight Unity OBJ/MTL/JPEG assets are unchanged.

## Derivation and ownership

Base-color textures use 2048px JPEG; packed metallic/roughness textures use
1024px PNG. Geometry, normals, UVs and indices are unchanged from the uploads,
except the cab's disconnected rear spare-wheel component: exactly 772 faces
wholly beyond source X=0.8 were removed, and unused vertices compacted. The main
cab ends at X=0.715034, with a verified gap before the removed component starts at
X=0.805358. Retained attributes and embedded texture bytes are unchanged. Source,
intermediate and final hashes, source IDs and this cleanup rule are in the manifest.

`node scripts/derive-rigid-cab.mjs` reproducibly retains complete tractor triangles
with all vertex X <= -0.28, compacts vertices and preserves original UVs/textures.
The result contains the front cab/front axle, without the fifth wheel/rear tractor
axles. It is a representative medium/heavy silhouette, not a manufacturer CAD model.

## Placement

GLB axes are Y-up, front toward -X. They are not reflected or unit-box normalized.
`threeVehicleLayout.ts` calibrates a cosmetic assembly to the selected equipment.
Cab/tractor, wheels, axles and landing feet use uniform scale. Only bare chassis
rail spans change longitudinal length; the short semitrailer rear overhang also
contracts beyond its final mudguard. The rigid ladder frame continues beneath
the cab. These adjustments are per-scene geometry clones; cached/source GLBs
are never changed. Landing feet retain their measured tire-plane clearance.

Containers and saved European trailers use tractor + container chassis. Domestic
one-ton bodies use the small cab; medium/heavy bodies use the derived rigid cab.
The registered rear-two-axle profile copies a complete rear-wheel/axle triangle
region (source 0.02 < X < 0.72) one wheel diameter forward with uniform scale.
Factory presets select an explicit profile; unclassified custom trucks use a
representative size/payload silhouette. This does not infer axle-load limits.
Jumbo retains the application's existing continuous
cargo-space approximation. Visual proxies do not assert real vehicle axle-load
specifications or roadworthiness.

Vehicle geometry is excluded from the loading plan, constraints, inertia bodies,
cargo selection, payload and cargo center of gravity. Failed vehicle loading
keeps cargo usable and offers retry. Unity remains available with its existing
models and behavior.

Truck selection thumbnails render this same calibrated assembly into cached
static images. The queue shares one temporary WebGL renderer and releases it
when idle; it never creates a live WebGL canvas for each selection card.
