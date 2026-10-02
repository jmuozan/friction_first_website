/* Layout per les cartes. Tota la lógica del set up del pdf */

const { PDFDocument, StandardFonts, rgb, degrees,
        pushGraphicsState, popGraphicsState, rectangle, clip, endPath,
        setTextRenderingMode, TextRenderingMode, setLineWidth, setStrokingColor,
        setLineJoin, LineJoinStyle } = PDFLib;

const PT = 72 / 25.4; // points per mm

const CREDITS = "Sofia Llàcer & Jorge Muñoz";
const LICENSE = "CC BY-NC-SA 4.0";

const LOREM = "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod " +
  "tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis " +
  "nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis " +
  "aute irure dolor in reprehenderit in voluptate velit esse cillum dolore.";

// Placeholders until the real card texts exist.
const CARD_TYPES = [
  { id: "casestudy",   name: "Case Study",  back: "imgs/cards/casestudy_back.png",   description: LOREM },
  { id: "confession",  name: "Confession",  back: "imgs/cards/confession_back.png",  description: LOREM },
  { id: "perspective", name: "Perspective", back: "imgs/cards/perspective_back.png", description: LOREM },
  { id: "wildcard",    name: "Wildcard",    back: "imgs/cards/wildcard_back.png",    description: LOREM },
];

const PAPERS = {
  A4:      [210, 297],
  A3:      [297, 420],
  SRA4:    [225, 320],
  SRA3:    [320, 450],
  Letter:  [215.9, 279.4],
  Tabloid: [279.4, 431.8],
};

const CARD_SIZES = {
  "70x100": [70, 100],   
  "63x88":  [63, 88],    // poker
  "70x120": [70, 120],   // tarot
  "44x68":  [44, 68],    // mini
};

const DEFAULTS = {
  qty: { casestudy: 8, confession: 8, perspective: 8, wildcard: 8 },
  cardPreset: "70x100", cardW: 70, cardH: 100,
  paper: "A4", paperW: 210, paperH: 297, orientation: "auto", margin: 5,
  bleed: 3, gutter: 6,
  marks: true, markLen: 5, markOffset: 3, markWeight: 0.25,
  trimOutline: false, slug: true,
  sides: "interleaved", flip: "long",
};

const STORAGE_KEY = "ff-deck-settings";

/* colour helpers */

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb(h, s, l) {
  if (s === 0) return [l, l, l];
  const hue = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3)];
}

// Reads the back artwork to get (a) the colour at its edge, used to fill the
// bleed, and (b) its average ink colour, used to theme the matching front.
function analyseImage(img) {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, c.width, c.height);

  const onPaper = (p) => {
    const a = data[p + 3] / 255;
    return [0, 1, 2].map((k) => data[p + k] * a + 255 * (1 - a));
  };

  // A few px in from the corner, past any hairline frame in the artwork.
  const edge = onPaper((8 * c.width + 8) * 4);

  let r = 0, g = 0, b = 0, n = 0;
  for (let p = 0; p < data.length; p += 4 * 7) {
    if (data[p + 3] < 128) continue; 
    if (Math.min(data[p], data[p + 1], data[p + 2]) > 225) continue;
    r += data[p]; g += data[p + 1]; b += data[p + 2]; n++;
  }
  const [h, s, l] = n ? rgbToHsl(r / n, g / n, b / n) : [0, 0, 0.3];

  return {
    edge: rgb(edge[0] / 255, edge[1] / 255, edge[2] / 255),
    ink: rgb(...hslToRgb(h, s, Math.min(l, 0.32))),
    tint: rgb(...hslToRgb(h, Math.min(s, 0.6), 0.94)),
    aspect: c.width / c.height,
  };
}

/* asset loading*/

async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${url}`));
    img.src = url;
  });
}

async function loadAssets() {
  const [kepler, apfel, ...backs] = await Promise.all([
    fetchBytes("font/kepler/KeplerW01-Italic.ttf"),
    fetchBytes("font/apfelGrotezk/ApfelGrotezk-Regular.otf"),
    ...CARD_TYPES.map(async (t) => {
      const [bytes, img] = await Promise.all([fetchBytes(t.back), loadImage(t.back)]);
      return { id: t.id, bytes, ...analyseImage(img) };
    }),
  ]);
  return { kepler, apfel, backs: Object.fromEntries(backs.map((b) => [b.id, b])) };
}

/* layout */

function paperSize(s, landscape) {
  const [w, h] = s.paper === "custom" ? [s.paperW, s.paperH] : PAPERS[s.paper];
  const short = Math.min(w, h), long = Math.max(w, h);
  return landscape ? [long, short] : [short, long];
}

function gridFor(s, landscape) {
  const [W, H] = paperSize(s, landscape);
  // How far printed things reach beyond the outer trim edges.
  const ext = Math.max(s.bleed, s.marks ? s.markOffset + s.markLen : 0);
  const fit = (avail, size) =>
    Math.max(0, Math.floor((avail - 2 * s.margin - 2 * ext + s.gutter) / (size + s.gutter)));
  return { W, H, landscape, cols: fit(W, s.cardW), rows: fit(H, s.cardH) };
}

function computeLayout(s) {
  if (s.orientation === "portrait") return gridFor(s, false);
  if (s.orientation === "landscape") return gridFor(s, true);
  const p = gridFor(s, false), l = gridFor(s, true);
  return l.cols * l.rows > p.cols * p.rows ? l : p;
}

// Trim rectangle of each slot, in mm from the top-left of the sheet.
function slotRects(layout, s) {
  const { W, H, cols, rows } = layout;
  const blockW = cols * s.cardW + (cols - 1) * s.gutter;
  const blockH = rows * s.cardH + (rows - 1) * s.gutter;
  const x0 = (W - blockW) / 2, y0 = (H - blockH) / 2;
  const rects = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      rects.push({ c, r, x: x0 + c * (s.cardW + s.gutter), y: y0 + r * (s.cardH + s.gutter) });
  return { rects, x0, y0, blockW, blockH };
}

// Bleed per side. Between cards it can't exceed half the gutter or it would
// print over the neighbouring card.
function bleedsFor(c, r, layout, s) {
  const inner = Math.min(s.bleed, s.gutter / 2);
  return {
    l: c === 0 ? s.bleed : inner,
    r: c === layout.cols - 1 ? s.bleed : inner,
    t: r === 0 ? s.bleed : inner,
    b: r === layout.rows - 1 ? s.bleed : inner,
  };
}

/* ---------- drawing ---------- */

function wrapText(text, font, size, maxWidth) {
  const lines = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const test = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// x, y, w, h are the trim box in points, PDF coordinates (origin bottom-left).
function drawFront(page, card, box, bl, fonts, look) {
  const { x, y, w, h } = box;
  page.drawRectangle({ x: x - bl.l, y: y - bl.b, width: w + bl.l + bl.r, height: h + bl.t + bl.b, color: look.tint });

  const k = w / (70 * PT); // type scales with the card, tuned at 70 mm wide
  const pad = w * 0.085;
  const inner = w - 2 * pad;

  // Kepler has no bold cut, so the title is thickened with an outline in the
  // same colour (fill + stroke), shrunk if needed to fit the card width.
  const titleSize = Math.min(30 * k, (30 * k * inner) / fonts.kepler.widthOfTextAtSize(card.name, 30 * k));
  const titleY = y + h - pad - titleSize * 0.8;
  page.pushOperators(
    pushGraphicsState(),
    setTextRenderingMode(TextRenderingMode.FillAndOutline),
    setLineWidth(titleSize * 0.022),
    setLineJoin(LineJoinStyle.Round),
    setStrokingColor(look.ink),
  );
  page.drawText(card.name, { x: x + pad, y: titleY, size: titleSize, font: fonts.kepler, color: look.ink });
  page.pushOperators(popGraphicsState());

  const ruleY = titleY - titleSize * 0.4;
  page.drawLine({ start: { x: x + pad, y: ruleY }, end: { x: x + w - pad, y: ruleY }, thickness: 0.5 * k, color: look.ink });

  // Footer, bottom-up: licence icons + number, then credits above them.
  const footSize = 6 * k;
  const iconSize = 9 * k;
  const iconsY = y + pad * 0.8;
  const creditsY = iconsY + iconSize + 3.5 * k;

  const bodySize = 8.5 * k, leading = bodySize * 1.4;
  const bodyBottom = creditsY + footSize + 6 * k;
  let ty = ruleY - pad * 0.7 - bodySize;
  for (const line of wrapText(card.description, fonts.apfel, bodySize, inner)) {
    if (ty < bodyBottom) break;
    page.drawText(line, { x: x + pad, y: ty, size: bodySize, font: fonts.apfel, color: rgb(0.1, 0.1, 0.1) });
    ty -= leading;
  }

  // Kepler, not Apfel: Apfel Grotezk 0.8 ships an empty "ñ" glyph (Muñoz).
  page.drawText(`Friction First · ${CREDITS}`, { x: x + pad, y: creditsY, size: footSize * 1.2, font: fonts.kepler, color: look.ink });

  const iconsEnd = drawLicenseIcons(page, x + pad, iconsY + iconSize, iconSize, look.ink);
  const textY = iconsY + iconSize / 2 - footSize * 0.35;
  page.drawText(LICENSE, { x: iconsEnd + 3 * k, y: textY, size: footSize, font: fonts.apfel, color: look.ink });

  const num = `${String(card.n).padStart(2, "0")} / ${String(card.of).padStart(2, "0")}`;
  const numW = fonts.apfel.widthOfTextAtSize(num, footSize);
  page.drawText(num, { x: x + w - pad - numW, y: textY, size: footSize, font: fonts.apfel, color: look.ink });
}

// Draws the CC / BY / NC / SA icons in a row. (x, top) is the top-left corner
// in PDF points; returns the x where the row ends.
function drawLicenseIcons(page, x, top, size, color) {
  const gap = size * 0.15;
  for (const id of ["cc", "by", "nc", "sa"]) {
    const icon = CC_ICONS[id];
    const [minX, minY, vbW] = icon.viewBox;
    const scale = size / vbW;
    for (const c of icon.circles) {
      page.drawCircle({ x: x + (c.cx - minX) * scale, y: top - (c.cy - minY) * scale, size: c.r * scale, color: rgb(1, 1, 1) });
    }
    for (const d of icon.paths) {
      page.drawSvgPath(d, { x: x - minX * scale, y: top + minY * scale, scale, color });
    }
    x += size + gap;
  }
  return x - gap;
}

function drawBack(page, image, box, bl, look, rotated) {
  const { x, y, w, h } = box;
  page.drawRectangle({ x: x - bl.l, y: y - bl.b, width: w + bl.l + bl.r, height: h + bl.t + bl.b, color: look.edge });

  // Cover the trim box with the artwork, cropping if the aspect ratios differ.
  let iw = w, ih = w / look.aspect;
  if (ih < h) { ih = h; iw = h * look.aspect; }
  const ix = x - (iw - w) / 2, iy = y - (ih - h) / 2;

  page.pushOperators(pushGraphicsState(), rectangle(x, y, w, h), clip(), endPath());
  if (rotated) {
    page.drawImage(image, { x: ix + iw, y: iy + ih, width: iw, height: ih, rotate: degrees(180) });
  } else {
    page.drawImage(image, { x: ix, y: iy, width: iw, height: ih });
  }
  page.pushOperators(popGraphicsState());
}

function drawMarks(page, layout, grid, s) {
  const { H } = layout;
  const thickness = s.markWeight;
  const color = rgb(0, 0, 0);
  const line = (x1, y1, x2, y2) =>
    page.drawLine({ start: { x: x1 * PT, y: (H - y1) * PT }, end: { x: x2 * PT, y: (H - y2) * PT }, thickness, color });

  const top = grid.y0, bottom = grid.y0 + grid.blockH;
  const left = grid.x0, right = grid.x0 + grid.blockW;
  const o = s.markOffset, len = s.markLen;

  const xs = new Set(), ys = new Set();
  for (let c = 0; c < layout.cols; c++) {
    const x = grid.x0 + c * (s.cardW + s.gutter);
    xs.add(x); xs.add(x + s.cardW);
  }
  for (let r = 0; r < layout.rows; r++) {
    const y = grid.y0 + r * (s.cardH + s.gutter);
    ys.add(y); ys.add(y + s.cardH);
  }
  for (const x of xs) {
    line(x, top - o, x, top - o - len);
    line(x, bottom + o, x, bottom + o + len);
  }
  for (const y of ys) {
    line(left - o, y, left - o - len, y);
    line(right + o, y, right + o + len, y);
  }
}

/* ---------- PDF ---------- */

function buildCardList(s) {
  const list = [];
  for (const t of CARD_TYPES) {
    const q = s.qty[t.id] || 0;
    for (let n = 1; n <= q; n++) list.push({ ...t, n, of: q });
  }
  return list;
}

async function buildPdf(s, assets) {
  const layout = computeLayout(s);
  const perSheet = layout.cols * layout.rows;
  const cards = buildCardList(s);
  if (!perSheet) throw new Error("No cards fit on this paper — try a larger sheet, smaller margins or less bleed.");
  if (!cards.length) throw new Error("Add at least one card.");

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle("Friction First — card deck");
  doc.setCreator("Friction First deck builder");

  // subset:false — fontkit's CFF subsetting is unreliable with OTF fonts.
  const fonts = {
    kepler: await doc.embedFont(assets.kepler, { subset: false }),
    apfel: await doc.embedFont(assets.apfel, { subset: false }),
    slug: await doc.embedFont(StandardFonts.Helvetica),
  };

  const images = {};
  for (const t of CARD_TYPES) {
    if (s.qty[t.id] > 0) images[t.id] = await doc.embedPng(assets.backs[t.id].bytes);
  }

  const grid = slotRects(layout, s);
  const sheets = [];
  for (let i = 0; i < cards.length; i += perSheet) sheets.push(cards.slice(i, i + perSheet));

  const W = layout.W * PT, H = layout.H * PT;
  const sheetInfo = `${layout.W}×${layout.H} mm · card ${s.cardW}×${s.cardH} mm · bleed ${s.bleed} mm · gutter ${s.gutter} mm`;

  const addSheet = (sheet, idx, side) => {
    const page = doc.addPage([W, H]);
    sheet.forEach((card, i) => {
      let { c, r } = grid.rects[i];
      // Backs are mirrored so each back lands behind its front after flipping.
      if (side === "back" && s.flip === "long") c = layout.cols - 1 - c;
      if (side === "back" && s.flip === "short") r = layout.rows - 1 - r;

      const xmm = grid.x0 + c * (s.cardW + s.gutter);
      const ymm = grid.y0 + r * (s.cardH + s.gutter);
      const box = { x: xmm * PT, y: (layout.H - ymm - s.cardH) * PT, w: s.cardW * PT, h: s.cardH * PT };
      const b = bleedsFor(c, r, layout, s);
      const bl = { l: b.l * PT, r: b.r * PT, t: b.t * PT, b: b.b * PT };
      const look = assets.backs[card.id];

      if (side === "front") drawFront(page, card, box, bl, fonts, look);
      else drawBack(page, images[card.id], box, bl, look, s.flip === "short");

      if (s.trimOutline) {
        page.drawRectangle({ x: box.x, y: box.y, width: box.w, height: box.h, borderColor: rgb(1, 0, 0), borderWidth: 0.25 });
      }
    });

    if (s.marks) drawMarks(page, layout, grid, s);

    if (s.slug) {
      const text = `Friction First deck — sheet ${idx + 1}/${sheets.length} · ${side} · ${sheetInfo}`;
      page.drawText(text, { x: s.margin * PT, y: s.margin * PT, size: 6, font: fonts.slug, color: rgb(0.4, 0.4, 0.4) });
    }
  };

  const doFronts = s.sides !== "backs";
  const doBacks = s.sides !== "fronts";
  if (s.sides === "interleaved") {
    sheets.forEach((sh, i) => { addSheet(sh, i, "front"); addSheet(sh, i, "back"); });
  } else {
    if (doFronts) sheets.forEach((sh, i) => addSheet(sh, i, "front"));
    if (doBacks) sheets.forEach((sh, i) => addSheet(sh, i, "back"));
  }

  const bytes = await doc.save();
  return { bytes, layout, perSheet, sheetCount: sheets.length, cardCount: cards.length, pageCount: doc.getPageCount() };
}

/* ---------- UI ---------- */

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved) return { ...DEFAULTS, ...saved, qty: { ...DEFAULTS.qty, ...saved.qty } };
  } catch (e) { /* storage unavailable */ }
  return structuredClone(DEFAULTS);
}

function saveSettings(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
}

const $ = (sel) => document.querySelector(sel);

function renderTiles(s, onChange) {
  const wrap = $("#card-types");
  wrap.innerHTML = "";
  for (const t of CARD_TYPES) {
    const tile = document.createElement("div");
    tile.className = "tile";
    tile.innerHTML = `
      <img src="${t.back}" alt="${t.name} card back">
      <span class="tile-name">${t.name}</span>
      <div class="stepper">
        <button type="button" data-d="-1" aria-label="One fewer ${t.name}">−</button>
        <input type="number" min="0" step="1" value="${s.qty[t.id]}" aria-label="${t.name} quantity">
        <button type="button" data-d="1" aria-label="One more ${t.name}">+</button>
      </div>`;
    const input = tile.querySelector("input");
    input.addEventListener("input", () => {
      s.qty[t.id] = Math.max(0, parseInt(input.value, 10) || 0);
      onChange();
    });
    tile.querySelectorAll("button").forEach((btn) =>
      btn.addEventListener("click", () => {
        s.qty[t.id] = Math.max(0, (s.qty[t.id] || 0) + Number(btn.dataset.d));
        input.value = s.qty[t.id];
        onChange();
      }));
    wrap.appendChild(tile);
  }
}

// Form fields are bound by name to settings keys.
function bindFields(s, onChange) {
  const form = $("#settings");
  const sync = () => {
    form.querySelector("[name=paperW]").disabled = s.paper !== "custom";
    form.querySelector("[name=paperH]").disabled = s.paper !== "custom";
    form.querySelectorAll(".marks-only").forEach((el) => (el.disabled = !s.marks));
  };
  for (const el of form.elements) {
    if (!el.name || !(el.name in s)) continue;
    if (el.type === "checkbox") el.checked = s[el.name];
    else el.value = s[el.name];

    el.addEventListener("input", () => {
      const v = el.type === "checkbox" ? el.checked : el.type === "number" ? parseFloat(el.value) : el.value;
      if (el.type === "number" && !Number.isFinite(v)) return;
      s[el.name] = v;

      if (el.name === "cardPreset" && v !== "custom") {
        [s.cardW, s.cardH] = CARD_SIZES[v];
        form.querySelector("[name=cardW]").value = s.cardW;
        form.querySelector("[name=cardH]").value = s.cardH;
      }
      if (el.name === "cardW" || el.name === "cardH") {
        s.cardPreset = "custom";
        form.querySelector("[name=cardPreset]").value = "custom";
      }
      if (el.name === "paper" && v !== "custom") {
        [s.paperW, s.paperH] = PAPERS[v];
        form.querySelector("[name=paperW]").value = s.paperW;
        form.querySelector("[name=paperH]").value = s.paperH;
      }
      sync();
      onChange();
    });
  }
  sync();
}

async function main() {
  const s = loadSettings();
  const status = $("#status");
  const frame = $("#preview");
  const download = $("#download");
  let assets, url, timer, run = 0;

  const regenerate = async () => {
    const mine = ++run;
    status.textContent = "Building PDF…";
    status.classList.remove("error");
    try {
      const out = await buildPdf(s, assets);
      if (mine !== run) return; // a newer build started meanwhile
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(new Blob([out.bytes], { type: "application/pdf" }));
      frame.src = url;
      download.href = url;
      download.removeAttribute("aria-disabled");
      const { layout } = out;
      status.textContent =
        `${out.cardCount} cards · ${layout.cols}×${layout.rows} = ${out.perSheet} per sheet ` +
        `(${layout.landscape ? "landscape" : "portrait"}) · ${out.sheetCount} sheets · ${out.pageCount} pages`;
    } catch (err) {
      if (mine !== run) return;
      status.textContent = err.message;
      status.classList.add("error");
      download.setAttribute("aria-disabled", "true");
    }
  };

  const onChange = () => {
    saveSettings(s);
    clearTimeout(timer);
    timer = setTimeout(regenerate, 350);
  };

  renderTiles(s, onChange);
  bindFields(s, onChange);

  $("#reset").addEventListener("click", () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    location.reload();
  });

  try {
    status.textContent = "Loading artwork and fonts…";
    assets = await loadAssets();
  } catch (err) {
    status.classList.add("error");
    status.textContent = location.protocol === "file:"
      ? "The builder needs to run from a local server: in the project folder run  python3 -m http.server  and open http://localhost:8000/cards.html"
      : err.message;
    return;
  }
  regenerate();
}

main();
