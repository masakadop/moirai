// getUserMedia ラッパー: フロント/バックカメラの取得と切替

let currentStream = null;
let facingMode = "user";

export async function startCamera(videoEl) {
  stopCamera();
  const constraints = {
    audio: false,
    video: {
      facingMode,
      width: { ideal: 640 },
      height: { ideal: 480 },
    },
  };
  currentStream = await navigator.mediaDevices.getUserMedia(constraints);
  videoEl.srcObject = currentStream;
  await videoEl.play();
  return videoEl;
}

export async function flipCamera(videoEl) {
  facingMode = facingMode === "user" ? "environment" : "user";
  // 前面カメラは鏡像表示、背面はそのまま
  videoEl.style.transform = facingMode === "user" ? "scaleX(-1)" : "none";
  return startCamera(videoEl);
}

export function stopCamera() {
  if (currentStream) {
    currentStream.getTracks().forEach((t) => t.stop());
    currentStream = null;
  }
}
