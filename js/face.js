// MediaPipe Face Landmarker 連携: blendshape から口・目の状態、landmark から傾きを取得

const CDN_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

let landmarker = null;

// CDN は動的 import にして、読込失敗時にマイク口パクへフォールバックできるようにする
export async function loadFaceLandmarker() {
  const { FaceLandmarker, FilesetResolver } = await import(CDN_URL);
  const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
  landmarker = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFaceBlendshapes: true,
  });
  return landmarker;
}

export function isFaceReady() {
  return landmarker !== null;
}

// しきい値(設定パネルのスライダーから変更可能)
let mouthThreshold = 0.25;
let blinkThreshold = 0.45;

export function setThresholds({ mouth, blink }) {
  if (mouth != null) mouthThreshold = mouth;
  if (blink != null) blinkThreshold = blink;
}

const EMPTY_STATE = {
  detected: false,
  mouthOpen: false,
  blinking: false,
  mouthLevel: 0,
  roll: 0,
};

/**
 * 1 フレーム分の検出を行い、アバター状態を返す。
 * @returns {{ detected: boolean, mouthOpen: boolean, blinking: boolean, mouthLevel: number, roll: number }}
 */
export function detectFace(videoEl, timestampMs) {
  if (!landmarker || videoEl.readyState < 2) return { ...EMPTY_STATE };

  const result = landmarker.detectForVideo(videoEl, timestampMs);
  const shapes = result.faceBlendshapes?.[0]?.categories;
  if (!shapes) return { ...EMPTY_STATE };

  const score = (name) =>
    shapes.find((c) => c.categoryName === name)?.score ?? 0;

  const jawOpen = score("jawOpen");
  const blinkL = score("eyeBlinkLeft");
  const blinkR = score("eyeBlinkRight");

  // 顔の傾き(roll): 両目尻の landmark (33, 263) の角度から算出。
  // 前面カメラは鏡像表示なので符号を反転し、画面の見た目と一致させる
  let roll = 0;
  const lm = result.faceLandmarks?.[0];
  if (lm && lm[33] && lm[263]) {
    roll = -Math.atan2(lm[263].y - lm[33].y, lm[263].x - lm[33].x);
  }

  return {
    detected: true,
    mouthOpen: jawOpen > mouthThreshold,
    blinking: blinkL > blinkThreshold && blinkR > blinkThreshold,
    mouthLevel: jawOpen,
    roll,
  };
}
