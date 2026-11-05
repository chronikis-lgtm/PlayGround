// Hand-authored pixel sprites, rendered once into offscreen canvases.
const DEFS = {
  player: {
    palette: { C: '#3df2ff', W: '#f4feff', D: '#12647c', K: '#06222d' },
    rows: [
      '...CCC...',
      '..CCCCC..',
      '..CWWWC..',
      '..CWWWC..',
      '.CCCCCCC.',
      'CC.CCC.CC',
      '...CCC...',
      '..CC.CC..',
      '.CC...CC.',
    ],
  },
  grunt: {
    palette: { R: '#ff3b57', W: '#ffe9ec', D: '#8c1024', K: '#3d0710' },
    rows: [
      '..RRRR..',
      '.RRRRRR.',
      'RR.WW.RR',
      'RR.RR.RR',
      'RRRRRRRR',
      '.RRRRRR.',
      '.R.RR.R.',
      'DR...RRD',
    ],
  },
  hulk: {
    palette: { H: '#ff9b2f', W: '#fff3d6', D: '#9c4a09', K: '#3d1c02' },
    rows: [
      '....HHHH....',
      '...HHHHHH...',
      '..HHWHHHWHH.',
      '.HHHHHHHHHH.',
      'DHHHHHHHHHHD',
      'HHHHHHHHHHHH',
      'HH.HHHHHH.HH',
      '.HHHHHHHHHH.',
      '..HH.HH.HH..',
      '..H..H..H...',
      '.DH...H...HD',
    ],
  },
  spheroid: {
    palette: { P: '#b45cff', W: '#f4dcff', D: '#5a1a91', K: '#210738' },
    rows: [
      '...PPPP...',
      '..PPPPPP..',
      '.PPDWWDPP.',
      '.PPWWWWPP.',
      'PPDWWWWDPP',
      'PPDWWWWDPP',
      '.PPWWWWPP.',
      '.PPDWWDPP.',
      '..PPPPPP..',
      '...PPPP...',
    ],
  },
  brain: {
    palette: { B: '#ff5fd2', W: '#ffe3f8', D: '#8f166f', K: '#390428' },
    rows: [
      '...BBBB...',
      '..BBBBBB..',
      '.BWBBBBWB.',
      '.BBWBBWBB.',
      'BBBBBBBBBB',
      '.BBBBBBBB.',
      '..BBBBBB..',
      '..B.BB.B..',
      '.B..BB..B.',
    ],
  },
  human: {
    palette: { W: '#eef6ff', Y: '#ffd23f', B: '#7cc6ff', K: '#5b4a12' },
    rows: [
      '..W..',
      '..W..',
      '.YYY.',
      '.YWY.',
      '..Y..',
      '..Y..',
      '..Y..',
      '.B.B.',
    ],
  },
  boss: {
    palette: { M: '#ff2f6d', W: '#fff0f5', D: '#7c0a2e', K: '#2b0210', Y: '#ffd23f' },
    rows: [
      '.....MMMMMM.....',
      '...MMMMMMMMMM...',
      '..MMWWMMMMWWMM..',
      '.MMMWWMMMMWWMMM.',
      '.MMMMMMYYMMMMMM.',
      'MMMMMMYWWYMMMMMM',
      'MMMMMMYYYYMMMMMM',
      'MMMMMMYWWYMMMMMM',
      'MMMMMMMYYMMMMMMM',
      '.MMMMMMMMMMMMMMMM.',
      '..MMMMMMMMMMMMMM..',
      '...MM.MM.MM.MM...',
      '..MM..MM..MM..MM.',
      '.M...MM....MM...M',
      '....M........M...',
    ],
  },
};

function normalizeRows(rows) {
  const width = Math.max(...rows.map((r) => r.length));
  return rows.map((r) => r.padEnd(width, '.'));
}

function makeCanvas(rows, palette, override) {
  const width = rows[0].length;
  const height = rows.length;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ch = rows[y][x];
      if (ch === '.' || ch === ' ') continue;
      const color = override || palette[ch];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return canvas;
}

const SPRITES = {};

function build() {
  for (const [name, def] of Object.entries(DEFS)) {
    const rows = normalizeRows(def.rows);
    SPRITES[name] = {
      normal: makeCanvas(rows, def.palette),
      flash: makeCanvas(rows, def.palette, '#ffffff'),
      width: rows[0].length,
      height: rows.length,
    };
  }
}

build();

export function spriteSize(name) {
  return { width: SPRITES[name].width, height: SPRITES[name].height };
}

export function drawSprite(ctx, name, cx, cy, art = 1, flash = false, alpha = 1) {
  const sprite = SPRITES[name];
  if (!sprite) return;
  const image = flash ? sprite.flash : sprite.normal;
  const w = image.width * art;
  const h = image.height * art;
  const x = Math.round(cx - w / 2);
  const y = Math.round(cy - h / 2);
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = prevAlpha * alpha;
  ctx.drawImage(image, x, y, Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  ctx.globalAlpha = prevAlpha;
}

// A tiny human icon for the HUD, drawn without touching the global transform.
export function drawHumanIcon(ctx, x, y, scale = 1, color = null) {
  const sprite = SPRITES.human;
  const image = color ? makeTinted(sprite.normal, color) : sprite.normal;
  ctx.drawImage(image, Math.round(x), Math.round(y), image.width * scale, image.height * scale);
}

const tintCache = new Map();
function makeTinted(source, color) {
  const key = color;
  if (tintCache.has(key)) return tintCache.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(source, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  tintCache.set(key, canvas);
  return canvas;
}
