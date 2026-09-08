import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { applyMovement, JOINTS, type MovementId } from "@/lib/exercises-3d/rig";
import { MOVEMENTS_3D } from "@/lib/exercises-3d/catalogue";
import type { ViewerController } from "./ExerciseViewer";

export async function createExerciseScene(
  host: HTMLDivElement,
  movement: MovementId,
  onPhase: (phase: number) => void,
  signal: AbortSignal,
): Promise<ViewerController> {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 30);
  camera.position.set(1.65, 1.25, 2.9);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.8, 0);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.minDistance = 1.9;
  controls.maxDistance = 5.5;
  controls.minPolarAngle = 0.25;
  controls.maxPolarAngle = Math.PI * 0.7;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x77866c, 2.5));
  const light = new THREE.DirectionalLight(0xffffff, 3);
  light.position.set(3, 5, 4);
  scene.add(light);
  const rim = new THREE.DirectionalLight(0xe8f0ff, 2);
  rim.position.set(-3, 2, -2);
  scene.add(rim);
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(0.65, 64),
    new THREE.MeshBasicMaterial({
      color: 0xcad5c4,
      transparent: true,
      opacity: 0.45,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.006;
  scene.add(floor);

  let frame = 0,
    disposed = false;
  const release = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    controls.dispose();
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        materials.forEach((material) => material.dispose());
      }
    });
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  };
  try {
    const response = await fetch("/models/exercises-3d/body.glb", { signal });
    if (!response.ok) throw new Error("Unable to load anatomy model");
    const gltf = await new GLTFLoader().parseAsync(
      await response.arrayBuffer(),
      "",
    );
    scene.add(gltf.scene);
    signal.throwIfAborted();
    const bones = JOINTS.map((joint) => {
      const bone = gltf.scene.getObjectByName(joint.name);
      if (!(bone instanceof THREE.Bone))
        throw new Error(`Missing joint ${joint.name}`);
      return bone;
    });
    const highlighted: readonly string[] = MOVEMENTS_3D[movement].groups;
    gltf.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.frustumCulled = false;
        const material = object.material as THREE.MeshStandardMaterial;
        material.color.set(
          highlighted.includes(object.name)
            ? 0xdf4f48
            : object.name === "bones"
              ? 0xe5dfcd
              : 0x8f9e91,
        );
        material.roughness = 0.8;
      }
    });
    if (movement !== "squat") {
      for (const index of [5, 8]) {
        const dumbbell = new THREE.Group();
        const material = new THREE.MeshStandardMaterial({
          color: 0x25382c,
          roughness: 0.55,
          metalness: 0.35,
        });
        const grip = new THREE.Mesh(
          new THREE.CylinderGeometry(0.013, 0.013, 0.22, 12),
          material,
        );
        grip.rotation.z = Math.PI / 2;
        dumbbell.add(grip);
        for (const x of [-0.085, 0.085]) {
          const plate = new THREE.Mesh(
            new THREE.CylinderGeometry(0.06, 0.06, 0.04, 12),
            material,
          );
          plate.rotation.z = Math.PI / 2;
          plate.position.x = x;
          dumbbell.add(plate);
        }
        dumbbell.position.set(0, -0.09, 0.025);
        bones[index]!.add(dumbbell);
      }
    }
    let dirty = true;
    controls.addEventListener("change", () => {
      dirty = true;
    });
    const resize = () => {
      dirty = true;
      const width = Math.max(host.clientWidth, 1),
        height = Math.max(host.clientHeight, 1);
      camera.aspect = width / height;
      // Keep the full arm span and dumbbells visible on narrow screens.
      const fitDistance = Math.max(
        3.35,
        2.1 /
          (2 *
            Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) *
            camera.aspect),
      );
      if (camera.position.distanceTo(controls.target) < fitDistance) {
        camera.position
          .sub(controls.target)
          .setLength(fitDistance)
          .add(controls.target);
      }
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    host.append(renderer.domElement);
    renderer.domElement.setAttribute("aria-hidden", "true");
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    let playing = false,
      speed = 1,
      phase = 0,
      previous = performance.now(),
      lastUpdate = 0;
    const animate = (time: number) => {
      if (disposed) return;
      const dt = Math.min((time - previous) / 1000, 0.05);
      previous = time;
      if (!document.hidden) {
        controls.update();
        if (playing || dirty) {
          if (playing) phase = (phase + (dt * speed) / 5) % 1;
          applyMovement(bones, movement, phase);
          renderer.render(scene, camera);
          dirty = false;
          if (playing && time - lastUpdate > 80) {
            onPhase(phase);
            lastUpdate = time;
          }
        }
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return {
      play(value) {
        playing = value;
      },
      speed(value) {
        speed = value;
      },
      seek(value) {
        phase = value;
        dirty = true;
      },
      view(value) {
        const distance = camera.position.distanceTo(controls.target);
        camera.position
          .copy(controls.target)
          .add(
            new THREE.Vector3(
              value === "side" ? distance : 0,
              0.15,
              value === "side" ? 0 : value === "back" ? -distance : distance,
            ),
          );
        controls.update();
      },
      dispose() {
        observer.disconnect();
        release();
      },
    };
  } catch (error) {
    release();
    throw error;
  }
}
