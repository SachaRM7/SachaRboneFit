# Studio 3D — prototype

Three original procedural demonstrations: bodyweight squat, dumbbell biceps curl,
and dumbbell lateral raise. Orbit camera, fixed views, play/pause, quarter/half
speed and scrubbing. Animation starts paused and does not advance in hidden tabs.
The renderer is loaded only when the studio or an exercise preview is opened.

The anatomical mesh is a licensed BodyParts3D derivative. See ATTRIBUTION.txt.
No LiftLab code or unlicensed exercise animation has been incorporated.
The animation uses heuristic skin weights and is **not biomechanically validated**.
Red marks selected muscle groups; it does not represent measured activation.
Review joint deformation, hand grip and exercise form before generalizing it.

## Rebuild

Download `anatomy.glb`, `skeleton.glb` and `mesh_mapping.json` from the BodyExplorer
repository at commit `7d04bf3c4de2bd9cb234dd51d7e6857c099afafd` into a temporary
directory, renaming the mapping file `mapping.json`.
Run `npx tsx src/scripts/prepare-exercise-anatomy.ts <directory>`.
This filters anatomy to BP3D, simplifies meshes, normalizes coordinates and
adds the original 15-joint rig. It writes body.glb and manifest.json here.
The asset is about 11 MB before HTTP compression; it is never part of the initial
dashboard download. Mesh compression and professionally reviewed motions are
follow-up work before expanding this beyond three demonstrations.

## Connect existing exercises

`src/lib/exercises-3d/catalogue.ts` owns explicit slug-to-render mappings.
Only `bicep-curl` and `lateral-raise` currently match the demonstrated equipment.
The existing `squat` is a barbell exercise and is intentionally not mapped to
the bodyweight prototype. Unknown slugs keep the current demonstration and
technique content. No database IDs, schemas, prescriptions, AI or history change.
