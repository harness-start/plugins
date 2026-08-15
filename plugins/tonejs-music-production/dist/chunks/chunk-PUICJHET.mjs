// harness-source-hash: sha256:2e06468278cd853b202d164627aec70cd7bf251a27eb226740a171c4796ca45d

// plugins/tonejs-music-production/src/lib/wav.ts
var textEncoder = new TextEncoder();
function writeAscii(view, offset, value) {
  new Uint8Array(view.buffer, view.byteOffset + offset, value.length).set(textEncoder.encode(value));
}
function ascii(bytes, offset, length) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}
function encodePcm16Wav({ channels, sampleRate }) {
  if (!Array.isArray(channels) || channels.length === 0 || channels.length > 8) throw new Error("WAV_CHANNELS_INVALID");
  if (!Number.isInteger(sampleRate) || sampleRate < 8e3 || sampleRate > 192e3) throw new Error("WAV_SAMPLE_RATE_INVALID");
  const frames = channels[0]?.length;
  if (!Number.isInteger(frames) || channels.some((channel) => channel.length !== frames)) throw new Error("WAV_FRAME_COUNT_INVALID");
  const dataBytes = frames * channels.length * 2;
  const bytes = new Uint8Array(44 + dataBytes);
  const view = new DataView(bytes.buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels.length, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels.length * 2, true);
  view.setUint16(32, channels.length * 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);
  let offset = 44;
  for (let frame = 0; frame < frames; frame += 1) {
    for (const channel of channels) {
      const sample = Math.max(-1, Math.min(1, Number(channel[frame]) || 0));
      view.setInt16(offset, sample <= -1 ? -32768 : Math.round(sample * 32767), true);
      offset += 2;
    }
  }
  return bytes;
}
function analyzePcm16Wav(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength < 44 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WAVE") throw new Error("WAV_HEADER_INVALID");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let format = null;
  let dataOffset = -1;
  let dataBytes = 0;
  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const id = ascii(bytes, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const content = offset + 8;
    if (content + size > bytes.byteLength) throw new Error("WAV_CHUNK_TRUNCATED");
    if (id === "fmt ") {
      format = {
        audioFormat: view.getUint16(content, true),
        channels: view.getUint16(content + 2, true),
        sampleRate: view.getUint32(content + 4, true),
        blockAlign: view.getUint16(content + 12, true),
        bitsPerSample: view.getUint16(content + 14, true)
      };
    } else if (id === "data") {
      dataOffset = content;
      dataBytes = size;
    }
    offset = content + size + size % 2;
  }
  if (!format || dataOffset < 0 || format.audioFormat !== 1 || format.bitsPerSample !== 16 || format.channels <= 0) throw new Error("WAV_PCM16_REQUIRED");
  const frames = dataBytes / format.blockAlign;
  if (!Number.isInteger(frames)) throw new Error("WAV_DATA_ALIGNMENT_INVALID");
  let peak = 0;
  let squareSum = 0;
  let sum = 0;
  let clippedSamples = 0;
  let silentSamples = 0;
  const sampleCount = dataBytes / 2;
  for (let index = 0; index < sampleCount; index += 1) {
    const integer = view.getInt16(dataOffset + index * 2, true);
    const sample = integer / 32768;
    const absolute = Math.abs(sample);
    peak = Math.max(peak, absolute);
    squareSum += sample * sample;
    sum += sample;
    if (Math.abs(integer) >= 32767) clippedSamples += 1;
    if (absolute < 1e-3) silentSamples += 1;
  }
  const rms = sampleCount > 0 ? Math.sqrt(squareSum / sampleCount) : 0;
  return {
    format: "pcm16",
    sampleRate: format.sampleRate,
    channels: format.channels,
    bitsPerSample: format.bitsPerSample,
    frames,
    durationSeconds: frames / format.sampleRate,
    peakDbfs: peak > 0 ? 20 * Math.log10(peak) : Number.NEGATIVE_INFINITY,
    rmsDbfs: rms > 0 ? 20 * Math.log10(rms) : Number.NEGATIVE_INFINITY,
    dcOffset: sampleCount > 0 ? sum / sampleCount : 0,
    clippedSamples,
    nonSilentRatio: sampleCount > 0 ? 1 - silentSamples / sampleCount : 0
  };
}

export {
  encodePcm16Wav,
  analyzePcm16Wav
};
