import { renderGame } from './render.js';

const PAD = (n, width = 2) => String(Math.max(0, Math.floor(n))).padStart(width, '0');
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rand = (a, b) => a + Math.random() * (b - a);
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

const PLAYER_SPEED = 86;
const BULLET_SPEED = 265;
const FIRE_INTERVAL = 0.095;
const HIGH_KEY = 'neon-rampage-high';
// The HUD owns the top strip of the arena; entities never hide underneath it.
const ARENA_TOP = 40;

const ENEMIES = {
  grunt: { r: 3.8, hp: 1, speed: 36, score: 100, color: '#ff3b57' },
  hulk: { r: 5.8, hp: 6, speed: 19, score: 500, color: '#ff9b2f' },
  spheroid: { r: 4.8, hp: 4, speed: 23, score: 300, color: '#b45cff' },
  brain: { r: 3.9, hp: 2, speed: 44, score: 300, color: '#ff5fd2' },
};

function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export class Game {
  constructor(canvas, input, sfx) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.ctx.imageSmoothingEnabled = false;
    this.input = input;
    this.sfx = sfx;
    this.view = { w: 480, h: 300, scale: 3, art: 1 };
    this.state = 'title';
    this.time = 0;
    this.shake = 0;
    this.flash = 0;
    this.flashColor = '#ffffff';
    this.high = 0;
    this.newHigh = false;
    try {
      this.high = Number(localStorage.getItem(HIGH_KEY)) || 0;
    } catch {}

    this.score = 0;
    this.lives = 3;
    this.wave = 0;
    this.kills = 0;
    this.rescued = 0;
    this.rescuedThisWave = 0;
    this.nextLife = 15000;
    this.waveState = 'idle';
    this.waveTimer = 0;
    this.pending = [];
    this.spawnTimer = 0;
    this.banner = null;

    this.player = this.makePlayer();
    this.bullets = [];
    this.enemies = [];
    this.humans = [];
    this.particles = [];
    this.texts = [];
    this.ambient = [];
    this.stars = [];

    this.makeAmbient();
    this.makeStars();
  }

  makePlayer() {
    return {
      x: this.view.w / 2,
      y: (ARENA_TOP + this.view.h) / 2,
      r: 3.4,
      aimX: 1,
      aimY: 0,
      dead: false,
      respawnT: 0,
      invuln: 0,
      fireCd: 0,
      muzzle: 0,
    };
  }

  makeStars() {
    const rng = makeRng(90210);
    const count = Math.round((this.view.w * this.view.h) / 5200);
    this.stars = [];
    for (let i = 0; i < count; i++) {
      this.stars.push({
        x: Math.floor(rng() * this.view.w),
        y: Math.floor(rng() * this.view.h),
        a: 0.1 + rng() * 0.28,
        c: rng() < 0.22 ? '#ff3d8b' : '#3df2ff',
      });
    }
  }

  makeAmbient() {
    const types = ['grunt', 'grunt', 'grunt', 'hulk', 'spheroid', 'brain', 'human', 'human'];
    const count = clamp(Math.round((this.view.w * this.view.h) / 14000), 7, 18);
    this.ambient = [];
    for (let i = 0; i < count; i++) {
      this.ambient.push({
        type: types[Math.floor(Math.random() * types.length)],
        x: rand(12, this.view.w - 12),
        y: rand(12, this.view.h - 12),
        vx: rand(-9, 9),
        vy: rand(-7, 7),
        phase: rand(0, Math.PI * 2),
      });
    }
  }

  setView(view) {
    const old = this.view;
    this.view = view;
    if (this.input) this.input.setView(view);
    const w = view.w;
    const h = view.h;
    if (old.w !== w || old.h !== h) {
      this.makeStars();
      if (this.state === 'title') this.makeAmbient();
    }
    const px = clamp(this.player.x, 8, w - 8);
    const py = clamp(this.player.y, ARENA_TOP + 4, h - 8);
    this.player.x = px;
    this.player.y = py;
    for (const e of this.enemies) {
      e.x = clamp(e.x, 8, w - 8);
      e.y = clamp(e.y, ARENA_TOP + 8, h - 8);
    }
    for (const b of this.bullets) {
      b.x = clamp(b.x, 0, w);
      b.y = clamp(b.y, 0, h);
    }
    for (const hm of this.humans) {
      hm.x = clamp(hm.x, 10, w - 10);
      hm.y = clamp(hm.y, ARENA_TOP + 8, h - 10);
    }
    for (const p of this.particles) {
      p.x = clamp(p.x, 0, w);
      p.y = clamp(p.y, 0, h);
    }
    for (const a of this.ambient) {
      a.x = clamp(a.x, 8, w - 8);
      a.y = clamp(a.y, 8, h - 8);
    }
  }

  syncInput() {
    if (!this.input) return;
    this.input.setEnabled(this.state === 'playing');
  }

  // ---------- state ----------

  startRun() {
    this.sfx.ensure();
    this.state = 'playing';
    this.time = 0;
    this.shake = 0;
    this.score = 0;
    this.lives = 3;
    this.wave = 0;
    this.kills = 0;
    this.rescued = 0;
    this.rescuedThisWave = 0;
    this.nextLife = 15000;
    this.newHigh = false;
    this.waveState = 'idle';
    this.waveTimer = 0;
    this.pending = [];
    this.spawnTimer = 0;
    this.banner = null;
    this.bullets = [];
    this.enemies = [];
    this.humans = [];
    this.particles = [];
    this.texts = [];
    this.player = this.makePlayer();
    this.player.invuln = 1.4;
    this.syncInput();
    this.startWave();
  }

  startWave() {
    this.wave += 1;
    this.waveState = 'fight';
    this.waveTimer = 0;
    this.pending = this.buildWave(this.wave);
    this.spawnTimer = 1.0;
    this.spawnInterval = Math.max(0.26, 0.56 - this.wave * 0.012);
    this.maxAlive = Math.max(11, Math.round(Math.min(30, 17 + this.wave) * this.density()));
    this.rescuedThisWave = 0;
    this.enemies = [];
    this.bullets = [];
    this.humans = [];
    for (const h of this.spawnHumans()) this.humans.push(h);
    this.banner = {
      title: `WAVE ${PAD(this.wave)}`,
      sub: this.wave === 1 ? 'RESCUE THE CIVILIANS' : `${this.pending.length} HOSTILES INBOUND`,
      t: 0,
      life: 1.7,
      color: '#3df2ff',
    };
    this.sfx.wave();
  }

  density() {
    return clamp(Math.sqrt((this.view.w * this.view.h) / 144000), 0.68, 1.1);
  }

  buildWave(n) {
    const d = this.density();
    const list = [];
    const grunts = Math.max(6, Math.round((8 + n * 2) * d));
    const hulks = n >= 2 ? clamp(Math.round((1 + Math.floor((n - 2) / 2)) * d), 1, 6) : 0;
    const spheroids = n >= 3 ? clamp(Math.round((1 + Math.floor((n - 3) / 4)) * Math.min(1, d + 0.2)), 1, 4) : 0;
    const brains = n >= 4 ? clamp(Math.round((1 + Math.floor((n - 4) / 4)) * Math.min(1, d + 0.2)), 1, 4) : 0;
    for (let i = 0; i < grunts; i++) list.push('grunt');
    for (let i = 0; i < hulks; i++) list.push('hulk');
    for (let i = 0; i < spheroids; i++) list.push('spheroid');
    for (let i = 0; i < brains; i++) list.push('brain');
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  spawnHumans() {
    const count = Math.max(3, Math.round(5 * this.density()));
    const out = [];
    const w = this.view.w;
    const h = this.view.h;
    for (let i = 0; i < count; i++) {
      let best = { x: w / 2, y: h / 2 };
      let bestD = -1;
      for (let tries = 0; tries < 18; tries++) {
        const x = rand(16, w - 16);
        const y = rand(ARENA_TOP + 8, h - 16);
        const d = dist(x, y, this.player.x, this.player.y);
        if (d > bestD) {
          bestD = d;
          best = { x, y };
        }
        if (d > Math.min(70, Math.min(w, h) * 0.34)) break;
      }
      out.push({
        x: best.x,
        y: best.y,
        r: 2.4,
        dead: false,
        dirX: rand(-1, 1),
        dirY: rand(-1, 1),
        wander: rand(0.5, 2.5),
        seed: rand(0, 10),
      });
    }
    return out;
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.syncInput();
    this.sfx.ui();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.syncInput();
    this.sfx.ui();
  }

  endRun() {
    if (this.state === 'gameover') return;
    this.newHigh = this.score > this.high;
    this.high = Math.max(this.high, this.score);
    try {
      localStorage.setItem(HIGH_KEY, String(this.high));
    } catch {}
    this.state = 'gameover';
    this.syncInput();
    this.shake = 5;
    this.sfx.gameOver();
  }

  handleAction(action) {
    if (action === 'mute') {
      this.sfx.ensure();
      this.sfx.toggle();
      return;
    }
    if (action === 'pause') {
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused') this.resume();
      return;
    }
    if (action === 'restart') {
      if (this.state === 'gameover') this.startRun();
      return;
    }
    if (action === 'start') {
      if (this.state === 'title' || this.state === 'gameover') this.startRun();
      else if (this.state === 'playing') this.pause();
      else if (this.state === 'paused') this.resume();
    }
  }

  uiButtons() {
    const list = [];
    const w = this.view.w;
    const h = this.view.h;
    if (this.state === 'playing' || this.state === 'paused') {
      const small = w < 320;
      const y = small ? 23 : 20;
      list.push({ id: 'mute', x: w - 38, y, w: 14, h: 14 });
      list.push({ id: 'pause', x: w - 20, y, w: 14, h: 14 });
    } else if (this.state === 'title' || this.state === 'gameover') {
      list.push({ id: 'mute', x: w - 20, y: h - 20, w: 14, h: 14 });
    }
    return list;
  }

  handleUiTap(x, y) {
    for (const b of this.uiButtons()) {
      if (x >= b.x - 4 && x <= b.x + b.w + 4 && y >= b.y - 4 && y <= b.y + b.h + 4) {
        if (b.id === 'pause') {
          if (this.state === 'paused') this.resume();
          else this.pause();
        } else if (b.id === 'mute') {
          this.sfx.ensure();
          this.sfx.toggle();
        }
        return true;
      }
    }
    if (this.state === 'title' || this.state === 'gameover') {
      this.startRun();
      return true;
    }
    if (this.state === 'paused') {
      this.resume();
      return true;
    }
    return false;
  }

  // ---------- update ----------

  update(dt) {
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 30);
    if (this.input) {
      for (const action of this.input.actions.splice(0)) this.handleAction(action);
    }
    if (this.state === 'title') {
      this.updateAmbient(dt);
      this.updateEffects(dt);
      this.updateBanner(dt);
    } else if (this.state === 'playing') {
      this.updatePlaying(dt);
      this.updateBanner(dt);
    } else if (this.state === 'gameover') {
      this.updateEffects(dt * 0.35);
      this.updateBanner(dt);
    }
  }

  updateBanner(dt) {
    if (!this.banner) return;
    this.banner.t += dt;
    if (this.banner.t > this.banner.life + 0.5) this.banner = null;
  }

  updatePlaying(dt) {
    this.waveTimer += dt;

    if (this.waveState === 'fight') {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.pending.length && this.enemies.length < this.maxAlive) {
        this.spawnEnemy(this.pending.shift());
        this.spawnTimer = this.spawnInterval;
      }
    }

    this.updatePlayer(dt);
    this.updateBullets(dt);
    this.updateEnemies(dt);
    this.updateHumans(dt);
    this.collideBullets();
    this.collidePlayer();
    this.collideHumans();
    this.separateEnemies();
    this.updateEffects(dt);
    this.enemies = this.enemies.filter((e) => !e.dead);
    this.humans = this.humans.filter((h) => !h.dead);

    if (
      this.waveState === 'fight' &&
      this.pending.length === 0 &&
      this.enemies.length === 0
    ) {
      this.clearWave();
    }

    if (this.waveState === 'clear') {
      if (this.waveTimer > 2.3 && !this.player.dead) {
        this.startWave();
      }
    }
  }

  updateAmbient(dt) {
    const w = this.view.w;
    const h = this.view.h;
    for (const a of this.ambient) {
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      if (a.x < 8) {
        a.x = 8;
        a.vx = Math.abs(a.vx);
      }
      if (a.x > w - 8) {
        a.x = w - 8;
        a.vx = -Math.abs(a.vx);
      }
      if (a.y < 8) {
        a.y = 8;
        a.vy = Math.abs(a.vy);
      }
      if (a.y > h - 8) {
        a.y = h - 8;
        a.vy = -Math.abs(a.vy);
      }
      a.phase += dt;
    }
  }

  updateEffects(dt) {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const drag = Math.max(0, 1 - dt * 2.6);
      p.vx *= drag;
      p.vy *= drag;
    }
    for (const t of this.texts) {
      t.life -= dt;
      t.y -= 15 * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    this.texts = this.texts.filter((t) => t.life > 0);
  }

  addScore(n) {
    this.score += n;
    while (this.score >= this.nextLife) {
      this.lives = Math.min(9, this.lives + 1);
      this.nextLife += 25000;
      this.showText('EXTRA LIFE', this.player.x, this.player.y - 14, '#7cffb2', 2.4);
      this.sfx.extra();
    }
  }

  showText(text, x, y, color = '#ffffff', life = 0.9) {
    this.texts.push({ text, x, y, color, life, maxLife: life });
  }

  // ---------- player ----------

  updatePlayer(dt) {
    const p = this.player;
    if (p.dead) {
      p.respawnT -= dt;
      if (p.respawnT <= 0) {
        if (this.lives > 0) this.respawn();
        else this.endRun();
      }
      return;
    }

    p.invuln = Math.max(0, p.invuln - dt);
    p.fireCd = Math.max(0, p.fireCd - dt);
    p.muzzle = Math.max(0, p.muzzle - dt);

    const input = this.input;
    const w = this.view.w;
    const h = this.view.h;
    if (input) {
      p.x += input.move.x * PLAYER_SPEED * dt;
      p.y += input.move.y * PLAYER_SPEED * dt;

      let aim = input.aimDir;
      if (!aim && input.mouse.active) {
        const dx = input.mouse.x - p.x;
        const dy = input.mouse.y - p.y;
        const m = Math.hypot(dx, dy);
        if (m > 2) aim = { x: dx / m, y: dy / m };
      }
      if (aim) {
        const m = Math.hypot(aim.x, aim.y) || 1;
        p.aimX = aim.x / m;
        p.aimY = aim.y / m;
      }
      if (input.firing) this.shoot();
    }
    p.x = clamp(p.x, 7, w - 7);
    p.y = clamp(p.y, ARENA_TOP + 5, h - 8);

    for (let i = this.humans.length - 1; i >= 0; i--) {
      const hm = this.humans[i];
      if (dist(p.x, p.y, hm.x, hm.y) < p.r + hm.r + 2.5) {
        this.rescueHuman(hm, 1000);
        this.humans.splice(i, 1);
      }
    }
  }

  shoot() {
    const p = this.player;
    if (p.fireCd > 0 || p.dead) return;
    p.fireCd = FIRE_INTERVAL;
    p.muzzle = 0.055;
    const ax = p.aimX;
    const ay = p.aimY;
    const x = p.x + ax * 5;
    const y = p.y + ay * 5;
    if (this.bullets.length < 80) {
      this.bullets.push({
        x,
        y,
        vx: ax * BULLET_SPEED,
        vy: ay * BULLET_SPEED,
        life: 0.92,
        r: 1.5,
        dead: false,
      });
    }
    this.spawnParticles(x, y, '#aefbff', 2, { speed: 24, life: 0.12, size: 1 });
    this.sfx.shoot();
  }

  respawn() {
    const p = this.player;
    p.dead = false;
    p.x = this.view.w / 2;
    p.y = (ARENA_TOP + this.view.h) / 2;
    p.invuln = 2.6;
    p.fireCd = 0;
    p.respawnT = 0;
    for (const e of this.enemies) {
      const d = dist(e.x, e.y, p.x, p.y);
      if (d < 58) {
        const m = d || 1;
        e.x = clamp(p.x + ((e.x - p.x) / m) * 64, 8, this.view.w - 8);
        e.y = clamp(p.y + ((e.y - p.y) / m) * 64, ARENA_TOP + 8, this.view.h - 8);
      }
    }
    this.spawnParticles(p.x, p.y, '#3df2ff', 18, { speed: 75, life: 0.6, size: 1 });
  }

  playerDie() {
    const p = this.player;
    if (p.dead || p.invuln > 0) return;
    p.dead = true;
    p.respawnT = 1.35;
    this.lives = Math.max(0, this.lives - 1);
    this.shake = 10;
    this.spawnParticles(p.x, p.y, '#3df2ff', 26, { speed: 105, life: 0.85, size: 2 });
    this.spawnParticles(p.x, p.y, '#ff3d8b', 18, { speed: 70, life: 0.7, size: 1 });
    this.sfx.death();
  }

  respawnBlocked() {}

  // ---------- enemies ----------

  spawnEnemy(type, at) {
    const def = ENEMIES[type];
    const pos = at || this.edgeSpawn();
    let hp = def.hp;
    if (type === 'hulk') hp += Math.floor(this.wave / 4);
    if (type === 'spheroid') hp += Math.floor(this.wave / 7);
    if (type === 'brain') hp += Math.floor(this.wave / 9);
    const speed = def.speed * (1 + Math.min(0.48, this.wave * 0.016));
    const e = {
      type,
      x: pos.x,
      y: pos.y,
      r: def.r,
      hp,
      maxHp: hp,
      speed,
      score: def.score,
      color: def.color,
      spawnT: at ? 0.22 : 0.55,
      hitFlash: 0,
      dead: false,
      seed: rand(0, 100),
      spawnCd: rand(1.6, 2.8),
      spawned: 0,
      wp: null,
    };
    this.enemies.push(e);
    return e;
  }

  edgeSpawn() {
    const w = this.view.w;
    const h = this.view.h;
    const m = 10;
    const top = ARENA_TOP + 6;
    const minD = Math.min(75, Math.min(w, h) * 0.3);
    let pick = { x: m, y: top };
    let best = -1;
    for (let i = 0; i < 14; i++) {
      const side = Math.floor(Math.random() * 4);
      let x;
      let y;
      if (side === 0) {
        x = rand(m, w - m);
        y = top;
      } else if (side === 1) {
        x = w - m;
        y = rand(top, h - m);
      } else if (side === 2) {
        x = rand(m, w - m);
        y = h - m;
      } else {
        x = m;
        y = rand(top, h - m);
      }
      const d = dist(x, y, this.player.x, this.player.y);
      if (d > best) {
        best = d;
        pick = { x, y };
      }
      if (d > minD) break;
    }
    return pick;
  }

  updateBullets(dt) {
    const w = this.view.w;
    const h = this.view.h;
    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < -5 || b.x > w + 5 || b.y < -5 || b.y > h + 5) b.dead = true;
    }
    this.bullets = this.bullets.filter((b) => !b.dead);
  }

  updateEnemies(dt) {
    const p = this.player;
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e.spawnT > 0) {
        e.spawnT -= dt;
        if (e.spawnT <= 0) {
          e.spawnT = 0;
          this.spawnParticles(e.x, e.y, e.color, 7, { speed: 45, life: 0.35, size: 1 });
        }
        continue;
      }
      e.hitFlash = Math.max(0, e.hitFlash - dt);
      let tx = p.x;
      let ty = p.y;

      if (e.type === 'brain') {
        let bestD = Infinity;
        let mark = null;
        for (const hm of this.humans) {
          if (hm.dead) continue;
          const d = dist(e.x, e.y, hm.x, hm.y);
          if (d < bestD) {
            bestD = d;
            mark = hm;
            tx = hm.x;
            ty = hm.y;
          }
        }
        if (!mark) {
          tx = p.x;
          ty = p.y;
        } else if (bestD < e.r + 3) {
          this.killHuman(mark);
        }
      } else if (e.type === 'spheroid') {
        if (!e.wp || dist(e.x, e.y, e.wp.x, e.wp.y) < 7) {
          e.wp = { x: rand(14, this.view.w - 14), y: rand(ARENA_TOP + 8, this.view.h - 14) };
        }
        tx = e.wp.x;
        ty = e.wp.y;
        e.spawnCd -= dt;
        if (e.spawnCd <= 0 && e.spawned < 3) {
          e.spawnCd = 2.5;
          e.spawned++;
          for (let i = 0; i < 2; i++) {
            const ang = rand(0, Math.PI * 2);
            const at = {
              x: clamp(e.x + Math.cos(ang) * 9, 8, this.view.w - 8),
              y: clamp(e.y + Math.sin(ang) * 9, ARENA_TOP + 8, this.view.h - 8),
            };
            const spawned = this.spawnEnemy('grunt', at);
            spawned.speed *= 0.92;
          }
          this.spawnParticles(e.x, e.y, '#b45cff', 6, { speed: 35, life: 0.4, size: 1 });
        }
      }

      let dx = tx - e.x;
      let dy = ty - e.y;
      const d = Math.hypot(dx, dy) || 1;
      dx /= d;
      dy /= d;

      if (e.type === 'grunt') {
        const wob = Math.sin(this.time * 7 + e.seed) * 0.38;
        const nx = -dy;
        const ny = dx;
        e.x += (dx + nx * wob) * e.speed * dt;
        e.y += (dy + ny * wob) * e.speed * dt;
      } else if (e.type === 'brain') {
        const boost = this.humans.length === 0 ? 1.22 : 1;
        e.x += dx * e.speed * boost * dt;
        e.y += dy * e.speed * boost * dt;
      } else {
        e.x += dx * e.speed * dt;
        e.y += dy * e.speed * dt;
      }

      e.x = clamp(e.x, e.r + 4, this.view.w - e.r - 4);
      e.y = clamp(e.y, ARENA_TOP + e.r + 3, this.view.h - e.r - 4);
    }
    this.enemies = this.enemies.filter((e) => !e.dead);
  }

  separateEnemies() {
    const arr = this.enemies;
    for (let i = 0; i < arr.length; i++) {
      const a = arr[i];
      if (a.spawnT > 0 || a.dead) continue;
      for (let j = i + 1; j < arr.length; j++) {
        const b = arr[j];
        if (b.spawnT > 0 || b.dead) continue;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const min = a.r + b.r;
        if (d > 0.0001 && d < min) {
          const push = ((min - d) / d) * 0.36;
          dx *= push;
          dy *= push;
          a.x -= dx;
          a.y -= dy;
          b.x += dx;
          b.y += dy;
        }
      }
    }
  }

  killEnemy(e) {
    if (e.dead) return;
    e.dead = true;
    this.kills += 1;
    this.addScore(e.score);
    this.shake = Math.max(this.shake, e.type === 'hulk' ? 5 : 2.5);
    this.spawnParticles(e.x, e.y, e.color, e.type === 'hulk' ? 22 : 13, {
      speed: e.type === 'hulk' ? 85 : 60,
      life: 0.6,
      size: e.type === 'hulk' ? 2 : 1,
    });
    if (e.score >= 300) this.showText(`+${e.score}`, e.x, e.y - 6, e.color, 0.8);
    this.sfx.explode();
  }

  // ---------- humans / collision ----------

  updateHumans(dt) {
    const w = this.view.w;
    const h = this.view.h;
    for (const hm of this.humans) {
      if (hm.dead) continue;
      let near = null;
      let nd = Infinity;
      for (const e of this.enemies) {
        if (e.spawnT > 0 || e.dead) continue;
        const d = dist(hm.x, hm.y, e.x, e.y);
        if (d < nd) {
          nd = d;
          near = e;
        }
      }
      if (near && nd < 38) {
        const dx = hm.x - near.x;
        const dy = hm.y - near.y;
        const m = Math.hypot(dx, dy) || 1;
        hm.x += (dx / m) * 24 * dt;
        hm.y += (dy / m) * 24 * dt;
      } else {
        hm.wander -= dt;
        if (hm.wander <= 0) {
          hm.wander = rand(0.8, 2.6);
          const a = rand(0, Math.PI * 2);
          hm.dirX = Math.cos(a);
          hm.dirY = Math.sin(a);
        }
        hm.x += hm.dirX * 7 * dt;
        hm.y += hm.dirY * 7 * dt;
      }
      if (hm.x < 10 || hm.x > w - 10) hm.dirX *= -1;
      if (hm.y < ARENA_TOP + 8 || hm.y > h - 10) hm.dirY *= -1;
      hm.x = clamp(hm.x, 10, w - 10);
      hm.y = clamp(hm.y, ARENA_TOP + 8, h - 10);
    }
  }

  rescueHuman(hm, points, options = {}) {
    if (hm.dead) return;
    hm.dead = true;
    this.rescued += 1;
    this.rescuedThisWave += 1;
    this.addScore(points);
    this.spawnParticles(hm.x, hm.y, '#ffd23f', 10, { speed: 45, life: 0.5, size: 1 });
    this.spawnParticles(hm.x, hm.y, '#ffffff', 4, { speed: 30, life: 0.35, size: 1 });
    if (!options.silent) {
      this.showText(`+${points}`, hm.x, hm.y - 7, '#ffd23f', 0.9);
      this.sfx.rescue();
    }
  }

  killHuman(hm) {
    if (hm.dead) return;
    hm.dead = true;
    this.spawnParticles(hm.x, hm.y, '#ff5f7a', 12, { speed: 50, life: 0.55, size: 1 });
    this.spawnParticles(hm.x, hm.y, '#ffd23f', 5, { speed: 35, life: 0.4, size: 1 });
    this.sfx.hit();
  }

  collideBullets() {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      if (b.dead) continue;
      for (const e of this.enemies) {
        if (e.dead || e.spawnT > 0) continue;
        if (dist(b.x, b.y, e.x, e.y) < b.r + e.r) {
          b.dead = true;
          e.hp -= 1;
          e.hitFlash = 0.09;
          this.spawnParticles(b.x, b.y, e.color, 3, { speed: 30, life: 0.25, size: 1 });
          this.sfx.hit();
          if (e.hp <= 0) this.killEnemy(e);
          break;
        }
      }
    }
    this.bullets = this.bullets.filter((b) => !b.dead);
  }

  collidePlayer() {
    const p = this.player;
    if (p.dead || p.invuln > 0) return;
    for (const e of this.enemies) {
      if (e.dead || e.spawnT > 0) continue;
      if (dist(p.x, p.y, e.x, e.y) < p.r + e.r) {
        this.playerDie();
        break;
      }
    }
  }

  collideHumans() {
    for (const hm of this.humans) {
      if (hm.dead) continue;
      for (const e of this.enemies) {
        if (e.dead || e.spawnT > 0) continue;
        if (dist(hm.x, hm.y, e.x, e.y) < hm.r + e.r) {
          this.killHuman(hm);
          break;
        }
      }
    }
  }

  clearWave() {
    this.waveState = 'clear';
    this.waveTimer = 0;
    let evac = 0;
    for (const hm of this.humans) {
      if (hm.dead) continue;
      evac += 1;
      this.rescueHuman(hm, 250, { silent: true });
    }
    if (evac) this.sfx.rescue();
    const bonus = 500 + this.wave * 100 + this.rescuedThisWave * 250;
    this.addScore(bonus);
    this.banner = {
      title: 'WAVE CLEAR',
      sub: `BONUS +${bonus}`,
      t: 0,
      life: 2.2,
      color: '#ffd23f',
    };
    this.shake = Math.max(this.shake, 2);
  }

  // ---------- particles ----------

  spawnParticles(x, y, color, count, opts = {}) {
    const speed = opts.speed || 50;
    const life = opts.life || 0.5;
    const size = opts.size || 1;
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(speed * 0.25, speed);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: rand(life * 0.45, life),
        maxLife: life,
        color,
        size: Math.random() < 0.25 ? size + 1 : size,
      });
    }
    if (this.particles.length > 500) this.particles.splice(0, this.particles.length - 500);
  }

  // ---------- render ----------

  render() {
    renderGame(this, this.ctx);
  }
}
