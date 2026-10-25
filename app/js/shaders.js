// GLSL shaders. Pipeline:
//  1) FEEDBACK: the previous frame is zoomed/rotated/warped (Milkdrop style)
//     and the current scene is drawn on top -> psychedelic trails.
//  2) DISPLAY: color grading, beat flash, vignette, dithering.

export const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const COMMON = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime, uDt, uBass, uMid, uTreble, uLevel, uBeat, uHue, uSym, uScene, uFlash;
uniform sampler2D uSpec, uWave, uPrev;
in vec2 vUv;
out vec4 fragColor;
#define TAU 6.28318530718

float spec(float x) { return texture(uSpec, vec2(clamp(x, 0.0, 1.0), 0.5)).r; }
float wave(float x) { return texture(uWave, vec2(clamp(x, 0.0, 1.0), 0.5)).r * 2.0 - 1.0; }
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec3 pal(float t) {
  return 0.5 + 0.5 * cos(TAU * (vec3(1.0, 1.0, 1.0) * t + vec3(0.0, 0.33, 0.67) + uHue));
}
vec3 pal2(float t) {
  return 0.5 + 0.5 * cos(TAU * (vec3(1.0, 0.7, 0.4) * t + vec3(0.0, 0.15, 0.20) + uHue));
}
// fold space into N mirrored slices (kaleidoscope)
vec2 kaleido(vec2 p, float n, float spin) {
  float r = length(p), a = atan(p.y, p.x) + spin;
  float seg = TAU / n;
  a = abs(mod(a, seg) - seg * 0.5);
  return vec2(cos(a), sin(a)) * r;
}
`;

// Each scene: radial/angular zones driven by FREQUENCY (spectrum),
// central/global zones driven by AMPLITUDE (level, bass, beat).
const SCENES = `
vec3 sceneMandala(vec2 p) {            // 0: cell kaleidoscope
  vec2 k = kaleido(p, uSym, uTime * 0.08);
  float r = length(p);
  vec2 g = k * (5.0 + 2.0 * uMid) + vec2(uTime * 0.4, 0.0);
  vec2 c = fract(g) - 0.5;
  float fr = spec(fract(r * 1.1));
  float d = length(c);
  float dots = smoothstep(0.18 + 0.25 * fr, 0.12 + 0.25 * fr, d);
  float ring = smoothstep(0.03, 0.0, abs(d - 0.35 - 0.1 * uTreble));
  vec3 col = pal(r * 1.4 - uTime * 0.07 + fr * 0.5) * dots * (0.25 + 1.6 * fr);
  col += pal2(r + 0.3) * ring * uTreble;
  float core = smoothstep(0.06 + 0.22 * uLevel + 0.12 * uBeat, 0.0, r);
  col += pal(0.5 - uTime * 0.05) * core * (0.6 + uBeat);
  return col;
}

vec3 sceneTunnel(vec2 p) {             // 1: neon grid tunnel
  float r = length(p), a = atan(p.y, p.x);
  float z = 0.4 / (r + 0.02) + uTime * (0.8 + 2.5 * uLevel);      // depth
  float u = a / TAU * uSym * 2.0 + 0.3 * sin(z * 0.4 + uTime * 0.5);
  float fr = spec(fract(z * 0.05));
  vec2 g = vec2(u, z * 0.8);
  vec2 f = abs(fract(g) - 0.5);
  float edge = min(0.5 - f.x, 0.5 - f.y);                         // distance from the cell edge
  float aa = fwidth(edge) * 1.5;
  float line = 1.0 - smoothstep(0.02 + 0.05 * fr, 0.02 + 0.05 * fr + aa, edge);
  float checker = mod(floor(g.x) + floor(g.y), 2.0);
  vec3 col = pal(z * 0.05 + checker * 0.5 + fr * 0.3) * line * (0.6 + 2.0 * fr);
  col += pal2(z * 0.03) * checker * fr * 0.35;
  col *= smoothstep(0.0, 0.2, r);                                 // fog in the center
  col += pal2(0.2) * smoothstep(0.1 + 0.1 * uBass, 0.0, r) * (0.3 + uBeat);
  return col;
}

vec3 scenePlasma(vec2 p) {             // 2: mirrored plasma
  vec2 q = rot(uTime * 0.07) * abs(rot(uTime * 0.05) * p);
  q = abs(q);
  float t = uTime * (0.6 + 1.5 * uMid);
  float v = sin(q.x * 9.0 + t) + sin(q.y * 11.0 + t * 1.3)
          + sin((q.x + q.y) * 8.0 + t * 0.7)
          + sin(length(q) * 16.0 - t * 2.0 - uBass * 5.0);
  v *= 0.25;
  float fr = spec(abs(v));
  float bands = smoothstep(0.0, 0.25, abs(sin(v * TAU * 1.5 + uTime)));
  return pal(v + uTreble * 0.4) * (0.2 + 1.2 * fr + 0.6 * uBeat) * bands;
}

vec3 sceneSpectrum(vec2 p) {           // 3: spectrum mandala
  float r = length(p), a = atan(p.y, p.x) + uTime * 0.1;
  float seg = TAU / uSym;
  float am = abs(mod(a, seg) - seg * 0.5) / (seg * 0.5);
  float s = spec(am * 0.9);
  float r0 = 0.1 + 0.08 * uBass;
  float bar = smoothstep(0.008, 0.0, r - (r0 + s * 0.4)) * smoothstep(r0 - 0.01, r0, r);
  float glow = exp(-abs(r - (r0 + s * 0.4)) * 40.0) * s;
  float w = wave(fract(atan(p.y, p.x) / TAU + 0.5));
  float wr = r0 * 0.7 + 0.05 * w * (0.5 + uLevel);
  float ring = smoothstep(0.012, 0.0, abs(r - wr));
  vec3 col = pal(am * 0.6 + r) * bar * (0.4 + s) + pal2(am) * glow;
  col += vec3(1.0, 0.95, 0.9) * ring * (0.4 + uLevel);
  return col;
}

vec3 sceneFractal(vec2 p) {            // 4: kaliset fractal (filaments)
  vec2 q = kaleido(rot(uTime * 0.04) * p, uSym, 0.0) * (1.6 - 0.4 * uBass);
  vec2 c = vec2(0.55 + 0.1 * sin(uTime * 0.13) + 0.08 * uBass, 0.45 + 0.08 * cos(uTime * 0.11) + 0.05 * uMid);
  vec3 col = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    q = abs(q) / clamp(dot(q, q), 0.05, 10.0) - c;
    float fi = float(i) / 8.0;
    float e = spec(fi * 0.8 + 0.05);
    float line = exp(-abs(q.y) * 25.0) + exp(-abs(q.x) * 25.0);
    col += pal(fi + length(q) * 0.1) * line * (0.1 + 1.2 * e);
  }
  col += pal2(0.3) * smoothstep(0.08 + 0.15 * uLevel, 0.0, length(p)) * uBeat;
  return col * 0.35;
}

vec3 sceneScope(vec2 p) {              // 5: star oscilloscope
  vec2 k = kaleido(p, uSym, uTime * 0.15);
  float x = k.x * 1.3;
  float w = wave(x) * (0.08 + 0.25 * uLevel);
  float d = abs(k.y - w - 0.03 - 0.05 * uBass);
  float line = smoothstep(0.006 + 0.01 * uBeat, 0.0, d) * step(0.02, x) * step(x, 1.0);
  float fr = spec(x);
  vec3 col = pal(x * 0.8 + uTime * 0.05) * line * (1.0 + fr);
  col += pal2(0.0) * smoothstep(0.05 + 0.1 * uLevel, 0.0, length(p)) * uBeat;
  return col;
}

vec3 scene(vec2 p) {
  int s = int(uScene + 0.5);
  if (s == 0) return sceneMandala(p);
  if (s == 1) return sceneTunnel(p);
  if (s == 2) return scenePlasma(p);
  if (s == 3) return sceneSpectrum(p);
  if (s == 4) return sceneFractal(p);
  return sceneScope(p);
}
`;

export const SCENE_NAMES = ['Mandala', 'Tunnel', 'Plasma', 'Spectrum', 'Fractal', 'Oscilloscope'];

export const FEEDBACK = COMMON + SCENES + `
void main() {
  float asp = uRes.x / uRes.y;
  vec2 p = vUv - 0.5; p.x *= asp;

  // warp of the previous frame: zoom with the bass, rotation with the mids,
  // ripples with the highs. Everything scaled by uDt: same speed at 60 or 120 fps.
  float zoom = exp(-uDt * (0.35 + 0.9 * uBass + 1.2 * uBeat));
  float spin = uDt * (0.15 + 0.6 * (uMid - 0.4) * sin(uTime * 0.2));
  vec2 q = rot(spin) * p * zoom;
  q += uDt * 0.2 * (0.3 + uTreble) * vec2(sin(uTime * 1.3 + p.y * 9.0), cos(uTime * 1.1 + p.x * 9.0));
  q.x /= asp;
  vec2 uv = q + 0.5;

  // 4 samples offset by half a pixel: trails fade smoothly
  // instead of leaving "stepped" copies (grainy look)
  vec2 px = 0.5 / uRes;
  vec3 prev = 0.25 * (texture(uPrev, uv + px).rgb + texture(uPrev, uv - px).rgb
                    + texture(uPrev, uv + vec2(px.x, -px.y)).rgb + texture(uPrev, uv + vec2(-px.x, px.y)).rgb);

  // trails slowly shift color
  // near the edges trails are magnified more (and softer): fade them faster
  float decay = exp(-uDt * (2.5 + 3.5 * uLevel + 5.0 * length(p)));
  prev = mix(prev, prev.gbr, uDt * (1.2 + 1.8 * uTreble)) * decay;

  vec3 col = scene(p);
  fragColor = vec4(max(prev, col) + 0.12 * col, 1.0);
}`;

export const DISPLAY = COMMON + `
void main() {
  vec2 d = (vUv - 0.5);
  vec3 col = texture(uPrev, vUv).rgb;
  col *= 1.0 + 0.5 * uBeat * uFlash;
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, 1.25);                 // more saturation
  col = col / (1.0 + 0.25 * col);                // soft tone map
  col *= 1.0 - 0.6 * pow(length(d) * 1.2, 2.5);  // vignette
  col = pow(max(col, 0.0), vec3(0.9));
  // dithering: avoids visible banding in dark gradients on the TV
  float n = fract(sin(dot(gl_FragCoord.xy + fract(uTime) * 61.0, vec2(12.9898, 78.233))) * 43758.5453);
  fragColor = vec4(col + (n - 0.5) / 255.0, 1.0);
}`;
