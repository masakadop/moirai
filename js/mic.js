// マイク音量ベースの口パク(顔認識が使えない時のフォールバック)

let audioCtx = null;
let analyser = null;
let data = null;
let stream = null;

export async function startMic() {
  if (audioCtx) return;
  stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  await audioCtx.resume();
  const source = audioCtx.createMediaStreamSource(stream);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  data = new Float32Array(analyser.fftSize);
}

export function stopMic() {
  if (stream) stream.getTracks().forEach((t) => t.stop());
  if (audioCtx) audioCtx.close();
  audioCtx = analyser = data = stream = null;
}

export function isMicActive() {
  return analyser !== null;
}

/** マイク音量の RMS(0〜1 程度)を返す */
export function getMicLevel() {
  if (!analyser) return 0;
  analyser.getFloatTimeDomainData(data);
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
  return Math.sqrt(sum / data.length);
}
