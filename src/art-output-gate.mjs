import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

const SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');
const MAX_PIXELS = 24_000_000;
const TARGET = { sprite: null, prop: [512, 512], background: null };
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const isU32 = n => Number.isSafeInteger(n) && n > 0 && n <= 32768;

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let i = 0; i < 8; i++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0);
  return c >>> 0;
});
function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = (c >>> 8) ^ crcTable[(c ^ byte) & 255];
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}

/** Fail closed for unsupported PNG modes; no optional native imaging dependencies. */
export function decodeProductionPng(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 57 || !bytes.subarray(0, 8).equals(SIGNATURE))
    throw new Error('PNG_SIGNATURE_INVALID');
  let offset = 8, ihdr = null, ended = false;
  const idat = [];
  while (offset + 12 <= bytes.length) {
    const len = bytes.readUInt32BE(offset);
    if (len > bytes.length - offset - 12) throw new Error('PNG_CHUNK_TRUNCATED');
    const name = bytes.toString('ascii', offset + 4, offset + 8);
    const body = bytes.subarray(offset + 8, offset + 8 + len);
    const chunkCrc = bytes.readUInt32BE(offset + 8 + len);
    if (crc32(bytes.subarray(offset + 4, offset + 8 + len)) !== chunkCrc)
      throw new Error('PNG_CHUNK_CRC_INVALID');
    offset += 12 + len;
    if (name === 'IHDR') {
      if (ihdr || len !== 13) throw new Error('PNG_IHDR_INVALID');
      const width = body.readUInt32BE(0), height = body.readUInt32BE(4);
      const bitDepth = body[8], colorType = body[9];
      if (!isU32(width) || !isU32(height) || width * height > MAX_PIXELS)
        throw new Error('PNG_DIMENSIONS_UNSUPPORTED');
      if (bitDepth !== 8 || ![2, 6].includes(colorType) || body[10] !== 0 ||
          body[11] !== 0 || body[12] !== 0)
        throw new Error('PNG_MODE_UNSUPPORTED: require noninterlaced RGB8/RGBA8');
      ihdr = { width, height, channels: colorType === 6 ? 4 : 3 };
    } else if (name === 'IDAT') {
      if (!ihdr) throw new Error('PNG_CHUNK_ORDER_INVALID');
      idat.push(body);
    } else if (name === 'IEND') {
      if (len !== 0) throw new Error('PNG_IEND_INVALID');
      ended = true; break;
    } else if (name[0] === name[0]?.toUpperCase() && !['PLTE', 'tRNS'].includes(name)) {
      throw new Error('PNG_CRITICAL_CHUNK_UNSUPPORTED');
    }
  }
  if (!ihdr || !ended || !idat.length || offset !== bytes.length)
    throw new Error('PNG_STRUCTURE_INCOMPLETE');
  const { width, height, channels } = ihdr;
  const stride = width * channels, expected = height * (stride + 1);
  let inflated;
  try {
    inflated = zlib.inflateSync(Buffer.concat(idat), { maxOutputLength: expected + 1 });
  } catch { throw new Error('PNG_DECOMPRESSION_FAILED'); }
  if (inflated.length !== expected) throw new Error('PNG_RASTER_SIZE_INVALID');
  const raw = Buffer.alloc(stride * height);
  let src = 0;
  for (let y = 0; y < height; y++) {
    const filter = inflated[src++], base = y * stride;
    if (filter > 4) throw new Error('PNG_FILTER_INVALID');
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? raw[base + i - channels] : 0;
      const b = y ? raw[base + i - stride] : 0;
      const c = y && i >= channels ? raw[base + i - stride - channels] : 0;
      let p = 0;
      if (filter === 1) p = a;
      else if (filter === 2) p = b;
      else if (filter === 3) p = (a + b) >>> 1;
      else if (filter === 4) {
        const v = a + b - c;
        const da = Math.abs(v - a), db = Math.abs(v - b), dc = Math.abs(v - c);
        p = da <= db && da <= dc ? a : db <= dc ? b : c;
      }
      raw[base + i] = (inflated[src++] + p) & 255;
    }
  }
  const pixels = Buffer.alloc(width * height * 4);
  for (let i = 0, j = 0; i < raw.length; i += channels, j += 4) {
    pixels[j] = raw[i]; pixels[j + 1] = raw[i + 1]; pixels[j + 2] = raw[i + 2];
    pixels[j + 3] = channels === 4 ? raw[i + 3] : 255;
  }
  return { width, height, pixels, sourceChannels: channels };
}

export function encodeProductionPng({ width, height, pixels }) {
  if (!isU32(width) || !isU32(height) || width * height > MAX_PIXELS ||
      pixels.length !== width * height * 4) throw new Error('PNG_ENCODE_INPUT_INVALID');
  const stride = width * 4;
  const scan = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) pixels.copy(scan, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    SIGNATURE, pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(scan, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}
function pixel(image, x, y) {
  const offset = (y * image.width + x) * 4;
  return image.pixels.subarray(offset, offset + 4);
}
/** Strong alternating neutral-color grid at any image corner. Conservative: opaque sprites also fail alpha check. */
function bakedCheckerboard(image) {
  const { width, height } = image;
  for (const tile of [4, 8, 12, 16, 24, 32, 48, 64]) {
    if (width < tile * 5 || height < tile * 5) continue;
    for (const [sx, sy] of [[0, 0], [width - tile * 4, 0], [0, height - tile * 4], [width - tile * 4, height - tile * 4]]) {
      let parityColors = [null, null], ok = true, n = 0;
      for (let iy = 0; iy < 4 && ok; iy++) for (let ix = 0; ix < 4; ix++) {
        const x = Math.min(width - 1, sx + Math.floor((ix + .5) * tile));
        const y = Math.min(height - 1, sy + Math.floor((iy + .5) * tile));
        const rgb = pixel(image, x, y);
        const p = (ix + iy) % 2;
        if (rgb[3] !== 255 || Math.max(rgb[0], rgb[1], rgb[2]) - Math.min(rgb[0], rgb[1], rgb[2]) > 12) { ok = false; break; }
        const val = (rgb[0] + rgb[1] + rgb[2]) / 3;
        if (parityColors[p] === null) parityColors[p] = val;
        else if (Math.abs(parityColors[p] - val) > 6) { ok = false; break; }
        n++;
      }
      if (ok && n === 16 && parityColors.every(Number.isFinite) &&
          Math.abs(parityColors[0] - parityColors[1]) >= 8 &&
          Math.abs(parityColors[0] - parityColors[1]) <= 110) return { detected: true, tileSize: tile };
    }
  }
  return { detected: false };
}

export function inspectArtOutput(file, { kind, width, height } = {}) {
  const absolute = path.resolve(file);
  const result = { schemaVersion: 1, path: absolute, kind: kind ?? null, status: 'BLOCKED_ART_OUTPUT', issues: [] };
  if (!['sprite', 'prop', 'background'].includes(kind)) {
    result.issues.push('ART_KIND_INVALID'); return result;
  }
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    result.issues.push('ART_FILE_NOT_FOUND'); return result;
  }
  result.sha256 = sha(absolute);
  result.bytes = fs.statSync(absolute).size;
  let image;
  try { image = decodeProductionPng(fs.readFileSync(absolute)); }
  catch (e) { result.issues.push(String(e.message)); return result; }
  result.dimensions = { width: image.width, height: image.height };
  if (TARGET[kind] && (width === undefined || height === undefined))
    [width, height] = TARGET[kind];
  if ((width !== undefined && (!isU32(width) || image.width !== width)) ||
      (height !== undefined && (!isU32(height) || image.height !== height)))
    result.issues.push('ART_DIMENSION_MISMATCH');
  let opaque = 0, transparent = 0, partial = 0, nonzero = 0, xmin = image.width, ymin = image.height, xmax = -1, ymax = -1;
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    const alpha = image.pixels[(y * image.width + x) * 4 + 3];
    if (alpha === 255) opaque++;
    else if (alpha === 0) transparent++;
    else partial++;
    if (alpha) { nonzero++; xmin = Math.min(xmin, x); ymin = Math.min(ymin, y); xmax = Math.max(xmax, x); ymax = Math.max(ymax, y); }
  }
  const cornerAlpha = [
    pixel(image, 0, 0)[3], pixel(image, image.width - 1, 0)[3],
    pixel(image, 0, image.height - 1)[3], pixel(image, image.width - 1, image.height - 1)[3]
  ];
  result.alpha = { opaque, transparent, partial, nonzero, cornerAlpha };
  result.bounds = nonzero ? { x: xmin, y: ymin, width: xmax - xmin + 1, height: ymax - ymin + 1 } : null;
  result.checkerboard = bakedCheckerboard(image);
  if (result.checkerboard.detected) result.issues.push('BAKED_CHECKERBOARD_SUSPECTED');
  if (kind !== 'background') {
    if (image.sourceChannels !== 4 || transparent === 0)
      result.issues.push('ART_ALPHA_MISSING_OR_OPAQUE');
    if (cornerAlpha.some(x => x !== 0))
      result.issues.push('ART_CORNERS_NOT_TRANSPARENT');
    if (!nonzero) result.issues.push('ART_EMPTY_ALPHA');
  }
  result.status = result.issues.length ? 'BLOCKED_ART_OUTPUT' : 'PASS_ART_OUTPUT_MECHANICAL';
  result.visualAcceptance = 'NOT_VERIFIED';
  return result;
}

/** Lossless crop-to-alpha-bounds + center/pad; no resampling or modifying occupied pixels. */
export function normalizeArtCanvas(inputFile, outputFile, { width = 512, height = 512 } = {}) {
  if (!isU32(width) || !isU32(height) || width * height > MAX_PIXELS)
    throw new Error('TARGET_CANVAS_INVALID');
  if (path.resolve(inputFile) === path.resolve(outputFile))
    throw new Error('NORMALIZE_WOULD_OVERWRITE_ORIGINAL');
  const source = inspectArtOutput(inputFile, { kind: 'prop', width: undefined, height: undefined });
  if (source.issues.some(x => !['ART_DIMENSION_MISMATCH'].includes(x)))
    throw new Error('NORMALIZE_SOURCE_FAILED_GATE: ' + source.issues.join(', '));
  if (!source.bounds || source.bounds.width > width || source.bounds.height > height)
    throw new Error('NORMALIZE_REQUIRES_RESAMPLING: no automatic downscale allowed');
  const image = decodeProductionPng(fs.readFileSync(inputFile));
  const pixels = Buffer.alloc(width * height * 4);
  const dx = Math.floor((width - source.bounds.width) / 2);
  const dy = Math.floor((height - source.bounds.height) / 2);
  for (let y = 0; y < source.bounds.height; y++) {
    const src = ((y + source.bounds.y) * image.width + source.bounds.x) * 4;
    const dst = ((y + dy) * width + dx) * 4;
    image.pixels.copy(pixels, dst, src, src + source.bounds.width * 4);
  }
  const resultBytes = encodeProductionPng({ width, height, pixels });
  fs.writeFileSync(outputFile, resultBytes, { flag: 'wx' });
  const verified = inspectArtOutput(outputFile, { kind: 'prop', width, height });
  if (verified.status !== 'PASS_ART_OUTPUT_MECHANICAL')
    throw new Error('NORMALIZE_OUTPUT_FAILED_GATE: ' + verified.issues.join(', '));
  return { status: 'NORMALIZED_LOSSLESS', sourceSha256: source.sha256, outputSha256: verified.sha256,
    outputPath: path.resolve(outputFile), dimensions: verified.dimensions, visualAcceptance: 'NOT_VERIFIED' };
}
export function inspectArtBatch(manifest, { projectDir = process.cwd() } = {}) {
  if (!Array.isArray(manifest?.assets) || manifest.assets.length < 1)
    return { status: 'BLOCKED_ART_BATCH', issues: ['ART_BATCH_MANIFEST_INVALID'], inspected: [] };
  const inspected = [];
  const root = fs.realpathSync(projectDir);
  for (const [index, asset] of manifest.assets.entries()) {
    if (typeof asset?.path !== 'string' || !asset.path || path.isAbsolute(asset.path) ||
        asset.path.split(/[\\/]/).includes('..')) {
      return { status: 'BLOCKED_ART_BATCH', firstFailedIndex: index, inspected, issues: ['ART_BATCH_PATH_INVALID'] };
    }
    const abs = path.resolve(root, asset.path);
    if (!abs.startsWith(root + path.sep)) {
      return { status: 'BLOCKED_ART_BATCH', firstFailedIndex: index, inspected, issues: ['ART_BATCH_PATH_ESCAPE'] };
    }
    const entry = inspectArtOutput(abs, { kind: asset.kind, width: asset.width, height: asset.height });
    inspected.push(entry);
    if (entry.status !== 'PASS_ART_OUTPUT_MECHANICAL')
      return { status: 'BLOCKED_ART_BATCH', firstFailedIndex: index, inspected, issues: entry.issues };
  }
  return { status: 'PASS_ART_BATCH_MECHANICAL', inspected, issues: [], visualAcceptance: 'NOT_VERIFIED' };
}
