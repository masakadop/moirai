// Canvas 描画: 画像切替(口/目/表情)+ 髪レイヤーの揺れ + 傾き追従 + バウンス演出

const SAMPLE_PATHS = {
  closed: "assets/sample/closed.png",       // 待機(目開き・口閉じ)
  open: "assets/sample/open.png",           // 発話(口開き)
  blink: "assets/sample/blink.png",         // まばたき(目閉じ)
  hairFront: "assets/sample/hair_front.png", // 前髪(体の前に描画)
  hairBack: "assets/sample/hair_back.png",   // 後ろ髪(体の後ろに描画)
};

export const IMAGE_SLOTS = ["closed", "open", "blink"];
export const HAIR_SLOTS = ["hairFront", "hairBack"];
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

// 髪の揺れ: 体の動きに減衰ばねで遅れて追従させ、差分だけ揺らす
// 前髪は軽く(硬いばね・強い減衰)、後ろ髪は重く(柔らかいばね・弱い減衰)
const hairSprings = {
  hairFront: { y: 0, vy: 0, r: 0, vr: 0, k: 110, d: 7.0, gain: 0.9 },
  hairBack: { y: 0, vy: 0, r: 0, vr: 0, k: 70, d: 5.5, gain: 1.25 },
};
let hairJiggle = 1; // 揺れ強さ(0 で無効)

export function setHairJiggle(v) {
  hairJiggle = v;
}

/** デバッグ・検証用: 髪ばねの現在の差分(体とのズレ)を返す */
export function getHairDebug() {
  const out = {};
  for (const key of HAIR_SLOTS) {
    const s = hairSprings[key];
    out[key] = { dy: s.y, dr: s.r, vy: s.vy, vr: s.vr };
  }
  return out;
}

function stepSpring(s, targetY, targetR, dt) {
  s.vy += (-s.k * (s.y - targetY) - s.d * s.vy) * dt;
  s.y += s.vy * dt;
  s.vr += (-s.k * (s.r - targetR) - s.d * s.vr) * dt;
  s.r += s.vr * dt;
}

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

// 髪はカスタムの体画像と組み合わせるとずれるため、
// カスタム体使用中はカスタム髪のみ描画(サンプル髪を重ねない)
function pickHair(key) {
  if (custom[key]) return custom[key];
  const usingCustomBody = IMAGE_SLOTS.some((k) => custom[k]);
  return usingCustomBody ? null : samples[key];
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

  // 髪ばねを体の動きに追従させる(ループは 24fps 固定)
  const dt = 1 / 24;
  for (const key of HAIR_SLOTS) {
    stepSpring(hairSprings[key], bounceY, smoothRoll, dt);
  }

  // 画面にフィットさせて中央下寄せで描画
  const scale = Math.min(w / img.width, h / img.height) * 0.85;
  const dw = img.width * scale;
  const dh = img.height * scale;
  const cx = w / 2;
  const cy = h - dh / 2 - h * 0.03 + bounceY;

  const drawHair = (key) => {
    const hairImg = pickHair(key);
    if (!hairImg) return;
    const s = hairSprings[key];
    // ばねの遅れ(体とのズレ)を揺れとして描画に反映
    const dy = (s.y - bounceY) * s.gain * hairJiggle;
    const dr = (s.r - smoothRoll) * s.gain * hairJiggle;
    const hw = hairImg.width * scale;
    const hh = hairImg.height * scale;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(smoothRoll);
    // 頭頂付近を支点に振り子のように揺らす
    const pivotY = -dh * 0.35;
    ctx.translate(0, pivotY);
    ctx.rotate(dr);
    ctx.translate(0, -pivotY);
    ctx.drawImage(hairImg, -hw / 2, -hh / 2 + dy, hw, hh);
    ctx.restore();
  };

  drawHair("hairBack");

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(smoothRoll);
  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();

  drawHair("hairFront");
}
