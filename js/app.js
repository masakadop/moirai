// 初期化と UI 制御

import { startCamera, flipCamera } from "./camera.js";
import { loadFaceLandmarker, detectFace, setThresholds, isFaceReady } from "./face.js";
import {
  initAvatar,
  drawAvatar,
  setBackground,
  setCustomImage,
  clearCustomImages,
  setExpression,
  hasImage,
  IMAGE_SLOTS,
  EXPRESSION_SLOTS,
} from "./avatar.js";
import {
  loadSettings,
  saveSettings,
  saveImage,
  loadImage,
  clearImages,
} from "./storage.js";
import { startMic, stopMic, isMicActive, getMicLevel } from "./mic.js";

const startScreen = document.getElementById("start-screen");
const startBtn = document.getElementById("start-btn");
const statusEl = document.getElementById("status");
const video = document.getElementById("camera-preview");
const canvas = document.getElementById("avatar-canvas");
const panel = document.getElementById("panel");
const flipBtn = document.getElementById("flip-btn");
const previewToggle = document.getElementById("preview-toggle");
const bgColorInput = document.getElementById("bg-color");
const mouthSens = document.getElementById("mouth-sens");
const mouthSensVal = document.getElementById("mouth-sens-val");
const blinkSens = document.getElementById("blink-sens");
const blinkSensVal = document.getElementById("blink-sens-val");
const resetImagesBtn = document.getElementById("reset-images");
const micToggle = document.getElementById("mic-toggle");
const exprBar = document.getElementById("expr-bar");

const TARGET_FPS = 24; // スマホの発熱・電池対策
const FRAME_INTERVAL = 1000 / TARGET_FPS;
const MIC_MOUTH_THRESHOLD = 0.05; // マイク口パクの音量しきい値(RMS)

let running = false;
let lastFrameTime = 0;
let lastVideoTime = -1;
let lastState = { detected: false, mouthOpen: false, blinking: false, mouthLevel: 0, roll: 0 };
let noFaceSince = 0;

function showStatus(text) {
  statusEl.textContent = text;
  statusEl.classList.remove("hidden");
}

function hideStatus() {
  statusEl.classList.add("hidden");
}

// --- 設定の読込・反映 ---

function applySettings(s) {
  setBackground(s.bgColor);
  setThresholds({ mouth: s.mouthThreshold, blink: s.blinkThreshold });

  bgColorInput.value = s.bgColor;
  mouthSens.value = s.mouthThreshold;
  mouthSensVal.textContent = Number(s.mouthThreshold).toFixed(2);
  blinkSens.value = s.blinkThreshold;
  blinkSensVal.textContent = Number(s.blinkThreshold).toFixed(2);
  previewToggle.checked = s.showPreview;
  video.style.display = s.showPreview ? "" : "none";
  micToggle.checked = s.micFallback;
}

async function restoreCustomImages() {
  for (const key of [...IMAGE_SLOTS, ...EXPRESSION_SLOTS]) {
    try {
      const blob = await loadImage(key);
      if (blob) await setCustomImage(key, blob);
    } catch (err) {
      console.warn("画像の復元に失敗:", key, err);
    }
  }
  updateExprBar();
}

// --- 表情切替バー ---

function updateExprBar() {
  let anyPreset = false;
  for (const btn of exprBar.querySelectorAll("button[data-expr]")) {
    const key = btn.dataset.expr;
    if (!key) continue; // 「通常」は常に表示
    const available = hasImage(key);
    btn.classList.toggle("hidden", !available);
    if (available) anyPreset = true;
  }
  exprBar.classList.toggle("hidden", !running || !anyPreset);
}

exprBar.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-expr]");
  if (!btn) return;
  setExpression(btn.dataset.expr || null);
  for (const b of exprBar.querySelectorAll("button")) {
    b.classList.toggle("active", b === btn);
  }
});

// --- 起動 ---

async function start() {
  startBtn.disabled = true;
  try {
    showStatus("カメラを起動中…");
    await startCamera(video);

    showStatus("顔認識モデルを読込中…");
    await initAvatar(canvas);
    let faceError = null;
    try {
      await loadFaceLandmarker();
    } catch (err) {
      faceError = err;
      console.error("顔認識モデルの読込に失敗:", err);
    }

    if (faceError) {
      // 顔認識が使えない場合はマイク口パクにフォールバック
      showStatus("顔認識が使えないため、マイク口パクで動作します");
      try {
        await startMic();
        micToggle.checked = true;
        saveSettings({ micFallback: true });
      } catch {
        showStatus("顔認識モデルの読込に失敗しました。通信環境を確認して再読み込みしてください");
        startBtn.disabled = false;
        return;
      }
    } else if (micToggle.checked) {
      // 設定でマイクフォールバックが有効なら起動しておく
      try {
        await startMic();
      } catch {
        micToggle.checked = false;
        saveSettings({ micFallback: false });
      }
    }

    await restoreCustomImages();

    startScreen.classList.add("hidden");
    if (!faceError) hideStatus();
    running = true;
    updateExprBar();
    requestAnimationFrame(loop);
  } catch (err) {
    console.error(err);
    showStatus(
      err.name === "NotAllowedError"
        ? "カメラの使用が許可されませんでした"
        : "起動に失敗しました: " + err.message
    );
    startBtn.disabled = false;
  }
}

function loop(now) {
  if (!running) return;
  requestAnimationFrame(loop);

  // フレームレート制御
  if (now - lastFrameTime < FRAME_INTERVAL) return;
  lastFrameTime = now;

  // 同じ映像フレームを二重に推論しない
  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    lastState = detectFace(video, performance.now());
  }

  const state = { ...lastState };

  if (state.detected) {
    noFaceSince = 0;
    if (isFaceReady()) hideStatus();
  } else if (isMicActive()) {
    // 顔が検出できない時はマイク音量で口パク
    state.mouthOpen = getMicLevel() > MIC_MOUTH_THRESHOLD;
    noFaceSince = 0;
  } else {
    if (!noFaceSince) noFaceSince = now;
    if (now - noFaceSince > 1500) showStatus("顔が検出できません");
  }

  drawAvatar(state);
}

// --- UI イベント ---

startBtn.addEventListener("click", start);

// 画面タップで設定パネルをトグル(パネル自身・小窓のタップは除く)
canvas.addEventListener("click", () => {
  if (!running) return;
  panel.classList.toggle("hidden");
});

flipBtn.addEventListener("click", async () => {
  showStatus("カメラを切替中…");
  try {
    await flipCamera(video);
    hideStatus();
  } catch (err) {
    showStatus("カメラ切替に失敗しました");
  }
});

previewToggle.addEventListener("change", () => {
  video.style.display = previewToggle.checked ? "" : "none";
  saveSettings({ showPreview: previewToggle.checked });
});

bgColorInput.addEventListener("input", () => {
  setBackground(bgColorInput.value);
  saveSettings({ bgColor: bgColorInput.value });
});

mouthSens.addEventListener("input", () => {
  const v = Number(mouthSens.value);
  setThresholds({ mouth: v });
  mouthSensVal.textContent = v.toFixed(2);
  saveSettings({ mouthThreshold: v });
});

blinkSens.addEventListener("input", () => {
  const v = Number(blinkSens.value);
  setThresholds({ blink: v });
  blinkSensVal.textContent = v.toFixed(2);
  saveSettings({ blinkThreshold: v });
});

micToggle.addEventListener("change", async () => {
  if (micToggle.checked) {
    try {
      await startMic();
    } catch {
      micToggle.checked = false;
      showStatus("マイクの使用が許可されませんでした");
      return;
    }
  } else {
    stopMic();
  }
  saveSettings({ micFallback: micToggle.checked });
});

// 立ち絵・表情プリセットのアップロード
for (const key of [...IMAGE_SLOTS, ...EXPRESSION_SLOTS]) {
  const input = document.getElementById("img-" + key);
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      await setCustomImage(key, file);
      await saveImage(key, file);
      updateExprBar();
    } catch (err) {
      console.error(err);
      showStatus("画像の読み込みに失敗しました");
    }
  });
}

resetImagesBtn.addEventListener("click", async () => {
  clearCustomImages();
  await clearImages();
  for (const key of [...IMAGE_SLOTS, ...EXPRESSION_SLOTS]) {
    document.getElementById("img-" + key).value = "";
  }
  updateExprBar();
});

// 起動時に保存済み設定を反映
applySettings(loadSettings());

// PWA: Service Worker 登録(GitHub Pages のサブパス配信に対応する相対パス)
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch((err) => {
    console.warn("Service Worker の登録に失敗:", err);
  });
}
