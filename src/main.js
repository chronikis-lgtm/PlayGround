import { Game } from './game.js';
import { Input } from './input.js';
import { Sfx } from './audio.js';

const canvas = document.getElementById('game');
const input = new Input(canvas);
const sfx = new Sfx();
const game = new Game(canvas, input, sfx);

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function computeView() {
  const cssW = Math.max(1, window.innerWidth);
  const cssH = Math.max(1, window.innerHeight);
  // Render into a small backing store and let CSS stretch it. This is what
  // gives the game its chunky pixel look, and it keeps the world size roughly
  // consistent across phones, tablets and desktops.
  const scale = clamp(Math.floor(Math.min(cssW, cssH) / 240), 2, 4);
  const w = Math.max(150, Math.floor(cssW / scale));
  const h = Math.max(130, Math.floor(cssH / scale));
  return { w, h, scale, art: scale < 3 ? 1.4 : 1 };
}

function resize() {
  const view = computeView();
  if (canvas.width !== view.w || canvas.height !== view.h) {
    canvas.width = view.w;
    canvas.height = view.h;
  }
  canvas.getContext('2d').imageSmoothingEnabled = false;
  input.setView(view);
  game.setView(view);
}

input.attach();
input.onUiTap = (x, y, pointerType) => game.handleUiTap(x, y, pointerType);
game.setView(computeView());
resize();
window.addEventListener('resize', resize);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', resize);
}

// Browsers only allow audio to start from a gesture.
const wakeAudio = () => sfx.ensure();
window.addEventListener('pointerdown', wakeAudio, { passive: true });
window.addEventListener('keydown', wakeAudio);
window.addEventListener('touchstart', wakeAudio, { passive: true });

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state === 'playing') game.pause();
  if (document.hidden && game.score > game.high) {
    game.high = game.score;
    try {
      localStorage.setItem('neon-rampage-high', String(game.high));
    } catch {}
  }
});

window.addEventListener('blur', () => {
  if (game.state === 'playing') game.pause();
});

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, Math.max(0, (now - last) / 1000));
  last = now;
  input.update(dt);
  game.update(dt);
  game.render();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// Small convenience for automated checks / curious humans.
window.neonRampage = game;
