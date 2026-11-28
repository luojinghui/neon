import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { BALL_RADIUS, powerToSpeed, simulateShot, type Ball, type Simulation } from './physics';
import { cueStyle } from './cues';
import { canPlace, type GameState } from './rules';

const R = BALL_RADIUS;
const BALL_COLORS = ['#f4f0e6', '#f0c400', '#1d4ed8', '#dc2626', '#7c3aed', '#f97316', '#15803d', '#7f1d1d', '#171717'];

export interface ShotReadout {
  cutAngle: number | null;
  separation: number | null;
}

export type ViewMode = 'table' | 'follow' | 'top';
export type AimMode = 'drag' | 'point' | 'fine';

export interface SceneHandlers {
  onPlace: (x: number, z: number) => void;
  onPower: (power: number) => void;
  onShoot: (power: number) => void;
  onReadout: (readout: ShotReadout) => void;
}

interface SceneControls {
  power: number;
  spinX: number;
  spinY: number;
  elevation: number;
  mode: ViewMode;
  aimMode: AimMode;
  cueId: string;
}

/** 球台、球和预测线。台呢、木库和球色是球桌内容，不走界面主题色。 */
export class PoolScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(36, 1, 0.05, 30);
  private readonly raycaster = new THREE.Raycaster();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly balls: THREE.Mesh[] = [];
  private readonly shadows: THREE.Mesh[] = [];
  private readonly cue: THREE.Mesh;
  private readonly aimLine: THREE.Line;
  private readonly cuePath: THREE.Line;
  private readonly objectPath: THREE.Line;
  private readonly contactGhost: THREE.Mesh;
  private readonly placeGhost: THREE.Mesh;
  private game: GameState | null = null;
  private controls: SceneControls = { power: 0.8, spinX: 0, spinY: 0, elevation: 0, mode: 'table', aimMode: 'drag', cueId: 'maple' };
  private shaftMaterial: THREE.MeshStandardMaterial | null = null;
  private tipMaterial: THREE.MeshStandardMaterial | null = null;
  private buttMaterial: THREE.MeshStandardMaterial | null = null;
  private aim = 0;
  private yaw = 0.04;
  private pitch = 1.05;
  private distance = 2.55;
  private inputKey = '';
  private dirty = true;
  private playing = false;
  private playStarted = 0;
  private playPower = 0.8;
  private samples: Simulation['samples'] = [];
  private playDone: (() => void) | null = null;
  private pointer: { x: number; y: number; mode: 'aim' | 'power' | 'orbit' | 'place' } | null = null;
  private hover: { x: number; z: number } | null = null;
  private dragPower: number | null = null;
  private audio: AudioContext | null = null;
  private frame = 0;
  private disposed = false;

  constructor(private readonly host: HTMLElement, private readonly handlers: SceneHandlers) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setSize(host.clientWidth, host.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(0x16120f);
    this.scene.fog = new THREE.Fog(0x16120f, 5.5, 9);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.buildRoom();
    this.cue = this.buildCue();
    this.aimLine = this.makeLine(0xf7f3ea, 0.9);
    this.cuePath = this.makeLine(0xf8f5ee, 0.8);
    this.objectPath = this.makeLine(0xf0c400, 0.75);
    this.contactGhost = this.ghostMesh(0.34);
    this.placeGhost = this.ghostMesh(0.55);
    this.placeGhost.visible = false;
    this.contactGhost.visible = false;
    for (let id = 0; id < 16; id += 1) this.balls.push(this.buildBall(id));
    this.bindInput();
    this.frame = requestAnimationFrame(this.loop);
  }

  sync(game: GameState, controls: SceneControls) {
    this.game = game;
    const key = `${controls.power.toFixed(3)}|${controls.spinX.toFixed(3)}|${controls.spinY.toFixed(3)}|${controls.elevation.toFixed(3)}|${game.phase}|${game.ballInHand}|${this.ballKey(game.balls)}`;
    this.controls = controls;
    this.applyCue(controls.cueId);
    if (key !== this.inputKey) {
      this.inputKey = key;
      this.dirty = true;
    }
    if (!this.playing) this.applyBalls(game.balls);
  }

  nudgeAim(delta: number) {
    this.aim += delta;
    this.dirty = true;
  }

  resetAim() {
    this.aim = 0;
    this.dirty = true;
  }

  getAim() {
    return this.aim;
  }

  play(simulation: Simulation, power: number, onDone: () => void) {
    this.playing = true;
    this.playStarted = performance.now();
    this.playPower = power;
    this.samples = simulation.samples;
    this.playDone = onDone;
    this.dragPower = null;
    this.cuePath.visible = false;
    this.objectPath.visible = false;
    this.contactGhost.visible = false;
    this.aimLine.visible = false;
    this.hit(power);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.renderer.domElement.remove();
    this.renderer.dispose();
    this.audio = null;
  }

  private loop = () => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.loop);
    if (this.playing) this.advancePlayback();
    else {
      if (this.dirty) {
        this.dirty = false;
        this.refreshPreview();
      }
      this.updateCue();
      this.updateAimLine();
      this.updatePlaceGhost();
    }
    this.updateCamera();
    this.renderer.render(this.scene, this.camera);
  };

  private advancePlayback() {
    const elapsed = performance.now() - this.playStarted;
    if (elapsed < 110) {
      const t = elapsed / 110;
      this.dragPower = this.playPower * (1 - t * t);
      this.cue.visible = true;
      this.updateCue();
      return;
    }
    const simTime = (elapsed - 110) / 1000;
    const frame = this.frameAt(simTime);
    if (!frame) {
      this.playing = false;
      this.dirty = true;
      this.dragPower = null;
      this.cue.visible = false;
      const done = this.playDone;
      this.playDone = null;
      done?.();
      return;
    }
    this.cue.visible = false;
    this.applyBalls(frame.balls);
  }

  private frameAt(time: number) {
    const samples = this.samples;
    if (!samples.length) return null;
    if (time >= samples[samples.length - 1].t) return null;
    let index = 1;
    while (index < samples.length && samples[index].t < time) index += 1;
    const next = samples[index];
    const prev = samples[index - 1];
    const span = Math.max(0.0001, next.t - prev.t);
    const mix = Math.min(1, Math.max(0, (time - prev.t) / span));
    return {
      balls: next.balls.map(ball => {
        const from = prev.balls.find(item => item.id === ball.id) || ball;
        return {
          ...ball,
          x: from.x + (ball.x - from.x) * mix,
          z: from.z + (ball.z - from.z) * mix
        };
      })
    };
  }

  private refreshPreview() {
    const game = this.game;
    const cue = game?.balls.find(ball => ball.id === 0);
    if (!game || game.phase !== 'aim' || !cue || cue.pocketed) {
      this.cuePath.visible = false;
      this.objectPath.visible = false;
      this.contactGhost.visible = false;
      return;
    }
    const active = game.balls.filter(ball => !ball.pocketed);
    const result = simulateShot(active, {
      shot: {
        angle: this.aim,
        speed: powerToSpeed(this.displayPower()),
        offsetX: this.controls.spinX,
        offsetY: this.controls.spinY,
        elevation: this.controls.elevation
      },
      maxTime: 1.35,
      dt: 1 / 200,
      sampleDt: 1 / 30
    });
    this.setPath(this.cuePath, result.samples, 0);
    this.setPath(this.objectPath, result.samples, result.firstContact);
    if (result.contact) {
      this.contactGhost.visible = true;
      this.contactGhost.position.set(result.contact.x, R, result.contact.z);
    } else this.contactGhost.visible = false;
    this.handlers.onReadout({ cutAngle: result.cutAngle, separation: result.separation });
  }

  private displayPower() {
    return this.dragPower ?? this.controls.power;
  }

  private cueBall() {
    return this.game?.balls.find(ball => ball.id === 0) || null;
  }

  private updateCue() {
    const cue = this.cueBall();
    const show = !!cue && !cue.pocketed && this.game?.phase === 'aim' && (!this.playing || this.cue.visible);
    if (!show || !cue) {
      if (!this.playing) this.cue.visible = false;
      return;
    }
    const dx = Math.cos(this.aim);
    const dz = Math.sin(this.aim);
    const pull = this.displayPower() * 0.22;
    const gap = R + 0.035 + pull;
    const half = 0.34;
    const dir = new THREE.Vector3(dx, -0.16, dz).normalize();
    this.cue.visible = true;
    this.cue.position.set(cue.x - dir.x * (gap + half), R + 0.02 - dir.y * (gap + half), cue.z - dir.z * (gap + half));
    this.cue.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  }

  private updateAimLine() {
    const cue = this.cueBall();
    if (!cue || cue.pocketed || this.playing || this.game?.phase !== 'aim') {
      this.aimLine.visible = false;
      return;
    }
    const positions = this.aimLine.geometry.getAttribute('position') as THREE.BufferAttribute;
    const array = positions.array as Float32Array;
    array[0] = cue.x;
    array[1] = R;
    array[2] = cue.z;
    array[3] = cue.x + Math.cos(this.aim) * 0.42;
    array[4] = R;
    array[5] = cue.z + Math.sin(this.aim) * 0.42;
    positions.needsUpdate = true;
    this.aimLine.geometry.setDrawRange(0, 2);
    this.aimLine.visible = true;
  }

  private updatePlaceGhost() {
    const game = this.game;
    if (!game || !game.ballInHand || !this.hover || this.playing || game.phase !== 'aim') {
      this.placeGhost.visible = false;
      return;
    }
    const allowed = canPlace(game, this.hover.x, this.hover.z);
    this.placeGhost.visible = true;
    this.placeGhost.position.set(this.hover.x, R, this.hover.z);
    (this.placeGhost.material as THREE.MeshStandardMaterial).color.set(allowed ? 0xf7f4ee : 0xd4554a);
  }

  private updateCamera() {
    const cue = this.cueBall();
    if (this.controls.mode === 'follow' && cue && !cue.pocketed) {
      const dx = Math.cos(this.aim);
      const dz = Math.sin(this.aim);
      this.camera.position.set(cue.x - dx * 0.82, 0.46, cue.z - dz * 0.82);
      this.camera.lookAt(cue.x + dx * 0.85, 0.02, cue.z + dz * 0.85);
      return;
    }
    const pitch = this.controls.mode === 'top' ? 1.28 : this.pitch;
    const distance = (this.controls.mode === 'top' ? 2.2 : this.distance) * (this.camera.aspect < 1 ? 1.28 : 1);
    const horizontal = Math.cos(pitch) * distance;
    this.camera.position.set(Math.sin(this.yaw) * horizontal, Math.sin(pitch) * distance + 0.05, Math.cos(this.yaw) * horizontal);
    this.camera.lookAt(0, 0, 0);
  }

  private applyBalls(balls: Array<{ id: number; x: number; z: number; pocketed: boolean; qx?: number; qy?: number; qz?: number; qw?: number }>) {
    for (const ball of balls) {
      const mesh = this.balls[ball.id];
      if (!mesh) continue;
      if (ball.pocketed) {
        const drop = Math.min(1, Number(mesh.userData.drop || 0) + 0.12);
        mesh.userData.drop = drop;
        mesh.position.set(ball.x, R - drop * 0.22, ball.z);
        mesh.visible = drop < 1;
      } else {
        mesh.userData.drop = 0;
        mesh.visible = true;
        mesh.position.set(ball.x, R, ball.z);
      }
      if (ball.qw != null) mesh.quaternion.set(ball.qx || 0, ball.qy || 0, ball.qz || 0, ball.qw);
      const shadow = this.shadows[ball.id];
      if (shadow) {
        shadow.visible = mesh.visible && !ball.pocketed;
        shadow.position.set(ball.x, 0.004, ball.z);
      }
    }
  }

  private ballKey(balls: Ball[]) {
    return balls.map(ball => `${ball.id}:${ball.pocketed ? 1 : 0}:${ball.x.toFixed(3)}:${ball.z.toFixed(3)}`).join('|');
  }

  private clothPoint(event: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const point = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.plane, point)) return null;
    return { x: point.x, z: point.z };
  }

  private bindInput() {
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointerleave', this.onPointerUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', event => event.preventDefault());
    const observer = new ResizeObserver(() => this.resize());
    observer.observe(this.host);
    this.resize();
  }

  private resize() {
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  private onPointerDown = (event: PointerEvent) => {
    if (this.playing || !this.game || this.game.phase !== 'aim') return;
    this.renderer.domElement.setPointerCapture(event.pointerId);
    const point = this.clothPoint(event);
    this.hover = point;
    if (event.button === 2 || event.altKey) {
      this.pointer = { x: event.clientX, y: event.clientY, mode: 'orbit' };
      return;
    }
    this.pointer = { x: event.clientX, y: event.clientY, mode: this.game.ballInHand ? 'place' : 'aim' };
  };

  private forwardOf(point: { x: number; z: number }) {
    const cue = this.cueBall();
    if (!cue) return 0;
    return (point.x - cue.x) * Math.cos(this.aim) + (point.z - cue.z) * Math.sin(this.aim);
  }

  private pullPower(point: { x: number; z: number }) {
    const forward = this.forwardOf(point);
    if (forward > -0.06) return null;
    return Math.min(1, Math.max(0.05, (-forward - 0.04) / 0.72));
  }

  private onPointerMove = (event: PointerEvent) => {
    const point = this.clothPoint(event);
    if (!point || this.playing || this.game?.phase !== 'aim') return;
    this.hover = point;
    if (!this.pointer || this.pointer.mode === 'place') return;
    if (this.pointer.mode === 'orbit') {
      if (this.controls.mode !== 'follow') {
        this.yaw -= (event.clientX - this.pointer.x) * 0.005;
        this.pitch = Math.max(0.32, Math.min(1.2, this.pitch - (event.clientY - this.pointer.y) * 0.004));
      }
      this.pointer.x = event.clientX;
      this.pointer.y = event.clientY;
      return;
    }
    if (this.controls.aimMode === 'fine') {
      this.aim -= (event.clientX - this.pointer.x) * 0.0032;
      this.pointer.x = event.clientX;
      const pull = event.clientY - this.pointer.y;
      if (pull > 12) {
        this.pointer.mode = 'power';
        this.dragPower = Math.min(1, pull / 210);
        this.handlers.onPower(this.dragPower);
      }
      this.dirty = true;
      return;
    }
    const power = this.pullPower(point);
    if (power != null) {
      this.pointer.mode = 'power';
      this.dragPower = power;
      this.handlers.onPower(power);
      this.dirty = true;
      return;
    }
    if (this.pointer.mode !== 'power' && this.controls.aimMode === 'drag') this.aimAt(point);
  };

  private onPointerUp = (event: PointerEvent) => {
    const pointer = this.pointer;
    const hover = this.hover;
    this.pointer = null;
    if (!pointer || this.playing || this.game?.phase !== 'aim') return;
    if (pointer.mode === 'power' && (this.dragPower || 0) > 0.05) {
      const power = this.dragPower || this.controls.power;
      this.dragPower = null;
      this.handlers.onShoot(power);
      return;
    }
    this.dragPower = null;
    if (pointer.mode === 'place' && hover && this.game && canPlace(this.game, hover.x, hover.z)) {
      this.handlers.onPlace(hover.x, hover.z);
      return;
    }
    if (pointer.mode === 'aim' && this.controls.aimMode === 'point' && hover) this.aimAt(hover);
    if (event.type === 'pointerleave') this.hover = null;
  };

  private onWheel = (event: WheelEvent) => {
    event.preventDefault();
    this.distance = Math.max(1.55, Math.min(4.4, this.distance * (1 + event.deltaY * 0.001)));
  };

  private aimAt(point: { x: number; z: number }) {
    const cue = this.cueBall();
    if (!cue || cue.pocketed) return;
    const dx = point.x - cue.x;
    const dz = point.z - cue.z;
    if (Math.hypot(dx, dz) < 0.03) return;
    this.aim = Math.atan2(dz, dx);
    this.dirty = true;
  }

  private buildRoom() {
    const hemi = new THREE.HemisphereLight(0xfff4e6, 0x163028, 0.48);
    this.scene.add(hemi);
    const key = new THREE.SpotLight(0xfff1dd, 34, 8, 0.72, 0.55, 1);
    key.position.set(0.15, 2.55, 0.2);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.4;
    key.shadow.camera.far = 6;
    key.shadow.bias = -0.0004;
    this.scene.add(key, key.target);
    const fill = new THREE.DirectionalLight(0xd7e4ff, 0.55);
    fill.position.set(-1.4, 1.6, -1.1);
    this.scene.add(fill);
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(6.5, 48),
      new THREE.MeshStandardMaterial({ color: 0x221910, roughness: 1 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.24;
    floor.receiveShadow = true;
    this.scene.add(floor);
    const felt = new THREE.Mesh(
      new THREE.PlaneGeometry(2.54, 1.27),
      new THREE.MeshStandardMaterial({ map: this.feltTexture(), roughness: 0.96, metalness: 0 })
    );
    felt.rotation.x = -Math.PI / 2;
    felt.receiveShadow = true;
    this.scene.add(felt);
    const cabinet = new THREE.Mesh(
      new THREE.BoxGeometry(2.86, 0.16, 1.6),
      new THREE.MeshStandardMaterial({ color: 0x4a2c18, roughness: 0.62 })
    );
    cabinet.position.y = -0.1;
    cabinet.receiveShadow = true;
    cabinet.castShadow = true;
    this.scene.add(cabinet);
    this.buildRails();
  }

  private buildRails() {
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b3e22, roughness: 0.55 });
    const cushion = new THREE.MeshStandardMaterial({ color: 0x0c5a30, roughness: 0.78 });
    const hl = 1.27;
    const hw = 0.635;
    const side = 0.075;
    const corner = 0.12;
    const length = hl - corner - side;
    const center = (hl - corner + side) / 2;
    const add = (x: number, z: number, span: number, yaw: number, kind: 'wood' | 'cushion') => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(span, kind === 'wood' ? 0.058 : 0.034, kind === 'wood' ? 0.075 : 0.03),
        kind === 'wood' ? wood : cushion
      );
      mesh.position.set(x, kind === 'wood' ? 0.034 : 0.02, z);
      mesh.rotation.y = yaw;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    };
    for (const sideSign of [1, -1]) {
      for (const end of [1, -1]) {
        add(end * center, sideSign * (hw + 0.02), length, 0, 'cushion');
        add(end * center, sideSign * (hw + 0.062), length, 0, 'wood');
      }
      const short = hw * 2 - corner * 2;
      add(sideSign * (hl + 0.02), 0, short, Math.PI / 2, 'cushion');
      add(sideSign * (hl + 0.062), 0, short, Math.PI / 2, 'wood');
    }
    const pocket = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1 });
    const pocketGeo = new THREE.CylinderGeometry(0.072, 0.05, 0.06, 24);
    for (const [x, z] of [[1.31, 0.67], [1.31, -0.67], [-1.31, 0.67], [-1.31, -0.67], [0, 0.72], [0, -0.72]] as const) {
      const mesh = new THREE.Mesh(pocketGeo, pocket);
      mesh.position.set(x, -0.01, z);
      this.scene.add(mesh);
    }
    const diamond = new THREE.MeshStandardMaterial({ color: 0xf3efe6, roughness: 0.4 });
    const diamondGeo = new THREE.BoxGeometry(0.018, 0.008, 0.028);
    for (const x of [-0.84, -0.42, 0.42, 0.84]) {
      for (const z of [hw + 0.062, -(hw + 0.062)]) {
        const mesh = new THREE.Mesh(diamondGeo, diamond);
        mesh.position.set(x, 0.066, z);
        this.scene.add(mesh);
      }
    }
  }

  private feltTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const context = canvas.getContext('2d');
    if (!context) return new THREE.CanvasTexture(canvas);
    context.fillStyle = '#0b6234';
    context.fillRect(0, 0, 1024, 512);
    const pixels = context.getImageData(0, 0, 1024, 512);
    for (let i = 0; i < pixels.data.length; i += 16) {
      const noise = (Math.random() - 0.5) * 22;
      pixels.data[i] = Math.max(0, pixels.data[i] + noise);
      pixels.data[i + 1] = Math.max(0, pixels.data[i + 1] + noise);
      pixels.data[i + 2] = Math.max(0, pixels.data[i + 2] + noise * 0.4);
    }
    context.putImageData(pixels, 0, 0);
    const xOf = (x: number) => ((x + 1.27) / 2.54) * 1024;
    const zOf = (z: number) => ((0.635 - z) / 1.27) * 512;
    context.strokeStyle = 'rgba(255,255,255,0.34)';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(xOf(-0.635), zOf(-0.62));
    context.lineTo(xOf(-0.635), zOf(0.62));
    context.stroke();
    context.fillStyle = 'rgba(255,255,255,0.5)';
    context.beginPath();
    context.arc(xOf(0.635), zOf(0), 6, 0, Math.PI * 2);
    context.fill();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    return texture;
  }

  private buildBall(id: number) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(R, 40, 28),
      new THREE.MeshPhysicalMaterial({
        map: this.ballTexture(id),
        roughness: 0.16,
        metalness: 0.02,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        envMapIntensity: 0.9
      })
    );
    mesh.castShadow = true;
    mesh.position.y = R;
    this.scene.add(mesh);
    return mesh;
  }

  private ballTexture(id: number) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    if (!context) return texture;
    const color = BALL_COLORS[id === 0 ? 0 : ((id - 1) % 8) + 1];
    context.fillStyle = color;
    context.fillRect(0, 0, 256, 256);
    if (id >= 9) {
      context.fillStyle = '#f6f6f6';
      context.fillRect(0, 92, 256, 72);
    }
    if (id > 0) {
      for (const center of [64, 192]) {
        context.fillStyle = '#f7f7f7';
        context.beginPath();
        context.arc(center, 128, 34, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#1a1a1a';
        context.font = '700 36px sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(String(id), center, 130);
      }
    }
    return texture;
  }

  private applyCue(id: string) {
    const style = cueStyle(id);
    this.shaftMaterial?.color.set(style.shaft);
    this.tipMaterial?.color.set(style.tip);
    this.buttMaterial?.color.set(style.butt);
  }

  private buildCue() {
    const style = cueStyle(this.controls.cueId);
    this.shaftMaterial = new THREE.MeshStandardMaterial({ color: style.shaft, roughness: 0.42, metalness: 0.04 });
    this.tipMaterial = new THREE.MeshStandardMaterial({ color: style.tip, roughness: 0.45 });
    this.buttMaterial = new THREE.MeshStandardMaterial({ color: style.butt, roughness: 0.5 });
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.011, 0.68, 18), this.shaftMaterial);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.0054, 0.006, 0.03, 12), this.tipMaterial);
    tip.position.y = 0.35;
    const butt = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.013, 0.09, 16), this.buttMaterial);
    butt.position.y = -0.3;
    mesh.add(tip, butt);
    mesh.castShadow = true;
    this.scene.add(mesh);
    const shadowGeo = new THREE.CircleGeometry(R * 0.86, 18);
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x042014, transparent: true, opacity: 0.32, depthWrite: false });
    for (let id = 0; id < 16; id += 1) {
      const shadow = new THREE.Mesh(shadowGeo, shadowMat);
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.004;
      shadow.renderOrder = 1;
      this.scene.add(shadow);
      this.shadows.push(shadow);
    }
    return mesh;
  }

  private ghostMesh(opacity: number) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(R, 24, 16),
      new THREE.MeshStandardMaterial({ color: 0xf7f4ee, transparent: true, opacity, roughness: 0.3, depthWrite: false })
    );
    mesh.renderOrder = 2;
    this.scene.add(mesh);
    return mesh;
  }

  private makeLine(color: number, opacity: number) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(720), 3));
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
    line.frustumCulled = false;
    line.visible = false;
    line.renderOrder = 3;
    this.scene.add(line);
    return line;
  }

  private setPath(line: THREE.Line, samples: Simulation['samples'], id: number | null) {
    if (id == null) {
      line.visible = false;
      return;
    }
    const positions = line.geometry.getAttribute('position') as THREE.BufferAttribute;
    const array = positions.array as Float32Array;
    let count = 0;
    for (const sample of samples) {
      const ball = sample.balls.find(item => item.id === id);
      if (!ball || ball.pocketed || count >= 240) continue;
      array[count * 3] = ball.x;
      array[count * 3 + 1] = R + 0.002;
      array[count * 3 + 2] = ball.z;
      count += 1;
    }
    positions.needsUpdate = true;
    line.geometry.setDrawRange(0, count);
    line.visible = count > 1;
  }

  private hit(power: number) {
    const Context = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    this.audio ||= new Context();
    const context = this.audio;
    void context.resume();
    const time = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(120 + power * 90, time);
    oscillator.frequency.exponentialRampToValueAtTime(55, time + 0.09);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(Math.min(0.16, 0.03 + power * 0.12), time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.12);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(time);
    oscillator.stop(time + 0.13);
  }
}
