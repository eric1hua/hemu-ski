import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { makeToon } from '../render/toon.js';

// Assembly coordinates match the body frame: length X, toes +Z.
// The deck is scaled uniformly to the game's 1.56 m length, keeping its generated
// width. Bindings retain their own proportions.
export async function loadBoardAssembly(rider) {
  const gltf = await new GLTFLoader().loadAsync(import.meta.env.BASE_URL + 'models/female-rider/board-assembly-seg-tex2k-v01.glb');
  gltf.scene.updateMatrixWorld(true);
  const root = new THREE.Group();
  root.name = 'FemaleBoardAssembly';
  root.visible = false;
  const parts = new Map();
  gltf.scene.traverse((node) => {
    if (!node.isMesh) return;
    const part = node.clone();
    part.geometry = node.geometry.clone().applyMatrix4(node.matrixWorld);
    part.position.set(0, 0, 0); part.quaternion.identity(); part.scale.setScalar(1);
    part.material = makeToon({ map: node.material.map, color: node.material.color, side: node.material.side }, { rim: 1, hatch: 0 });
    part.castShadow = true; part.receiveShadow = true;
    parts.set(node.name, part);
  });
  const deck = parts.get('tripo_part_0');
  if (!deck) throw new Error('Board assembly is missing its deck');
  deck.geometry.computeBoundingBox();
  const box = deck.geometry.boundingBox;
  const centre = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  deck.geometry.translate(-centre.x, -box.min.y + 0.005, -centre.z);
  deck.scale.setScalar(1.56 / size.x); // keep the generated width (~0.39 m at 1.56 m long)
  root.add(deck);
  for (const [i, names] of [[0, ['tripo_part_2', 'tripo_part_3', 'tripo_part_6']], [1, ['tripo_part_1', 'tripo_part_4', 'tripo_part_7']]]) {
    const group = new THREE.Group();
    group.name = `Binding${i}`;
    const base = parts.get(names[0]);
    if (!base) throw new Error(`Missing binding ${names[0]}`);
    base.geometry.computeBoundingBox();
    const bounds = base.geometry.boundingBox;
    const anchor = bounds.getCenter(new THREE.Vector3());
    anchor.y = bounds.min.y;
    for (const name of names) {
      const part = parts.get(name);
      if (!part) throw new Error(`Missing binding part ${name}`);
      part.geometry.translate(-anchor.x, -anchor.y, -anchor.z);
      group.add(part);
    }
    group.scale.setScalar(1.2);
    group.position.copy(rider.feet[i].position);
    group.position.y -= 0.02; // thin base under the existing IK sole datum
    root.add(group);
  }
  rider.body.add(root);
  return root;
}
