// "Milkdrop" mode: the real Winamp visualizer (butterchurn WebGL port)
// with hundreds of classic presets. Libraries in app/vendor, no network needed.

export class Milkdrop {
  constructor(canvas, audioCtx) {
    this.canvas = canvas;
    this.ctx = audioCtx;
    this.viz = null;
    this.presets = {};
    this.names = [];
    this.index = 0;
  }

  available() {
    return typeof window.butterchurn !== 'undefined' && typeof window.butterchurnPresets !== 'undefined';
  }

  init(sourceNode, quality) {
    this.quality = quality;
    const bc = window.butterchurn.default || window.butterchurn;
    const bp = window.butterchurnPresets.default || window.butterchurnPresets;
    this.presets = Object.assign({}, bp.getPresets());
    const extra = window.butterchurnPresetsExtra;
    if (extra) Object.assign(this.presets, (extra.default || extra).getPresets());
    this.names = Object.keys(this.presets).sort(() => Math.random() - 0.5);
    this.resize(this.quality);
    this.viz = bc.createVisualizer(this.ctx, this.canvas, {
      width: this.canvas.width, height: this.canvas.height, pixelRatio: 1, textureRatio: 1,
    });
    this.connect(sourceNode);
    this.next(0);
  }

  connect(sourceNode) {
    if (this.viz && sourceNode) this.viz.connectAudio(sourceNode);
  }

  resize(quality = 2) {
    this.canvas.width = Math.round(window.innerWidth * quality);
    this.canvas.height = Math.round(window.innerHeight * quality);
    if (this.viz) this.viz.setRendererSize(this.canvas.width, this.canvas.height);
  }

  next(blend = 2.5) {
    if (!this.viz || !this.names.length) return '';
    this.index = (this.index + 1) % this.names.length;
    const name = this.names[this.index];
    this.viz.loadPreset(this.presets[name], blend);
    return name;
  }

  render() {
    if (this.viz) this.viz.render();
  }
}
