#!/usr/bin/env node
// Generates a guaranteed-offline, dependency-free 1-second 440Hz sine-wave WAV
// fixture at samples/fixture-1s.wav. Unlike the downloaded samples, this file
// requires no network access, so it always exists for CI/offline testing.
//
// Usage: node scripts/gen-fixture-wav.mjs

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, "..", "samples", "fixture-1s.wav");

const SAMPLE_RATE = 16000;
const DURATION_SEC = 1;
const FREQ_HZ = 440; // A4
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;

function buildWav() {
  const numSamples = SAMPLE_RATE * DURATION_SEC;
  const blockAlign = (CHANNELS * BITS_PER_SAMPLE) / 8;
  const byteRate = SAMPLE_RATE * blockAlign;
  const dataSize = numSamples * blockAlign;

  const buf = Buffer.alloc(44 + dataSize);

  // RIFF header
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8, "ascii");

  // fmt chunk
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16); // chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(CHANNELS, 22);
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(BITS_PER_SAMPLE, 34);

  // data chunk
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataSize, 40);

  const amplitude = 0.5 * 32767;
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const sample = Math.round(amplitude * Math.sin(2 * Math.PI * FREQ_HZ * t));
    buf.writeInt16LE(sample, 44 + i * blockAlign);
  }

  return buf;
}

const wav = buildWav();
writeFileSync(OUT_PATH, wav);
console.log(`Wrote ${OUT_PATH} (${wav.length} bytes, ${DURATION_SEC}s @ ${SAMPLE_RATE}Hz)`);
