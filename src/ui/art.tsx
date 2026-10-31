import { useId } from 'react';
import type { Muscle } from '@/domain/types';

/**
 * Original Iron Quest character art, drawn entirely in code. Armor grows by tier (0–5) and every
 * piece is real geometry, so the character visibly evolves with progress.
 */
export function WarriorArt({ tier = 0, accent = '#ff6b2c', relic = 'none', className, title = 'Your armored character' }: { tier?: number; accent?: string; relic?: string; className?: string; title?: string }) {
  const id = useId().replace(/:/g, '');
  const m = `url(#m${id})`, l = `url(#l${id})`, d = `url(#d${id})`, a = `url(#a${id})`;
  const edge = '#6c7681';
  const Half = (
    <g stroke="#000" strokeWidth="1.4" strokeLinejoin="round">
      {/* leg */}
      <polygon points="208,476 268,460 272,540 226,552" fill={m} />
      <polygon points="222,552 272,540 270,572 228,582" fill={l} />
      <polygon points="226,584 270,574 266,618 232,624" fill={d} />
      <polygon points="222,624 272,616 284,638 214,640" fill={m} />
      <polyline points="238,486 248,540" fill="none" stroke={edge} strokeWidth="1" />
      <polygon points="240,556 258,552 256,564 242,568" fill={a} stroke="none" />
      {/* hips */}
      <polygon points="200,418 256,406 276,462 232,490 200,472" fill={d} />
      <polygon points="200,424 240,416 250,456 200,464" fill={m} />
      {/* waist + abs */}
      <polygon points="200,382 238,372 252,410 200,420" fill="#0b0d10" />
      <polygon points="202,330 240,322 238,348 202,354" fill={m} /><polygon points="202,358 238,352 236,372 202,378" fill={d} />
      {/* arm */}
      <polygon points="284,220 322,232 330,312 296,322" fill={d} />
      <polygon points="294,326 334,316 348,398 310,410" fill={m} />
      <polygon points="306,412 350,400 360,448 318,460" fill={l} />
      <polygon points="316,462 358,450 356,478 324,486" fill={d} />
      <line x1="316" y1="340" x2="330" y2="396" stroke={a} strokeWidth="2" />
      {/* torso */}
      <polygon points="200,178 264,188 290,232 274,294 234,320 200,326" fill={m} />
      <polygon points="200,178 264,188 276,214 204,226" fill={l} />
      <polyline points="204,226 240,272 234,320" fill="none" stroke={edge} strokeWidth="1" />
      {tier >= 2 && <polygon points="214,232 276,218 268,280 236,300" fill={l} opacity=".9" />}
      {tier >= 4 && <polygon points="232,190 290,206 300,246 262,226" fill={l} />}
      {/* pauldron */}
      {tier === 0 && <polygon points="268,186 314,196 332,236 292,238" fill={m} />}
      {tier >= 1 && <polygon points="258,172 326,184 354,246 300,258 278,224" fill={m} />}
      {tier >= 1 && <polygon points="270,176 326,186 338,214 286,206" fill={l} />}
      {tier >= 3 && <polygon points="268,156 340,172 378,256 338,270 322,214" fill={d} />}
      {tier >= 3 && <line x1="290" y1="166" x2="360" y2="250" stroke={a} strokeWidth="2" />}
      {tier >= 4 && <polygon points="312,158 352,124 344,186" fill={l} />}
      {/* helmet */}
      <polygon points="200,38 240,50 254,92 246,130 224,152 200,158" fill={m} />
      <polygon points="200,38 240,50 248,78 200,72" fill={l} />
      <polygon points="200,152 224,150 228,178 200,184" fill="#0b0d10" />
      {tier >= 2 && <polygon points="238,52 262,30 256,88" fill={l} />}
    </g>
  );
  return (
    <svg viewBox="0 0 400 660" className={className} role="img" aria-label={title}>
      <defs>
        <linearGradient id={`m${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#59626c" /><stop offset=".55" stopColor="#23282e" /><stop offset="1" stopColor="#0f1215" /></linearGradient>
        <linearGradient id={`l${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#a4adb7" /><stop offset=".5" stopColor="#4a525b" /><stop offset="1" stopColor="#1a1e23" /></linearGradient>
        <linearGradient id={`d${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#30363d" /><stop offset="1" stopColor="#0b0d0f" /></linearGradient>
        <linearGradient id={`a${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={accent} /><stop offset="1" stopColor={accent} stopOpacity=".6" /></linearGradient>
        <filter id={`g${id}`} x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="7" /></filter>
        <radialGradient id={`f${id}`}><stop offset="0" stopColor={accent} stopOpacity=".55" /><stop offset="1" stopColor={accent} stopOpacity="0" /></radialGradient>
        <g id={`h${id}`}>{Half}</g>
      </defs>
      <ellipse cx="200" cy="642" rx="150" ry="16" fill={`url(#f${id})`} />
      {tier >= 3 && <polygon points="150,190 250,190 340,600 290,640 200,620 110,640 60,600" fill="#1a0c0c" stroke="#3a1414" strokeWidth="2" />}
      {tier >= 3 && <polyline points="200,200 200,620" stroke="#3a1414" strokeWidth="2" />}
      {relic === 'halo' && <><circle cx="200" cy="96" r="88" fill="none" stroke={accent} strokeWidth="3" opacity=".9" /><circle cx="200" cy="96" r="96" fill="none" stroke={accent} strokeWidth="1" opacity=".4" /></>}
      {tier >= 5 && <g fill="none" stroke={accent} strokeWidth="3" opacity=".95"><path d="M120 76 Q200 -26 280 76" /><path d="M140 60 Q200 -2 260 60" /></g>}
      {relic === 'banner' && <g><rect x="62" y="60" width="6" height="580" fill="#2c3137" /><polygon points="68,70 140,86 118,120 140,156 68,170" fill={accent} /></g>}
      <use href={`#h${id}`} />
      <use href={`#h${id}`} transform="translate(400 0) scale(-1 1)" />
      {/* face & reactor glow */}
      <polygon points="160,92 240,92 232,110 200,114 168,110" fill={accent} />
      <polygon points="160,92 240,92 232,110 200,114 168,110" fill={accent} filter={`url(#g${id})`} />
      <rect x="198" y="72" width="4" height="84" fill="#000" opacity=".5" />
      <polygon points="200,226 218,238 218,260 200,272 182,260 182,238" fill={tier >= 4 ? '#fff' : accent} />
      <polygon points="200,226 218,238 218,260 200,272 182,260 182,238" fill={accent} filter={`url(#g${id})`} opacity={0.6 + tier * 0.08} />
      {relic === 'hammer' && <g transform="rotate(8 340 450)"><rect x="336" y="300" width="9" height="290" fill="#30363d" /><polygon points="306,270 376,270 386,308 296,308" fill={`url(#l${id})`} stroke="#000" /><rect x="306" y="284" width="70" height="4" fill={accent} /></g>}
      {relic === 'greatshield' && <g><polygon points="16,270 110,250 122,450 66,540 10,450" fill={`url(#m${id})`} stroke="#000" strokeWidth="2" /><polygon points="54,290 76,286 74,460 60,480 46,460" fill={accent} opacity=".8" /></g>}
    </svg>
  );
}

// ---------- Achievement sigils ----------
const GLYPHS: Record<string, string> = {
  spark: 'M50 20 L58 44 L82 50 L58 56 L50 80 L42 56 L18 50 L42 44 Z',
  gate: 'M28 78 V36 L50 22 L72 36 V78 H60 V48 H40 V78 Z',
  chevron: 'M50 22 L78 52 H62 L50 40 L38 52 H22 Z M50 50 L78 80 H62 L50 68 L38 80 H22 Z',
  anvil: 'M20 34 H78 V44 C70 50 66 54 64 60 L72 74 H30 L38 60 C36 54 30 48 20 44 Z',
  flame: 'M50 18 C56 34 74 42 72 62 C70 76 60 82 50 82 C40 82 30 76 28 62 C27 52 34 46 38 38 C42 46 46 46 48 42 C50 36 48 28 50 18 Z',
  moon: 'M62 20 C42 22 28 36 28 54 C28 70 42 82 60 80 C68 79 72 76 76 72 C58 74 46 62 46 46 C46 34 52 26 62 20 Z',
  sun: 'M50 34 A16 16 0 1 1 50 66 A16 16 0 1 1 50 34 Z M47 16 H53 V27 H47 Z M47 73 H53 V84 H47 Z M16 47 H27 V53 H16 Z M73 47 H84 V53 H73 Z',
  crown: 'M20 72 L16 32 L34 48 L50 22 L66 48 L84 32 L80 72 Z',
  road: 'M42 18 H58 L78 82 H58 L55 62 H45 L42 82 H22 Z',
  scroll: 'M28 22 H72 V30 H66 V78 H22 V70 H28 Z M36 36 H58 V42 H36 Z M36 50 H58 V56 H36 Z',
};
const TIER = { bronze: '#c98a5a', silver: '#c8ced6', gold: '#ffc24b' };
export function Sigil({ glyph, tier, locked, size = 56 }: { glyph: string; tier: keyof typeof TIER; locked?: boolean; size?: number }) {
  const c = locked ? '#3a424b' : TIER[tier];
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <polygon points="50,3 91,26 91,74 50,97 9,74 9,26" fill={locked ? '#0d0f12' : '#16110e'} stroke={c} strokeWidth="2.5" />
      <polygon points="50,12 83,31 83,69 50,88 17,69 17,31" fill="none" stroke={c} strokeWidth=".7" opacity=".6" />
      <path d={GLYPHS[glyph] ?? GLYPHS.spark} fill={c} />
    </svg>
  );
}

// ---------- Muscle map ----------
type Sh = [Muscle, string];
const FRONT: Sh[] = [
  ['traps', 'M42 26 L50 30 L58 26 L62 32 L38 32 Z'],
  ['front-delts', 'M30 33 L38 31 L39 44 L31 46 Z M70 33 L62 31 L61 44 L69 46 Z'],
  ['side-delts', 'M26 36 L30 32 L31 47 L26 48 Z M74 36 L70 32 L69 47 L74 48 Z'],
  ['chest', 'M39 33 L49.5 35 L49.5 49 L40 49 Z M61 33 L50.5 35 L50.5 49 L60 49 Z'],
  ['biceps', 'M26 49 L32 48 L32 64 L27 65 Z M74 49 L68 48 L68 64 L73 65 Z'],
  ['forearms', 'M25 67 L32 66 L30 86 L25 86 Z M75 67 L68 66 L70 86 L75 86 Z'],
  ['abs', 'M43 50 L57 50 L56 76 L44 76 Z'],
  ['obliques', 'M39 51 L42 51 L43 74 L39 70 Z M61 51 L58 51 L57 74 L61 70 Z'],
  ['quads', 'M38 84 L48 84 L47 118 L40 118 Z M62 84 L52 84 L53 118 L60 118 Z'],
  ['adductors', 'M47 78 L49.5 80 L49 100 L48 92 Z M53 78 L50.5 80 L51 100 L52 92 Z'],
  ['abductors', 'M35 78 L38 80 L38 100 L35 92 Z M65 78 L62 80 L62 100 L65 92 Z'],
  ['calves', 'M39 124 L46 124 L45 150 L41 150 Z M61 124 L54 124 L55 150 L59 150 Z'],
];
const BACK: Sh[] = [
  ['traps', 'M40 26 L50 24 L60 26 L58 36 L50 48 L42 36 Z'],
  ['rear-delts', 'M30 33 L40 31 L39 44 L30 46 Z M70 33 L60 31 L61 44 L70 46 Z'],
  ['side-delts', 'M26 36 L30 32 L30 47 L26 48 Z M74 36 L70 32 L70 47 L74 48 Z'],
  ['upper-back', 'M40 37 L46 42 L46 52 L39 48 Z M60 37 L54 42 L54 52 L61 48 Z'],
  ['lats', 'M38 49 L46 54 L47 68 L41 66 Z M62 49 L54 54 L53 68 L59 66 Z'],
  ['lower-back', 'M44 66 L56 66 L56 76 L44 76 Z'],
  ['triceps', 'M26 49 L32 48 L32 64 L27 65 Z M74 49 L68 48 L68 64 L73 65 Z'],
  ['forearms', 'M25 67 L32 66 L30 86 L25 86 Z M75 67 L68 66 L70 86 L75 86 Z'],
  ['glutes', 'M37 76 L49.5 78 L49.5 92 L38 92 Z M63 76 L50.5 78 L50.5 92 L62 92 Z'],
  ['hamstrings', 'M38 94 L48 94 L47 120 L40 120 Z M62 94 L52 94 L53 120 L60 120 Z'],
  ['calves', 'M39 124 L46 124 L45 150 L41 150 Z M61 124 L54 124 L55 150 L59 150 Z'],
];
const BODY = 'M50 4 C56 4 59 9 59 15 C59 20 57 23 55 25 L62 27 L74 31 L78 48 L78 88 L72 90 L68 66 L63 52 L64 78 L64 118 L62 156 L52 156 L51 100 L49 100 L48 156 L38 156 L36 118 L36 78 L37 52 L32 66 L28 90 L22 88 L22 48 L26 31 L38 27 L45 25 C43 23 41 20 41 15 C41 9 44 4 50 4 Z';

function Fig({ shapes, primary, secondary, label }: { shapes: Sh[]; primary: Set<Muscle>; secondary: Set<Muscle>; label: string }) {
  return (
    <figure className="m-0 text-center">
      <svg viewBox="16 0 68 160" className="h-52 w-auto" role="img" aria-label={`${label} view: ${[...primary].join(', ') || 'no muscles'} highlighted`}>
        <path d={BODY} fill="#14181c" stroke="#2c333b" strokeWidth=".6" />
        {shapes.map(([m, d]) => <path key={m + d} d={d} fill={primary.has(m) ? 'var(--color-ember)' : secondary.has(m) ? '#8a4a2c' : '#22282e'} />)}
      </svg>
      <figcaption className="hud mt-1">{label}</figcaption>
    </figure>
  );
}
export function MuscleMap({ primary, secondary }: { primary: Muscle[]; secondary: Muscle[] }) {
  const p = new Set(primary), s = new Set(secondary);
  return <div className="flex justify-center gap-4"><Fig shapes={FRONT} primary={p} secondary={s} label="Front" /><Fig shapes={BACK} primary={p} secondary={s} label="Back" /></div>;
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ''}`}>
      <svg viewBox="0 0 512 512" width="22" height="22" aria-hidden><path fill="#c8ced6" d="M256 56 408 128v120c0 96-64 168-152 208-88-40-152-112-152-208V128z" /><path fill="#14171b" d="M256 84 382 144v104c0 80-52 142-126 178-74-36-126-98-126-178V144z" /><path fill="var(--accent)" d="M154 196h204l-34 44H188z" /><path fill="#c8ced6" d="M232 260h48v128l-24 18-24-18z" /></svg>
      <span className="display text-lg tracking-[.08em]">Iron Quest</span>
    </span>
  );
}
