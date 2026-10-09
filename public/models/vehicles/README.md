# Cosmetic vehicle models

These four GLBs are user-supplied Meshy assets from the Drive folder linked in
`provenance.json`. They are local, self-contained glTF 2.0 files with embedded
textures. They do not call Meshy or any other external service at runtime.

- `cargo-1ton-cab-v2-clean.glb`: 10,886 triangles; 2,610,968 bytes
- `cargo-container-tractor-v2-web.glb`: 19,841 triangles; 3,847,552 bytes
- `cargo-truck-underbody-v2-web.glb`: 14,645 triangles; 2,941,020 bytes
- `cargo-container-chassis-v2-web.glb`: 19,483 triangles; 3,432,972 bytes

Total: 12,832,512 bytes. Only the selected pair is loaded (approximately 5.6 MB
for a rigid truck or 7.3 MB for a container/semitrailer). The cache shares decoded
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

## Placement

GLB axes are Y-up, front toward -X. They are not reflected or unit-box normalized.
`threeVehicleLayout.ts` calibrates a cosmetic assembly to the selected equipment.
Cab/tractor, wheels, axles and landing feet use uniform scale. Only bare chassis
rail spans change longitudinal length; the short semitrailer rear overhang also
contracts beyond its final mudguard. The rigid ladder frame continues beneath
the cab. These adjustments are per-scene geometry clones; cached/source GLBs
are never changed. Landing feet retain their measured tire-plane clearance.

Containers, Mega Trailer and Jumbo use tractor + container chassis. Tautliner,
Refrigerated Truck, Isotherm Truck and Custom Truck use the uploaded Meshy cab +
truck underbody, including long custom cargo spaces. Cargo length does not select
the vehicle type. Jumbo retains the application's existing continuous
cargo-space approximation. Visual proxies do not assert real vehicle axle-load
specifications or roadworthiness.

Vehicle geometry is excluded from the loading plan, constraints, inertia bodies,
cargo selection, payload and cargo center of gravity. Failed vehicle loading
keeps cargo usable and offers retry. Unity remains available with its existing
models and behavior.
