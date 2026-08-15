import { inflateSync } from "node:zlib";

const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/**
 * Decode 8-bit RGB/RGBA PNG to { width, height, rgba: Uint8ClampedArray }.
 * Supports filter types 0–4 on scanlines.
 */
export function decodePngToRgba(buf: Buffer | Uint8Array): { width: number; height: number; rgba: Uint8ClampedArray } {
  const bytes = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(PNG_SIG)) {
    throw new Error("PNG_SIGNATURE_INVALID");
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idats: Buffer[] = [];
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    offset += 4;
    const type = bytes.toString("ascii", offset, offset + 4);
    offset += 4;
    const data = bytes.subarray(offset, offset + length);
    offset += length + 4; // skip CRC
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data.readUInt8(8);
      colorType = data.readUInt8(9);
    } else if (type === "IDAT") {
      idats.push(data);
    } else if (type === "IEND") {
      break;
    }
  }
  if (!(width > 0) || !(height > 0) || bitDepth !== 8) {
    throw new Error(`PNG_UNSUPPORTED:${width}x${height} depth=${bitDepth}`);
  }
  if (![2, 6].includes(colorType)) {
    throw new Error(`PNG_COLOR_TYPE_UNSUPPORTED:${colorType}`);
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idats));
  const stride = 1 + width * bpp;
  if (raw.length !== height * stride) {
    throw new Error(`PNG_RAW_SIZE_MISMATCH:${raw.length}!=${height * stride}`);
  }
  const rgba = new Uint8ClampedArray(width * height * 4);
  const prev = new Uint8Array(width * bpp);
  const curr = new Uint8Array(width * bpp);
  for (let y = 0; y < height; y += 1) {
    const row = raw.subarray(y * stride, (y + 1) * stride);
    const filter = row[0];
    const slice = row.subarray(1);
    for (let i = 0; i < slice.length; i += 1) {
      const left = i >= bpp ? curr[i - bpp] ?? 0 : 0;
      const up = prev[i] ?? 0;
      const upLeft = i >= bpp ? prev[i - bpp] ?? 0 : 0;
      let val = slice[i] ?? 0;
      if (filter === 1) val = (val + left) & 255;
      else if (filter === 2) val = (val + up) & 255;
      else if (filter === 3) val = (val + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) val = (val + paeth(left, up, upLeft)) & 255;
      else if (filter !== 0) throw new Error(`PNG_FILTER_UNSUPPORTED:${filter}`);
      curr[i] = val;
    }
    for (let x = 0; x < width; x += 1) {
      const si = x * bpp;
      const di = (y * width + x) * 4;
      rgba[di] = curr[si] ?? 0;
      rgba[di + 1] = curr[si + 1] ?? 0;
      rgba[di + 2] = curr[si + 2] ?? 0;
      rgba[di + 3] = bpp === 4 ? curr[si + 3] ?? 0 : 255;
    }
    prev.set(curr);
  }
  return { width, height, rgba };
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}
