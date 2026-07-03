// MediaPipe Face Landmarker 連携: blendshape から口・目の状態を取得

import {
  FaceLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

let landmarker = null;

export async function loadFaceLandmarker() {
  const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
  landmarker = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFaceBlendshapes: true,
  });
  return landmarker;
}

// しきい値(Phase 2 でスライダー化予定)
const MOUTH_OPEN_THRESHOLD = 0.25;
const BLINK_THRESHOLD = 0.45;

/**
 * 1 フレーム分の検出を行い、アバター状態を返す。
 * @returns {{ detected: boolean, mouthOpen: boolean, blinking: boolean, mouthLevel: number }}
 */
export function detectFace(videoEl, timestampMs) {
  if (!landmarker || videoEl.readyState < 2) {
    return { detected: false, mouthOpen: false, blinking: false, mouthLevel: 0 };
  }

  const result = landmarker.detectForVideo(videoEl, timestampMs);
  const shapes = result.faceBlendshapes?.[0]?.categories;
  if (!shapes) {
    return { detected: false, mouthOpen: false, blinking: false, mouthLevel: 0 };
  }

  const score = (name) =>
    shapes.find((c) => c.categoryName === name)?.score ?? 0;

  const jawOpen = score("jawOpen");
  const blinkL = score("eyeBlinkLeft");
  const blinkR = score("eyeBlinkRight");

  return {
    detected: true,
    mouthOpen: jawOpen > MOUTH_OPEN_THRESHOLD,
    blinking: blinkL > BLINK_THRESHOLD && blinkR > BLINK_THRESHOLD,
    mouthLevel: jawOpen,
  };
}
