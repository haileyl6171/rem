// Generates public/sample_memory.splat — a valid placeholder Gaussian Splat scene.
//
// WHY THIS EXISTS:
// The repo originally shipped a 17-byte text placeholder ("SPLAT_PLACEHOLDER")
// at public/sample_memory.splat. The viewer (@mkkellogg/gaussian-splats-3d)
// crashes on it with "Cannot read properties of undefined (reading 'splatBuffer')"
// because it isn't a real splat. This script writes a real, valid .splat so the
// viewer has something to render until true reconstruction is wired up.
//
// .splat row format (32 bytes/splat), confirmed against the library's parser:
//   center   float32[3]   (linear world position)
//   scale    float32[3]   (linear std-dev, NOT log)
//   color    uint8[4]     (RGBA, direct)
//   rotation uint8[4]     bytes [w,x,y,z] each encoded as round(q*128 + 128);
//                         decoded by the lib as ((b-128)/128) -> (x,y,z,w)
//
// Run: node scripts/generate-sample-splat.mjs

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "public", "sample_memory.splat");

const splats = [];
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
const push = (px, py, pz, sx, sy, sz, r, g, b, a) =>
  splats.push({ px, py, pz, sx, sy, sz, r, g, b, a });

// World is y-down (the viewer uses cameraUp [0,-1,0]); camera sits at (0,0,4)
// looking toward the origin. Build a warm, enveloping "memory" interior.

// Dense bright central nebula (the focal "memory" core)
for (let i = 0; i < 16000; i++) {
  const r = Math.pow(Math.random(), 0.5) * 1.3;
  const th = 2 * Math.PI * Math.random();
  const ph = Math.acos(2 * Math.random() - 1);
  const warm = 1 - r / 1.4;
  push(
    r * Math.sin(ph) * Math.cos(th),
    r * Math.cos(ph) * 0.8,
    r * Math.sin(ph) * Math.sin(th),
    0.1, 0.1, 0.1,
    clamp(235 + 20 * warm), clamp(170 + 50 * warm), clamp(110 + 60 * warm), 200
  );
}
// Warm sunset backdrop wall filling the frame behind the core
for (let i = 0; i < 14000; i++) {
  const y = (Math.random() * 2 - 1) * 2.4;
  const g = 1 - (y + 2.4) / 4.8;
  push(
    (Math.random() * 2 - 1) * 3.2, y, -2.0 - Math.random() * 0.6,
    0.12, 0.12, 0.06,
    clamp(200 + 50 * g), clamp(120 + 70 * g), clamp(70 + 50 * g), 230
  );
}
// Floor band (warm, low in frame -> +y because y is down)
for (let i = 0; i < 10000; i++) {
  push(
    (Math.random() * 2 - 1) * 3.0, 1.7 + Math.random() * 0.2, (Math.random() * 2 - 1) * 2.0,
    0.13, 0.04, 0.13,
    clamp(150 + 40 * Math.random()), clamp(95 + 30 * Math.random()), clamp(60 + 25 * Math.random()), 240
  );
}
// Bright window glow (left)
for (let i = 0; i < 4000; i++) {
  push(
    -1.7 + Math.random() * 0.8, -1.1 + Math.random() * 1.6, -1.9 + Math.random() * 0.1,
    0.09, 0.09, 0.04,
    clamp(252 + Math.random() * 3), clamp(205 + Math.random() * 40), clamp(140 + Math.random() * 50), 255
  );
}

const N = splats.length;
const buf = Buffer.alloc(N * 32);
let o = 0;
for (const s of splats) {
  buf.writeFloatLE(s.px, o); buf.writeFloatLE(s.py, o + 4); buf.writeFloatLE(s.pz, o + 8);
  buf.writeFloatLE(s.sx, o + 12); buf.writeFloatLE(s.sy, o + 16); buf.writeFloatLE(s.sz, o + 20);
  buf[o + 24] = s.r; buf[o + 25] = s.g; buf[o + 26] = s.b; buf[o + 27] = s.a;
  // identity rotation: (w,x,y,z) = (1,0,0,0) -> bytes [255,128,128,128]
  buf[o + 28] = 255; buf[o + 29] = 128; buf[o + 30] = 128; buf[o + 31] = 128;
  o += 32;
}
writeFileSync(OUT, buf);
console.log(`wrote ${N} splats (${buf.length} bytes) -> ${OUT}`);
