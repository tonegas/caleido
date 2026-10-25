// JXA: prints "x y w h n" (Chrome coordinates, top-left origin) of the external
// display if there is one, otherwise of the main display; n = number of displays.
ObjC.import('AppKit');
function run() {
  const screens = $.NSScreen.screens.js;
  const main = screens[0].frame;
  const pick = screens.length > 1 ? screens[1] : screens[0];
  const f = pick.frame;
  const y = main.size.height - (f.origin.y + f.size.height);
  return [f.origin.x, y, f.size.width, f.size.height, screens.length].map(Math.round).join(' ');
}
