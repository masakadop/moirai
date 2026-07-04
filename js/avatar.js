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
let lastDrawTime = 0;

const MAX_ROLL = 0.45;   // 傾きの上限(ラジアン)
const ROLL_FACTOR = 0.8; // 実際の傾きに対する追従率

// --- 髪の揺れ(節ばねチェーン) ---
// 髪を根元→毛先の N_SEG 節に分け、体の動きの遅れを節ごとに順番に伝播させる。
// 画像は N_STRIP 枚の横スライスに分けて、節の角度を積分した「たわみ」で描画する。
const N_SEG = 6;
const N_STRIP = 36;

function makeSprings() {
  return {
    rootY: { p: 0, v: 0 }, // 縦バウンスへの遅れ
    rootR: { p: 0, v: 0 }, // 傾きへの遅れ
    segs: Array.from({ length: N_SEG }, () => ({ p: 0, v: 0 })),
  };
}

const hairPhysics = {
  hairFront: { s: makeSprings(), k: 130, d: 6.0, tipGain: 0.7, sway: 0.02 },
  hairBack: { s: makeSprings(), k: 80, d: 4.8, tipGain: 1.1, sway: 0.035 },
};

let hairJiggle = 1; // 揺れ強さ(0 で無効)

export function setHairJiggle(v) {
  hairJiggle = v;
}

/** デバッグ・検証用: 髪ばねの現在値(根元の遅れと毛先の角度)を返す */
export function getHairDebug() {
  const out = {};
  for (const key of HAIR_SLOTS) {
    const s = hairPhysics[key].s;
    out[key] = { dy: s.rootY.p, dr: s.rootR.p, tip: s.segs[N_SEG - 1].p };
  }
  return out;
}

function stepSpring(sp, target, k, d, dt) {
  sp.v += (-k * (sp.p - target) - d * sp.v) * dt;
  sp.p += sp.v * dt;
}

function stepHair(phys, bounceY, roll, dt) {
  const { s, k, d } = phys;
  stepSpring(s.rootY, bounceY, k, d, dt);
  stepSpring(s.rootR, roll, k, d, dt);
  // 根元の遅れ(体とのズレ)を起点に、節ごとに遅れて毛先へ伝播させる
  let target = s.rootR.p - roll;
  for (const seg of s.segs) {
    stepSpring(seg, target, k, d, dt);
    target = seg.p;
  }
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
 * @param {number} [dtOverride] 検証用: 経過秒を固定したい場合に指定
 */
export function drawAvatar(state, dtOverride) {
  if (!ctx) return;

  // 実時間ベースの経過秒(描画は毎フレーム呼ばれる想定)
  const now = performance.now() / 1000;
  let dt = dtOverride ?? (lastDrawTime ? now - lastDrawTime : 1 / 60);
  lastDrawTime = now;
  dt = Math.min(Math.max(dt, 1 / 240), 1 / 15);

  const { width: w, height: h } = canvas;
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, w, h);

  // 画像選択: 表情プリセット > まばたき > 口開き > 通常
  let img = pick("closed");
  if (expression && pick(expression)) img = pick(expression);
  else if (state.blinking && pick("blink")) img = pick("blink");
  else if (state.mouthOpen && pick("open")) img = pick("open");
  if (!img) return;

  // 発話中はバウンス: 口の開き具合(連続値)でなめらかに追従
  const bounceTarget = Math.min(
    1,
    Math.max(state.mouthOpen ? 0.6 : 0, (state.mouthLevel || 0) * 2.2)
  );
  bounceAmp += (bounceTarget - bounceAmp) * (1 - Math.exp(-dt * 5));
  bouncePhase += dt * 8.5;
  const bounceY = Math.sin(bouncePhase) * bounceAmp * h * 0.012;

  // 顔の傾きに滑らかに追従
  const targetRoll = Math.max(-MAX_ROLL, Math.min(MAX_ROLL, (state.roll || 0) * ROLL_FACTOR));
  smoothRoll += (targetRoll - smoothRoll) * (1 - Math.exp(-dt * 10));

  // 髪ばねを体の動きに追従させる
  for (const key of HAIR_SLOTS) {
    stepHair(hairPhysics[key], bounceY, smoothRoll, dt);
  }

  // 画面にフィットさせて中央下寄せで描画
  const scale = Math.min(w / img.width, h / img.height) * 0.85;
  const dw = img.width * scale;
  const dh = img.height * scale;
  const cx = w / 2;
  const cy = h - dh / 2 - h * 0.03 + bounceY;

  // 髪: 横スライスして節ばねの角度を積分し、根元は固定・毛先ほど大きく
  // ぐにゃっと曲げて描画する
  const drawHair = (key) => {
    const hairImg = pickHair(key);
    if (!hairImg) return;
    const phys = hairPhysics[key];
    const { s } = phys;
    const hw = hairImg.width * scale;
    const hh = hairImg.height * scale;
    const dyLag = (s.rootY.p - bounceY) * hairJiggle;
    const maxBend = hh * 0.22;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(smoothRoll);

    const stripH = hh / N_STRIP;
    const imgStripH = hairImg.height / N_STRIP;
    let offX = 0;
    for (let m = 0; m < N_STRIP; m++) {
      const t = (m + 0.5) / N_STRIP; // 0 = 根元(上端)、1 = 毛先(下端)
      // 節ばねの角度を根元→毛先で補間
      const f = t * (N_SEG - 1);
      const i0 = Math.floor(f);
      const i1 = Math.min(N_SEG - 1, i0 + 1);
      const seg = s.segs[i0].p + (s.segs[i1].p - s.segs[i0].p) * (f - i0);
      // 常時の微揺れ(呼吸のようなうねり)
      const idle =
        Math.sin(now * 1.8 + t * 2.5 + (key === "hairBack" ? 1.2 : 0)) * phys.sway;
      const ang = (seg * phys.tipGain + idle) * hairJiggle;
      // 角度を積分してたわみ(横ずれ)にする
      offX += ang * stripH;
      offX = Math.max(-maxBend, Math.min(maxBend, offX));
      const dy = dyLag * (0.25 + 0.75 * t); // 縦の遅れも毛先ほど大きく
      ctx.drawImage(
        hairImg,
        0, m * imgStripH, hairImg.width, imgStripH,
        -hw / 2 + offX, -hh / 2 + m * stripH + dy, hw, stripH + 1.5
      );
    }
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
