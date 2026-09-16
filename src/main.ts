import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './styles/main.scss';

type BrickType = '1x1' | '2x2' | '2x4';

type BrickState = {
  id: string;
  type: BrickType;
  x: number;
  y: number;
  z: number;
  rotation: 0 | 90 | 180 | 270;
  color: string;
};

const UNIT = 1;
const BRICK_HEIGHT = 0.48;
const STUD_RADIUS = 0.14;
const STUD_HEIGHT = 0.08;

const colors = ['#d71920', '#1565c0', '#f7c600', '#159447', '#ffffff', '#22252a'];
const brickSizes: Record<BrickType, [number, number]> = {
  '1x1': [1, 1],
  '2x2': [2, 2],
  '2x4': [2, 4],
};

const scene = new THREE.Scene();
scene.background = new THREE.Color('#08090b');
scene.fog = new THREE.Fog('#08090b', 28, 85);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200);
camera.position.set(12, 12, 16);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('app')!.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 4;
controls.maxDistance = 42;
controls.maxPolarAngle = Math.PI * 0.48;
controls.target.set(0, 0, 0);
controls.mouseButtons = {
  LEFT: THREE.MOUSE.PAN,
  MIDDLE: THREE.MOUSE.PAN,
  RIGHT: THREE.MOUSE.ROTATE,
};

scene.add(new THREE.HemisphereLight('#ffffff', '#20242b', 2.2));
const key = new THREE.DirectionalLight('#ffffff', 3.2);
key.position.set(10, 18, 8);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
scene.add(key);

const ground = new THREE.Mesh(
  new THREE.BoxGeometry(30, 0.35, 30),
  new THREE.MeshStandardMaterial({ color: '#14171b', roughness: 0.82, metalness: 0.05 }),
);
ground.position.y = -0.24;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(30, 30, '#3b4149', '#20242b');
grid.position.y = -0.04;
scene.add(grid);

const root = new THREE.Group();
scene.add(root);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

let selectedType: BrickType = '2x4';
let selectedColor = colors[0];
let rotation: 0 | 90 | 180 | 270 = 0;
let ghost: THREE.Group | null = null;
let hoveredCell = new THREE.Vector3();
let sequence = 0;

const bricks: BrickState[] = [];
const meshes = new Map<string, THREE.Group>();
const history: BrickState[][] = [];
const redoStack: BrickState[][] = [];

function makeBrick(state: BrickState, transparent = false) {
  const [w, d] = brickSizes[state.type];
  const group = new THREE.Group();
  group.userData.brickId = state.id;

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(w * UNIT - 0.04, BRICK_HEIGHT, d * UNIT - 0.04),
    new THREE.MeshStandardMaterial({
      color: state.color,
      roughness: 0.48,
      metalness: 0.03,
      transparent,
      opacity: transparent ? 0.45 : 1,
    }),
  );
  body.castShadow = true;
  body.receiveShadow = true;
  body.position.y = BRICK_HEIGHT / 2;
  group.add(body);

  const studGeometry = new THREE.CylinderGeometry(STUD_RADIUS, STUD_RADIUS, STUD_HEIGHT, 16);
  const studMaterial = new THREE.MeshStandardMaterial({
    color: state.color,
    roughness: 0.42,
    transparent,
    opacity: transparent ? 0.55 : 1,
  });

  for (let x = 0; x < w; x += 1) {
    for (let z = 0; z < d; z += 1) {
      const stud = new THREE.Mesh(studGeometry, studMaterial);
      stud.castShadow = true;
      stud.position.set(x - (w - 1) / 2, BRICK_HEIGHT + STUD_HEIGHT / 2, z - (d - 1) / 2);
      group.add(stud);
    }
  }

  group.position.set(state.x, state.y, state.z);
  group.rotation.y = THREE.MathUtils.degToRad(state.rotation);
  return group;
}

function snapshot() {
  history.push(structuredClone(bricks));
  if (history.length > 80) history.shift();
  redoStack.length = 0;
}

function addBrick(x: number, z: number) {
  snapshot();
  const [w, d] = brickSizes[selectedType];
  const state: BrickState = {
    id: `brick-${++sequence}`,
    type: selectedType,
    x: snapCenter(x, w),
    y: getStackHeight(x, z),
    z: snapCenter(z, d),
    rotation,
    color: selectedColor,
  };

  if (!canPlace(state)) return;
  bricks.push(state);
  const mesh = makeBrick(state);
  root.add(mesh);
  meshes.set(state.id, mesh);
}

function snapCenter(value: number, size: number) {
  const base = Math.floor(value);
  return size % 2 === 0 ? base + 0.5 : base;
}

function getStackHeight(x: number, z: number) {
  const nearby = bricks.filter((brick) => Math.abs(brick.x - x) < 2.1 && Math.abs(brick.z - z) < 2.1);
  if (!nearby.length) return 0;
  return Math.max(...nearby.map((brick) => brick.y + BRICK_HEIGHT));
}

function canPlace(state: BrickState) {
  return bricks.every((brick) => {
    const [aw, ad] = brickSizes[brick.type];
    const [bw, bd] = brickSizes[state.type];
    const overlapX = Math.abs(brick.x - state.x) < (aw + bw) / 2;
    const overlapZ = Math.abs(brick.z - state.z) < (ad + bd) / 2;
    const overlapY = Math.abs(brick.y - state.y) < BRICK_HEIGHT * 0.9;
    return !(overlapX && overlapZ && overlapY);
  });
}

function updateGhost() {
  if (!ghost) return;
  const [w, d] = brickSizes[selectedType];
  const state: BrickState = {
    id: 'ghost',
    type: selectedType,
    x: snapCenter(hoveredCell.x, w),
    y: getStackHeight(hoveredCell.x, hoveredCell.z),
    z: snapCenter(hoveredCell.z, d),
    rotation,
    color: selectedColor,
  };
  ghost.clear();
  const next = makeBrick(state, true);
  ghost.add(...next.children);
  ghost.position.copy(next.position);
  ghost.rotation.copy(next.rotation);
  const valid = canPlace(state);
  ghost.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
      obj.material.color.set(valid ? selectedColor : '#ff3045');
    }
  });
}

function createUI() {
  const ui = document.createElement('div');
  ui.className = 'ui';
  ui.innerHTML = `
    <header class="topbar">
      <div><strong>LBLB</strong><span>3D BUILDER</span></div>
      <div class="hint">LMB build · RMB orbit · Q/E rotate · Delete remove</div>
    </header>
    <aside class="panel palette">
      <div class="label">BRICKS</div>
      <div class="brick-options">
        ${(['1x1', '2x2', '2x4'] as BrickType[]).map((type) => `<button data-brick="${type}" class="brick-btn ${type === selectedType ? 'active' : ''}">${type}</button>`).join('')}
      </div>
      <div class="label">COLOR</div>
      <div class="colors">
        ${colors.map((color) => `<button class="color-btn" data-color="${color}" style="--c:${color}"></button>`).join('')}
      </div>
      <button id="clear" class="action">CLEAR BUILD</button>
    </aside>
    <footer class="status"><span id="mode">BUILD</span><span id="coord">0 / 0 / 0</span></footer>
  `;
  document.body.appendChild(ui);

  ui.querySelectorAll<HTMLButtonElement>('[data-brick]').forEach((button) => {
    button.onclick = () => {
      selectedType = button.dataset.brick as BrickType;
      ui.querySelectorAll('.brick-btn').forEach((b) => b.classList.remove('active'));
      button.classList.add('active');
      updateGhost();
    };
  });
  ui.querySelectorAll<HTMLButtonElement>('[data-color]').forEach((button) => {
    button.onclick = () => {
      selectedColor = button.dataset.color!;
      ui.querySelectorAll('.color-btn').forEach((b) => b.classList.remove('active'));
      button.classList.add('active');
      updateGhost();
    };
  });
  ui.querySelector<HTMLButtonElement>('#clear')!.onclick = () => {
    if (!bricks.length) return;
    snapshot();
    bricks.length = 0;
    meshes.forEach((mesh) => root.remove(mesh));
    meshes.clear();
  };
}

function setPointer(event: PointerEvent) {
  pointer.x = (event.clientX / innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / innerHeight) * 2 + 1;
}

renderer.domElement.addEventListener('pointermove', (event) => {
  setPointer(event);
  raycaster.setFromCamera(pointer, camera);
  if (raycaster.ray.intersectPlane(plane, hoveredCell)) {
    updateGhost();
    const coord = document.getElementById('coord');
    if (coord) coord.textContent = `${hoveredCell.x.toFixed(1)} / ${getStackHeight(hoveredCell.x, hoveredCell.z).toFixed(1)} / ${hoveredCell.z.toFixed(1)}`;
  }
});

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  setPointer(event);
  raycaster.setFromCamera(pointer, camera);
  if (raycaster.ray.intersectPlane(plane, hoveredCell)) addBrick(hoveredCell.x, hoveredCell.z);
});

window.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 'q') rotation = ((rotation + 270) % 360) as BrickState['rotation'];
  if (event.key.toLowerCase() === 'e') rotation = ((rotation + 90) % 360) as BrickState['rotation'];
  if (event.key === 'Escape') rotation = 0;
  updateGhost();
});

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

createUI();
ghost = new THREE.Group();
scene.add(ghost);

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

animate();
