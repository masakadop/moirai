// Canvas 描画: 画像切替(口/目/表情)+ 傾き追従 + 発話中のバウンス演出

const SAMPLE_PATHS = {
  closed: "assets/sample/closed.png", // 待機(目開き・口閉じ)
  open: "assets/sample/open.png",     // 発話(口開き)
  blink: "assets/sample/blink.png",   // まばたき(目閉じ)
};

export const IMAGE_SLOTS = Object.keys(SAMPLE_PATHS);
export const EXPRESSION_SLOTS = ["joy", "surprise"]; // 表情プリセット(アップロード式)

const samples = {};
const custom = {};
let canvas = null;
let ctx = null;
let bgColor = "#00ff00";
let expression = null; // 表情プリセットの上書き(null = 通常)

// バウンス・傾きの状態
let bouncePhase = 0;
let bounceAmp = 0;
let smoothRoll = 0;

const MAX_ROLL = 0.45;   // 傾きの上限(ラジアン)
const ROLL_FACTOR = 0.8; // 実際の傾きに対する追従率

function loadImg(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function initAvatar(canvasEl) {
  canvas = canvasEl;
  ctx = canvas.getContext("2d");
  resize();
  window.addEventListener("resize", resize);

  await Promise.all(
    Object.entries(SAMPLE_PATHS).map(async ([key, src]) => {
      samples[key] = await loadImg(src);
    })
  );
}

// アップロードされた画像を反映する(blob=null でサンプル/未設定に戻す)
export async function setCustomImage(key, blob) {
  if (custom[key]) {
    URL.revokeObjectURL(custom[key].src);
    delete custom[key];
  }
  if (blob) {
    custom[key] = await loadImg(URL.createObjectURL(blob));
  }
}

export function clearCustomImages() {
  for (const key of Object.keys(custom)) {
    URL.revokeObjectURL(custom[key].src);
    delete custom[key];
  }
  expression = null;
}

export function hasImage(key) {
  return !!(custom[key] ?? samples[key]);
}

/** 表情プリセットを設定(null で通常に戻す) */
export function setExpression(key) {
  expression = key && hasImage(key) ? key : null;
}

export function getExpression() {
  return expression;
}

function pick(key) {
  return custom[key] ?? samples[key];
}

function resize() {
  canvas.width = window.innerWidth * devicePixelRatio;
  canvas.height = window.innerHeight * devicePixelRatio;
}

export function setBackground(color) {
  bgColor = color;
  document.body.style.background = color;
}

/**
 * アバターを 1 フレーム描画する。
 * @param {{ mouthOpen: boolean, blinking: boolean, mouthLevel: number, roll: number }} state
 */
export function drawAvatar(state) {
  if (!ctx) return;

  const { width: w, height: h } = canvas;
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, w, h);

  // 画像選択: 表情プリセット > まばたき > 口開き > 通常
  let img = pick("closed");
  if (expression && pick(expression)) img = pick(expression);
  else if (state.blinking && pick("blink")) img = pick("blink");
  else if (state.mouthOpen && pick("open")) img = pick("open");
  if (!img) return;

  // 発話中はバウンス量を増やし、無音時は減衰させる
  const target = state.mouthOpen ? 1 : 0;
  bounceAmp += (target - bounceAmp) * 0.15;
  bouncePhase += 0.35;
  const bounceY = Math.sin(bouncePhase) * bounceAmp * h * 0.012;

  // 顔の傾きに滑らかに追従
  const targetRoll = Math.max(-MAX_ROLL, Math.min(MAX_ROLL, (state.roll || 0) * ROLL_FACTOR));
  smoothRoll += (targetRoll - smoothRoll) * 0.2;

  // 画面にフィットさせて中央下寄せで描画
  const scale = Math.min(w / img.width, h / img.height) * 0.85;
  const dw = img.width * scale;
  const dh = img.height * scale;
  const cx = w / 2;
  const cy = h - dh / 2 - h * 0.03 + bounceY;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(smoothRoll);
  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}
