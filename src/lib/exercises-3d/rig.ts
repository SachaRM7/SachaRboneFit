import { Bone, Vector3 } from "three";

// Repères du modèle BodyParts3D, en mètres (Y vertical, Z vers l’avant).
export const JOINTS = [
  { name: "pelvis", parent: -1, p: [0, 0.903, -0.015] },
  { name: "chest", parent: 0, p: [0, 1.2, -0.015] },
  { name: "head", parent: 1, p: [0, 1.53, 0] },
  { name: "upperL", parent: 1, p: [0.175, 1.393, -0.005] },
  { name: "lowerL", parent: 3, p: [0.222, 1.113, 0.005] },
  { name: "handL", parent: 4, p: [0.26, 0.888, 0.015] },
  { name: "upperR", parent: 1, p: [-0.175, 1.393, -0.005] },
  { name: "lowerR", parent: 6, p: [-0.222, 1.113, 0.005] },
  { name: "handR", parent: 7, p: [-0.26, 0.888, 0.015] },
  { name: "thighL", parent: 0, p: [0.085, 0.903, -0.015] },
  { name: "shinL", parent: 9, p: [0.082, 0.443, -0.005] },
  { name: "footL", parent: 10, p: [0.075, 0.063, -0.005] },
  { name: "thighR", parent: 0, p: [-0.085, 0.903, -0.015] },
  { name: "shinR", parent: 12, p: [-0.082, 0.443, -0.005] },
  { name: "footR", parent: 13, p: [-0.075, 0.063, -0.005] },
] as const;
export type MovementId = "squat" | "bicep-curl" | "lateral-raise";
export function makeBones() {
  const bones = JOINTS.map((j) => {
    const b = new Bone();
    b.name = j.name;
    b.position.fromArray(j.p);
    return b;
  });
  JOINTS.forEach((j, i) => {
    if (j.parent >= 0) {
      bones[i]!.position.sub(
        new Vector3().fromArray(JOINTS[j.parent as number]!.p),
      );
      bones[j.parent]!.add(bones[i]!);
    }
  });
  return bones;
}
export function applyMovement(
  bones: Bone[],
  movement: MovementId,
  phase: number,
) {
  if (bones.length !== JOINTS.length) throw new Error("Invalid exercise rig");
  bones.forEach((b, i) => {
    b.rotation.set(0, 0, 0);
    b.position.fromArray(JOINTS[i]!.p);
    const p = JOINTS[i]!.parent;
    if (p >= 0) b.position.sub(new Vector3().fromArray(JOINTS[p as number]!.p));
  });
  const f = (1 - Math.cos(phase * Math.PI * 2)) / 2;
  if (movement === "bicep-curl") {
    bones[4]!.rotation.x = bones[7]!.rotation.x = -f * 2.05;
  } else if (movement === "lateral-raise") {
    bones[3]!.rotation.z = f * 1.2;
    bones[6]!.rotation.z = -f * 1.2;
    bones[4]!.rotation.x = bones[7]!.rotation.x = -0.12;
  } else {
    const hip = f * 1.18,
      knee = f * 1.65,
      lean = f * 0.4;
    bones[0]!.rotation.x = lean;
    bones[9]!.rotation.x = bones[12]!.rotation.x = -hip - lean;
    bones[10]!.rotation.x = bones[13]!.rotation.x = knee;
    bones[11]!.rotation.x = bones[14]!.rotation.x = hip - knee;
    bones[3]!.rotation.x = bones[6]!.rotation.x = -0.75 - lean;
    bones[4]!.rotation.x = bones[7]!.rotation.x = -0.28;
    bones[0]!.updateMatrixWorld(true);
    const ankle = bones[11]!.getWorldPosition(new Vector3());
    bones[0]!.position.y += JOINTS[11]!.p[1] - ankle.y;
    bones[0]!.position.z += JOINTS[11]!.p[2] - ankle.z;
  }
  bones[0]!.updateMatrixWorld(true);
}
