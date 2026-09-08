/** Rebuild: npx tsx src/scripts/prepare-exercise-anatomy.ts <source-directory>
 * Sources and mesh license: public/models/exercises-3d/ATTRIBUTION.txt.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { MeshoptSimplifier } from "meshoptimizer";
import {
  BufferGeometry,
  Float32BufferAttribute,
  Uint16BufferAttribute,
  MeshStandardMaterial,
  Scene,
  Skeleton,
  SkinnedMesh,
} from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { makeBones, JOINTS } from "../lib/exercises-3d/rig";

class BlobReader {
  result: ArrayBuffer | null = null;
  onloadend?: () => void;
  readAsArrayBuffer(blob: Blob) {
    void blob.arrayBuffer().then((b) => {
      this.result = b;
      this.onloadend?.();
    });
  }
}
Object.assign(globalThis, { FileReader: BlobReader });
async function main() {
  const source = process.argv[2];
  if (!source) throw new Error("Source directory required");
  const output = path.resolve("public/models/exercises-3d");
  const mapping = JSON.parse(
    await fs.readFile(path.join(source, "mapping.json"), "utf8"),
  );
  const permitted = new Set(
    mapping
      .filter((m: { source: string }) => m.source === "bp3d")
      .map((m: { name: string }) => m.name),
  );
  await MeshoptSimplifier.ready;
  const groups = new Map<
    string,
    { p: number[]; i: number[]; j: number[]; w: number[] }
  >();
  let sourceTriangles = 0,
    triangles = 0;
  function mixPair(a: number, b: number, t: number) {
    return { j: [a, b, 0, 0], w: [1 - t, t, 0, 0] };
  }
  function blend(
    y: number,
    at: number,
    width: number,
    low: number,
    high: number,
  ) {
    const t = Math.max(0, Math.min(1, (y - at + width) / (2 * width)));
    return mixPair(low, high, t * t * (3 - 2 * t));
  }
  function weights(name: string, x: number, y: number, cx: number, cy: number) {
    const left = x >= 0,
      upper = left ? 3 : 6,
      lower = left ? 4 : 7,
      hand = left ? 5 : 8,
      thigh = left ? 9 : 12,
      shin = left ? 10 : 13,
      foot = left ? 11 : 14;
    const leg =
      /femor|vastus|patella|tibia|fibula|glute|gastrocnemius|soleus|semitend|semimembran|foot|toe|talus|calcane|tarsal|pelvic|adductor|gracilis|sartorius/.test(
        name,
      ) || cy < 0.8;
    const arm =
      /humerus|radius|ulna|brachii|brachialis|brachioradialis|deltoid|carpi|digitorum|pollicis|hand|finger|thumb|forearm|metacarp|pronator|supinator/.test(
        name,
      ) ||
      (Math.abs(cx) > 0.18 && cy > 0.65);
    if (arm && cy > 0.65 && !/femor/.test(name)) {
      if (y < 0.97) return blend(y, 0.888, 0.04, hand, lower);
      if (y < 1.28) return blend(y, 1.113, 0.065, lower, upper);
      return /deltoid/.test(name)
        ? blend(y, 1.405, 0.025, upper, 1)
        : mixPair(upper, upper, 0);
    }
    if (leg) {
      if (y < 0.2) return blend(y, 0.09, 0.035, foot, shin);
      if (y < 0.68) return blend(y, 0.443, 0.06, shin, thigh);
      return blend(y, 0.9, 0.075, thigh, 0);
    }
    if (y > 1.44) return blend(y, 1.49, 0.055, 1, 2);
    return blend(y, 1.1, 0.16, 0, 1);
  }
  function groupFor(name: string, bone: boolean) {
    if (bone) return "bones";
    if (/tendon|aponeurosis|fascia|retinaculum/.test(name)) return "tendons";
    if (/biceps brachii|brachialis/.test(name)) return "biceps";
    if (/deltoid/.test(name)) return "deltoids";
    if (/rectus femoris|vastus/.test(name)) return "quads";
    if (/gluteus/.test(name)) return "glutes";
    if (/pectoralis/.test(name)) return "pecs";
    if (/triceps brachii/.test(name)) return "triceps";
    if (/biceps femoris|semitendinosus|semimembranosus/.test(name))
      return "hamstrings";
    if (/gastrocnemius|soleus/.test(name)) return "calves";
    return "other";
  }
  for (const kind of ["anatomy", "skeleton"]) {
    const data = await fs.readFile(path.join(source, kind + ".glb"));
    const jsonSize = data.readUInt32LE(12);
    const gltf = JSON.parse(data.subarray(20, 20 + jsonSize).toString());
    const binStart = 28 + jsonSize;
    function attribute(id: number): number[] {
      const a = gltf.accessors[id],
        v = gltf.bufferViews[a.bufferView],
        count = a.count * (a.type === "VEC3" ? 3 : 1),
        stride = v.byteStride;
      const offset = binStart + (v.byteOffset || 0) + (a.byteOffset || 0);
      const read =
        a.componentType === 5126
          ? "readFloatLE"
          : a.componentType === 5125
            ? "readUInt32LE"
            : "readUInt16LE";
      const bytes = a.componentType === 5123 ? 2 : 4;
      return Array.from({ length: count }, (_, i) =>
        data[read](
          offset +
            Math.floor(i / (a.type === "VEC3" ? 3 : 1)) *
              (stride || bytes * (a.type === "VEC3" ? 3 : 1)) +
            (i % (a.type === "VEC3" ? 3 : 1)) * bytes,
        ),
      );
    }
    for (const mesh of gltf.meshes) {
      if (kind === "anatomy" && !permitted.has(mesh.name)) continue;
      const prim = mesh.primitives[0],
        raw = attribute(prim.attributes.POSITION),
        idx = new Uint32Array(attribute(prim.indices));
      const positions = new Float32Array(raw.length);
      let cx = 0,
        cy = 0;
      for (let i = 0; i < raw.length; i += 3) {
        positions[i] = raw[i]! / 1000;
        positions[i + 1] = (raw[i + 2]! + 73) / 1000;
        positions[i + 2] = -(raw[i + 1]! + 85) / 1000;
        cx += positions[i]!;
        cy += positions[i + 1]!;
      }
      cx /= raw.length / 3;
      cy /= raw.length / 3;
      const target = Math.max(24, Math.floor((idx.length * 0.035) / 3) * 3);
      const [small] = MeshoptSimplifier.simplify(
        idx,
        positions,
        3,
        Math.min(idx.length, target),
        0.03,
        [],
      );
      const name = groupFor(mesh.name, kind === "skeleton");
      const g = groups.get(name) ?? { p: [], i: [], j: [], w: [] };
      groups.set(name, g);
      const remap = new Map<number, number>();
      for (const old of small) {
        let n = remap.get(old);
        if (n === undefined) {
          n = g.p.length / 3;
          remap.set(old, n);
          const x = positions[old * 3]!,
            y = positions[old * 3 + 1]!,
            z = positions[old * 3 + 2]!;
          // Bake a simple closed hand around the grip. This is a prototype
          // approximation, not an individually articulated finger rig.
          const handVertex =
            Math.abs(cx) > 0.21 && cy > 0.65 && cy < 0.97 && y < 0.81;
          const angle = Math.min(Math.PI, Math.max(0, (0.81 - y) / 0.028));
          g.p.push(
            x,
            handVertex ? 0.81 - Math.sin(angle) * 0.028 : y,
            handVertex ? z + (1 - Math.cos(angle)) * 0.028 : z,
          );
          const skin = weights(mesh.name, x, y, cx, cy);
          g.j.push(...skin.j);
          g.w.push(...skin.w);
        }
        g.i.push(n);
      }
      sourceTriangles += idx.length / 3;
      triangles += small.length / 3;
    }
  }
  const scene = new Scene(),
    bones = makeBones();
  scene.add(bones[0]!);
  scene.updateMatrixWorld(true);
  const skeleton = new Skeleton(bones);
  for (const [name, g] of groups) {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(g.p, 3));
    geometry.setAttribute("skinIndex", new Uint16BufferAttribute(g.j, 4));
    geometry.setAttribute("skinWeight", new Float32BufferAttribute(g.w, 4));
    geometry.setIndex(g.i);
    geometry.computeVertexNormals();
    const material = new MeshStandardMaterial({
      color: name === "bones" ? 0xe3ded1 : 0x9baba0,
      roughness: 0.75,
    });
    const mesh = new SkinnedMesh(geometry, material);
    mesh.name = name;
    mesh.bind(skeleton);
    mesh.frustumCulled = false;
    scene.add(mesh);
  }
  scene.updateMatrixWorld(true);
  const binary = await new GLTFExporter().parseAsync(scene, {
    binary: true,
    onlyVisible: true,
  });
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(
    path.join(output, "body.glb"),
    Buffer.from(binary as ArrayBuffer),
  );
  await fs.writeFile(
    path.join(output, "manifest.json"),
    JSON.stringify(
      {
        sourceCommit: "7d04bf3c4de2bd9cb234dd51d7e6857c099afafd",
        sourceTriangles,
        triangles,
        bytes: (binary as ArrayBuffer).byteLength,
        groups: [...groups.keys()],
        joints: JOINTS.length,
        method:
          "BP3D meshes only; decimation, coordinate conversion, heuristic skin weights. Poses require expert review.",
      },
      null,
      2,
    ),
  );
  console.log({
    sourceTriangles,
    triangles,
    bytes: (binary as ArrayBuffer).byteLength,
  });
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
