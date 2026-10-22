import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

// Decode 8-bit RGBA PNG (filter type 0..4)
function decodePngRgba(buf) {
  const width = buf.readUInt32BE(16)
  const height = buf.readUInt32BE(20)
  const bitDepth = buf[24]
  const colorType = buf[25]
  if (bitDepth !== 8 || colorType !== 6) {
    throw new Error(`Unsupported PNG: depth=${bitDepth}, colorType=${colorType}`)
  }

  let offset = 8
  const idatParts = []
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset)
    const type = buf.slice(offset + 4, offset + 8).toString('ascii')
    if (type === 'IDAT') {
      idatParts.push(buf.slice(offset + 8, offset + 8 + len))
    }
    offset += 8 + len + 4
  }

  const decompressed = zlib.inflateSync(Buffer.concat(idatParts))
  const bpp = 4
  const stride = 1 + width * bpp
  const rawRgba = Buffer.alloc(width * height * 4)

  function paeth(a, b, c) {
    const p = a + b - c
    const pa = Math.abs(p - a)
    const pb = Math.abs(p - b)
    const pc = Math.abs(p - c)
    if (pa <= pb && pa <= pc) return a
    if (pb <= pc) return b
    return c
  }

  const prevRow = Buffer.alloc(width * bpp)
  const curRow = Buffer.alloc(width * bpp)

  for (let y = 0; y < height; y++) {
    const filter = decompressed[y * stride]
    const rowStart = y * stride + 1

    for (let x = 0; x < width * bpp; x++) {
      const byte = decompressed[rowStart + x]
      const left = x >= bpp ? curRow[x - bpp] : 0
      const up = prevRow[x]
      const upLeft = x >= bpp ? prevRow[x - bpp] : 0

      let val = 0
      if (filter === 0) {
        val = byte
      } else if (filter === 1) {
        val = (byte + left) & 0xff
      } else if (filter === 2) {
        val = (byte + up) & 0xff
      } else if (filter === 3) {
        val = (byte + Math.floor((left + up) / 2)) & 0xff
      } else if (filter === 4) {
        val = (byte + paeth(left, up, upLeft)) & 0xff
      } else {
        val = byte
      }
      curRow[x] = val
    }

    curRow.copy(rawRgba, y * width * bpp)
    curRow.copy(prevRow)
  }

  return { width, height, data: rawRgba }
}

// CRC32 table
const crcTable = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
  let c = i
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  crcTable[i] = c >>> 0
}

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function makeChunk(type, data) {
  const lenBuf = Buffer.alloc(4)
  lenBuf.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  const toCrc = Buffer.concat([typeBuf, data])
  crcBuf.writeUInt32BE(crc32(toCrc), 0)
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf])
}

// Encode uncompressed/deflated RGBA into standard PNG
function encodePngRgba(width, height, rgbaBuffer) {
  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(width, 0)
  ihdrData.writeUInt32BE(height, 4)
  ihdrData[8] = 8 // bit depth
  ihdrData[9] = 6 // RGBA
  ihdrData[10] = 0 // deflate
  ihdrData[11] = 0 // filter
  ihdrData[12] = 0 // interlace
  const ihdrChunk = makeChunk('IHDR', ihdrData)

  const bpp = 4
  const rawData = Buffer.alloc(height * (1 + width * bpp))
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * bpp)] = 0 // filter none
    rgbaBuffer.copy(rawData, y * (1 + width * bpp) + 1, y * width * bpp, (y + 1) * width * bpp)
  }

  const deflated = zlib.deflateSync(rawData, { level: 9 })
  const idatChunk = makeChunk('IDAT', deflated)
  const iendChunk = makeChunk('IEND', Buffer.alloc(0))

  return Buffer.concat([header, ihdrChunk, idatChunk, iendChunk])
}

// Crop and fit logo into square with white background and balanced padding
function createPwaIcon(srcImg, targetSize, paddingRatio = 0.08) {
  // First, find bounding box of non-white content in srcImg
  const { width: srcW, height: srcH, data: srcData } = srcImg
  let minX = srcW,
    maxX = 0,
    minY = srcH,
    maxY = 0

  for (let y = 0; y < srcH; y++) {
    for (let x = 0; x < srcW; x++) {
      const idx = (y * srcW + x) * 4
      const r = srcData[idx]
      const g = srcData[idx + 1]
      const b = srcData[idx + 2]
      const a = srcData[idx + 3]
      // check if pixel is not pure white or transparent
      if (a > 30 && (r < 240 || g < 240 || b < 240)) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  console.log(`Content bounds: x=[${minX}, ${maxX}] y=[${minY}, ${maxY}] (src: ${srcW}x${srcH})`)

  const contentW = Math.max(1, maxX - minX + 1)
  const contentH = Math.max(1, maxY - minY + 1)

  // Target canvas: targetSize x targetSize
  // We want to fill the canvas with white background (#FFFFFF)
  // And draw the logo centered within (targetSize - 2 * padding)
  const canvas = Buffer.alloc(targetSize * targetSize * 4)
  // Fill with white
  for (let i = 0; i < targetSize * targetSize; i++) {
    canvas[i * 4] = 255
    canvas[i * 4 + 1] = 255
    canvas[i * 4 + 2] = 255
    canvas[i * 4 + 3] = 255
  }

  const pad = Math.round(targetSize * paddingRatio)
  const drawAreaSize = targetSize - pad * 2

  // Scale factor to fit content inside drawAreaSize
  const scale = Math.min(drawAreaSize / contentW, drawAreaSize / contentH)
  const destW = Math.round(contentW * scale)
  const destH = Math.round(contentH * scale)
  const destX = Math.round((targetSize - destW) / 2)
  const destY = Math.round((targetSize - destH) / 2)

  // Resample content into canvas with bilinear interpolation
  for (let dy = 0; dy < destH; dy++) {
    const srcYFloat = minY + (dy / destH) * contentH
    const y0 = Math.floor(srcYFloat)
    const y1 = Math.min(y0 + 1, srcH - 1)
    const wy1 = srcYFloat - y0
    const wy0 = 1 - wy1

    for (let dx = 0; dx < destW; dx++) {
      const srcXFloat = minX + (dx / destW) * contentW
      const x0 = Math.floor(srcXFloat)
      const x1 = Math.min(x0 + 1, srcW - 1)
      const wx1 = srcXFloat - x0
      const wx0 = 1 - wx1

      const idx00 = (y0 * srcW + x0) * 4
      const idx10 = (y0 * srcW + x1) * 4
      const idx01 = (y1 * srcW + x0) * 4
      const idx11 = (y1 * srcW + x1) * 4

      const cIdx = ((destY + dy) * targetSize + (destX + dx)) * 4

      for (let c = 0; c < 4; c++) {
        const top = srcData[idx00 + c] * wx0 + srcData[idx10 + c] * wx1
        const btm = srcData[idx01 + c] * wx0 + srcData[idx11 + c] * wx1
        canvas[cIdx + c] = Math.round(top * wy0 + btm * wy1)
      }
    }
  }

  return encodePngRgba(targetSize, targetSize, canvas)
}

// Convert 32x32 PNG to simple .ico format
function createIcoFromPng(png32Buf) {
  // ICO header: 6 bytes
  // ICONDIRENTRY: 16 bytes
  // PNG payload: png32Buf.length
  const icoHeader = Buffer.alloc(6)
  icoHeader.writeUInt16LE(0, 0) // Reserved
  icoHeader.writeUInt16LE(1, 2) // Type 1 = ICO
  icoHeader.writeUInt16LE(1, 4) // Count 1 image

  const dirEntry = Buffer.alloc(16)
  dirEntry[0] = 32 // width
  dirEntry[1] = 32 // height
  dirEntry[2] = 0 // colors (0 = >=8bpp)
  dirEntry[3] = 0 // reserved
  dirEntry.writeUInt16LE(1, 4) // color planes
  dirEntry.writeUInt16LE(32, 6) // bits per pixel
  dirEntry.writeUInt32LE(png32Buf.length, 8) // size of image
  dirEntry.writeUInt32LE(6 + 16, 12) // offset of image data

  return Buffer.concat([icoHeader, dirEntry, png32Buf])
}

function main() {
  const pngPath = path.resolve('src/assets/image-a9605.png')
  const srcBuf = fs.readFileSync(pngPath)
  const decoded = decodePngRgba(srcBuf)
  console.log(`Decoded source logo: ${decoded.width}x${decoded.height}`)

  const publicDir = path.resolve('public')
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true })
  }

  // 1. icon-192.png (192x192)
  console.log('Generating pwa-192x192.png...')
  const icon192 = createPwaIcon(decoded, 192, 0.1)
  fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), icon192)

  // 2. icon-512.png (512x512)
  console.log('Generating pwa-512x512.png...')
  const icon512 = createPwaIcon(decoded, 512, 0.1)
  fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), icon512)

  // 3. apple-touch-icon.png (180x180)
  console.log('Generating apple-touch-icon.png...')
  const appleIcon = createPwaIcon(decoded, 180, 0.12)
  fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), appleIcon)

  // 4. favicon-32x32.png and favicon.ico
  console.log('Generating favicon...')
  const favicon32 = createPwaIcon(decoded, 32, 0.06)
  fs.writeFileSync(path.join(publicDir, 'favicon-32x32.png'), favicon32)
  const faviconIco = createIcoFromPng(favicon32)
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), faviconIco)

  // 5. favicon-16x16.png
  const favicon16 = createPwaIcon(decoded, 16, 0.04)
  fs.writeFileSync(path.join(publicDir, 'favicon-16x16.png'), favicon16)

  console.log('All icons generated successfully!')
}

main()
