import * as THREE from 'three';

export interface WarriorHandles { group: THREE.Group; animate: (t: number, px: number, py: number) => void; dispose: () => void }
export interface WarriorOptions { tier: number; accent: string; relic: string; mode: 'landing' | 'chamber' }

type V3 = [number, number, number];

/** A box whose top and bottom faces scale independently. BoxGeometry's unshared face vertices give crisp facets. */
function plate(w: number, h: number, d: number, o: { tx?: number; tz?: number; bx?: number; bz?: number; sz?: number; sx?: number } = {}) {
  const { tx = 1, tz = 1, bx = 1, bz = 1, sz = 0, sx = 0 } = o;
  const g = new THREE.BoxGeometry(w, h, d);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const top = p.getY(i) > 0;
    p.setX(i, p.getX(i) * (top ? tx : bx) + (top ? sx : 0));
    p.setZ(i, p.getZ(i) * (top ? tz : bz) + (top ? sz : 0));
  }
  g.computeVertexNormals();
  return g;
}

function wearTexture() {
  const s = 256;
  const c = document.createElement('canvas'); c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#8c8c8c'; ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 900; i++) { const v = 90 + Math.random() * 130; ctx.fillStyle = `rgba(${v},${v},${v},.35)`; ctx.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 16, 1); }
  for (let i = 0; i < 120; i++) { ctx.fillStyle = `rgba(230,230,230,${Math.random() * 0.4})`; const r = Math.random() * 3.5; ctx.beginPath(); ctx.arc(Math.random() * s, Math.random() * s, r, 0, 7); ctx.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function buildWarrior({ tier, accent, relic, mode }: WarriorOptions): WarriorHandles {
  const wear = wearTexture();
  const std = (color: string, metalness: number, roughness: number) => new THREE.MeshStandardMaterial({ color, metalness, roughness, roughnessMap: wear, flatShading: false });
  const M = {
    dark: std('#343b43', 0.9, 0.62),
    mid: std('#5c6570', 0.95, 0.5),
    light: std('#a5afba', 1, 0.42),
    under: std('#0c0e10', 0.5, 1),
    trim: std('#b8742f', 1, 0.5),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(accent).multiplyScalar(1.5), toneMapped: false }),
    hot: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff').lerp(new THREE.Color(accent), 0.3).multiplyScalar(1.6), toneMapped: false }),
    cape: new THREE.MeshStandardMaterial({ color: '#3a0f12', metalness: 0.1, roughness: 0.85, side: THREE.DoubleSide }),
  };
  const group = new THREE.Group();
  const add = (parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, pos: V3, rot: V3 = [0, 0, 0]) => {
    const mesh = new THREE.Mesh(g, m); mesh.position.set(...pos); mesh.rotation.set(...rot); parent.add(mesh); return mesh;
  };

  // ---------- Legs ----------
  const pelvis = new THREE.Group(); pelvis.position.y = 1.72; group.add(pelvis);
  add(pelvis, plate(0.72, 0.34, 0.42, { bx: 0.72, bz: 0.8 }), M.dark, [0, 0, 0]);
  add(pelvis, plate(0.34, 0.42, 0.06, { bx: 0.6 }), M.mid, [0, -0.17, 0.24], [-0.1, 0, 0]);
  add(pelvis, plate(0.5, 0.36, 0.05, { bx: 0.7 }), M.dark, [0, -0.16, -0.24], [0.1, 0, 0]);
  for (const s of [-1, 1]) {
    add(pelvis, plate(0.2, 0.46, 0.34, { bx: 0.8 }), M.mid, [s * 0.42, -0.2, 0.02], [0, 0, s * 0.14]);
    const leg = new THREE.Group();
    leg.position.set(s * 0.32, 1.6, s > 0 ? -0.08 : 0.14);
    leg.rotation.set(s > 0 ? 0.07 : -0.1, 0, s * 0.055);
    group.add(leg);
    add(leg, plate(0.3, 0.66, 0.34, { tx: 1.18, tz: 1.1, bx: 0.76, bz: 0.76 }), M.dark, [0, -0.33, 0]);
    add(leg, plate(0.32, 0.56, 0.1, { tx: 1.15, bx: 0.7 }), M.mid, [0, -0.3, 0.17], [-0.05, 0, 0]);
    add(leg, plate(0.1, 0.5, 0.26, { bz: 0.7 }), M.light, [s * 0.17, -0.3, 0], [0, 0, s * 0.06]);
    add(leg, new THREE.BoxGeometry(0.018, 0.4, 0.016), M.glow, [s * 0.05, -0.3, 0.228]);
    // knee
    add(leg, new THREE.CylinderGeometry(0.14, 0.14, 0.26, 8), M.under, [0, -0.68, 0], [0, 0, Math.PI / 2]);
    add(leg, plate(0.25, 0.26, 0.16, { tx: 0.8, bx: 0.8, tz: 0.6, bz: 0.6 }), M.light, [0, -0.67, 0.15]);
    add(leg, new THREE.BoxGeometry(0.06, 0.1, 0.012), M.glow, [0, -0.67, 0.235]);
    // shin
    const shin = new THREE.Group(); shin.position.y = -0.72; shin.rotation.x = s > 0 ? -0.05 : 0.12; leg.add(shin);
    add(shin, plate(0.24, 0.66, 0.3, { tx: 1.2, tz: 1.15, bx: 0.8, bz: 0.72 }), M.dark, [0, -0.34, -0.01]);
    add(shin, plate(0.25, 0.6, 0.1, { tx: 1.15, bx: 0.78, sz: 0.04 }), M.mid, [0, -0.32, 0.15]);
    add(shin, plate(0.08, 0.46, 0.18), M.light, [s * 0.14, -0.3, -0.02]);
    // boot
    add(shin, plate(0.28, 0.2, 0.52, { tx: 0.86, tz: 0.6, sz: -0.09 }), M.mid, [0, -0.72, 0.09]);
    add(shin, plate(0.27, 0.07, 0.56), M.under, [0, -0.83, 0.1]);
    add(shin, plate(0.2, 0.09, 0.14, { tx: 0.7 }), M.light, [0, -0.71, 0.32], [0.5, 0, 0]);
    if (tier >= 2) add(leg, plate(0.2, 0.18, 0.36, { bx: 0.6 }), M.light, [s * 0.14, -0.06, 0.02], [0, 0, s * 0.3]);
    if (tier >= 4) add(shin, plate(0.05, 0.34, 0.2, { tz: 0.2 }), M.light, [s * 0.14, -0.14, 0.14], [0.2, 0, s * 0.2]);
  }

  // ---------- Torso ----------
  const torso = new THREE.Group(); torso.position.y = 1.9; group.add(torso);
  add(torso, plate(0.54, 0.46, 0.34, { tx: 1.25, tz: 1.15, bx: 0.9 }), M.under, [0, 0.14, 0]);
  for (let i = 0; i < 3; i++) add(torso, plate(0.42 - i * 0.03 + 0.06, 0.13, 0.08, { tx: 1.1, bx: 0.92 }), i === 1 ? M.mid : M.dark, [0, 0.0 + (2 - i) * 0.135, 0.17], [-0.06, 0, 0]);
  const chest = new THREE.Group(); chest.position.y = 0.72; torso.add(chest);
  add(chest, plate(1.02, 0.66, 0.54, { tx: 1.18, tz: 1.04, bx: 0.66, bz: 0.72 }), M.dark, [0, 0, 0]);
  for (const s of [-1, 1]) {
    add(chest, plate(0.5, 0.42, 0.12, { bx: 0.6, sx: s * 0.03 }), M.mid, [s * 0.27, 0.07, 0.29], [-0.1, s * 0.16, s * 0.02]);
    add(chest, plate(0.36, 0.14, 0.1, { tx: 0.7 }), M.light, [s * 0.3, 0.3, 0.27], [-0.3, s * 0.2, 0]);
    add(chest, new THREE.BoxGeometry(0.28, 0.012, 0.012), M.glow, [s * 0.3, -0.1, 0.345], [0, 0, s * 0.35]);
  }
  add(chest, plate(0.14, 0.6, 0.1, { tx: 1.2, bx: 0.5 }), M.light, [0, -0.03, 0.31]);
  add(chest, plate(1.0, 0.56, 0.1, { tx: 1.1, bx: 0.7 }), M.mid, [0, 0.02, -0.3], [0.08, 0, 0]);
  // reactor
  const core = add(chest, new THREE.CylinderGeometry(0.075, 0.09, 0.05, 6), M.hot, [0, 0.02, 0.365], [Math.PI / 2, 0, 0]);
  add(chest, new THREE.TorusGeometry(0.11, 0.02, 6, 6), M.light, [0, 0.02, 0.36], [0, 0, Math.PI / 6]);
  if (tier >= 2) for (const s of [-1, 1]) add(chest, plate(0.34, 0.5, 0.07, { tx: 0.8, bx: 0.5 }), M.light, [s * 0.36, 0.0, 0.345], [-0.14, s * 0.28, s * 0.05]);
  // back pack
  add(chest, plate(0.6, 0.62, 0.22, { tx: 0.88, bx: 0.72 }), M.dark, [0, 0.02, -0.42]);
  for (const s of [-1, 1]) { add(chest, new THREE.CylinderGeometry(0.075, 0.1, 0.56, 8), M.mid, [s * 0.2, 0.02, -0.56]); add(chest, new THREE.CylinderGeometry(0.05, 0.05, 0.03, 8), M.glow, [s * 0.2, -0.27, -0.56]); }

  // ---------- Head ----------
  const neck = add(chest, new THREE.CylinderGeometry(0.11, 0.16, 0.2, 8), M.under, [0, 0.4, 0]);
  void neck;
  add(chest, plate(0.62, 0.16, 0.42, { tx: 0.62, tz: 0.72 }), M.mid, [0, 0.36, -0.02]);
  const head = new THREE.Group(); head.position.set(0, 0.6, 0.03); chest.add(head);
  add(head, plate(0.34, 0.32, 0.4, { tx: 0.82, tz: 0.84, bx: 0.62, bz: 0.72 }), M.mid, [0, 0.03, 0]);
  add(head, plate(0.38, 0.14, 0.42, { tx: 0.78, tz: 0.8, bx: 1, bz: 1 }), M.light, [0, 0.22, -0.01]);
  add(head, plate(0.05, 0.2, 0.44, { tz: 0.5 }), M.dark, [0, 0.3, -0.03]);
  add(head, plate(0.28, 0.13, 0.08, { tx: 1.1, bx: 0.42, tz: 0.8 }), M.dark, [0, -0.1, 0.19], [0.18, 0, 0]);
  add(head, new THREE.BoxGeometry(0.28, 0.035, 0.03), M.hot, [0, 0.07, 0.195]);
  for (const s of [-1, 1]) {
    add(head, plate(0.09, 0.16, 0.32), M.dark, [s * 0.16, 0.01, -0.03], [0, s * 0.05, s * 0.05]);
    add(head, new THREE.BoxGeometry(0.012, 0.09, 0.1), M.glow, [s * 0.207, 0.01, -0.03]);
    if (tier >= 1) add(head, plate(0.04, 0.22, 0.2, { tz: 0.2, sz: -0.12 }), M.light, [s * 0.19, 0.2, -0.08], [0, 0, s * 0.3]);
  }
  if (tier >= 3) add(head, plate(0.04, 0.36, 0.3, { tz: 0.15, sz: -0.2 }), M.light, [0, 0.42, -0.07]);
  if (tier >= 5) for (const r of [0.42, 0.54]) add(head, new THREE.TorusGeometry(r, 0.012, 6, 28, Math.PI * 1.1), M.glow, [0, 0.24, -0.16], [0, 0, -0.05 * Math.PI]);

  // ---------- Arms ----------
  const arms: Record<string, THREE.Group> = {};
  for (const s of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(s * 0.72, 0.24, 0); arm.rotation.set(s > 0 ? -0.04 : 0.1, 0, s * 0.2); chest.add(arm); arms[s] = arm;
    add(arm, new THREE.SphereGeometry(0.2, 8, 6), M.under, [0, 0, 0]);
    add(arm, plate(0.26, 0.56, 0.28, { tx: 1.1, tz: 1.05, bx: 0.8, bz: 0.76 }), M.dark, [0, -0.32, 0]);
    add(arm, plate(0.14, 0.4, 0.26, { bz: 0.7 }), M.mid, [s * 0.09, -0.3, 0]);
    add(arm, new THREE.BoxGeometry(0.014, 0.3, 0.014), M.glow, [s * 0.165, -0.3, 0.05]);
    // pauldron by tier
    if (tier === 0) add(arm, plate(0.42, 0.24, 0.44, { tx: 0.7, tz: 0.74 }), M.mid, [s * 0.03, 0.1, 0], [0, 0, -s * 0.14]);
    else {
      add(arm, plate(0.52, 0.3, 0.54, { tx: 0.62, tz: 0.72, bx: 0.94 }), M.mid, [s * 0.07, 0.13, 0], [0, 0, -s * 0.34]);
      add(arm, plate(0.32, 0.08, 0.38, { tx: 0.8 }), M.light, [s * 0.01, 0.3, 0], [0, 0, -s * 0.34]);
      add(arm, plate(0.5, 0.05, 0.015), M.glow, [s * 0.08, 0.01, 0.285], [0, 0, -s * 0.2]);
    }
    if (tier >= 3) { add(arm, plate(0.3, 0.16, 0.62, { tx: 0.6, tz: 0.8 }), M.dark, [s * 0.3, 0.2, 0], [0, 0, -s * 0.7]); add(arm, plate(0.05, 0.3, 0.3, { tz: 0.3 }), M.light, [s * 0.1, 0.42, 0], [0, 0, -s * 0.15]); }
    if (tier >= 4) add(arm, plate(0.12, 0.48, 0.2, { tx: 0.08, tz: 0.15, sx: s * 0.16 }), M.light, [s * 0.32, 0.72, 0], [0, 0, -s * 0.4]);
    // forearm
    const fore = new THREE.Group(); fore.position.set(0, -0.62, 0); fore.rotation.x = s > 0 ? -0.08 : -0.55; arm.add(fore);
    add(fore, new THREE.CylinderGeometry(0.12, 0.12, 0.24, 8), M.under, [0, 0, 0], [0, 0, Math.PI / 2]);
    add(fore, plate(0.25, 0.56, 0.28, { tx: 0.92, tz: 0.9, bx: 1.14, bz: 1.1 }), M.mid, [0, -0.3, 0]);
    add(fore, plate(0.3, 0.38, 0.14, { bx: 1.1 }), M.light, [s * 0.04, -0.34, 0.1]);
    add(fore, new THREE.BoxGeometry(0.15, 0.015, 0.015), M.glow, [0, -0.48, 0.18]);
    // fist
    add(fore, plate(0.24, 0.22, 0.24, { bx: 0.88 }), M.dark, [0, -0.67, 0]);
    add(fore, plate(0.25, 0.08, 0.26), M.light, [0, -0.6, 0]);
  }

  // ---------- The Forge Hammer: planted in the right hand at rest, signature silhouette ----------
  const showHammer = mode === 'landing' || relic === 'hammer';
  if (showHammer) {
    const hammer = new THREE.Group();
    hammer.position.set(1.0, 1.0, 0.12);
    hammer.rotation.set(0.0, 0.5, -0.02);
    group.add(hammer);
    add(hammer, new THREE.CylinderGeometry(0.038, 0.05, 2.6, 8), M.dark, [0, 0.42, 0]);
    add(hammer, new THREE.CylinderGeometry(0.052, 0.052, 0.4, 8), M.trim, [0, 0.1, 0]);
    for (let i = 0; i < 4; i++) add(hammer, new THREE.TorusGeometry(0.05, 0.012, 4, 8), M.light, [0, 0.96 + i * 0.14, 0], [Math.PI / 2, 0, 0]);
    const headH = new THREE.Group(); headH.position.set(0, -0.77, 0); hammer.add(headH);
    add(headH, plate(0.62, 0.42, 0.36, { tx: 0.86, tz: 0.86 }), M.mid, [0, 0, 0]);
    add(headH, plate(0.64, 0.05, 0.38), M.light, [0, 0.21, 0]);
    add(headH, plate(0.64, 0.05, 0.38), M.light, [0, -0.21, 0]);
    add(headH, new THREE.BoxGeometry(0.42, 0.03, 0.02), M.glow, [0, 0, 0.185]);
    for (const s of [-1, 1]) add(headH, plate(0.12, 0.34, 0.28, { tx: 0.8 }), M.dark, [s * 0.36, 0, 0], [0, 0, s * 0.04]);
  }
  if (relic === 'banner') {
    add(group, new THREE.CylinderGeometry(0.03, 0.03, 5.2, 8), M.dark, [-1.5, 2.5, -0.5]);
    const flag = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(1.2, -0.25, 0), new THREE.Vector3(0.8, -0.8, 0), new THREE.Vector3(1.2, -1.4, 0), new THREE.Vector3(0, -1.7, 0)]);
    flag.setIndex([0, 1, 2, 0, 2, 4, 2, 3, 4]); flag.computeVertexNormals();
    add(group, flag, new THREE.MeshBasicMaterial({ color: accent, side: THREE.DoubleSide }), [-1.47, 5, -0.5]);
  }
  if (relic === 'halo') { add(head, new THREE.TorusGeometry(0.58, 0.016, 8, 48), M.glow, [0, 0.12, -0.2]); add(head, new THREE.TorusGeometry(0.66, 0.006, 8, 48), M.glow, [0, 0.12, -0.22]); }
  if (relic === 'greatshield') {
    const sh = new THREE.Group(); sh.position.set(-1.25, 1.4, 0.3); sh.rotation.set(0, 0.5, 0); group.add(sh);
    add(sh, plate(1.15, 1.9, 0.08, { tx: 1, bx: 0.5 }), M.mid, [0, 0, 0]);
    add(sh, plate(0.15, 1.5, 0.04, { bx: 0.4 }), M.glow, [0, 0, 0.05]);
  }

  // ---------- Cape ----------
  let cape: THREE.Mesh | null = null;
  let capeBase: Float32Array | null = null;
  if (tier >= 3) {
    const g = new THREE.PlaneGeometry(1.5, 2.7, 8, 12);
    cape = new THREE.Mesh(g, M.cape);
    cape.position.set(0, 1.42, -0.62);
    cape.rotation.x = 0.09;
    group.add(cape);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) { const v = (1.35 - p.getY(i)) / 2.7; p.setX(i, p.getX(i) * (0.62 + v * 0.52)); }
    capeBase = (p.array as Float32Array).slice();
  }

  return {
    group,
    animate(t, px, py) {
      const breathe = Math.sin(t * 1.1);
      chest.position.y = 0.72 + breathe * 0.008;
      chest.rotation.x = breathe * 0.006;
      head.rotation.y += ((px * 0.5) - head.rotation.y) * 0.08;
      head.rotation.x += ((-py * 0.22) - head.rotation.x) * 0.08;
      arms[-1].rotation.z = -0.2 + breathe * 0.008;
      arms[1].rotation.z = 0.2 - breathe * 0.008;
      const pulse = 1.5 + Math.sin(t * 2.1) * 0.3;
      (core.material as THREE.MeshBasicMaterial).color.setRGB(pulse, pulse * 0.92, pulse * 0.85);
      if (cape && capeBase) {
        const p = cape.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < p.count; i++) {
          const x = capeBase[i * 3], y = capeBase[i * 3 + 1], v = (1.35 - y) / 2.7;
          p.setZ(i, Math.sin(t * 1.4 + x * 2.4 + y * 2.1) * 0.08 * v - v * 0.28);
        }
        p.needsUpdate = true;
      }
    },
    dispose() {
      group.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); });
      Object.values(M).forEach((m) => m.dispose());
      wear.dispose();
    },
  };
}
