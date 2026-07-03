// 初期化と UI 制御

import { startCamera, flipCamera } from "./camera.js";
import { loadFaceLandmarker, detectFace, setThresholds } from "./face.js";
import {
  initAvatar,
  drawAvatar,
  setBackground,
  setCustomImage,
  clearCustomImages,
  IMAGE_SLOTS,
} from "./avatar.js";
import {
  loadSettings,
  saveSettings,
  saveImage,
  loadImage,
  clearImages,
} from "./storage.js";

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

const TARGET_FPS = 24; // スマホの発熱・電池対策
const FRAME_INTERVAL = 1000 / TARGET_FPS;

let running = false;
let lastFrameTime = 0;
let lastVideoTime = -1;
let lastState = { detected: false, mouthOpen: false, blinking: false, mouthLevel: 0 };
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
}

async function restoreCustomImages() {
  for (const key of IMAGE_SLOTS) {
    try {
      const blob = await loadImage(key);
      if (blob) await setCustomImage(key, blob);
    } catch (err) {
      console.warn("画像の復元に失敗:", key, err);
    }
  }
}

async function start() {
  startBtn.disabled = true;
  try {
    showStatus("カメラを起動中…");
    await startCamera(video);

    showStatus("顔認識モデルを読込中…");
    await Promise.all([loadFaceLandmarker(), initAvatar(canvas)]);
    await restoreCustomImages();

    startScreen.classList.add("hidden");
    hideStatus();
    running = true;
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

  if (lastState.detected) {
    noFaceSince = 0;
    hideStatus();
  } else {
    if (!noFaceSince) noFaceSince = now;
    if (now - noFaceSince > 1500) showStatus("顔が検出できません");
  }

  drawAvatar(lastState);
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

// 立ち絵アップロード
for (const key of IMAGE_SLOTS) {
  const input = document.getElementById("img-" + key);
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      await setCustomImage(key, file);
      await saveImage(key, file);
    } catch (err) {
      console.error(err);
      showStatus("画像の読み込みに失敗しました");
    }
  });
}

resetImagesBtn.addEventListener("click", async () => {
  clearCustomImages();
  await clearImages();
  for (const key of IMAGE_SLOTS) {
    document.getElementById("img-" + key).value = "";
  }
});

// 起動時に保存済み設定を反映
applySettings(loadSettings());
