// 初期化と UI 制御

import { startCamera, flipCamera } from "./camera.js";
import { loadFaceLandmarker, detectFace } from "./face.js";
import { initAvatar, drawAvatar, setBackground } from "./avatar.js";

const startScreen = document.getElementById("start-screen");
const startBtn = document.getElementById("start-btn");
const statusEl = document.getElementById("status");
const video = document.getElementById("camera-preview");
const canvas = document.getElementById("avatar-canvas");
const panel = document.getElementById("panel");
const flipBtn = document.getElementById("flip-btn");
const previewToggle = document.getElementById("preview-toggle");
const bgColorInput = document.getElementById("bg-color");

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

async function start() {
  startBtn.disabled = true;
  try {
    showStatus("カメラを起動中…");
    await startCamera(video);

    showStatus("顔認識モデルを読込中…");
    await Promise.all([loadFaceLandmarker(), initAvatar(canvas)]);

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
});

bgColorInput.addEventListener("input", () => {
  setBackground(bgColorInput.value);
});
