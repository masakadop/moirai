// Canvas 描画: 画像切替(口/目)+ 発話中のバウンス演出

const SAMPLE_PATHS = {
  closed: "assets/sample/closed.png", // 待機(目開き・口閉じ)
  open: "assets/sample/open.png",     // 発話(口開き)
  blink: "assets/sample/blink.png",   // まばたき(目閉じ)
};

export const IMAGE_SLOTS = Object.keys(SAMPLE_PATHS);

const samples = {};
const custom = {};
let canvas = null;
let ctx = null;
let bgColor = "#00ff00";

// バウンス演出の状態
let bouncePhase = 0;
let bounceAmp = 0;

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

// アップロードされた立ち絵を反映する(blob=null でサンプルに戻す)
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
 * @param {{ mouthOpen: boolean, blinking: boolean, mouthLevel: number }} state
 */
export function drawAvatar(state) {
  if (!ctx) return;

  const { width: w, height: h } = canvas;
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, w, h);

  // 状態に応じた画像選択(まばたき優先)
  let img = pick("closed");
  if (state.blinking && pick("blink")) img = pick("blink");
  else if (state.mouthOpen && pick("open")) img = pick("open");
  if (!img) return;

  // 発話中はバウンス量を増やし、無音時は減衰させる
  const target = state.mouthOpen ? 1 : 0;
  bounceAmp += (target - bounceAmp) * 0.15;
  bouncePhase += 0.35;
  const bounceY = Math.sin(bouncePhase) * bounceAmp * h * 0.012;

  // 画面にフィットさせて中央下寄せで描画
  const scale = Math.min(w / img.width, h / img.height) * 0.85;
  const dw = img.width * scale;
  const dh = img.height * scale;
  const dx = (w - dw) / 2;
  const dy = h - dh - h * 0.03 + bounceY;

  ctx.drawImage(img, dx, dy, dw, dh);
}
