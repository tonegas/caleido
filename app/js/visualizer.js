// Renderer WebGL2 con feedback ping-pong.
import { VERT, FEEDBACK, DISPLAY } from './shaders.js';
import { SPEC_BINS, WAVE_LEN } from './audio.js';

const UNIFORMS = ['uRes', 'uTime', 'uDt', 'uBass', 'uMid', 'uTreble', 'uLevel', 'uBeat', 'uHue',
  'uSym', 'uScene', 'uFlash', 'uSpec', 'uWave', 'uPrev'];

export class Visualizer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 non disponibile');
    this.gl = gl;
    this.halfFloat = !!gl.getExtension('EXT_color_buffer_float');
    // pixel disegnati per pixel CSS: 2 = nitido anche su TV 1080p (supersampling),
    // viene ridotto automaticamente se gli fps calano
    this.quality = 2;

    this.fb = this._program(FEEDBACK);
    this.disp = this._program(DISPLAY);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.specTex = this._dataTex(SPEC_BINS);
    this.waveTex = this._dataTex(WAVE_LEN);
    this.targets = [];
    this.resize();
  }

  _program(fragSrc) {
    const gl = this.gl;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fragSrc));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    for (const n of UNIFORMS) u[n] = gl.getUniformLocation(p, n);
    return { p, u };
  }

  _dataTex(w) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, 1, 0, gl.RED, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  resize() {
    const gl = this.gl;
    const w = Math.max(2, Math.round(window.innerWidth * this.quality)), h = Math.max(2, Math.round(window.innerHeight * this.quality));
    this.canvas.width = w; this.canvas.height = h;
    this.w = w; this.h = h;
    for (const t of this.targets) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); }
    this.targets = [0, 1].map(() => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      if (this.halfFloat) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, this.w, this.h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.w, this.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return { tex, fbo };
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.cur = 0;
  }

  _setUniforms(u, s) {
    const gl = this.gl;
    gl.uniform2f(u.uRes, this.w, this.h);
    gl.uniform1f(u.uTime, s.time);
    gl.uniform1f(u.uDt, s.dt);
    gl.uniform1f(u.uBass, s.bass);
    gl.uniform1f(u.uMid, s.mid);
    gl.uniform1f(u.uTreble, s.treble);
    gl.uniform1f(u.uLevel, s.level);
    gl.uniform1f(u.uBeat, s.beat);
    gl.uniform1f(u.uHue, s.hue);
    gl.uniform1f(u.uSym, s.sym);
    gl.uniform1f(u.uScene, s.scene);
    gl.uniform1f(u.uFlash, s.flash);
    gl.uniform1i(u.uSpec, 1);
    gl.uniform1i(u.uWave, 2);
    gl.uniform1i(u.uPrev, 0);
  }

  render(audio, s) {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.specTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, SPEC_BINS, 1, gl.RED, gl.UNSIGNED_BYTE, audio.spectrum);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.waveTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, WAVE_LEN, 1, gl.RED, gl.UNSIGNED_BYTE, audio.wave);

    // pass 1: feedback (legge targets[cur], scrive targets[1-cur])
    const src = this.targets[this.cur], dst = this.targets[1 - this.cur];
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(this.fb.p);
    this._setUniforms(this.fb.u, s);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src.tex);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // pass 2: a schermo
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.disp.p);
    this._setUniforms(this.disp.u, s);
    gl.bindTexture(gl.TEXTURE_2D, dst.tex);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.cur = 1 - this.cur;
  }
}
