// Canvas 描画: 画像切替(口/目)+ 発話中のバウンス演出

const IMAGE_PATHS = {
  closed: "assets/sample/closed.png", // 待機(目開き・口閉じ)
  open: "assets/sample/open.png",     // 発話(口開き)
  blink: "assets/sample/blink.png",   // まばたき(目閉じ)
};

const images = {};
let canvas = null;
let ctx = null;
let bgColor = "#00ff00";

// バウンス演出の状態
let bouncePhase = 0;
let bounceAmp = 0;

export async function initAvatar(canvasEl) {
  canvas = canvasEl;
  ctx = canvas.getContext("2d");
  resize();
  window.addEventListener("resize", resize);

  await Promise.all(
    Object.entries(IMAGE_PATHS).map(
      ([key, src]) =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            images[key] = img;
            resolve();
          };
          img.onerror = reject;
          img.src = src;
        })
    )
  );
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
  let img = images.closed;
  if (state.blinking && images.blink) img = images.blink;
  else if (state.mouthOpen && images.open) img = images.open;
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
