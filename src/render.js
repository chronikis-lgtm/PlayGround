import { drawText, measureText, drawWrapped } from './font.js';
import { drawSprite, drawHumanIcon } from './sprites.js';

const pad = (n, width = 2) => String(Math.max(0, Math.floor(n))).padStart(width, '0');
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const ARENA_TOP = 40;

function handheld(g) {
  if (!g.input) return false;
  return !!g.input.coarse || Math.min(g.view.w, g.view.h) < 220;
}

const COL = {
  white: '#f2f7ff',
  dim: '#7f8fc0',
  faint: '#3f4d78',
  cyan: '#3df2ff',
  pink: '#ff3d8b',
  gold: '#ffd23f',
  green: '#7cffb2',
  red: '#ff3b57',
};

export function renderGame(g, ctx) {
  const { w, h } = g.view;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#05060d';
  ctx.fillRect(0, 0, w, h);

  drawBackground(g, ctx);

  if (g.state === 'title') {
    drawAmbient(g, ctx);
    drawTitle(g, ctx);
    drawButtons(g, ctx);
    return;
  }

  const shakeX = g.shake > 0.2 ? Math.round((Math.random() * 2 - 1) * g.shake) : 0;
  const shakeY = g.shake > 0.2 ? Math.round((Math.random() * 2 - 1) * g.shake) : 0;
  ctx.save();
  ctx.translate(shakeX, shakeY);
  drawWorld(g, ctx);
  ctx.restore();

  if (g.state === 'playing' || g.state === 'paused') {
    drawHud(g, ctx);
    drawBanner(g, ctx);
    if (g.state === 'playing') drawTouch(g, ctx);
  }

  if (g.state === 'paused') {
    drawPause(g, ctx);
    drawButtons(g, ctx);
  } else if (g.state === 'gameover') {
    drawGameOver(g, ctx);
    drawButtons(g, ctx);
  } else if (g.state === 'playing') {
    drawButtons(g, ctx);
  }
}

function drawBackground(g, ctx) {
  const { w, h } = g.view;

  // faint constellation floor
  for (const s of g.stars) {
    if (s.y < ARENA_TOP) continue;
    ctx.globalAlpha = s.a;
    ctx.fillStyle = s.c;
    ctx.fillRect(s.x, s.y, 1, 1);
  }
  ctx.globalAlpha = 1;

  const step = w < 300 ? 20 : 24;
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(52, 88, 168, 0.13)';
  ctx.beginPath();
  for (let x = step; x < w; x += step) {
    ctx.moveTo(x + 0.5, ARENA_TOP);
    ctx.lineTo(x + 0.5, h);
  }
  for (let y = ARENA_TOP + step; y < h; y += step) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(w, y + 0.5);
  }
  ctx.stroke();

  // HUD strip divider
  ctx.fillStyle = 'rgba(4, 6, 14, 0.34)';
  ctx.fillRect(0, 0, w, ARENA_TOP);
  ctx.fillStyle = 'rgba(61, 242, 255, 0.2)';
  ctx.fillRect(0, ARENA_TOP, w, 1);
  ctx.fillStyle = 'rgba(255, 61, 139, 0.16)';
  ctx.fillRect(0, ARENA_TOP + 1, w, 1);

  ctx.strokeStyle = 'rgba(31, 55, 112, 0.8)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);
  ctx.strokeStyle = 'rgba(61, 242, 255, 0.16)';
  ctx.lineWidth = 1;
  ctx.strokeRect(4.5, 4.5, w - 9, h - 9);

  // corner brackets
  const L = 10;
  const corners = [
    [4, 4, 1, 1, COL.cyan],
    [w - 5, 4, -1, 1, COL.pink],
    [4, h - 5, 1, -1, COL.pink],
    [w - 5, h - 5, -1, -1, COL.cyan],
  ];
  ctx.lineWidth = 2;
  for (const [x, y, sx, sy, color] of corners) {
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(x, y + sy * L);
    ctx.lineTo(x, y);
    ctx.lineTo(x + sx * L, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawAmbient(g, ctx) {
  const art = g.view.art;
  for (const a of g.ambient) {
    const bob = Math.sin(a.phase * 1.8) * 1.5;
    ctx.globalAlpha = 0.32;
    drawSprite(ctx, a.type, a.x, a.y + bob, art, false, 1);
  }
  ctx.globalAlpha = 1;
}

function drawWorld(g, ctx) {
  const art = g.view.art;
  const t = g.time;

  for (const hm of g.humans) {
    if (hm.dead) continue;
    const bob = Math.sin(t * 4 + hm.seed) * 0.6;
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#000000';
    ctx.fillRect(Math.round(hm.x - 3), Math.round(hm.y + 5), 6, 2);
    ctx.globalAlpha = 1;
    drawSprite(ctx, 'human', hm.x, hm.y + bob, art);
  }

  for (const e of g.enemies) {
    if (e.spawnT > 0) {
      drawSpawnRing(g, ctx, e);
      continue;
    }
    const bob = e.type === 'spheroid' || e.type === 'brain' ? Math.sin(t * 5 + e.seed) * 1.1 : 0;
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#000000';
    ctx.fillRect(Math.round(e.x - e.r), Math.round(e.y + e.r * 0.75), Math.round(e.r * 2), 2);
    ctx.globalAlpha = 1;

    if (e.type === 'spheroid' || e.type === 'brain') {
      ctx.globalAlpha = 0.13;
      ctx.fillStyle = e.color;
      ctx.beginPath();
      ctx.arc(Math.round(e.x), Math.round(e.y + bob), e.r + 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    drawSprite(ctx, e.type, e.x, e.y + bob, art, e.hitFlash > 0);

    if (e.type === 'hulk' && e.hp < e.maxHp) {
      const width = Math.round(e.r * 2);
      const x = Math.round(e.x - e.r);
      const y = Math.round(e.y - e.r - 6);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(x - 1, y - 1, width + 2, 3);
      ctx.fillStyle = COL.red;
      ctx.fillRect(x, y, Math.max(0, Math.round((width * e.hp) / e.maxHp)), 1);
    }
  }

  // bullets
  for (const b of g.bullets) {
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = COL.cyan;
    ctx.fillRect(Math.round(b.x - b.vx * 0.018) - 1, Math.round(b.y - b.vy * 0.018) - 1, 3, 3);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.round(b.x) - 1, Math.round(b.y) - 1, 2, 2);
  }

  drawPlayer(g, ctx, art);

  // particles
  for (const p of g.particles) {
    const a = clamp(p.life / p.maxLife, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    const s = Math.max(1, Math.round(p.size * (0.6 + a * 0.4)));
    ctx.fillRect(Math.round(p.x), Math.round(p.y), s, s);
  }
  ctx.globalAlpha = 1;

  for (const txt of g.texts) {
    const a = clamp(txt.life / txt.maxLife, 0, 1);
    ctx.globalAlpha = a;
    drawText(ctx, txt.text, txt.x, txt.y, 1, txt.color, 'center', 'rgba(0,0,0,0.7)');
  }
  ctx.globalAlpha = 1;
}

function drawSpawnRing(g, ctx, e) {
  const p = 1 - e.spawnT / 0.6;
  const r = e.r + 3 + Math.sin(g.time * 24 + e.seed) * 1.2;
  ctx.globalAlpha = 0.35 + Math.sin(g.time * 18 + e.seed) * 0.2;
  ctx.strokeStyle = e.color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(Math.round(e.x), Math.round(e.y), Math.max(2, r), 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.18 + p * 0.25;
  drawSprite(ctx, e.type, e.x, e.y, g.view.art, false);
  ctx.globalAlpha = 1;
}

function drawPlayer(g, ctx, art) {
  const p = g.player;
  if (p.dead) return;
  const blink = p.invuln > 0 && Math.floor(g.time * 18) % 2 === 0;
  if (blink) return;

  ctx.globalAlpha = 0.32;
  ctx.fillStyle = '#000000';
  ctx.fillRect(Math.round(p.x - 4), Math.round(p.y + 4), 8, 2);
  ctx.globalAlpha = 1;

  // gun / aim line
  const ax = p.aimX;
  const ay = p.aimY;
  ctx.strokeStyle = 'rgba(61, 242, 255, 0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(Math.round(p.x + ax * 4), Math.round(p.y + ay * 4));
  ctx.lineTo(Math.round(p.x + ax * 9), Math.round(p.y + ay * 9));
  ctx.stroke();

  if (p.muzzle > 0) {
    const mx = Math.round(p.x + ax * 10);
    const my = Math.round(p.y + ay * 10);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(mx - 1, my - 1, 2, 2);
    ctx.fillStyle = COL.cyan;
    ctx.fillRect(Math.round(p.x + ax * 8), Math.round(p.y + ay * 8), 1, 1);
  }

  drawSprite(ctx, 'player', p.x, p.y, art);

  if (p.invuln > 0) {
    ctx.globalAlpha = 0.4 + Math.sin(g.time * 12) * 0.2;
    ctx.strokeStyle = COL.cyan;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(Math.round(p.x), Math.round(p.y), 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawHud(g, ctx) {
  const { w } = g.view;
  const small = w < 320;

  const grad = ctx.createLinearGradient(0, 0, 0, small ? 46 : 48);
  grad.addColorStop(0, 'rgba(3, 5, 12, 0.92)');
  grad.addColorStop(0.72, 'rgba(3, 5, 12, 0.58)');
  grad.addColorStop(1, 'rgba(3, 5, 12, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, small ? 46 : 48);

  if (small) {
    drawText(ctx, 'SCORE', 5, 5, 1, COL.dim);
    drawText(ctx, pad(g.score, 6), 5, 13, 2, COL.white);
    drawText(ctx, 'WAVE', w / 2, 5, 1, COL.dim, 'center');
    drawText(ctx, pad(g.wave, 2), w / 2, 13, 2, COL.cyan, 'center');
    drawText(ctx, 'HI', w - 5, 5, 1, COL.dim, 'right');
    drawText(ctx, pad(Math.max(g.high, g.score), 6), w - 5, 13, 1, COL.dim, 'right');
  } else {
    drawText(ctx, 'SCORE', 6, 5, 1, COL.dim);
    drawText(ctx, pad(g.score, 6), 6, 13, 2, COL.white);
    drawText(ctx, 'WAVE', w / 2, 5, 1, COL.dim, 'center');
    drawText(ctx, pad(g.wave, 2), w / 2, 13, 2, COL.cyan, 'center');
    drawText(ctx, 'HI ' + pad(Math.max(g.high, g.score), 6), w - 6, 5, 1, COL.dim, 'right');
  }

  const lifeY = small ? 32 : 31;
  const icons = Math.min(g.lives, 5);
  for (let i = 0; i < icons; i++) {
    drawHumanIcon(ctx, 6 + i * 7, lifeY, 1);
  }
  if (g.lives > 5) drawText(ctx, '+' + (g.lives - 5), 6 + icons * 7 + 2, lifeY + 1, 1, COL.gold);
  if (g.lives === 0) drawText(ctx, 'NO LIVES', 6, lifeY + 1, 1, COL.red);

  drawText(ctx, 'RESCUED ' + pad(g.rescued, 2), w / 2, lifeY + 1, 1, COL.gold, 'center');
}

function drawIconButton(g, ctx, b) {
  const muted = g.sfx && g.sfx.muted;
  ctx.fillStyle = 'rgba(8, 12, 25, 0.82)';
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.strokeStyle = 'rgba(74, 104, 186, 0.75)';
  ctx.lineWidth = 1;
  ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;

  if (b.id === 'pause') {
    ctx.fillStyle = COL.cyan;
    if (g.state === 'paused') {
      ctx.fillRect(cx - 2, cy - 4, 2, 8);
      ctx.fillRect(cx - 2, cy - 4, 5, 1);
      ctx.fillRect(cx - 2, cy + 3, 5, 1);
      ctx.fillRect(cx + 1, cy - 3, 1, 6);
    } else {
      ctx.fillRect(cx - 3, cy - 4, 2, 8);
      ctx.fillRect(cx + 1, cy - 4, 2, 8);
    }
  } else {
    const color = muted ? '#ff5f7a' : '#9fe9ff';
    ctx.fillStyle = color;
    ctx.fillRect(cx - 5, cy - 2, 2, 4);
    ctx.fillRect(cx - 3, cy - 3, 1, 6);
    ctx.fillRect(cx - 2, cy - 4, 1, 8);
    if (muted) {
      ctx.fillStyle = '#ff5f7a';
      ctx.fillRect(cx, cy - 4, 1, 2);
      ctx.fillRect(cx + 1, cy - 2, 1, 2);
      ctx.fillRect(cx + 2, cy, 1, 2);
      ctx.fillRect(cx + 3, cy + 2, 1, 2);
    } else {
      ctx.fillRect(cx + 1, cy - 2, 1, 4);
      ctx.fillRect(cx + 3, cy - 3, 1, 6);
      ctx.fillRect(cx + 5, cy - 4, 1, 8);
    }
  }
}

function drawButtons(g, ctx) {
  for (const b of g.uiButtons()) drawIconButton(g, ctx, b);
}

function drawBanner(g, ctx) {
  const b = g.banner;
  if (!b || b.t > b.life) return;
  const { w, h } = g.view;
  const p = b.t / b.life;
  let alpha = 1;
  if (p < 0.1) alpha = p / 0.1;
  else if (p > 0.78) alpha = Math.max(0, (1 - p) / 0.22);

  const scale = clamp(Math.floor((w - 20) / (Math.max(1, b.title.length) * 6)), 2, 5);
  const bandH = 7 * scale + 16;
  const bandY = Math.round(h * 0.34);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(3, 5, 12, 0.72)';
  ctx.fillRect(0, bandY, w, bandH);
  ctx.fillStyle = b.color;
  ctx.globalAlpha = alpha * 0.55;
  ctx.fillRect(0, bandY, w, 1);
  ctx.fillRect(0, bandY + bandH - 1, w, 1);
  ctx.globalAlpha = alpha;
  drawText(ctx, b.title, w / 2, bandY + 5, scale, b.color, 'center', 'rgba(0,0,0,0.8)');
  const subScale = measureText(b.sub, 2) <= w - 24 ? 2 : 1;
  drawText(ctx, b.sub, w / 2, bandY + 7 * scale + 8, subScale, COL.white, 'center', 'rgba(0,0,0,0.8)');
  ctx.globalAlpha = 1;
}

function drawTitle(g, ctx) {
  const { w, h } = g.view;
  const pw = Math.min(w - 12, 430);
  let ts = Math.max(3, Math.min(7, Math.floor((pw - 14) / 41)));
  ts = Math.min(ts, Math.max(3, Math.floor((h - 140) / 16)));
  const lineH = 8 * ts;
  const ph = Math.min(h - 12, lineH * 2 + 140);
  const px = Math.round((w - pw) / 2);
  const py = Math.round((h - ph) / 2);

  ctx.fillStyle = 'rgba(5, 7, 17, 0.9)';
  ctx.fillRect(px, py, pw, ph);
  ctx.strokeStyle = 'rgba(44, 74, 143, 0.9)';
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
  ctx.strokeStyle = 'rgba(61, 242, 255, 0.22)';
  ctx.strokeRect(px + 4.5, py + 4.5, pw - 9, ph - 9);

  // corner accents
  ctx.strokeStyle = COL.pink;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px + 5, py + 12);
  ctx.lineTo(px + 5, py + 5);
  ctx.lineTo(px + 12, py + 5);
  ctx.moveTo(px + pw - 12, py + ph - 5);
  ctx.lineTo(px + pw - 5, py + ph - 5);
  ctx.lineTo(px + pw - 5, py + ph - 12);
  ctx.stroke();

  const cx = w / 2;
  let y = py + 12;
  drawText(ctx, 'NEON', cx, y, ts, COL.cyan, 'center', 'rgba(4, 72, 91, 0.9)');
  y += lineH;
  drawText(ctx, 'RAMPAGE', cx, y, ts, COL.pink, 'center', 'rgba(88, 9, 47, 0.9)');
  y += lineH + 3;

  const subScale = measureText('TWIN-STICK SURVIVAL', 2) <= pw - 24 ? 2 : 1;
  drawText(ctx, 'TWIN-STICK SURVIVAL', cx, y, subScale, COL.gold, 'center');
  y += 7 * subScale + 6;

  ctx.strokeStyle = 'rgba(72, 100, 172, 0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px + 22, y + 2.5);
  ctx.lineTo(px + pw - 22, y + 2.5);
  ctx.stroke();
  y += 8;

  drawText(ctx, 'HI ' + pad(g.high, 6), cx, y, 1, COL.dim, 'center');
  y += 13;

  const prompt = handheld(g) ? 'TAP OR ENTER' : 'PRESS ENTER';
  const ps = measureText(prompt, 2) <= pw - 20 ? 2 : 1;
  const blinkOn = Math.floor(g.time * 2.2) % 2 === 0;
  ctx.globalAlpha = blinkOn ? 1 : 0.42;
  drawText(ctx, prompt, cx, y, ps, COL.white, 'center', 'rgba(0,0,0,0.8)');
  ctx.globalAlpha = 1;
  y += 7 * ps + 8;

  const coarse = handheld(g);
  const tiny = pw < 165;
  const lines = coarse
    ? ['LEFT THUMB  MOVE', 'RIGHT THUMB  AIM + FIRE', tiny ? 'RESCUE THE CIVILIANS' : 'TOUCH CIVILIANS TO RESCUE']
    : ['WASD / LEFT STICK  MOVE', 'MOUSE / ARROWS  SHOOT', tiny ? 'RESCUE THE CIVILIANS' : 'TOUCH CIVILIANS TO RESCUE'];
  for (const line of lines) {
    drawText(ctx, line, cx, y, 1, '#9fb0d8', 'center');
    y += 9;
  }

  if (y + 7 < py + ph - 4) {
    drawText(ctx, 'SURVIVE  •  RESCUE  •  REPEAT', cx, py + ph - 12, 1, COL.faint, 'center');
  }
}

function drawPause(g, ctx) {
  const { w, h } = g.view;
  ctx.fillStyle = 'rgba(3, 5, 12, 0.8)';
  ctx.fillRect(0, 0, w, h);

  const pw = Math.min(w - 20, 330);
  const scale = clamp(Math.floor((w - 40) / 36), 3, 6);
  const ph = Math.min(h - 20, 50 + 7 * scale + 38);
  const px = (w - pw) / 2;
  const py = (h - ph) / 2;
  ctx.fillStyle = 'rgba(8, 12, 26, 0.92)';
  ctx.fillRect(px, py, pw, ph);
  ctx.strokeStyle = 'rgba(61, 242, 255, 0.4)';
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);

  drawText(ctx, 'PAUSED', w / 2, py + 12, scale, COL.cyan, 'center', 'rgba(0,0,0,0.8)');
  let y = py + 18 + 7 * scale;
  drawText(ctx, `WAVE ${pad(g.wave)}   SCORE ${pad(g.score, 6)}`, w / 2, y, 1, COL.dim, 'center');
  y += 14;
  const prompt = handheld(g) ? 'TAP TO RESUME' : 'P / ESC / TAP TO RESUME';
  drawText(ctx, prompt, w / 2, y, 1, COL.white, 'center');
  y += 11;
  drawText(ctx, 'M  SOUND: ' + (g.sfx.muted ? 'OFF' : 'ON'), w / 2, y, 1, g.sfx.muted ? COL.pink : COL.green, 'center');
}

function drawGameOver(g, ctx) {
  const { w, h } = g.view;
  ctx.fillStyle = 'rgba(3, 4, 10, 0.82)';
  ctx.fillRect(0, 0, w, h);

  const pw = Math.min(w - 16, 340);
  let ts = clamp(Math.floor((pw - 20) / 54), 2, 5);
  const ph = Math.min(h - 18, 150 + 7 * ts);
  const px = Math.round((w - pw) / 2);
  const py = Math.round((h - ph) / 2);

  ctx.fillStyle = 'rgba(10, 5, 18, 0.94)';
  ctx.fillRect(px, py, pw, ph);
  ctx.strokeStyle = 'rgba(255, 61, 139, 0.55)';
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
  ctx.strokeStyle = 'rgba(255, 61, 139, 0.16)';
  ctx.strokeRect(px + 4.5, py + 4.5, pw - 9, ph - 9);

  drawText(ctx, 'GAME OVER', w / 2, py + 12, ts, COL.pink, 'center', 'rgba(60, 0, 26, 0.9)');
  let y = py + 12 + 7 * ts + 7;

  drawText(ctx, 'FINAL SCORE', w / 2, y, 1, COL.dim, 'center');
  y += 8;
  drawText(ctx, pad(g.score, 6), w / 2, y, 3, COL.white, 'center', 'rgba(0,0,0,0.8)');
  y += 24;

  if (g.newHigh) {
    const blink = Math.floor(g.time * 3) % 2 === 0;
    ctx.globalAlpha = blink ? 1 : 0.45;
    drawText(ctx, 'NEW HIGH SCORE!', w / 2, y, 1, COL.gold, 'center');
    ctx.globalAlpha = 1;
  } else {
    drawText(ctx, 'BEST ' + pad(g.high, 6), w / 2, y, 1, COL.dim, 'center');
  }
  y += 12;

  drawText(ctx, `WAVE ${pad(g.wave)}    KILLS ${pad(g.kills, 3)}`, w / 2, y, 1, '#9fb0d8', 'center');
  y += 9;
  drawText(ctx, `RESCUED ${pad(g.rescued, 2)}`, w / 2, y, 1, COL.gold, 'center');
  y += 15;

  const prompt = handheld(g) ? 'TAP TO REDEPLOY' : 'ENTER OR TAP TO REDEPLOY';
  const ps = measureText(prompt, 2) <= pw - 16 ? 2 : 1;
  const blinkOn = Math.floor(g.time * 2.2) % 2 === 0;
  ctx.globalAlpha = blinkOn ? 1 : 0.45;
  drawText(ctx, prompt, w / 2, y, ps, COL.white, 'center', 'rgba(0,0,0,0.8)');
  ctx.globalAlpha = 1;

  if (!handheld(g) && y + 7 * ps + 9 < py + ph - 3) {
    drawText(ctx, 'R TO RETRY', w / 2, py + ph - 11, 1, COL.faint, 'center');
  }
}

function drawTouch(g, ctx) {
  const input = g.input;
  if (!input) return;
  const radius = input.stickRadius();
  const { w, h } = g.view;
  const active = [];

  for (const side of ['move', 'aim']) {
    const s = input.sticks[side];
    if (!s) continue;
    active.push(side);
    const color = side === 'move' ? COL.cyan : COL.pink;
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(s.baseX, s.baseY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(s.baseX, s.baseY, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.22;
    ctx.beginPath();
    ctx.arc(s.baseX, s.baseY, radius * 0.55, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(s.knobX, s.knobY, Math.max(5, radius * 0.32), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  if (!handheld(g)) return;
  const ghostY = h - radius - 16;
  const leftX = Math.max(radius + 8, w * 0.16);
  const rightX = Math.min(w - radius - 8, w * 0.84);
  const ghosts = [
    ['move', leftX, 'MOVE'],
    ['aim', rightX, 'AIM + FIRE'],
  ];
  for (const [side, x, label] of ghosts) {
    if (active.includes(side)) continue;
    const color = side === 'move' ? COL.cyan : COL.pink;
    ctx.globalAlpha = 0.13;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, ghostY, radius * 0.82, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.32;
    drawText(ctx, label, side === 'move' ? 8 : w - 8, h - 9, 1, color, side === 'move' ? 'left' : 'right');
    ctx.globalAlpha = 1;
  }
}

