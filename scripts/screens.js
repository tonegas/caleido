// JXA: stampa "x y w h" (coordinate Chrome, origine in alto a sinistra) dello schermo
// esterno se presente, altrimenti di quello principale.
ObjC.import('AppKit');
function run() {
  const screens = $.NSScreen.screens.js;
  const main = screens[0].frame;
  const pick = screens.length > 1 ? screens[1] : screens[0];
  const f = pick.frame;
  const y = main.size.height - (f.origin.y + f.size.height);
  return [f.origin.x, y, f.size.width, f.size.height, screens.length].map(Math.round).join(' ');
}
