const audioInput = document.getElementById('audioInput');
const listenButton = document.getElementById('listenButton');
const downloadButton = document.getElementById('downloadButton');
const player = document.getElementById('player');
const statusText = document.getElementById('status');
const progress = document.getElementById('progress');
const progressText = document.getElementById('progressText');
const canvas = document.getElementById('sstvCanvas');
const ctx = canvas.getContext('2d');

const WIDTH = 320;
const HEIGHT = 256;
const MARTIN_M1 = {
  lineMs: 446.446,
  syncMs: 4.862,
  porchMs: 0.572,
  colorMs: 146.432,
  separatorMs: 0.572,
};

const toneFrequencies = [];
for (let hz = 1500; hz <= 2300; hz += 50) {
  toneFrequencies.push(hz);
}

let audioFileUrl = null;
let pcmData = null;
let sampleRate = 0;
let imageData = ctx.createImageData(WIDTH, HEIGHT);
let decodedLines = 0;
let decodingActive = false;
let syncStartSec = 0;
let rafId = 0;

function resetDecoderState(clearCanvas = true) {
  decodedLines = 0;
  progress.value = 0;
  progressText.textContent = '0%';
  imageData = ctx.createImageData(WIDTH, HEIGHT);
  if (clearCanvas) {
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
  downloadButton.disabled = true;
}

function setStatus(message) {
  statusText.textContent = message;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function msToSampleIndex(ms) {
  return Math.floor((ms / 1000) * sampleRate);
}

function goertzelMagnitudeSquared(samples, start, windowSize, frequency) {
  const omega = (2 * Math.PI * frequency) / sampleRate;
  const cosine = Math.cos(omega);
  const coefficient = 2 * cosine;
  let q0 = 0;
  let q1 = 0;
  let q2 = 0;

  for (let i = 0; i < windowSize; i += 1) {
    q0 = coefficient * q1 - q2 + samples[start + i];
    q2 = q1;
    q1 = q0;
  }

  return q1 * q1 + q2 * q2 - coefficient * q1 * q2;
}

function estimateToneAtTime(seconds) {
  const center = Math.floor(seconds * sampleRate);
  const windowSize = Math.max(64, Math.floor(sampleRate * 0.0015));
  const halfWindow = Math.floor(windowSize / 2);
  const maxStart = Math.max(0, pcmData.length - windowSize);
  const start = clamp(center - halfWindow, 0, maxStart);

  let bestFrequency = toneFrequencies[0];
  let bestEnergy = -Infinity;

  for (const frequency of toneFrequencies) {
    const energy = goertzelMagnitudeSquared(pcmData, start, windowSize, frequency);
    if (energy > bestEnergy) {
      bestEnergy = energy;
      bestFrequency = frequency;
    }
  }

  return bestFrequency;
}

function frequencyToLuma(frequency) {
  return Math.round(clamp(((frequency - 1500) / 800) * 255, 0, 255));
}

function detectSyncStart() {
  const stepMs = 2;
  const windowMs = 6;
  const stepSamples = msToSampleIndex(stepMs);
  const windowSamples = Math.max(msToSampleIndex(windowMs), 64);
  const scanUntil = Math.min(pcmData.length - windowSamples, Math.floor(sampleRate * 20));

  let bestStart = 0;
  let bestScore = -1;

  for (let start = 0; start < scanUntil; start += stepSamples) {
    const p1200 = goertzelMagnitudeSquared(pcmData, start, windowSamples, 1200);
    const p1900 = goertzelMagnitudeSquared(pcmData, start, windowSamples, 1900);
    if (p1200 <= p1900 * 1.5) {
      continue;
    }

    let score = 0;
    for (let i = 0; i < 8; i += 1) {
      const checkSec = start / sampleRate + (MARTIN_M1.lineMs / 1000) * i;
      const checkStart = Math.floor(checkSec * sampleRate);
      if (checkStart + windowSamples >= pcmData.length) {
        break;
      }
      const check1200 = goertzelMagnitudeSquared(pcmData, checkStart, windowSamples, 1200);
      const check1900 = goertzelMagnitudeSquared(pcmData, checkStart, windowSamples, 1900);
      if (check1200 > check1900) {
        score += 1;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestStart = start;
    }
  }

  return bestStart / sampleRate;
}

function decodeLine(lineIndex) {
  const lineStart = syncStartSec + (lineIndex * MARTIN_M1.lineMs) / 1000;
  const greenStart = lineStart + (MARTIN_M1.syncMs + MARTIN_M1.porchMs) / 1000;
  const blueStart = greenStart + (MARTIN_M1.colorMs + MARTIN_M1.separatorMs) / 1000;
  const redStart = blueStart + (MARTIN_M1.colorMs + MARTIN_M1.separatorMs) / 1000;

  for (let x = 0; x < WIDTH; x += 1) {
    const pixelOffset = (x + 0.5) / WIDTH;
    const greenTone = estimateToneAtTime(greenStart + (pixelOffset * MARTIN_M1.colorMs) / 1000);
    const blueTone = estimateToneAtTime(blueStart + (pixelOffset * MARTIN_M1.colorMs) / 1000);
    const redTone = estimateToneAtTime(redStart + (pixelOffset * MARTIN_M1.colorMs) / 1000);

    const g = frequencyToLuma(greenTone);
    const b = frequencyToLuma(blueTone);
    const r = frequencyToLuma(redTone);

    const idx = (lineIndex * WIDTH + x) * 4;
    imageData.data[idx] = r;
    imageData.data[idx + 1] = g;
    imageData.data[idx + 2] = b;
    imageData.data[idx + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
}

function updateProgress() {
  const percent = Math.round((decodedLines / HEIGHT) * 100);
  progress.value = percent;
  progressText.textContent = `${percent}% (${decodedLines}/${HEIGHT} líneas)`;
  if (decodedLines >= HEIGHT) {
    downloadButton.disabled = false;
    setStatus('Decodificación completada. Puedes descargar la imagen.');
  }
}

function decodeLoop() {
  if (!decodingActive || !pcmData) {
    return;
  }

  const elapsed = player.currentTime - syncStartSec;
  if (elapsed >= 0) {
    const availableLines = Math.min(HEIGHT, Math.floor((elapsed * 1000) / MARTIN_M1.lineMs));
    let linesPerFrame = 0;
    while (decodedLines < availableLines && linesPerFrame < 4) {
      decodeLine(decodedLines);
      decodedLines += 1;
      linesPerFrame += 1;
    }
    updateProgress();
  }

  if (!player.paused && !player.ended) {
    rafId = requestAnimationFrame(decodeLoop);
  } else {
    decodingActive = false;
    if (player.ended && decodedLines < HEIGHT) {
      setStatus('Audio finalizado antes de completar toda la imagen.');
    }
  }
}

async function decodeAudioFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  const audioContext = new AudioContext();
  try {
    const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    sampleRate = decoded.sampleRate;
    pcmData = decoded.getChannelData(0);
    syncStartSec = detectSyncStart();
  } finally {
    await audioContext.close();
  }
}

function setPlayerSourceFromFile(file) {
  if (!file.type.startsWith('audio/')) {
    throw new Error('El archivo seleccionado no es de audio.');
  }

  const nextUrl = URL.createObjectURL(file);
  const parsedUrl = new URL(nextUrl, window.location.href);
  if (parsedUrl.protocol !== 'blob:') {
    URL.revokeObjectURL(nextUrl);
    throw new Error('Se bloqueó una URL de audio inválida.');
  }

  player.src = parsedUrl.toString();
  return nextUrl;
}

audioInput.addEventListener('change', async (event) => {
  const [file] = event.target.files;
  if (!file) {
    return;
  }

  if (audioFileUrl) {
    URL.revokeObjectURL(audioFileUrl);
  }

  audioFileUrl = setPlayerSourceFromFile(file);
  listenButton.disabled = true;
  setStatus('Procesando audio y buscando sincronía SSTV...');
  resetDecoderState();

  try {
    await decodeAudioFile(file);
    if (sampleRate !== 44100) {
      setStatus(`Audio cargado (${sampleRate} Hz). Recomendado: 44100 Hz PCM 16-bit.`);
    } else {
      setStatus('Audio cargado. Pulsa Escuchar para iniciar la decodificación.');
    }
    listenButton.disabled = false;
  } catch (error) {
    console.error(error);
    setStatus('No se pudo decodificar el audio. Verifica que sea un archivo válido.');
  }
});

listenButton.addEventListener('click', async () => {
  if (!pcmData) {
    return;
  }

  cancelAnimationFrame(rafId);
  player.currentTime = 0;
  resetDecoderState();
  setStatus('Reproduciendo y decodificando imagen pixel a pixel...');

  try {
    await player.play();
  } catch (error) {
    console.error(error);
    setStatus('No se pudo iniciar la reproducción del audio.');
    return;
  }

  decodingActive = true;
  decodeLoop();
});

player.addEventListener('pause', () => {
  if (decodingActive && !player.ended) {
    setStatus('Pausado. Reanuda la reproducción para continuar.');
  }
});

player.addEventListener('ended', () => {
  decodingActive = false;
  if (decodedLines >= HEIGHT) {
    setStatus('Reproducción finalizada y decodificación completa.');
  }
});

downloadButton.addEventListener('click', () => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const link = document.createElement('a');
  link.download = `sstv-${timestamp}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
});

resetDecoderState();
