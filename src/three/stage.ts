import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { buildWarrior, type WarriorHandles } from './warrior';

export interface Shot { pos: [number, number, number]; look: [number, number, number]; fov: number; turn: number; gate: number; ember: number }
export interface StageOptions { mode: 'landing' | 'chamber'; small: boolean; tier: number; accent: string; relic: string; onSlow?: () => void; onReady?: () => void }

/** Camera beats for the landing's chapters, 0 → 1 over the page. */
export const SHOTS: Shot[] = [
  { pos: [-2.5, 1.0, 8.2], look: [-2.5, 2.45, 0], fov: 42, turn: -0.22, gate: 0.25, ember: 1 },
  { pos: [-4.4, 2.1, 11.5], look: [-3.0, 3.0, -2], fov: 38, turn: -0.3, gate: 0.2, ember: 0.7 },
  { pos: [2.2, 2.5, 6.6], look: [1.9, 2.2, 0], fov: 34, turn: 0.3, gate: 0.3, ember: 1 },
  { pos: [-3.6, 2.0, 6.0], look: [-1.9, 2.0, 0], fov: 36, turn: -0.5, gate: 0.4, ember: 1 },
  { pos: [3.4, 0.55, 9.8], look: [2.7, 5.2, -6], fov: 44, turn: 0.28, gate: 1.0, ember: 1.5 },
  { pos: [3.1, 0.9, 4.6], look: [1.25, 1.35, 0], fov: 36, turn: -0.28, gate: 0.5, ember: 1 },
  { pos: [0, 1.3, 13], look: [0, 3.6, -3], fov: 40, turn: 0, gate: 1.4, ember: 1.8 },
];

const smooth = (t: number) => t * t * (3 - 2 * t);

function noiseCanvas(size: number, paint: (ctx: CanvasRenderingContext2D, s: number) => void) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  paint(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function softPuff() {
  return noiseCanvas(256, (ctx, s) => {
    for (let i = 0; i < 26; i++) {
      const x = s / 2 + (Math.random() - 0.5) * s * 0.5, y = s / 2 + (Math.random() - 0.5) * s * 0.4, r = s * (0.12 + Math.random() * 0.2);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,.16)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    }
  });
}

function skyTexture(accent: string) {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 512;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#030405'); g.addColorStop(0.42, '#0a0c0f'); g.addColorStop(0.5, '#1a1110'); g.addColorStop(0.53, accent); g.addColorStop(0.545, '#2a1208'); g.addColorStop(0.6, '#050607'); g.addColorStop(1, '#020203');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 16, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function wordmark() {
  const c = document.createElement('canvas');
  c.width = 2048; c.height = 512;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#c8ced6';
  ctx.font = '900 400px "Big Shoulders Display Variable", Impact, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '10px';
  ctx.fillText('IRON QUEST', 1024, 276, 2000);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function groundMaps() {
  const s = 512;
  const c = document.createElement('canvas'); c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#0a0b0d'; ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 2600; i++) { const v = 8 + Math.random() * 26; ctx.fillStyle = `rgba(${v},${v},${v + 2},.5)`; const r = Math.random() * 3; ctx.fillRect(Math.random() * s, Math.random() * s, r, r); }
  ctx.strokeStyle = 'rgba(70,78,88,.35)'; ctx.lineWidth = 1;
  for (let i = 0; i <= 8; i++) { ctx.beginPath(); ctx.moveTo(i * s / 8, 0); ctx.lineTo(i * s / 8, s); ctx.moveTo(0, i * s / 8); ctx.lineTo(s, i * s / 8); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(0,0,0,.9)'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 14; i++) { ctx.beginPath(); let x = Math.random() * s, y = Math.random() * s; ctx.moveTo(x, y); for (let k = 0; k < 7; k++) { x += (Math.random() - 0.5) * 70; y += (Math.random() - 0.5) * 70; ctx.lineTo(x, y); } ctx.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 10); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function makeEnv(renderer: THREE.WebGLRenderer, accent: THREE.Color) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#050608');
  const panel = (c: THREE.ColorRepresentation, i: number, w: number, h: number, p: [number, number, number]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(i), side: THREE.DoubleSide }));
    m.position.set(...p); m.lookAt(0, 0, 0); scene.add(m);
  };
  panel(accent, 6, 8, 14, [-9, 3, -6]);
  panel(accent, 2.2, 14, 3, [0, -4, -9]);
  panel('#7fb8e6', 2.4, 3, 12, [9, 4, -5]);
  panel('#cfd6de', 1.4, 10, 3, [0, 10, 3]);
  panel('#2b3036', 1, 6, 8, [0, 2, 12]);
  const gen = new THREE.PMREMGenerator(renderer);
  const rt = gen.fromScene(scene, 0.03);
  gen.dispose();
  return rt.texture;
}

export class Stage {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  private composer?: EffectComposer;
  private warrior!: WarriorHandles;
  private rig = new THREE.Group();
  private lastT = 0; private elapsed = 0;
  private raf = 0;
  private running = false;
  private visible = true;
  private scroll = 0;
  private pointer = new THREE.Vector2();
  private pointerSmooth = new THREE.Vector2();
  private cur: Shot = { ...SHOTS[0], pos: [...SHOTS[0].pos], look: [...SHOTS[0].look] };
  private lookTarget = new THREE.Vector3(...SHOTS[0].look);
  private gateMat!: THREE.MeshBasicMaterial;
  private rayMat?: THREE.MeshBasicMaterial;
  private fog: { s: THREE.Sprite; v: number; base: number }[] = [];
  private embers?: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private pylons: THREE.MeshBasicMaterial[] = [];
  private accent: THREE.Color;
  private opts: StageOptions;
  private frames = 0; private fpsAt = 0; private slowStrikes = 0; private dpr = 1;
  private disposed = false;
  private io?: IntersectionObserver;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement, opts: StageOptions) {
    this.canvas = canvas; this.opts = opts;
    this.accent = new THREE.Color(opts.accent);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !opts.small, powerPreference: 'high-performance', alpha: opts.mode === 'chamber' });
    this.dpr = Math.min(window.devicePixelRatio || 1, opts.small ? 1.25 : 1.5);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene.environment = makeEnv(this.renderer, this.accent);
    this.scene.environmentIntensity = 0.75;
    this.scene.fog = new THREE.FogExp2(opts.mode === 'chamber' ? 0x050607 : 0x08090a, opts.mode === 'chamber' ? 0.05 : 0.03);
    if (opts.mode === 'landing') this.buildWorld(); else this.buildChamber();
    this.buildLights();
    this.buildEmbers();
    this.buildFog();
    this.scene.add(this.rig);
    this.setLook(opts.tier, opts.accent, opts.relic);
    if (!opts.small) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(512, 512), opts.mode === 'chamber' ? 0.28 : 0.34, 0.6, 1.0));
      this.composer.addPass(new OutputPass());
    }
    if (opts.mode === 'chamber') { this.cur = { pos: [0, 2.0, 7.4], look: [0, 1.75, 0], fov: 34, turn: 0, gate: 0, ember: 1 }; this.lookTarget.set(0, 1.75, 0); }
    this.applyCamera(1);
    this.resize();
    this.io = new IntersectionObserver((e) => { this.visible = e[0].isIntersecting; this.sync(); });
    this.io.observe(canvas);
    document.addEventListener('visibilitychange', this.sync);
    canvas.addEventListener('webglcontextlost', this.onLost);
    this.sync();
    this.opts.onReady?.();
  }

  private onLost = (e: Event) => { e.preventDefault(); this.opts.onSlow?.(); };

  private buildLights() {
    const a = new THREE.SpotLight(this.accent, this.opts.mode === 'chamber' ? 150 : 620, 40, 0.75, 0.6, 1.4); a.position.set(-5, 7, -6); a.target.position.set(0, 1.8, 0);
    const b = new THREE.SpotLight('#9cc8ee', this.opts.mode === 'chamber' ? 90 : 300, 40, 0.8, 0.7, 1.4); b.position.set(6, 6, -4); b.target.position.set(0, 2, 0);
    const c = new THREE.DirectionalLight('#c9d1da', 0.55); c.position.set(1.5, 3, 7);
    const d = new THREE.PointLight(this.accent, 2.5, 7, 1.8); d.position.set(0, 0.5, 2.2);
    this.scene.add(a, a.target, b, b.target, c, d, new THREE.AmbientLight('#20262c', 0.45));
  }

  private buildWorld() {
    const sky = new THREE.Mesh(new THREE.SphereGeometry(120, 24, 16), new THREE.MeshBasicMaterial({ map: skyTexture('#4a1c0a'), side: THREE.BackSide, fog: false }));
    this.scene.add(sky);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(90, 48), new THREE.MeshStandardMaterial({ map: groundMaps(), metalness: 0.75, roughness: 0.55 }));
    ground.rotation.x = -Math.PI / 2; this.scene.add(ground);

    // A giant wordmark standing in the world, so the warrior and fog really pass in front of it.
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(28, 7), new THREE.MeshBasicMaterial({ map: wordmark(), transparent: true, opacity: 0.11, fog: false, depthWrite: false }));
    mark.position.set(0, 6.2, -10); this.scene.add(mark);
    if (document.fonts) void document.fonts.load('900 400px "Big Shoulders Display Variable"').then(() => { const m = mark.material as THREE.MeshBasicMaterial; m.map?.dispose(); m.map = wordmark(); m.needsUpdate = true; });

    // The Forge Gate: a broken ring that kindles as the story progresses.
    this.gateMat = new THREE.MeshBasicMaterial({ color: this.accent.clone().multiplyScalar(2), fog: false });
    const frame = new THREE.MeshStandardMaterial({ color: '#15181c', metalness: 0.9, roughness: 0.5 });
    const gate = new THREE.Group();
    for (let i = 0; i < 18; i++) {
      if (i === 4 || i === 13) continue;
      const a0 = (i / 18) * Math.PI * 2;
      const seg = new THREE.Mesh(new THREE.TorusGeometry(13, 0.9, 6, 4, (Math.PI * 2) / 18 - 0.03), frame);
      seg.rotation.z = a0; gate.add(seg);
      const glow = new THREE.Mesh(new THREE.TorusGeometry(12, 0.07, 4, 6, (Math.PI * 2) / 18 - 0.06), this.gateMat);
      glow.rotation.z = a0; gate.add(glow);
    }
    gate.position.set(0, 7, -24); gate.rotation.z = 0.12; this.scene.add(gate);

    // Ruined megastructure silhouettes, deliberately low-poly: fog does the work.
    const stone = new THREE.MeshStandardMaterial({ color: '#0e1013', metalness: 0.4, roughness: 0.9 });
    const count = this.opts.small ? 24 : 46;
    const seedRand = (() => { let s = 1337; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
    for (let i = 0; i < count; i++) {
      const side = i % 2 ? 1 : -1;
      const x = side * (8 + seedRand() * 34), z = -8 - seedRand() * 46, h = 4 + seedRand() * 26, w = 1.4 + seedRand() * 4;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * (0.6 + seedRand())), stone);
      m.position.set(x, h / 2 - 0.5, z); m.rotation.y = seedRand() * 0.8; m.rotation.z = (seedRand() - 0.5) * 0.12; this.scene.add(m);
    }
    // Light shaft behind the warrior.
    this.rayMat = new THREE.MeshBasicMaterial({ map: noiseCanvas(128, (ctx, s) => { const g = ctx.createLinearGradient(0, 0, s, 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, s, s); const v = ctx.createLinearGradient(0, 0, 0, s); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.5, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,1)'); ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = v; ctx.fillRect(0, 0, s, s); }), color: this.accent, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const ray = new THREE.Mesh(new THREE.PlaneGeometry(9, 20), this.rayMat);
    ray.position.set(0, 8, -2.4); this.scene.add(ray);
  }

  private buildChamber() {
    this.gateMat = new THREE.MeshBasicMaterial({ color: this.accent });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(24, 40), new THREE.MeshStandardMaterial({ map: groundMaps(), metalness: 0.55, roughness: 0.62 }));
    floor.rotation.x = -Math.PI / 2; this.scene.add(floor);
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 0.16, 8), new THREE.MeshStandardMaterial({ color: '#1a1e23', metalness: 0.9, roughness: 0.35 }));
    plinth.position.y = 0.08; this.scene.add(plinth);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.52, 1.56, 8), this.gateMat);
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.17; this.scene.add(ring);
    const stone = new THREE.MeshStandardMaterial({ color: '#111418', metalness: 0.7, roughness: 0.6 });
    // Pylons that light up one by one with armor tier: the room evolves with you.
    for (let i = 0; i < 6; i++) {
      const a = Math.PI * 0.58 + (i / 5) * Math.PI * 0.84; // An arc behind the plinth, never between camera and character.
      const x = Math.sin(a) * 6.5, z = Math.cos(a) * 6.5;
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.7, 8, 0.7), stone); p.position.set(x, 4, z); this.scene.add(p);
      const mat = new THREE.MeshBasicMaterial({ color: 0x14181c });
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 7, 0.08), mat); strip.position.set(x * 0.94, 3.8, z * 0.94); this.scene.add(strip);
      this.pylons.push(mat);
    }
  }

  private buildFog() {
    const tex = softPuff();
    const n = this.opts.small ? 7 : 14;
    for (let i = 0; i < n; i++) {
      const mat = new THREE.SpriteMaterial({ map: tex, color: i % 3 === 0 ? this.accent.clone().multiplyScalar(0.55) : new THREE.Color('#3b4149'), transparent: true, opacity: 0.1 + Math.random() * 0.14, depthWrite: false, rotation: Math.random() * 6 });
      const s = new THREE.Sprite(mat);
      const size = 7 + Math.random() * 9;
      s.scale.set(size * 1.7, size * 0.42, 1);
      const base = 0.2 + Math.random() * 1.1;
      s.position.set((Math.random() - 0.5) * 22, base, -7 + Math.random() * 9);
      this.scene.add(s);
      this.fog.push({ s, v: (Math.random() - 0.5) * 0.16, base });
    }
  }

  private buildEmbers() {
    const n = this.opts.small ? 90 : 320;
    const pos = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 16; pos[i * 3 + 1] = Math.random() * 10; pos[i * 3 + 2] = (Math.random() - 0.5) * 12; seed[i] = Math.random(); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { t: { value: 0 }, c: { value: this.accent }, k: { value: 1 }, px: { value: this.renderer.getPixelRatio() } },
      vertexShader: `attribute float seed; uniform float t; uniform float px; varying float a;
        void main(){ vec3 p=position; float s=seed*6.28; float life=fract(seed+t*(.03+seed*.05)); p.y=life*11.; p.x+=sin(t*.4+s)*.7+life*1.2; p.z+=cos(t*.3+s)*.5;
        a=smoothstep(0.,.1,life)*(1.-life); vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv; gl_PointSize=(1.+seed*2.6)*px*(14./-mv.z); }`,
      fragmentShader: `uniform vec3 c; uniform float k; varying float a; void main(){ float d=length(gl_PointCoord-.5); if(d>.5)discard; float f=pow(1.-d*2.,1.6); gl_FragColor=vec4(mix(c,vec3(1.,.85,.6),.45)*f*2.2,f*a*k); }`,
    });
    this.embers = new THREE.Points(g, mat);
    this.embers.frustumCulled = false;
    this.scene.add(this.embers);
  }

  setLook(tier: number, accent: string, relic: string) {
    if (this.warrior) { this.rig.remove(this.warrior.group); this.warrior.dispose(); }
    this.accent.set(accent);
    this.warrior = buildWarrior({ tier, accent, relic, mode: this.opts.mode });
    this.rig.add(this.warrior.group);
    this.gateMat.color.copy(this.accent).multiplyScalar(1.5);
    this.pylons.forEach((m, i) => m.color.copy(i <= tier ? this.accent.clone().multiplyScalar(1.8) : new THREE.Color(0x14181c)));
    this.embers?.material.uniforms.c.value.copy(this.accent);
  }

  setScroll(p: number) { this.scroll = Math.max(0, Math.min(1, p)); }
  setPointer(x: number, y: number) { this.pointer.set(x, y); }

  private shotAt(p: number): Shot {
    const f = p * (SHOTS.length - 1);
    const i = Math.min(Math.floor(f), SHOTS.length - 2);
    const a = SHOTS[i], b = SHOTS[i + 1], t = smooth(f - i);
    const l = (x: number, y: number) => x + (y - x) * t;
    return { pos: [l(a.pos[0], b.pos[0]), l(a.pos[1], b.pos[1]), l(a.pos[2], b.pos[2])], look: [l(a.look[0], b.look[0]), l(a.look[1], b.look[1]), l(a.look[2], b.look[2])], fov: l(a.fov, b.fov), turn: l(a.turn, b.turn), gate: l(a.gate, b.gate), ember: l(a.ember, b.ember) };
  }

  private applyCamera(k: number) {
    const target = this.opts.mode === 'landing' ? this.shotAt(this.scroll) : this.cur;
    for (const i of [0, 1, 2] as const) {
      this.cur.pos[i] += (target.pos[i] - this.cur.pos[i]) * k;
      this.cur.look[i] += (target.look[i] - this.cur.look[i]) * k;
    }
    this.cur.fov += (target.fov - this.cur.fov) * k;
    this.cur.turn += (target.turn - this.cur.turn) * k;
    this.cur.gate += (target.gate - this.cur.gate) * k;
    this.cur.ember += (target.ember - this.cur.ember) * k;
    const aspect = this.camera.aspect;
    // Pull back on portrait screens so the warrior still fits.
    const pull = aspect < 1 ? 1 + (1 - aspect) * 0.75 : 1;
    const center = aspect < 1 ? 0.12 : 1; // Portrait: the warrior stands centred above the copy.
    this.camera.position.set(this.cur.pos[0] * pull * center + this.pointerSmooth.x * 0.35, this.cur.pos[1] + this.pointerSmooth.y * 0.2, this.cur.pos[2] * pull);
    // Portrait also aims lower, lifting the warrior into the clear space above the copy.
    this.lookTarget.set(this.cur.look[0] * center, this.cur.look[1] - (aspect < 1 && this.opts.mode === 'landing' ? 1.9 : 0), this.cur.look[2]);
    this.camera.lookAt(this.lookTarget);
    if (Math.abs(this.camera.fov - this.cur.fov) > 0.01) { this.camera.fov = this.cur.fov; this.camera.updateProjectionMatrix(); }
    this.rig.rotation.y = this.cur.turn + (this.opts.mode === 'chamber' ? this.pointerSmooth.x * 0.5 : this.pointerSmooth.x * 0.05);
  }

  private loop = () => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now() / 1000;
    const dt = Math.min(now - this.lastT, 0.1);
    this.lastT = now;
    this.elapsed += dt;
    const t = this.elapsed;
    const k = 1 - Math.exp(-dt * 4);
    this.pointerSmooth.lerp(this.pointer, 1 - Math.exp(-dt * 3));
    this.applyCamera(k);
    this.warrior.animate(t, this.pointerSmooth.x, this.pointerSmooth.y);
    if (this.embers) { this.embers.material.uniforms.t.value = t; this.embers.material.uniforms.k.value = this.cur.ember; }
    if (this.opts.mode === 'landing') this.gateMat.color.copy(this.accent).multiplyScalar(0.4 + this.cur.gate * 2.2 + Math.sin(t * 2) * 0.05);
    if (this.rayMat) this.rayMat.opacity = 0.03 + this.cur.gate * 0.12;
    for (const f of this.fog) { f.s.position.x += f.v * dt; if (f.s.position.x > 13) f.s.position.x = -13; if (f.s.position.x < -13) f.s.position.x = 13; }
    if (this.composer) this.composer.render(dt); else this.renderer.render(this.scene, this.camera);
    this.watchPerformance(now);
  };

  /**
   * Adaptive quality: drop bloom, then resolution, then hand back to the drawn fallback.
   * Measured in real time: animation time is capped per frame, which would hide very slow devices.
   */
  private watchPerformance(now: number) {
    this.frames++;
    const span = now - this.fpsAt;
    if (span < 2) return;
    const fps = this.frames / span;
    this.frames = 0; this.fpsAt = now;
    if (fps >= 26) { this.slowStrikes = 0; return; }
    if (localStorage.getItem('iq.keep3d')) return; // Screenshot tooling on GPU-less machines.
    this.slowStrikes += fps < 10 ? 2 : 1; // Barely moving: don't make people wait through every step.
    if (this.composer) { this.composer.dispose(); this.composer = undefined; }
    if (this.slowStrikes >= 2 && this.dpr > 1) { this.dpr = 1; this.renderer.setPixelRatio(1); this.resize(); }
    if (this.slowStrikes >= 4) this.opts.onSlow?.();
  }

  private sync = () => {
    const should = this.visible && document.visibilityState === 'visible' && !this.disposed;
    if (should === this.running) return;
    this.running = should;
    if (should) { this.lastT = this.fpsAt = performance.now() / 1000; this.frames = 0; this.loop(); } else cancelAnimationFrame(this.raf);
  };

  resize() {
    const w = this.canvas.clientWidth || 1, h = this.canvas.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.disposed = true; this.running = false;
    cancelAnimationFrame(this.raf);
    this.io?.disconnect();
    document.removeEventListener('visibilitychange', this.sync);
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.scene.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : []; for (const x of mats) { (x as THREE.MeshBasicMaterial).map?.dispose(); x.dispose(); } });
    this.composer?.dispose();
    this.renderer.dispose();
  }
}
