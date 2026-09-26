# 雷達回放 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 雷達圖層改為播放最近 3 小時（每 10 分鐘一格、共 19 格）的回波動畫：資料改用 CWA 歷史 API 的雷達回波格點 `O-A0059-001`，server 依 CWA 官方色標畫成 PNG 並長期快取，前端以單一 canvas source 切格播放，並提供「過去 → 現在」時間軸與 dBZ 圖例。

**Architecture:** 後端沿用 `ensureFresh → sync → repo → SQLite`：`syncRadar` 向 historyapi 取最近 19 格的時間存進 `radar_frames`，`/api/radar` 回傳各格網址；`/api/radar-frame?t=` 即時抓 9 MB 格點 XML、上色、編成 PNG，以 `immutable` 長期快取交給 CDN。前端 `useRadarFrames` 同時載入 19 張 PNG 並重投影，`RadarLayer` 把目前那格畫進一張顯示用 canvas 後 `play(); pause();` 更新 texture；`TimeTrack` 由既有 `Timeline` 抽出，預報與雷達時間軸共用。

**Tech Stack:** TypeScript、better-sqlite3、fflate、Vitest、React 19、MapLibre GL 6、TanStack Query、Zustand。

**Spec:** `docs/superpowers/specs/2026-09-26-radar-replay-design.md`

## Global Constraints

- 本計畫的程式碼已在 repo 副本中實際跑過：`npm test`（155 個測試）、`npm run typecheck`、`npm run build`（`build:db` 寫入 `radar_frames: 19`）；以 2026-09-26 的 CWA 即時資料確認 `syncRadar` 取得 19 格、單格 PNG 921×881、約 22 KB、端到端約 0.8 秒；瀏覽器實測播放、停留、拖曳、鍵盤、切換底圖與切換圖層。照抄即可，不要「順手改善」。
- 不新增任何相依套件（PNG 以既有 `fflate` 壓縮、手寫檔頭）。
- 程式碼註解用繁體中文，風格同既有檔案（短、說明「為什麼」）。
- CWA 時間一律是 `+08:00` ISO 字串；前端格式化直接取字元，不經 `Date` 轉時區。
- 資料集 `O-A0059-001`（雷達整合回波格點）：歷史 API `historyapi/v1/getMetadata` 取時間清單（`timeFrom` = 現在 − 4 小時，臺北時間、不帶時區），取最後 19 格；`historyapi/v1/getData/O-A0059-001/YYYY/MM/DD/HH/mm/00` 取單格（302 轉址到 S3）。不再使用 `O-A0058-005`。
- 格點 921×881、0.0125°、左下角 115.0°E／18.0°N、由西向東再由南往北；`RADAR_BOUNDS = [114.99375, 17.99375, 126.50625, 29.00625]`。
- 色標 `RADAR_COLORS` 66 色對應 0–65 dBZ，`floor(dBZ)` 取色、≥ 65 用最後一色、< 0（含 `-99`、`-999`）透明。
- 單格成功：`cache-control: public, max-age=31536000, s-maxage=31536000, immutable`；CWA 404 → 404 `public, s-maxage=60`；其他 CWA 錯誤 → 502 `no-store`；`t` 不合法 → 400 `no-store`。
- 播放每格 500 ms，播到「現在」停 1.5 秒再從最舊一格重播；時間軸位置不寫進網址。
- **CWA 授權碼不可出現在錯誤訊息、log、fixture 或 commit。** historyapi 的回應會把授權碼夾在 `ProductURL` 裡。
- `TTL.radar` 維持 `10 * MIN`；前端 `refetchInterval: TEN_MIN`。
- Commit 訊息：英文 subject＋中英雙語 body，不加 trailer（repo 既有慣例）。每個 Task 最後一步附完整訊息，用 `git commit -F -` 搭配 heredoc 提交。
- 測試指令：`npm test`（Vitest 一次跑完 server 與 frontend）、`npm run typecheck`。單檔可用 `npx vitest run <path>`。
- 本機看畫面：`npm run dev` → `http://localhost:5173`（需要 `.env` 的 `CWA_API_KEY`）。**MapLibre 只在前景分頁渲染**：背景分頁不觸發 `requestAnimationFrame`，地圖全黑、播放不會前進，這不是程式錯誤。
- **本機連 CWA 的 S3 偶爾極慢**（實測同一個 8.9 MB 檔案時而 0.5 秒、時而 60～100 秒，npm registry 同時間正常）。單格因逾時回 502 時重新整理即可；Vercel（hnd1）與 S3（ap-northeast-1）同區，不受影響。
- Task 3 完成後到 Task 6 完成前，瀏覽器的雷達圖層暫時沒有畫面（`/api/radar` 形狀已換、前端尚未跟上），屬預期；測試與型別檢查全程保持通過。

## Review Focus

1. 單格下載很慢或失敗（本機實測 S3 偶爾 60～100 秒）：該格刻度標為失敗色、其他格照常播放、地圖停在前一格畫面，不會整個圖層消失 — Task 8 手動步驟 5（DevTools 封鎖一格）。
2. 停在雷達圖層切換底圖（`setStyle` 會清掉所有圖層）：雷達圖層與目前那一格要重新出現 — Task 6 手動步驟 3、Task 8 手動步驟 4。
3. 停在雷達圖層超過 10 分鐘，清單往後滑一格或因缺格變短：停在「現在」者仍是最新一格 — Task 5 `radarIndex` 測試 `maps positions to frame indexes, clamped to the list`。
4. 在雷達圖層播放中切到溫度再切回雷達：雷達回到「現在」且停止播放；預報時間軸（拖曳、鍵盤、日期標籤）行為與改版前相同 — Task 7 手動步驟、Task 8 手動步驟 3。
5. historyapi 回傳亂序或空清單：排序後取最後 19 格；空清單不清掉舊資料 — Task 3 `sorts frames that arrive out of order`、`keeps the old list when CWA returns no frames`。

---

## 檔案結構

| 檔案 | 動作 | 責任 |
|---|---|---|
| `shared/radar.ts` | 新增 | `RADAR_COLORS`、`radarColor`、`RADAR_GRID`、`RADAR_BOUNDS`（前後端共用） |
| `server/png.ts` | 新增 | `crc32`、`encodePng` |
| `server/png.test.ts` | 新增 | PNG 編碼測試 |
| `server/radar.ts` | 新增 | `frameKey`、`framePath`、`parseRadarGrid`、`radarRgba` |
| `server/radar.test.ts` | 新增 | 色標、範圍、格點解析與上色測試 |
| `server/cwa/client.ts` | 修改 | `historyMetadata`、`historyData`、`NotFoundError` |
| `server/cwa/client.test.ts` | 修改 | 歷史 API client 測試 |
| `server/sync.test.ts` | 修改 | fake Fetcher 補歷史 API stub；`syncRadar` 測試；移除雷達圖片測試 |
| `shared/types.ts` | 修改 | `RadarFrame`、`RadarFrames`；`ImageKind` 只剩 `'satellite'` |
| `server/__fixtures__/O-A0059-001-metadata.json` | 新增 | 歷史 API metadata（21 筆，已移除授權碼） |
| `server/__fixtures__/O-A0058-005.json` | 刪除 | 舊雷達圖片 fixture |
| `server/cwa/parse.ts` | 修改 | `parseRadarTimes`；`parseImage` 移除雷達分支 |
| `server/cwa/parse.test.ts` | 修改 | 解析測試 |
| `server/db.ts` | 修改 | `radar_frames` 表 |
| `server/repo.ts` | 修改 | `replaceRadarFrames`、`listRadarFrames` |
| `server/repo.test.ts` | 修改 | repo 測試 |
| `server/sync.ts` | 修改 | `syncRadar`；`syncImage` 只剩衛星 |
| `server/service.ts` | 修改 | `getRadar`（取代 `getImageOverlay`） |
| `api/radar.ts` | 修改 | 回傳時間清單 |
| `scripts/build-db.ts` | 修改 | 種子 DB 改抓雷達時間清單 |
| `server/radarFrame.ts` | 新增 | `radarFrameResponse`（單格 PNG 回應） |
| `server/radarFrame.test.ts` | 新增 | 單格回應測試 |
| `api/radar-frame.ts` | 新增 | `GET /api/radar-frame` |
| `frontend/src/lib/radar.ts` | 新增 | `advanceRadar`、`snapRadar`、`radarIndex`、`agoLabel`、`hourTicks` |
| `frontend/src/lib/radar.test.ts` | 新增 | 純函式與色階測試 |
| `frontend/src/lib/colorScale.ts` | 修改 | `radar` 色階 |
| `frontend/src/store.ts` | 修改 | `radarPos`、`setRadarPos` |
| `frontend/src/lib/overlays.ts` | 修改 | 匯出 `loadImage`；移除 `radarOverlay` |
| `frontend/src/api.ts` | 修改 | `useRadar`、`useRadarFrames`（取代 `useOverlay`、`useReprojected`） |
| `frontend/src/components/RadarLayer.tsx` | 新增 | 單一 canvas source 顯示目前那一格 |
| `frontend/src/components/DataLayers.tsx` | 修改 | 掛上 `RadarLayer`、移除舊雷達圖層 |
| `frontend/src/components/StatusBadge.tsx` | 修改 | 雷達改讀 `useRadar` |
| `frontend/src/components/TimeTrack.tsx` | 新增 | 播放鈕＋可拖曳軌道＋刻度；`measureHeight` |
| `frontend/src/components/Timeline.tsx` | 修改 | 改用 `TimeTrack`；雷達圖層顯示 `RadarTimeline` |
| `frontend/src/components/RadarTimeline.tsx` | 新增 | 雷達時間軸 |
| `frontend/src/styles.css` | 修改 | 載入中、失敗的刻度樣式 |
| `README.md` | 修改 | 功能、截圖、架構圖、TTL 表、專案結構、API 表 |
| `docs/screenshots/radar.png` | 修改 | 重截（含時間軸） |

---

### Task 1：色標、格點解析、PNG 編碼

**Files:**
- Create: `shared/radar.ts`、`server/png.ts`、`server/radar.ts`
- Test: `server/png.test.ts`、`server/radar.test.ts`

**Interfaces:**
- Consumes: `Bounds`（`shared/types.ts`）、`fflate` 的 `zlibSync`
- Produces:
  - `shared/radar.ts`：`RADAR_COLORS: [number, number, number][]`（66 色）、`radarColor(dbz: number): [number, number, number] | null`、`RADAR_GRID = { west: 115, south: 18, step: 0.0125, nx: 921, ny: 881 } as const`、`RADAR_BOUNDS: Bounds`
  - `server/png.ts`：`crc32(bytes: Uint8Array): number`、`encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array<ArrayBuffer>`
  - `server/radar.ts`：`frameKey(time: string): string`（`'2026-09-26T11:30:00+08:00'` → `'202609261130'`）、`framePath(t: string): string | null`（`'202609261130'` → `'2026/09/26/11/30/00'`）、`parseRadarGrid(xml: string, nx = 921, ny = 881): Float32Array`、`radarRgba(values: Float32Array, nx = 921, ny = 881): Uint8Array`

- [ ] **Step 1：寫 PNG 測試**

新增 `server/png.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { unzlibSync } from 'fflate'
import { crc32, encodePng } from './png.js'

const u32 = (b: Uint8Array, at: number) => new DataView(b.buffer, b.byteOffset).getUint32(at)
const ascii = (b: Uint8Array, at: number) => String.fromCharCode(...b.subarray(at, at + 4))

/** 依序切出各 chunk，順便驗 CRC */
function chunks(png: Uint8Array) {
  const out: { type: string; data: Uint8Array }[] = []
  for (let at = 8; at < png.length;) {
    const len = u32(png, at)
    const type = ascii(png, at + 4)
    const data = png.subarray(at + 8, at + 8 + len)
    expect(u32(png, at + 8 + len)).toBe(crc32(png.subarray(at + 4, at + 8 + len)))
    out.push({ type, data })
    at += 12 + len
  }
  return out
}

describe('crc32', () => {
  it('matches the standard check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })
})

describe('encodePng', () => {
  // 2×2：紅、綠／藍、透明
  const rgba = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 0, 0])
  const png = encodePng(2, 2, rgba)

  it('starts with the PNG signature', () => {
    expect(Array.from(png.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  })

  it('writes IHDR, IDAT and IEND with valid CRCs', () => {
    const list = chunks(png)
    expect(list.map(c => c.type)).toEqual(['IHDR', 'IDAT', 'IEND'])
    const ihdr = list[0].data
    expect([u32(ihdr, 0), u32(ihdr, 4)]).toEqual([2, 2])
    // bit depth 8、color type 6（RGBA）、壓縮／濾波／交錯皆 0
    expect(Array.from(ihdr.subarray(8))).toEqual([8, 6, 0, 0, 0])
  })

  it('stores each row with filter byte 0 followed by the raw pixels', () => {
    const raw = unzlibSync(chunks(png)[1].data)
    expect(Array.from(raw)).toEqual([0, ...rgba.subarray(0, 8), 0, ...rgba.subarray(8)])
  })
})
```

- [ ] **Step 2：寫色標與格點測試**

新增 `server/radar.test.ts`（vitest 只收 `server/` 與 `frontend/src/`，`shared/radar.ts` 的測試也放這裡）：

```ts
import { describe, it, expect } from 'vitest'
import { RADAR_BOUNDS, RADAR_COLORS, radarColor } from '../shared/radar.js'
import { frameKey, framePath, parseRadarGrid, radarRgba } from './radar.js'

const xml = (nx: number, ny: number, values: string) => `<?xml version="1.0" encoding="UTF-8"?>
<cwaopendata><dataset><datasetInfo><parameterSet>
  <GridDimensionX>${nx}</GridDimensionX>
  <GridDimensionY>${ny}</GridDimensionY>
</parameterSet></datasetInfo>
<contents><content>${values}</content></contents></dataset></cwaopendata>`

describe('radarColor', () => {
  it('leaves negative, invalid and out-of-range values transparent', () => {
    for (const v of [-999, -99, -0.1, NaN]) expect(radarColor(v)).toBeNull()
  })
  it('uses one colour per whole dBZ', () => {
    expect(radarColor(0)).toEqual([0, 255, 255])
    expect(radarColor(14.9)).toEqual([0, 0, 255])
    expect(radarColor(15)).toEqual([0, 255, 0])
  })
  it('clamps at 65 dBZ', () => {
    expect(RADAR_COLORS).toHaveLength(66)
    expect(radarColor(65)).toEqual([150, 0, 255])
    expect(radarColor(80)).toEqual([150, 0, 255])
  })
})

describe('RADAR_BOUNDS', () => {
  it('extends half a cell beyond the outer grid points', () => {
    const [w, s, e, n] = RADAR_BOUNDS
    expect(w).toBeCloseTo(114.99375, 9)
    expect(s).toBeCloseTo(17.99375, 9)
    expect(e).toBeCloseTo(126.50625, 9)
    expect(n).toBeCloseTo(29.00625, 9)
  })
})

describe('parseRadarGrid', () => {
  it('reads values in CWA order', () => {
    const grid = parseRadarGrid(xml(3, 2, '-9.990E+02,1.500E+01,3.000E+01,-9.900E+01,4.500E+01,6.500E+01'), 3, 2)
    expect(Array.from(grid)).toEqual([-999, 15, 30, -99, 45, 65])
  })
  it('rejects unexpected dimensions', () => {
    expect(() => parseRadarGrid(xml(2, 2, '1,2,3,4'), 3, 2)).toThrow('Unexpected radar grid 2x2')
  })
  it('rejects a value count that does not match the dimensions', () => {
    expect(() => parseRadarGrid(xml(3, 2, '1,2,3,4,5'), 3, 2)).toThrow('5 values')
  })
})

describe('radarRgba', () => {
  it('puts the northern row first and leaves no-echo cells transparent', () => {
    // 南列：-999、15、30；北列：-99、45、65
    const rgba = radarRgba(Float32Array.from([-999, 15, 30, -99, 45, 65]), 3, 2)
    const px = (i: number) => Array.from(rgba.subarray(i * 4, i * 4 + 4))
    expect([px(0), px(1), px(2)]).toEqual([[0, 0, 0, 0], [255, 0, 0, 255], [150, 0, 255, 255]])
    expect([px(3), px(4), px(5)]).toEqual([[0, 0, 0, 0], [0, 255, 0, 255], [255, 255, 0, 255]])
  })
})

describe('frameKey / framePath', () => {
  it('turns a CWA time into the YYYYMMDDHHmm key and the key into the getData path', () => {
    expect(frameKey('2026-09-26T11:30:00+08:00')).toBe('202609261130')
    expect(framePath('202609261130')).toBe('2026/09/26/11/30/00')
  })
  it('rejects keys that are not on the 10-minute grid', () => {
    for (const t of ['202609261135', '2026092611', '20260926113000', 'abcdefghijkl']) expect(framePath(t)).toBeNull()
  })
})
```

- [ ] **Step 3：確認測試失敗**

Run: `npx vitest run server/png.test.ts server/radar.test.ts`
Expected: FAIL，`Failed to resolve import "./png.js"`／`"../shared/radar.js"`。

- [ ] **Step 4：新增 `shared/radar.ts`**

```ts
import type { Bounds } from './types.js'

/** CWA 雷達色標：dBZ 0–65，每 1 dBZ 一色（https://www.cwa.gov.tw/V8/assets/img/radar/colorbar_n.png） */
export const RADAR_COLORS: [number, number, number][] = [
  [0, 255, 255], [0, 236, 255], [0, 218, 255], [0, 200, 255], [0, 182, 255], [0, 163, 255], [0, 145, 255], [0, 127, 255],
  [0, 109, 255], [0, 91, 255], [0, 72, 255], [0, 54, 255], [0, 36, 255], [0, 18, 255], [0, 0, 255],
  [0, 255, 0], [0, 244, 0], [0, 233, 0], [0, 222, 0], [0, 211, 0], [0, 200, 0], [0, 190, 0], [0, 180, 0], [0, 170, 0],
  [0, 160, 0], [0, 150, 0], [51, 171, 0], [102, 192, 0], [153, 213, 0], [204, 234, 0],
  [255, 255, 0], [255, 244, 0], [255, 233, 0], [255, 222, 0], [255, 211, 0], [255, 200, 0], [255, 184, 0], [255, 168, 0],
  [255, 152, 0], [255, 136, 0], [255, 120, 0], [255, 96, 0], [255, 72, 0], [255, 48, 0], [255, 24, 0],
  [255, 0, 0], [244, 0, 0], [233, 0, 0], [222, 0, 0], [211, 0, 0], [200, 0, 0], [190, 0, 0], [180, 0, 0], [170, 0, 0],
  [160, 0, 0], [150, 0, 0], [171, 0, 51], [192, 0, 102], [213, 0, 153], [234, 0, 204],
  [255, 0, 255], [234, 0, 255], [213, 0, 255], [192, 0, 255], [171, 0, 255], [150, 0, 255],
]

/** 負值（含 -99 無效值、-999 範圍外）不上色 */
export function radarColor(dbz: number): [number, number, number] | null {
  if (!(dbz >= 0)) return null
  return RADAR_COLORS[Math.min(RADAR_COLORS.length - 1, Math.floor(dbz))]
}

/** O-A0059-001 格點：左下角格點 115.0°E、18.0°N，每 0.0125° 一點 */
export const RADAR_GRID = { west: 115, south: 18, step: 0.0125, nx: 921, ny: 881 } as const

/** 以格點為中心往外推半格 */
export const RADAR_BOUNDS: Bounds = [
  RADAR_GRID.west - RADAR_GRID.step / 2,
  RADAR_GRID.south - RADAR_GRID.step / 2,
  RADAR_GRID.west + (RADAR_GRID.nx - 0.5) * RADAR_GRID.step,
  RADAR_GRID.south + (RADAR_GRID.ny - 0.5) * RADAR_GRID.step,
]
```

- [ ] **Step 5：新增 `server/png.ts`**

回傳型別寫 `Uint8Array<ArrayBuffer>`：TS 5.7 起 typed array 帶泛型，`Uint8Array<ArrayBufferLike>` 不能直接當 `new Response()` 的 body（Task 4 會用到）。

```ts
import { zlibSync } from 'fflate'

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]

/** 8-bit RGBA PNG；每列 filter 0，整張壓成單一 IDAT */
export function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array<ArrayBuffer> {
  const ihdr = new Uint8Array(13)
  const view = new DataView(ihdr.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  ihdr.set([8, 6, 0, 0, 0], 8)
  const stride = width * 4
  const raw = new Uint8Array((stride + 1) * height)
  for (let y = 0; y < height; y++) raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1)
  const parts = [new Uint8Array(SIGNATURE), chunk('IHDR', ihdr), chunk('IDAT', zlibSync(raw)), chunk('IEND', new Uint8Array())]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) { out.set(p, at); at += p.length }
  return out
}
```

- [ ] **Step 6：新增 `server/radar.ts`**

```ts
import { RADAR_GRID, radarColor } from '../shared/radar.js'

/** +08:00 ISO → /api/radar-frame 的 t（YYYYMMDDHHmm，臺北時間） */
export const frameKey = (time: string) => time.slice(0, 16).replace(/\D/g, '')

/** t（YYYYMMDDHHmm，分鐘為 10 的倍數）→ historyapi getData 的路徑；格式不符回 null */
export function framePath(t: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d0)$/.exec(t)
  return m ? `${m[1]}/${m[2]}/${m[3]}/${m[4]}/${m[5]}/00` : null
}

const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1]

/** O-A0059-001 XML → dBZ 陣列，順序同 CWA：由西向東、再由南往北 */
export function parseRadarGrid(xml: string, nx: number = RADAR_GRID.nx, ny: number = RADAR_GRID.ny): Float32Array {
  const dx = Number(tag(xml, 'GridDimensionX'))
  const dy = Number(tag(xml, 'GridDimensionY'))
  if (dx !== nx || dy !== ny) throw new Error(`Unexpected radar grid ${dx}x${dy}`)
  const content = tag(xml, 'content')
  if (content == null) throw new Error('Radar grid has no content')
  const parts = content.split(',')
  if (parts.length !== nx * ny) throw new Error(`Radar grid has ${parts.length} values, expected ${nx * ny}`)
  return Float32Array.from(parts, Number)
}

/** 上色成北在上的 RGBA；不上色的格子 alpha 0 */
export function radarRgba(values: Float32Array, nx: number = RADAR_GRID.nx, ny: number = RADAR_GRID.ny): Uint8Array {
  const out = new Uint8Array(nx * ny * 4)
  for (let j = 0; j < ny; j++) {
    const row = (ny - 1 - j) * nx
    for (let i = 0; i < nx; i++) {
      const c = radarColor(values[j * nx + i])
      if (!c) continue
      const p = (row + i) * 4
      out[p] = c[0]
      out[p + 1] = c[1]
      out[p + 2] = c[2]
      out[p + 3] = 255
    }
  }
  return out
}
```

- [ ] **Step 7：確認測試通過**

Run: `npx vitest run server/png.test.ts server/radar.test.ts`
Expected: PASS（2 個檔案、14 個測試）。

Run: `npm run typecheck`
Expected: 無錯誤。

- [ ] **Step 8：提交**

```bash
git add shared/radar.ts server/png.ts server/png.test.ts server/radar.ts server/radar.test.ts
git commit -F - <<'EOF'
feat(api): render radar grids to png

加入 CWA 官方雷達色標（0–65 dBZ、每 1 dBZ 一色）、O-A0059-001
格點的解析與上色（轉成北在上），以及以 fflate 壓縮的 RGBA PNG
編碼，不新增相依套件。

Add the official CWA radar palette (0–65 dBZ, one colour per
dBZ), parsing and colouring of the O-A0059-001 grid (flipped
north-up), and an RGBA PNG encoder on top of fflate, with no new
dependencies.
EOF
```

---

### Task 2：CWA 歷史 API client

**Files:**
- Modify: `server/cwa/client.ts`
- Modify: `server/sync.test.ts`（fake Fetcher 補 stub）
- Test: `server/cwa/client.test.ts`

**Interfaces:**
- Consumes: 無
- Produces: `Fetcher.historyMetadata(id: string, params: Record<string, string>): Promise<any>`、`Fetcher.historyData(id: string, path: string): Promise<Uint8Array>`、`class NotFoundError extends Error`（`historyData` 遇 HTTP 404 時拋出）

- [ ] **Step 1：寫測試**

`server/cwa/client.test.ts` 第 2 行改為：

```ts
import { cwa, NotFoundError } from './client.js'
```

在最後一個 `it(...)`（`downloads bytes and throws on non-OK`）之後、`describe` 結尾的 `})` 之前加：

```ts
  it('asks the history API for metadata since a given time', async () => {
    process.env.CWA_API_KEY = SECRET
    const fetch = vi.fn(async (_url: string) => Response.json({ ok: 1 }))
    vi.stubGlobal('fetch', fetch)
    expect(await cwa.historyMetadata('O-A0059-001', { timeFrom: '2026-09-26T07:40:00' })).toEqual({ ok: 1 })
    const url = new URL(fetch.mock.calls[0][0])
    expect(url.pathname).toBe('/historyapi/v1/getMetadata/O-A0059-001')
    expect(url.searchParams.get('timeFrom')).toBe('2026-09-26T07:40:00')
    expect(url.searchParams.get('format')).toBe('JSON')
  })

  it('downloads history data and tells a missing frame apart from other failures', async () => {
    process.env.CWA_API_KEY = SECRET
    const fetch = vi.fn(async (_url: string) => new Response(new Uint8Array([7])))
    vi.stubGlobal('fetch', fetch)
    expect(Array.from(await cwa.historyData('O-A0059-001', '2026/09/26/11/30/00'))).toEqual([7])
    expect(new URL(fetch.mock.calls[0][0]).pathname).toBe('/historyapi/v1/getData/O-A0059-001/2026/09/26/11/30/00')

    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
    await expect(cwa.historyData('O-A0059-001', '2026/09/26/11/30/00')).rejects.toBeInstanceOf(NotFoundError)

    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })))
    expect.assertions(5)
    try {
      await cwa.historyData('O-A0059-001', '2026/09/26/11/30/00')
    } catch (e) {
      expect(e).not.toBeInstanceOf(NotFoundError)
      expect(String(e)).not.toContain(SECRET)
    }
  })
```

- [ ] **Step 2：確認測試失敗**

Run: `npx vitest run server/cwa/client.test.ts`
Expected: FAIL，`cwa.historyMetadata is not a function`。

- [ ] **Step 3：實作 client**

`server/cwa/client.ts` 的 `Fetcher` 介面換成：

```ts
export interface Fetcher {
  dataset(id: string, params?: Record<string, string>): Promise<any>
  file(id: string): Promise<any>
  bytes(url: string): Promise<Uint8Array>
  historyMetadata(id: string, params: Record<string, string>): Promise<any>
  /** path 例：2026/09/26/11/30/00 */
  historyData(id: string, path: string): Promise<Uint8Array>
}

/** CWA 回 404：該時刻沒有資料 */
export class NotFoundError extends Error {}
```

`getJson` 換成（抽出 `redact` 給 `historyData` 共用）：

```ts
const redact = (url: string) => url.replace(/Authorization=[^&]+/, 'Authorization=***')

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`CWA HTTP ${res.status} ${redact(url)}`)
  return res.json()
}
```

`cwa` 物件在 `bytes` 之後加：

```ts
  historyMetadata(id, params) {
    const q = new URLSearchParams({ Authorization: apiKey(), format: 'JSON', ...params })
    return getJson(`${BASE}/historyapi/v1/getMetadata/${id}?${q}`)
  },
  // getData 會 302 轉址到 S3 的公開檔案
  async historyData(id, path) {
    const url = `${BASE}/historyapi/v1/getData/${id}/${path}?${new URLSearchParams({ Authorization: apiKey() })}`
    const res = await fetch(url, { signal: AbortSignal.timeout(BYTES_TIMEOUT_MS) })
    if (res.status === 404) throw new NotFoundError(`CWA ${id} has no ${path}`)
    if (!res.ok) throw new Error(`CWA HTTP ${res.status} ${redact(url)}`)
    return new Uint8Array(await res.arrayBuffer())
  },
```

- [ ] **Step 4：fake Fetcher 補 stub**

`Fetcher` 多了兩個方法，`server/sync.test.ts` 裡以 `Fetcher` 為型別的物件都要補上，否則 `npm run typecheck` 失敗。

在 `const empty = …` 那行之後加：

```ts
const noHistory = {
  historyMetadata: async () => { throw new Error('unexpected historyMetadata') },
  historyData: async () => { throw new Error('unexpected historyData') },
}
```

再把 `...noHistory` 加進下列 7 處：

1. `fakeFetcher` 回傳物件的 `async bytes(url) { … },` 之後加一行 `    ...noHistory,`。
2. `syncObservations` 的 `refuses to wipe data with an empty response`：`bytes: noBytes }` 改成 `bytes: noBytes, ...noHistory }`。
3. `syncObservations` 的 `refuses to wipe data when weather stations are empty even if rain has data`：`      bytes: noBytes,` 之後加 `      ...noHistory,`。
4. `syncForecast` 的 `refuses to wipe data when the week forecast yields zero slots`：同上。
5. `withTyphoons`：`    bytes: noBytes,` 之後加 `    ...noHistory,`。
6. `withWarnings`：同上。
7. `withQuakes`：同上。

- [ ] **Step 5：確認測試通過**

Run: `npx vitest run server/cwa/client.test.ts server/sync.test.ts`
Expected: PASS。

Run: `npm run typecheck`
Expected: 無錯誤。

- [ ] **Step 6：提交**

```bash
git add server/cwa/client.ts server/cwa/client.test.ts server/sync.test.ts
git commit -F - <<'EOF'
feat(api): add cwa history api client

client 加上 historyapi 的 getMetadata 與 getData（後者會 302
到 S3）；getData 回 404 時拋 NotFoundError，讓呼叫端分辨「沒有這
一格」與其他失敗。錯誤訊息一律遮蔽授權碼。

Add historyapi getMetadata and getData (which redirects to S3)
to the CWA client. getData throws NotFoundError on 404 so
callers can tell a missing frame from other failures, and error
messages keep the API key redacted.
EOF
```

---

### Task 3：雷達時間清單與 `/api/radar`

**Files:**
- Modify: `shared/types.ts`
- Create: `server/__fixtures__/O-A0059-001-metadata.json`
- Delete: `server/__fixtures__/O-A0058-005.json`
- Modify: `server/cwa/parse.ts`、`server/db.ts`、`server/repo.ts`、`server/sync.ts`、`server/service.ts`、`api/radar.ts`、`scripts/build-db.ts`
- Test: `server/cwa/parse.test.ts`、`server/repo.test.ts`、`server/sync.test.ts`

**Interfaces:**
- Consumes: `Fetcher.historyMetadata`（Task 2）、`frameKey`、`RADAR_BOUNDS`（Task 1）
- Produces:
  - 型別 `RadarFrame { time: string; url: string }`、`RadarFrames { frames: RadarFrame[]; bounds: Bounds }`；`ImageKind = 'satellite'`
  - `parseRadarTimes(json: any, count = 19): string[]`
  - `replaceRadarFrames(db: DB, times: string[]): void`、`listRadarFrames(db: DB): string[]`（由舊到新）
  - `syncRadar(db: DB, f: Fetcher = cwa, at = Date.now()): Promise<void>`
  - `getRadar(): Promise<ApiResponse<RadarFrames> | null>`
  - `GET /api/radar` → `ApiResponse<RadarFrames>`，每格 `url` 為 `/api/radar-frame?t=YYYYMMDDHHmm`

- [ ] **Step 1：新增 fixture、刪除舊 fixture**

2026-09-26 帶 `timeFrom=2026-09-26T08:00:00` 的實際回應，保留最後 21 筆，並**移除每筆 `ProductURL` 的 `?Authorization=…`**。

`server/__fixtures__/O-A0059-001-metadata.json`：

```json
{
 "dataset": {
  "success": "true",
  "result": {
   "resource_id": "O-A0059-001",
   "fields": [
    {
     "id": "DateTime",
     "type": "Timestamp"
    },
    {
     "id": "UpdateTime",
     "type": "Timestamp"
    },
    {
     "id": "ProductURL",
     "type": "String"
    }
   ]
  },
  "resources": {
   "resource": {
    "data": {
     "time": [
       {"DateTime":"2026-09-26T08:30:00+08:00","UpdateTime":"2026-09-26T08:36:45+08:00","ProductURL":"https://opendata.cwa.gov.tw/historyapi/v1/getData/O-A0059-001/2026/09/26/08/30/00"},
       {"DateTime":"2026-09-26T08:40:00+08:00","UpdateTime":"2026-09-26T08:46:37+08:00","ProductURL":"https://opendata.cwa.gov.tw/historyapi/v1/getData/O-A0059-001/2026/09/26/08/40/00"},
       {"DateTime":"2026-09-26T08:50:00+08:00","UpdateTime":"2026-09-26T08:56:46+08:00","ProductURL":"https://opendata.cwa.gov.tw/historyapi/v1/getData/O-A0059-001/2026/09/26/08/50/00"},
       {"DateTime":"2026-09-26T09:00:00+08:00","UpdateTime":"2026-09-26T09:06:41+08:00","ProductURL":"https://opendata.cwa.gov.tw/historyapi/v1/getData/O-A0059-001/2026/09/26/09/00/00"},
       {"DateTime":"2026-09-26T09:10:00+08:00","UpdateTime":"2026-09-26T09:16:49+08:00","ProductURL":"https://opendata.cwa.gov.tw/historyapi/v1/getData/O-A0059-001/2026/09/26/09/10/00"},
       {"DateTime":"2026-09-26T09:20:00+08:00","UpdateTime":"2026-09-26T09:26:45+08:00","ProductURL":"https://opendata.cwa.gov.tw/historyapi/v1/getData/O-A0059-001/2026/09/26/09/20/00"},
       {"DateTime":"2026-09-26T09:30:00+08:00","UpdateTime":"2026-09-26T09:36:32+08:00","ProductURL":"https://opendata.cwa.gov.tw/historyapi/v1/getData/O-A0059-001/2026/09/26/09/30/00"},
       {"DateTime":"2026-09-26T09:40:00+08:00","UpdateTime":"2026-09-26T09:46:35+08:00","ProductURL":"https://opendata.cwa.gov.tw/historyapi/v1/getData/O-A0059-001/2026/09/26/09/40/00"},
       {"DateTime":"2026-09-26T09:50:00+08:00","UpdateTime":"2026-09-26T09:56:49+08:00","ProductURL":"https://opendata.cwa.gov.tw/historyapi/v1/getData/O-A0059-001/2026/09/26/09/50/00"},
       {"DateTime":"2026-09-26T10:00:00+08:00","UpdateTime":"2026-09-26T10:06:42+08:00","ProductURL":"https://opendata.cwa.gov.tw/historyapi/v1/getData/O-A0059-001/2026/09/26/10/00/00"},
       {"DateTime":"2026-09-26T10:10:00+08:00","UpdateTime":"2026-09-26T10:16:32+08:00","ProductURL":"https://opendata.cwa.gov.tw/historyapi/v1/getData/O-A0059-001/2026/09/26/10/10/00"},
       {"DateTime":"2026-09-26T10:20:00+08:00","UpdateTime":"2026-09-26T10:26:44+08:00","ProductURL":"https://opendata.cwa.gov.tw/historyapi/v1/getData/O-A0059-001/2026/09/26/10/20/00"},
       {"DateTime":"2026-09-26T10:30:00+08:00","UpdateTime":"2026-09-26T10:36:32+08:00","ProductURL":"https://opendata.cwa.gov.tw/historyapi/v1/getData/O-A0059-001/2026/09/26/10/30/00"},
       {"DateTime":"2026-09-26T10:40:00+08:00","UpdateTime":"2026-09-26T10:46:42+08:00","ProductURL":"https://opendata.cwa.gov.tw/historyapi/v1/getData/O-A0059-001/2026/09/26/10/40/00"},
       {"DateTime":"2026-09-26T10:50:00+08:00","UpdateTime":"2026-09-26T10:57:36+08:00","ProductURL":"https://opendata.cwa.gov.tw/historyapi/v1/getData/O-A0059-001/2026/09/26/10/50/00"},
       {"DateTime":"2026-09-26T11:00:00+08:00","UpdateTime":"2026-09-26T11:06:51+08:00","ProductURL":"https://opendata.cwa.gov.tw/historyapi/v1/getData/O-A0059-001/2026/09/26/11/00/00"},
       {"DateTime":"2026-09-26T11:10:00+08:00","UpdateTime":"2026-09-26T11:16:38+08:00","ProductURL":"https://opendata.cwa.gov.tw/historyapi/v1/getData/O-A0059-001/2026/09/26/11/10/00"},
       {"DateTime":"2026-09-26T11:20:00+08:00","UpdateTime":"2026-09-26T11:26:49+08:00","ProductURL":"https://opendata.cwa.gov.tw/historyapi/v1/getData/O-A0059-001/2026/09/26/11/20/00"},
       {"DateTime":"2026-09-26T11:30:00+08:00","UpdateTime":"2026-09-26T11:36:41+08:00","ProductURL":"https://opendata.cwa.gov.tw/historyapi/v1/getData/O-A0059-001/2026/09/26/11/30/00"},
       {"DateTime":"2026-09-26T11:40:00+08:00","UpdateTime":"2026-09-26T11:46:51+08:00","ProductURL":"https://opendata.cwa.gov.tw/historyapi/v1/getData/O-A0059-001/2026/09/26/11/40/00"},
       {"DateTime":"2026-09-26T11:50:00+08:00","UpdateTime":"2026-09-26T11:56:44+08:00","ProductURL":"https://opendata.cwa.gov.tw/historyapi/v1/getData/O-A0059-001/2026/09/26/11/50/00"}
      ]
    }
   }
  }
 }
}
```

```bash
git rm server/__fixtures__/O-A0058-005.json
grep -c "Authorization\|CWA-" server/__fixtures__/O-A0059-001-metadata.json
```

Expected: 最後一行輸出 `0`。

- [ ] **Step 2：改測試**

`server/cwa/parse.test.ts`：

import 換成：

```ts
import {
  num, parseWeatherStations, parseRainStations, parseForecast3h, parseForecastWeek, parseImage, parseRadarTimes, parseTyphoons, parseWarnings,
  parseEarthquakes,
} from './parse.js'
```

刪掉 `describe('parseImage', …)` 裡的 `it('parses radar metadata', …)`（只留 `parses satellite metadata`），並在 `describe('parseImage', …)` 整段之後加：

```ts
describe('parseRadarTimes', () => {
  const json = fixture('O-A0059-001-metadata.json')
  it('keeps the latest 19 frames, oldest first', () => {
    const times = parseRadarTimes(json)
    expect(times).toHaveLength(19)
    expect(times[0]).toBe('2026-09-26T08:50:00+08:00')
    expect(times[18]).toBe('2026-09-26T11:50:00+08:00')
  })
  it('sorts frames that arrive out of order', () => {
    const list = json.dataset.resources.resource.data.time
    const shuffled = { dataset: { resources: { resource: { data: { time: [...list].reverse() } } } } }
    expect(parseRadarTimes(shuffled)).toEqual(parseRadarTimes(json))
  })
  it('returns nothing for a response without frames', () => {
    expect(parseRadarTimes({ dataset: { resources: { resource: { data: {} } } } })).toEqual([])
    expect(parseRadarTimes({})).toEqual([])
  })
})
```

`server/repo.test.ts`：

repo import 的最後一行 `replaceSatelliteTiles, listSatelliteTiles, getSatelliteTile, replaceWarnings, listWarnings, replaceEarthquakes, listEarthquakes,` 之後加一行：

```ts
  replaceRadarFrames, listRadarFrames,
```

`describe('images & fetch log', …)` 的 `stores image overlays` 內容換成（雷達 fixture 已刪，改用衛星）：

```ts
  it('stores image overlays', () => {
    expect(getImage(db, 'satellite')).toBeNull()
    const satellite = parseImage(fixture('O-B0033-003.json'), 'satellite')
    upsertImage(db, satellite)
    expect(getImage(db, 'satellite')).toEqual(satellite)
  })
```

並在 `describe('images & fetch log', …)` 之前加：

```ts
describe('radar frames', () => {
  it('replaces the whole list and reads it back oldest first', () => {
    replaceRadarFrames(db, ['2026-09-26T11:00:00+08:00'])
    replaceRadarFrames(db, ['2026-09-26T11:30:00+08:00', '2026-09-26T11:20:00+08:00'])
    expect(listRadarFrames(db)).toEqual(['2026-09-26T11:20:00+08:00', '2026-09-26T11:30:00+08:00'])
  })
})
```

`server/sync.test.ts`：

sync import 換成：

```ts
import { syncObservations, syncForecast, syncImage, syncRadar, syncTyphoons, syncWarnings, syncEarthquakes } from './sync.js'
```

repo import 的 `listObservations, …, listEarthquakes,` 那行之後加一行 `  listRadarFrames,`。

刪掉 `describe('syncImage', …)` 裡的 `it('stores radar metadata', …)`，並在 `describe('syncImage', …)` 整段之後加：

```ts
describe('syncRadar', () => {
  const withRadar = (json: unknown, calls: Record<string, string>[] = []): Fetcher => ({
    dataset: async () => { throw new Error('unexpected dataset') },
    file: async () => { throw new Error('unexpected file') },
    bytes: noBytes,
    async historyMetadata(id, params) {
      if (id !== 'O-A0059-001') throw new Error(`unexpected history ${id}`)
      calls.push(params)
      return json
    },
    historyData: async () => { throw new Error('unexpected historyData') },
  })

  it('asks for four hours back in Taipei time and stores the latest 19 frames', async () => {
    const calls: Record<string, string>[] = []
    await syncRadar(db, withRadar(fixture('O-A0059-001-metadata.json'), calls), Date.parse('2026-09-26T04:00:00Z'))
    expect(calls).toEqual([{ timeFrom: '2026-09-26T08:00:00' }])
    const times = listRadarFrames(db)
    expect(times).toHaveLength(19)
    expect(times[18]).toBe('2026-09-26T11:50:00+08:00')
    expect(getFetchedAt(db, 'radar')).not.toBeNull()
  })
  it('keeps the old list when CWA returns no frames', async () => {
    await syncRadar(db, withRadar(fixture('O-A0059-001-metadata.json')))
    const empty = { dataset: { success: 'true', resources: { resource: { data: { time: [] } } } } }
    await expect(syncRadar(db, withRadar(empty))).rejects.toThrow('no radar frames')
    expect(listRadarFrames(db)).toHaveLength(19)
  })
})
```

- [ ] **Step 3：確認測試失敗**

Run: `npx vitest run server/cwa/parse.test.ts server/repo.test.ts server/sync.test.ts`
Expected: FAIL，`parseRadarTimes is not a function`、`replaceRadarFrames is not a function`、`syncRadar is not a function`。

- [ ] **Step 4：型別**

`shared/types.ts`：

```ts
export type ImageKind = 'radar' | 'satellite'
```

換成：

```ts
export type ImageKind = 'satellite'
```

並在 `export interface SatelliteOverlay {` 之前加：

```ts
export interface RadarFrame {
  /** CWA DateTime，+08:00 ISO 字串 */
  time: string
  /** /api/radar-frame?t=YYYYMMDDHHmm */
  url: string
}

export interface RadarFrames {
  /** 由舊到新，最多 19 格 */
  frames: RadarFrame[]
  bounds: Bounds
}

```

- [ ] **Step 5：解析**

`server/cwa/parse.ts` 的 `parseImage` 換成（移除雷達分支），並在它之後加 `parseRadarTimes`：

```ts
export function parseImage(json: any, kind: ImageKind): ImageOverlay {
  const ds = json.cwaopendata.dataset
  const [west, east] = range(ds.GeoInfo.LongitudeRange)
  const [south, north] = range(ds.GeoInfo.LatitudeRange)
  const bounds: Bounds = [west, south, east, north]
  return { kind, url: ds.Resource.ProductURL, obsTime: ds.ObsTime.Datetime, bounds }
}

/** historyapi metadata → 最近 count 格的 DateTime（+08:00 ISO），由舊到新 */
export function parseRadarTimes(json: any, count = 19): string[] {
  const list: any[] = json.dataset?.resources?.resource?.data?.time ?? []
  return list.map(t => t.DateTime).filter((t): t is string => typeof t === 'string').sort().slice(-count)
}
```

- [ ] **Step 6：資料表與 repo**

`server/db.ts` 的 SCHEMA 在 `CREATE TABLE IF NOT EXISTS images …` 那行之後加：

```sql
CREATE TABLE IF NOT EXISTS radar_frames (time TEXT PRIMARY KEY);
```

`server/repo.ts` 在 `export function replaceSatelliteTiles(` 之前加：

```ts
export function replaceRadarFrames(db: DB, times: string[]): void {
  const insert = db.prepare('INSERT INTO radar_frames (time) VALUES (?)')
  db.transaction(() => {
    db.prepare('DELETE FROM radar_frames').run()
    for (const t of times) insert.run(t)
  })()
}

export function listRadarFrames(db: DB): string[] {
  return (db.prepare('SELECT time FROM radar_frames ORDER BY time').all() as { time: string }[]).map(r => r.time)
}

```

- [ ] **Step 7：同步**

`server/sync.ts` 的兩段 import 換成：

```ts
import {
  parseEarthquakes, parseForecast3h, parseForecastWeek, parseImage, parseRadarTimes, parseRainStations, parseTyphoons, parseWarnings,
  parseWeatherStations,
} from './cwa/parse.js'
import {
  logFetch, replaceEarthquakes, replaceForecasts, replaceObservations, replaceRadarFrames, replaceSatelliteTiles, replaceTyphoons, replaceWarnings,
  upsertImage,
} from './repo.js'
```

`IMAGE_IDS` 換成：

```ts
const IMAGE_IDS: Record<ImageKind, string> = { satellite: 'O-B0033-003' }
```

`syncImage` 整個換成下面兩個函式（`syncImage` 只剩衛星；`syncRadar` 新增）：

```ts
export async function syncImage(db: DB, kind: ImageKind, f: Fetcher = cwa): Promise<void> {
  const meta = parseImage(await f.file(IMAGE_IDS[kind]), kind)
  const tiles = parseSatelliteKmz(await f.bytes(meta.url))
  if (tiles.length === 0) throw new Error('CWA returned no satellite tiles')
  db.transaction(() => {
    upsertImage(db, meta)
    replaceSatelliteTiles(db, tiles)
  })()
  logFetch(db, kind, now())
}

const HOUR = 3600_000

// 最新一格約晚 6～7 分鐘才出現，多查一小時才湊得滿 19 格；timeFrom 為臺北時間、不帶時區
export async function syncRadar(db: DB, f: Fetcher = cwa, at = Date.now()): Promise<void> {
  const timeFrom = new Date(at + 8 * HOUR - 4 * HOUR).toISOString().slice(0, 19)
  const times = parseRadarTimes(await f.historyMetadata('O-A0059-001', { timeFrom }))
  if (times.length === 0) throw new Error('CWA returned no radar frames')
  replaceRadarFrames(db, times)
  logFetch(db, 'radar', now())
}
```

- [ ] **Step 8：service 與 API**

`server/service.ts` 開頭的 import 換成：

```ts
import type {
  ApiResponse, Earthquake, ForecastGrid, Observation, RadarFrames, SatelliteOverlay, Town, TownForecast, Typhoon, Warning,
} from '../shared/types.js'
import { RADAR_BOUNDS } from '../shared/radar.js'
import { getDb } from './db.js'
import { ensureFresh } from './freshness.js'
import {
  getGrid, getImage, getSatelliteTile, getTownForecast, listEarthquakes, listGridTimes, listObservations, listRadarFrames, listSatelliteTiles, listTowns,
  listTyphoons, listWarnings,
} from './repo.js'
import { syncEarthquakes, syncForecast, syncImage, syncObservations, syncRadar, syncTyphoons, syncWarnings } from './sync.js'
import { frameKey } from './radar.js'
```

`getImageOverlay` 整個換成：

```ts
export async function getRadar(): Promise<ApiResponse<RadarFrames> | null> {
  const db = getDb()
  const meta = await ensureFresh(db, 'radar', () => syncRadar(db))
  const times = listRadarFrames(db)
  if (times.length === 0) return null
  const frames = times.map(time => ({ time, url: `/api/radar-frame?t=${frameKey(time)}` }))
  return { data: { frames, bounds: RADAR_BOUNDS }, ...meta }
}
```

`api/radar.ts` 整個換成：

```ts
import { handle, json } from '../server/http.js'
import { getRadar } from '../server/service.js'

export async function GET(): Promise<Response> {
  return handle(async () => {
    const result = await getRadar()
    return result ? json(result) : json({ error: 'Radar frames unavailable' }, 503)
  })
}
```

`scripts/build-db.ts`：

- sync import 換成 `import { syncEarthquakes, syncForecast, syncImage, syncObservations, syncRadar, syncTyphoons, syncWarnings } from '../server/sync.js'`
- `['radar', () => syncImage(db, 'radar')],` 換成 `['radar', () => syncRadar(db)],`
- 統計陣列的 `'images', 'satellite_tiles',` 換成 `'images', 'radar_frames', 'satellite_tiles',`

- [ ] **Step 9：確認測試與型別通過**

Run: `npm test`
Expected: PASS。

Run: `npm run typecheck`
Expected: 無錯誤（前端仍用 `useOverlay('radar')` 取 `ImageOverlay`，型別上照樣成立；Task 6 才換掉）。

- [ ] **Step 10：以即時資料確認**（需要 `.env` 的 `CWA_API_KEY`）

```bash
cat > ./radar-sync-check.mts <<'EOF'
import { openDb } from './server/db.js'
import { syncRadar } from './server/sync.js'
import { listRadarFrames } from './server/repo.js'
const db = openDb(':memory:')
await syncRadar(db)
const t = listRadarFrames(db)
console.log(t.length, t[0], '→', t[t.length - 1])
EOF
npx tsx --env-file=.env ./radar-sync-check.mts; rm ./radar-sync-check.mts
```

Expected: `19 <3 小時前的整 10 分> → <最近的整 10 分>`，例如 `19 2026-09-26T08:50:00+08:00 → 2026-09-26T11:50:00+08:00`。

- [ ] **Step 11：提交**

```bash
git add shared/types.ts server/__fixtures__/O-A0059-001-metadata.json server/cwa/parse.ts server/cwa/parse.test.ts server/db.ts server/repo.ts server/repo.test.ts server/sync.ts server/sync.test.ts server/service.ts api/radar.ts scripts/build-db.ts
git commit -F - <<'EOF'
feat(api): list recent radar frames from history api

雷達改用 historyapi 的 O-A0059-001：syncRadar 查最近 4 小時的
metadata、取最後 19 格存進 radar_frames，/api/radar 回傳各格時間
與 /api/radar-frame 網址。空清單時保留舊資料。移除 O-A0058-005
雷達圖片的同步與 fixture；fixture 的網址已去掉授權碼。

Switch radar to O-A0059-001 from the history API: syncRadar
reads four hours of metadata, keeps the last 19 frames in
radar_frames, and /api/radar returns each frame's time and
/api/radar-frame URL. An empty list keeps the old data. Drop
the O-A0058-005 image sync and fixture; the new fixture's URLs
have the API key stripped.
EOF
```

---

### Task 4：`/api/radar-frame`

**Files:**
- Create: `server/radarFrame.ts`、`api/radar-frame.ts`
- Test: `server/radarFrame.test.ts`

**Interfaces:**
- Consumes: `Fetcher.historyData`、`NotFoundError`（Task 2）；`framePath`、`parseRadarGrid`、`radarRgba`、`encodePng`、`RADAR_GRID`（Task 1）；`json`、`handle`（`server/http.ts`）
- Produces: `radarFrameResponse(t: string | null, f: Fetcher = cwa): Promise<Response>`；`GET /api/radar-frame?t=YYYYMMDDHHmm`

- [ ] **Step 1：寫測試**

新增 `server/radarFrame.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { unzlibSync } from 'fflate'
import { NotFoundError, type Fetcher } from './cwa/client.js'
import { radarFrameResponse } from './radarFrame.js'

/** 完整尺寸的格點 XML：全部 -999，只有 index 的格子是 dbz */
function gridXml(index: number, dbz: string, nx = 921, ny = 881) {
  const values = new Array<string>(nx * ny).fill('-9.990E+02')
  values[index] = dbz
  return `<cwaopendata><dataset><datasetInfo><parameterSet><GridDimensionX>${nx}</GridDimensionX><GridDimensionY>${ny}</GridDimensionY>`
    + `</parameterSet></datasetInfo><contents><content>${values.join(',')}</content></contents></dataset></cwaopendata>`
}

function withFrame(historyData: Fetcher['historyData']): Fetcher {
  return {
    dataset: async () => { throw new Error('unexpected dataset') },
    file: async () => { throw new Error('unexpected file') },
    bytes: async () => { throw new Error('unexpected bytes') },
    historyMetadata: async () => { throw new Error('unexpected historyMetadata') },
    historyData,
  }
}

const unused = withFrame(async () => { throw new Error('should not fetch') })

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}) })

describe('radarFrameResponse', () => {
  it('rejects a missing or malformed t without calling CWA', async () => {
    for (const t of [null, '', '2026092611', '202609261135', '2026-09-26T11:30', '2026092611300']) {
      const res = await radarFrameResponse(t, unused)
      expect(res.status).toBe(400)
      expect(res.headers.get('cache-control')).toBe('no-store')
    }
  })

  it('renders the frame as a long-cached PNG with the northern row first', async () => {
    const paths: string[] = []
    // 最南一列的第一格（115.0°E, 18.0°N）為 30 dBZ
    const f = withFrame(async (id, path) => { paths.push(`${id} ${path}`); return new TextEncoder().encode(gridXml(0, '3.000E+01')) })
    const res = await radarFrameResponse('202609261130', f)
    expect(paths).toEqual(['O-A0059-001 2026/09/26/11/30/00'])
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, s-maxage=31536000, immutable')
    const png = new Uint8Array(await res.arrayBuffer())
    expect(Array.from(png.subarray(1, 4))).toEqual([80, 78, 71])
    // IDAT 緊接在 IHDR（8 + 25 bytes）之後
    const idatLen = new DataView(png.buffer).getUint32(33)
    const raw = unzlibSync(png.subarray(41, 41 + idatLen))
    const stride = 921 * 4 + 1
    expect(raw).toHaveLength(stride * 881)
    // 輸出最後一列（最南）第一格為 30 dBZ 的黃色，其他列全透明
    expect(Array.from(raw.subarray(880 * stride + 1, 880 * stride + 5))).toEqual([255, 255, 0, 255])
    expect(raw.subarray(0, 880 * stride).some((b, i) => i % stride !== 0 && b !== 0)).toBe(false)
  })

  it('caches a missing frame briefly', async () => {
    const res = await radarFrameResponse('202609261130', withFrame(async () => { throw new NotFoundError('gone') }))
    expect(res.status).toBe(404)
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=60')
  })

  it('reports other CWA failures as 502 without caching', async () => {
    const res = await radarFrameResponse('202609261130', withFrame(async () => { throw new Error('CWA HTTP 500') }))
    expect(res.status).toBe(502)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('throws when the grid has unexpected dimensions', async () => {
    const f = withFrame(async () => new TextEncoder().encode(gridXml(0, '1', 10, 10)))
    await expect(radarFrameResponse('202609261130', f)).rejects.toThrow('Unexpected radar grid 10x10')
  })
})
```

- [ ] **Step 2：確認測試失敗**

Run: `npx vitest run server/radarFrame.test.ts`
Expected: FAIL，`Failed to resolve import "./radarFrame.js"`。

- [ ] **Step 3：實作**

新增 `server/radarFrame.ts`：

```ts
import { RADAR_GRID } from '../shared/radar.js'
import { cwa, NotFoundError, type Fetcher } from './cwa/client.js'
import { json } from './http.js'
import { encodePng } from './png.js'
import { framePath, parseRadarGrid, radarRgba } from './radar.js'

// 歷史格點產生後不再變動；Vercel CDN 只看 s-maxage
const IMMUTABLE = 'public, max-age=31536000, s-maxage=31536000, immutable'

/** GET /api/radar-frame?t=YYYYMMDDHHmm：抓 CWA 歷史格點、上色成 PNG；格點維度不符時拋錯，交給 handle() 回 500 */
export async function radarFrameResponse(t: string | null, f: Fetcher = cwa): Promise<Response> {
  const path = t ? framePath(t) : null
  if (!path) return json({ error: 'Invalid t parameter' }, 400)
  let bytes: Uint8Array
  try {
    bytes = await f.historyData('O-A0059-001', path)
  } catch (e) {
    // 沒有這一格時短暫快取，避免一直重打 CWA
    if (e instanceof NotFoundError) {
      return Response.json({ error: 'Radar frame not found' }, { status: 404, headers: { 'cache-control': 'public, s-maxage=60' } })
    }
    console.error('radar frame fetch failed', e)
    return json({ error: 'Radar frame unavailable' }, 502)
  }
  const png = encodePng(RADAR_GRID.nx, RADAR_GRID.ny, radarRgba(parseRadarGrid(new TextDecoder().decode(bytes))))
  return new Response(png, { headers: { 'content-type': 'image/png', 'cache-control': IMMUTABLE } })
}
```

新增 `api/radar-frame.ts`：

```ts
import { handle } from '../server/http.js'
import { radarFrameResponse } from '../server/radarFrame.js'

export async function GET(request: Request): Promise<Response> {
  return handle(() => radarFrameResponse(new URL(request.url).searchParams.get('t')))
}
```

- [ ] **Step 4：確認測試與型別通過**

Run: `npx vitest run server/radarFrame.test.ts`
Expected: PASS（5 個測試）。

Run: `npm run typecheck`
Expected: 無錯誤。

- [ ] **Step 5：以即時資料確認**（需要 `.env`）

先用 Task 3 Step 10 的指令取得最新一格時間，換成 `YYYYMMDDHHmm`（例：`2026-09-26T11:50:00+08:00` → `202609261150`），再：

```bash
cat > ./radar-frame-check.mts <<'EOF'
import fs from 'node:fs'
import { radarFrameResponse } from './server/radarFrame.js'
const t0 = performance.now()
const res = await radarFrameResponse(process.argv[2])
const buf = new Uint8Array(await res.arrayBuffer())
console.log(res.status, res.headers.get('cache-control'), buf.length, 'bytes', Math.round(performance.now() - t0), 'ms')
if (res.status === 200) fs.writeFileSync('/tmp/radar-frame.png', buf)
EOF
npx tsx --env-file=.env ./radar-frame-check.mts 202609261150; npx tsx --env-file=.env ./radar-frame-check.mts 202001010000; rm ./radar-frame-check.mts
```

Expected：第一行 `200 public, max-age=31536000, s-maxage=31536000, immutable <約 2～60 萬> bytes <數百> ms`，`/tmp/radar-frame.png` 為 921×881、台灣附近的回波位置與 CWA 網站雷達圖一致；第二行 `404 public, s-maxage=60 …`。若第一行是 502 且 log 為 `TimeoutError`，是本機連 S3 偶發變慢（見 Global Constraints），稍後重跑。

- [ ] **Step 6：提交**

```bash
git add server/radarFrame.ts server/radarFrame.test.ts api/radar-frame.ts
git commit -F - <<'EOF'
feat(api): serve radar frames as long-cached png

新增 /api/radar-frame?t=YYYYMMDDHHmm：向 historyapi 取該時刻的
格點、上色成 921×881 PNG，以 immutable 長期快取交給 CDN。t 不合
法回 400、CWA 沒有這一格回 404 並短暫快取、其他失敗回 502。

Add /api/radar-frame?t=YYYYMMDDHHmm, which fetches that frame's
grid from the history API, colours it into a 921×881 PNG and
hands it to the CDN with an immutable long cache. A bad t is a
400, a frame CWA lacks is a briefly cached 404, and other
failures are a 502.
EOF
```

---

### Task 5：前端純函式與 dBZ 色階

**Files:**
- Create: `frontend/src/lib/radar.ts`
- Modify: `frontend/src/lib/colorScale.ts`
- Test: `frontend/src/lib/radar.test.ts`

**Interfaces:**
- Consumes: `RADAR_COLORS`（Task 1）
- Produces:
  - `RADAR_STEP_MS = 500`
  - `advanceRadar(pos: number, dt: number, n: number): number`：位置為「距離現在的格數」（0 = 現在、−(n−1) = 最舊）；每 500 ms 前進一格，超過 0 後再走 1.5 秒（到 +3）即回到 −(n−1)
  - `snapRadar(pos: number): number`：`Math.min(0, Math.round(pos))`
  - `radarIndex(pos: number, n: number): number`：`clamp(n − 1 + Math.round(pos), 0, n − 1)`
  - `agoLabel(time: string, latest: string): string`
  - `hourTicks(times: string[]): number[]`
  - `ScaleId` 加 `'radar'`；`SCALES.radar = { unit: 'dBZ', stops: 66 個 [dbz, '#rrggbb'] }`

- [ ] **Step 1：寫測試**

新增 `frontend/src/lib/radar.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { advanceRadar, agoLabel, hourTicks, radarIndex, snapRadar } from './radar'
import { SCALES } from './colorScale'

describe('advanceRadar', () => {
  it('moves one frame every 500 ms', () => {
    expect(advanceRadar(-18, 500, 19)).toBe(-17)
    expect(advanceRadar(-1, 250, 19)).toBe(-0.5)
  })
  it('lingers on the latest frame for 1.5 s, then restarts from the oldest', () => {
    expect(advanceRadar(0, 1000, 19)).toBe(2)
    expect(radarIndex(2, 19)).toBe(18)
    expect(advanceRadar(2, 500, 19)).toBe(-18)
  })
})

describe('snapRadar / radarIndex', () => {
  it('snaps to whole frames and treats the dwell as now', () => {
    expect(snapRadar(-3.4)).toBe(-3)
    expect(snapRadar(2.6)).toBe(0)
  })
  it('maps positions to frame indexes, clamped to the list', () => {
    expect(radarIndex(0, 19)).toBe(18)
    expect(radarIndex(-18, 19)).toBe(0)
    expect(radarIndex(-30, 19)).toBe(0)
    // 清單變短（缺格）時停在「現在」仍是最後一格
    expect(radarIndex(0, 17)).toBe(16)
  })
})

describe('agoLabel', () => {
  const latest = '2026-09-26T11:50:00+08:00'
  it('is empty for the latest frame', () => {
    expect(agoLabel(latest, latest)).toBe('')
  })
  it('uses minutes under an hour, then hours and minutes', () => {
    expect(agoLabel('2026-09-26T11:10:00+08:00', latest)).toBe('40 分鐘前')
    expect(agoLabel('2026-09-26T10:30:00+08:00', latest)).toBe('1 小時 20 分前')
    expect(agoLabel('2026-09-26T09:50:00+08:00', latest)).toBe('2 小時前')
  })
})

describe('hourTicks', () => {
  it('marks the frames on the hour', () => {
    expect(hourTicks(['2026-09-26T09:50:00+08:00', '2026-09-26T10:00:00+08:00', '2026-09-26T10:10:00+08:00', '2026-09-26T11:00:00+08:00']))
      .toEqual([1, 3])
  })
})

describe('radar scale', () => {
  it('has one stop per dBZ from 0 to 65', () => {
    const { unit, stops } = SCALES.radar
    expect(unit).toBe('dBZ')
    expect(stops).toHaveLength(66)
    expect(stops[0]).toEqual([0, '#00ffff'])
    expect(stops[15]).toEqual([15, '#00ff00'])
    expect(stops[65]).toEqual([65, '#9600ff'])
  })
})
```

- [ ] **Step 2：確認測試失敗**

Run: `npx vitest run frontend/src/lib/radar.test.ts`
Expected: FAIL，`Failed to resolve import "./radar"`。

- [ ] **Step 3：新增 `frontend/src/lib/radar.ts`**

```ts
// 雷達回放：位置以「距離現在的格數」表示，0 為現在、-(n - 1) 為最舊一格；播到現在之後的正值是停留時間
export const RADAR_STEP_MS = 500
const DWELL_STEPS = 1500 / RADAR_STEP_MS

/** 播放前進 dt 毫秒；在「現在」停留完就回到最舊一格 */
export function advanceRadar(pos: number, dt: number, n: number): number {
  const next = pos + dt / RADAR_STEP_MS
  return next >= DWELL_STEPS ? -(n - 1) : next
}

/** 停下或放開時對齊整格；停留區間算「現在」 */
export const snapRadar = (pos: number) => Math.min(0, Math.round(pos))

/** 位置 → frames（由舊到新）的 index */
export const radarIndex = (pos: number, n: number) => Math.min(n - 1, Math.max(0, n - 1 + Math.round(pos)))

/** 例：40 分鐘前、2 小時前、1 小時 20 分前；同一格為空字串 */
export function agoLabel(time: string, latest: string): string {
  const min = Math.round((Date.parse(latest) - Date.parse(time)) / 60_000)
  if (min <= 0) return ''
  if (min < 60) return `${min} 分鐘前`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} 小時 ${m} 分前` : `${h} 小時前`
}

/** 整點（分鐘為 00）的格子 index；CWA 時間固定 +08:00，直接取字元 */
export const hourTicks = (times: string[]) => times.flatMap((t, i) => (t.slice(14, 16) === '00' ? [i] : []))
```

- [ ] **Step 4：加 `radar` 色階**

`frontend/src/lib/colorScale.ts` 第一行：

```ts
export type ScaleId = 'temp' | 'wind' | 'rain1h' | 'pop' | 'humidity'
```

換成：

```ts
import { RADAR_COLORS } from '../../../shared/radar'

export type ScaleId = 'temp' | 'wind' | 'rain1h' | 'pop' | 'humidity' | 'radar'
```

`SCALES` 的 `humidity: …,` 那行之後加：

```ts
  // 與 server 上色共用 CWA 色標，每個 dBZ 一個 stop
  radar: { unit: 'dBZ', stops: RADAR_COLORS.map((rgb, dbz) => [dbz, `#${rgb.map(v => v.toString(16).padStart(2, '0')).join('')}`]) },
```

- [ ] **Step 5：確認測試與型別通過**

Run: `npx vitest run frontend/src/lib/radar.test.ts`
Expected: PASS（8 個測試）。

Run: `npm run typecheck`
Expected: 無錯誤。

- [ ] **Step 6：提交**

```bash
git add frontend/src/lib/radar.ts frontend/src/lib/radar.test.ts frontend/src/lib/colorScale.ts
git commit -F - <<'EOF'
feat(web): add radar playback helpers and dbz legend scale

雷達時間軸以「距離現在的格數」表示位置：每格 500 ms、播到現在
停 1.5 秒再從最舊一格重播，並提供對齊、index 換算、「40 分鐘前」
文字與整點刻度。dBZ 色階與 server 共用 CWA 色標。

Track radar playback as frames back from now: 500 ms a frame,
a 1.5 s pause on the latest before restarting from the oldest,
plus snapping, index mapping, "40 minutes ago" labels and hour
ticks. The dBZ legend shares the CWA palette with the server.
EOF
```

---

### Task 6：地圖上的雷達圖層

**Files:**
- Modify: `frontend/src/store.ts`、`frontend/src/lib/overlays.ts`、`frontend/src/api.ts`、`frontend/src/components/DataLayers.tsx`、`frontend/src/components/StatusBadge.tsx`
- Create: `frontend/src/components/RadarLayer.tsx`

**Interfaces:**
- Consumes: `RadarFrames`（Task 3）、`/api/radar`、`/api/radar-frame`（Task 3、4）、`radarIndex`（Task 5）、`RADAR_BOUNDS`、`RADAR_GRID`（Task 1）、既有 `reprojectImage`、`dataLayerBefore`、`removeLayerAndSource`
- Produces:
  - store：`radarPos: number`（預設 0，`setLayer` 一律設回 0）、`setRadarPos(radarPos: number): void`
  - `loadImage(url: string): Promise<HTMLImageElement>`（自 `lib/overlays.ts` 匯出）
  - `useRadar(enabled: boolean)`：`useQuery<ApiResponse<RadarFrames>>`，key `['radar']`
  - `useRadarFrames(radar: RadarFrames | null)`：`UseQueryResult<CanvasOverlay>[]`，與 `frames` 同順序（由舊到新）
  - `<RadarLayer map={map} />`

- [ ] **Step 1：store**

`frontend/src/store.ts`：

`interface State` 的 `quake: string | null` 之後加：

```ts
  /** 雷達時間軸位置：距離現在的格數（0 為現在、負數往前；播放時在 0 之後有一段停留），不寫進網址 */
  radarPos: number
```

`selectQuake: (quake: string | null) => void` 之後加：

```ts
  setRadarPos: (radarPos: number) => void
```

`create` 裡的：

```ts
  quake: null,
  // 雷達/衛星沒有未來時段，切換時回到「現在」
  setLayer: layer => set(LAYERS[layer].future ? { layer } : { layer, t: 0, pos: 0, playing: false }),
```

換成：

```ts
  quake: null,
  radarPos: 0,
  // 雷達/衛星沒有未來時段，切換時回到「現在」；雷達時間軸每次切換都從「現在」開始
  setLayer: layer => set(LAYERS[layer].future ? { layer, radarPos: 0 } : { layer, t: 0, pos: 0, playing: false, radarPos: 0 }),
```

`selectQuake: quake => set({ quake }),` 之後加：

```ts
  setRadarPos: radarPos => set({ radarPos }),
```

- [ ] **Step 2：overlays 與資料 hooks**

`frontend/src/lib/overlays.ts`：

- 第一行換成 `import type { Bounds, SatelliteOverlay } from '../../../shared/types'`
- `async function loadImage(` 改成 `export async function loadImage(`
- 刪掉整個 `radarOverlay` 函式（含上方註解）

`frontend/src/api.ts`：

- 第一行換成 `import { keepPreviousData, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'`
- 型別 import 與 overlays import 換成：

```ts
import type {
  ApiResponse, Earthquake, ForecastGrid, Observation, RadarFrames, SatelliteOverlay, Town, TownForecast, Typhoon, Warning,
} from '../../shared/types'
import { loadImage, satelliteOverlay } from './lib/overlays'
import { reprojectImage } from './lib/reproject'
```

- `useOverlay` 與 `useReprojected` 整段換成：

```ts
export const useRadar = (enabled: boolean) =>
  useQuery({ queryKey: ['radar'], queryFn: () => get<RadarFrames>('/api/radar'), enabled, refetchInterval: TEN_MIN })

const oldestFirst = <T,>(results: T[]) => [...results].reverse()

/** 每格重投影後的 canvas，與 frames 同順序（由舊到新）；最新一格排最前面送出，先看到「現在」 */
export const useRadarFrames = (radar: RadarFrames | null) =>
  useQueries({
    queries: [...(radar?.frames ?? [])].reverse().map(f => ({
      // 過去的格點不會再變，以時間為 key 快取；清單更新時只多載入新的一格
      queryKey: ['radarFrame', f.time],
      queryFn: async () => reprojectImage(await loadImage(f.url), radar!.bounds),
      staleTime: Infinity,
      gcTime: CANVAS_GC,
    })),
    combine: oldestFirst,
  })
```

（`combine` 定義在模組層，reference 穩定，TanStack Query 才會記住結果。）

- [ ] **Step 3：`RadarLayer`**

新增 `frontend/src/components/RadarLayer.tsx`：

```tsx
import { useEffect, useState } from 'react'
import type { CanvasSource, Map as MlMap } from 'maplibre-gl'
import { useRadar, useRadarFrames } from '../api'
import { useStore } from '../store'
import { radarIndex } from '../lib/radar'
import { RADAR_BOUNDS, RADAR_GRID } from '../../../shared/radar'
import { dataLayerBefore, removeLayerAndSource } from '../map/helpers'

const ID = 'radar'

/** 19 格共用一個 canvas source：切格時把該格畫進顯示用 canvas，再請 MapLibre 更新一次 texture */
export default function RadarLayer({ map }: { map: MlMap }) {
  const radar = useRadar(true)
  const frames = useRadarFrames(radar.data?.data ?? null)
  const index = useStore(s => radarIndex(s.radarPos, frames.length))
  const frame = frames[index]?.data?.canvas ?? null
  // 重投影後與格點同尺寸
  const [canvas] = useState(() => Object.assign(document.createElement('canvas'), { width: RADAR_GRID.nx, height: RADAR_GRID.ny }))

  useEffect(() => {
    const [w, s, e, n] = RADAR_BOUNDS
    map.addSource(ID, { type: 'canvas', canvas, animate: false, coordinates: [[w, n], [e, n], [e, s], [w, s]] })
    map.addLayer({ id: ID, type: 'raster', source: ID, paint: { 'raster-opacity': 0.9, 'raster-fade-duration': 0 } }, dataLayerBefore(map))
    return () => removeLayerAndSource(map, ID)
  }, [map, canvas])

  // 目前這格還沒載入或載入失敗時不重畫，保留上一張
  useEffect(() => {
    if (!frame) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(frame, 0, 0, canvas.width, canvas.height)
    // animate: false 的 canvas source 只在 play 狀態下更新 texture；pause() 會先上傳一次再停
    const src = map.getSource(ID) as CanvasSource | undefined
    src?.play()
    src?.pause()
  }, [map, canvas, frame])

  return null
}
```

- [ ] **Step 4：`DataLayers` 與 `StatusBadge`**

`frontend/src/components/DataLayers.tsx`：

- api import 換成：

```ts
import {
  useEarthquakes, usePrefetchGrids, useForecastGrid, useFutureTimes, useObservations, useSatellite, useSatelliteClouds, useTyphoons, useWarnings,
} from '../api'
```

- `import QuakeLayer from './QuakeLayer'` 之後加 `import RadarLayer from './RadarLayer'`
- 刪掉這兩行：

```ts
  const radar = useOverlay(layer === 'radar' ? 'radar' : null)
  const image = useReprojected(layer === 'radar' ? radar.data?.data ?? null : null)
```

- 刪掉 `  useImageOverlay(map, 'image', image.data ?? null, 0.9)`
- 回傳的 fragment 第一行（`{layer === 'wind' && …}` 之前）加：

```tsx
      {layer === 'radar' && <RadarLayer map={map} />}
```

`frontend/src/components/StatusBadge.tsx`：

- api import 的 `useOverlay, useReprojected,` 換成 `useRadar, useRadarFrames,`
- 這兩行：

```ts
  const radar = useOverlay(isRadar ? 'radar' : null)
  const image = useReprojected(isRadar ? radar.data?.data ?? null : null)
```

換成：

```ts
  const radar = useRadar(isRadar)
  const radarFrames = useRadarFrames(isRadar ? radar.data?.data ?? null : null)
```

- `if (q.isError || image.isError || clouds.isError)` 換成 `if (q.isError || radarFrames.at(-1)?.isError || clouds.isError)`
- `const when = …` 那行的 `isRadar ? radar.data?.data.obsTime` 換成 `isRadar ? radar.data?.data.frames.at(-1)?.time`

- [ ] **Step 5：確認測試與型別通過**

Run: `npm test && npm run typecheck`
Expected: 全部 PASS、無型別錯誤。

- [ ] **Step 6：手動確認**

`npm run dev`，前景分頁開 `http://localhost:5173/?layer=radar`：

1. DevTools Network 篩 `radar`：先 `/api/radar`（200），接著 19 個 `/api/radar-frame?t=…`（200），**第一個是最新一格**。
2. 地圖上出現回波，顏色與 CWA 網站雷達圖一致；縮小到可見台灣東側外海時，125.5°E 以東可能比 CWA 網站多一些遠海回波（spec §2.2，屬預期）。左上角徽章「觀測於 HH:mm」為最新一格時間。此時還沒有雷達時間軸（Task 8 才加），畫面固定在「現在」。
3. 右下角底圖切到「淺色」再切回「深色」：雷達回波每次都重新出現。
4. 切到「衛星」圖層再切回「雷達」：衛星照常顯示，回到雷達時 Network 不再重打 19 格（快取命中）。

- [ ] **Step 7：提交**

```bash
git add frontend/src/store.ts frontend/src/lib/overlays.ts frontend/src/api.ts frontend/src/components/RadarLayer.tsx frontend/src/components/DataLayers.tsx frontend/src/components/StatusBadge.tsx
git commit -F - <<'EOF'
feat(web): draw radar frames through one canvas source

前端改讀 /api/radar，同時載入 19 格 PNG（最新一格先送出）並重投
影；RadarLayer 只用一個 canvas source，切格時畫進顯示用 canvas
再 play()/pause() 更新一次 texture，GPU 上只有一張。目前格尚未
載入或失敗時保留上一張。store 加 radarPos，移除舊的雷達圖片 hooks。

Read /api/radar, load all 19 PNGs (latest first) and reproject
them. RadarLayer keeps a single canvas source: switching frames
draws into it and calls play()/pause() to upload the texture
once, so only one texture lives on the GPU. A frame that is not
ready or failed leaves the previous one in place. Add radarPos
to the store and drop the old radar image hooks.
EOF
```

---

### Task 7：抽出 `TimeTrack`

**Files:**
- Create: `frontend/src/components/TimeTrack.tsx`
- Modify: `frontend/src/components/Timeline.tsx`（整檔換掉）

**Interfaces:**
- Consumes: 既有 `Timeline` 的行為與 CSS class（`timeline-row`、`play`、`track`、`rail-area`、`bubble`、`rail`、`fill`、`thumb`、`ruler`、`tick`、`day-label`）
- Produces:
  - `measureHeight(el: HTMLDivElement | null)`（自 `Timeline.tsx` 移過來並匯出）
  - `interface TrackLabel { key: string; at: number; text: ReactNode; on?: boolean }`
  - `<TimeTrack max pos value playing canPlay ariaLabel main sub ticks labels onToggle onScrub onRelease onStep />`：`max` 為最後一格 index；`pos` 為 0～max 連續位置；`value` 為對齊後的格；`main`、`sub` 為字串（組 `aria-valuetext`）；`ticks` 長度 `max + 1`，每格額外 class（空字串代表沒有）；`onScrub(pos)` 按下與拖曳；`onRelease()` 放開；`onStep(i)` 鍵盤（已夾在 0～max）

本 Task 是純重構：預報時間軸的外觀與行為（播放、拖曳整條含刻度、鍵盤、標籤貼邊、日期標籤過短不顯示）完全不變。

- [ ] **Step 1：新增 `frontend/src/components/TimeTrack.tsx`**

```tsx
import { useRef, type ReactNode } from 'react'

/** 時間軸高度寫進 CSS 變數，讓右下角的元件在窄螢幕時避開它；隱藏時歸零 */
export function measureHeight(el: HTMLDivElement | null) {
  if (!el) return
  const set = (h: number) => document.documentElement.style.setProperty('--timeline-h', `${h}px`)
  const ro = new ResizeObserver(() => set(el.offsetHeight))
  ro.observe(el)
  return () => { ro.disconnect(); set(0) }
}

export interface TrackLabel { key: string; at: number; text: ReactNode; on?: boolean }

interface Props {
  /** 最後一格的 index；0 表示沒有可選的格子 */
  max: number
  /** 目前位置，0～max，播放與拖曳時有小數 */
  pos: number
  /** 對齊後的格 */
  value: number
  playing: boolean
  canPlay: boolean
  ariaLabel: string
  main: string
  sub: string
  /** 每格刻度額外的 class，長度 max + 1 */
  ticks: string[]
  labels: TrackLabel[]
  onToggle: () => void
  /** 按下或拖曳到連續位置 */
  onScrub: (pos: number) => void
  /** 放開拖曳 */
  onRelease: () => void
  /** 鍵盤選到某一格（已夾在 0～max） */
  onStep: (i: number) => void
}

/** 播放鈕＋可拖曳軌道（含刻度）；整塊都可以拖曳 */
export default function TimeTrack(p: Props) {
  const { max } = p
  const rail = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const posAt = (x: number) => {
    const r = rail.current!.getBoundingClientRect()
    return Math.min(1, Math.max(0, (x - r.left) / r.width)) * max
  }
  const release = () => {
    if (!dragging.current) return
    dragging.current = false
    p.onRelease()
  }
  const pct = (i: number) => (max ? (i / max) * 100 : 0)
  const at = pct(p.pos)
  return (
    <div className="timeline-row">
      <button className="play" disabled={!p.canPlay} onClick={p.onToggle} aria-label={p.playing ? '暫停' : '播放'}>
        {p.playing ? '❚❚' : '▶'}
      </button>
      <div className="track" role="slider" tabIndex={0} aria-label={p.ariaLabel}
        aria-valuemin={0} aria-valuemax={max} aria-valuenow={p.value} aria-valuetext={`${p.main} ${p.sub}`}
        onPointerDown={e => {
          if (max === 0) return
          e.currentTarget.setPointerCapture(e.pointerId)
          dragging.current = true
          p.onScrub(posAt(e.clientX))
        }}
        onPointerMove={e => { if (dragging.current) p.onScrub(posAt(e.clientX)) }}
        onPointerUp={release}
        onPointerCancel={release}
        onKeyDown={e => {
          const k = { ArrowRight: p.value + 1, ArrowUp: p.value + 1, ArrowLeft: p.value - 1, ArrowDown: p.value - 1, Home: 0, End: max }[e.key]
          if (k === undefined) return
          e.preventDefault()
          p.onStep(Math.min(max, Math.max(0, k)))
        }}>
        <div className="rail-area" ref={rail}>
          {/* 標籤跟著目前位置移動；兩端時貼齊邊緣不超出 */}
          <div className="bubble" style={{ left: `${at}%`, transform: `translateX(-${at}%)` }}>
            <b>{p.main}</b> <span>{p.sub}</span>
          </div>
          <div className="rail"><div className="fill" style={{ width: `${at}%` }} /></div>
          <div className="thumb" style={{ left: `${at}%` }} />
        </div>
        <div className="ruler" aria-hidden>
          {p.ticks.map((c, i) => <i key={i} className={c ? `tick ${c}` : 'tick'} style={{ left: `${pct(i)}%` }} />)}
          {p.labels.map(l => (
            <span key={l.key} className={`day-label ${l.on ? 'on' : ''}`} style={{ left: `${pct(l.at)}%` }}>{l.text}</span>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2：`Timeline.tsx` 整檔換成**

```tsx
import { useCallback, useEffect } from 'react'
import { useFutureTimes } from '../api'
import { useStore } from '../store'
import { LAYERS } from '../lib/layers'
import { daySegments, fmtClock, fmtMD, relDay, taipeiDate, weekdayOf } from '../lib/format'
import { advancePos } from '../lib/playback'
import Legend from './Legend'
import CloudModeToggle from './CloudModeToggle'
import TimeTrack, { measureHeight } from './TimeTrack'

// 播放時每 3 小時一格走 0.8 秒
const STEP_MS = 800

export default function Timeline() {
  const layer = useStore(s => s.layer)
  const pos = useStore(s => s.pos)
  const t = useStore(s => s.t)
  const playing = useStore(s => s.playing)
  const setPos = useStore(s => s.setPos)
  const setT = useStore(s => s.setT)
  const setPlaying = useStore(s => s.setPlaying)
  const times = useFutureTimes()
  const def = LAYERS[layer]
  const max = def.future ? times.length : 0
  const measure = useCallback(measureHeight, [])

  // 以 requestAnimationFrame 連續前進；停下時對齊最近的整格，停住時看到的一定是實際預報值
  useEffect(() => {
    if (!playing || max === 0) return
    let raf = 0
    let last = performance.now()
    const frame = (now: number) => {
      setPos(advancePos(useStore.getState().pos, now - last, max, STEP_MS))
      last = now
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      setT(Math.round(useStore.getState().pos))
    }
  }, [playing, max, setPos, setT])

  // URL 帶入的 t 超出範圍（例如資料已更新）時回到現在
  useEffect(() => {
    if (times.length > 0 && t > max) setT(0)
  }, [t, max, times.length, setT])

  // 雷達、颱風、行政區沒有時間可播放，不顯示時間軸；衛星只留雲圖樣式切換
  if (!def.future) {
    return layer === 'satellite' ? <div className="timeline glass compact" ref={measure}><CloudModeToggle /></div> : null
  }

  const today = taipeiDate(new Date())
  const slot = t > 0 ? times[t - 1] : undefined
  const date = slot?.slice(0, 10) ?? today
  const clock = slot ? slot.slice(11, 16) : fmtClock(new Date().toISOString())
  const main = t === 0 ? '現在' : `${relDay(date, today)} ${clock}`
  const sub = `${fmtMD(date)}（${weekdayOf(date)}）${t === 0 ? ` ${clock}` : ''}`
  const scale = t > 0 ? def.future.scale : def.now?.scale
  const segs = max > 0 ? daySegments(times.slice(0, max), today) : []
  return (
    <div className="timeline glass" ref={measure}>
      <TimeTrack max={max} pos={Math.min(pos, max)} value={t} playing={playing} canPlay={max > 0} ariaLabel="預報時間" main={main} sub={sub}
        ticks={Array.from({ length: max + 1 }, (_, i) => (segs.some(s => s.from === i && i > 0) ? 'day' : ''))}
        // 太短的日期段（例如只剩一兩格）只畫分隔線，不放文字以免重疊
        labels={segs.filter(s => (s.to - s.from + 1) / (max + 1) >= 0.15).map(s => ({
          key: s.date, at: s.from, on: s.date === date,
          text: <>{relDay(s.date, today)}<span className="md"> {fmtMD(s.date)}</span></>,
        }))}
        onToggle={() => setPlaying(!playing)}
        onScrub={p => { setPlaying(false); setPos(p) }}
        onRelease={() => setT(Math.round(useStore.getState().pos))}
        onStep={i => { setPlaying(false); setT(i) }} />
      {scale && <Legend scale={scale} />}
    </div>
  )
}
```

- [ ] **Step 3：確認測試與型別通過**

Run: `npm test && npm run typecheck`
Expected: 全部 PASS、無型別錯誤。

- [ ] **Step 4：手動確認預報時間軸不變**

`npm run dev`，前景分頁開 `http://localhost:5173/?layer=temp`：

1. 按播放：熱圖淡出、鄉鎮預報淡入並平滑前進，走到最後一格回到「現在」；再按暫停對齊整格。
2. 拖曳軌道或下方日期刻度：泡泡跟著移動、兩端貼齊不超出；放開對齊整格，網址的 `t` 跟著變。
3. 點軌道後按 → ← Home End：一次一格、Home 回「現在」、End 到最後一格。
4. 日期標籤（今天／明天／後天／週幾）位置與目前日期粗體同改版前。
5. 切到「衛星」：只剩雲圖樣式切換的精簡列；切到「颱風」：沒有時間軸。

- [ ] **Step 5：提交**

```bash
git add frontend/src/components/TimeTrack.tsx frontend/src/components/Timeline.tsx
git commit -F - <<'EOF'
refactor(web): extract the draggable time track

把時間軸的播放鈕、可拖曳軌道、跟隨標籤、刻度與鍵盤操作抽成
TimeTrack，由呼叫端提供格數、標籤文字與刻度樣式，讓雷達時間軸可
以共用。預報時間軸的外觀與行為不變。

Pull the timeline's play button, draggable track, following
bubble, ticks and keyboard handling into TimeTrack, with the
caller supplying the frame count, labels and tick styles, so the
radar timeline can share it. The forecast timeline looks and
behaves as before.
EOF
```

---

### Task 8：雷達時間軸

**Files:**
- Create: `frontend/src/components/RadarTimeline.tsx`
- Modify: `frontend/src/components/Timeline.tsx`、`frontend/src/styles.css`

**Interfaces:**
- Consumes: `TimeTrack`、`measureHeight`（Task 7）、`useRadar`、`useRadarFrames`、`radarPos`、`setRadarPos`（Task 6）、`advanceRadar`、`snapRadar`、`radarIndex`、`agoLabel`、`hourTicks`、`SCALES.radar`（Task 5）、既有 `Legend`
- Produces: `<RadarTimeline />`；雷達圖層顯示時間軸

- [ ] **Step 1：新增 `frontend/src/components/RadarTimeline.tsx`**

```tsx
import { useCallback, useEffect, useMemo } from 'react'
import { useRadar, useRadarFrames } from '../api'
import { useStore } from '../store'
import { advanceRadar, agoLabel, hourTicks, radarIndex, snapRadar } from '../lib/radar'
import Legend from './Legend'
import TimeTrack, { measureHeight } from './TimeTrack'

/** 雷達過去 3 小時：左為最舊、右為「現在」 */
export default function RadarTimeline() {
  const radar = useRadar(true)
  const frames = useRadarFrames(radar.data?.data ?? null)
  const times = useMemo(() => radar.data?.data.frames.map(f => f.time) ?? [], [radar.data])
  const radarPos = useStore(s => s.radarPos)
  const playing = useStore(s => s.playing)
  const setRadarPos = useStore(s => s.setRadarPos)
  const setPlaying = useStore(s => s.setPlaying)
  const measure = useCallback(measureHeight, [])
  const n = times.length

  useEffect(() => {
    if (!playing || n === 0) return
    let raf = 0
    let last = performance.now()
    const frame = (now: number) => {
      setRadarPos(advanceRadar(useStore.getState().radarPos, now - last, n))
      last = now
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      setRadarPos(snapRadar(useStore.getState().radarPos))
    }
  }, [playing, n, setRadarPos])

  if (n === 0) return <div className="timeline glass compact" ref={measure}><Legend scale="radar" /></div>

  const max = n - 1
  const index = radarIndex(radarPos, n)
  const time = times[index]
  const clock = time.slice(11, 16)
  const hours = hourTicks(times)
  // 全部格子都有結果（成功或失敗）才能播放，動畫不會停下來等
  const ready = frames.every(f => !f.isPending)
  return (
    <div className="timeline glass" ref={measure}>
      <TimeTrack max={max} pos={Math.min(max, max + radarPos)} value={index} playing={playing} canPlay={ready && n > 1} ariaLabel="雷達觀測時間"
        main={index === max ? '現在' : clock} sub={index === max ? `${clock} 觀測` : agoLabel(time, times[max])}
        ticks={times.map((_, i) => [hours.includes(i) ? 'day' : '', frames[i]?.isError ? 'failed' : frames[i]?.isPending ? 'pending' : '']
          .filter(Boolean).join(' '))}
        // 最後兩格放不下「HH:00」，不標字以免超出右緣
        labels={hours.filter(i => i <= max - 2).map(i => ({ key: times[i], at: i, text: times[i].slice(11, 16) }))}
        onToggle={() => {
          // 停在「現在」按播放時從最舊一格開始
          if (!playing && radarPos >= 0) setRadarPos(-max)
          setPlaying(!playing)
        }}
        onScrub={p => { setPlaying(false); setRadarPos(p - max) }}
        onRelease={() => setRadarPos(snapRadar(useStore.getState().radarPos))}
        onStep={i => { setPlaying(false); setRadarPos(i - max) }} />
      <Legend scale="radar" />
    </div>
  )
}
```

- [ ] **Step 2：`Timeline` 接上雷達**

`frontend/src/components/Timeline.tsx`：

`import TimeTrack, { measureHeight } from './TimeTrack'` 之後加：

```ts
import RadarTimeline from './RadarTimeline'
```

這段：

```tsx
  // 雷達、颱風、行政區沒有時間可播放，不顯示時間軸；衛星只留雲圖樣式切換
  if (!def.future) {
    return layer === 'satellite' ? <div className="timeline glass compact" ref={measure}><CloudModeToggle /></div> : null
  }
```

換成：

```tsx
  // 雷達播放過去 3 小時；颱風、行政區等沒有時間可播放，不顯示時間軸；衛星只留雲圖樣式切換
  if (!def.future) {
    if (layer === 'radar') return <RadarTimeline />
    return layer === 'satellite' ? <div className="timeline glass compact" ref={measure}><CloudModeToggle /></div> : null
  }
```

- [ ] **Step 3：刻度樣式**

`frontend/src/styles.css` 的 `.tick.day { … }` 那行之後加：

```css
.tick.pending { opacity: 0.3; }
.tick.failed { background: #ff6b6b; }
```

- [ ] **Step 4：確認測試與型別通過**

Run: `npm test && npm run typecheck`
Expected: 全部 PASS、無型別錯誤。

- [ ] **Step 5：手動確認**

`npm run dev`，前景分頁開 `http://localhost:5173/?layer=radar`：

1. 時間軸：泡泡「現在 HH:mm 觀測」；整點格子為長刻度並標 `HH:00`（最後兩格不標）；下方 0～65 dBZ 圖例。載入期間未到的格子刻度變淡、播放鈕停用，全部到齊後可按。
2. 按播放：泡泡從最舊一格開始、每 0.5 秒一格（例：09:00 → 09:10 → …），回波跟著移動；到「現在」停約 1.5 秒再從最舊一格重播。暫停後對齊整格。可在 console 取樣確認：

   ```js
   const seen = []; for (let i = 0; i < 26; i++) { seen.push(document.querySelector('.bubble b')?.textContent); await new Promise(r => setTimeout(r, 500)) } seen.join(' ')
   ```

   Expected：連續 `HH:mm` 每次加 10 分，接著連續 3 次左右「現在」，再回到最舊一格。
3. 拖曳軌道：泡泡顯示「HH:mm N 分鐘前」或「1 小時 20 分前」，放開對齊整格；點軌道後 ← → Home End 一次一格、Home 為 3 小時前、End 為「現在」。播放中切到「溫度」再切回「雷達」：雷達停止播放並回到「現在」，網址只有 `?layer=radar`；溫度圖層的時間軸照常。
4. 停在某一格（例：40 分鐘前）時切換底圖（深色 → 淺色 → 深色）：雷達回波重新出現且仍是同一格。
5. 失敗的格子：在 DevTools Network 面板對其中一格的請求按右鍵 → Block request URL（或在 Request blocking 手動加入該格網址，例：`/api/radar-frame?t=202609261100`，時間換成目前清單內的一格），然後重新整理。該格重試約 7 秒後刻度變紅；其他格到齊後可播放；播放經過該格時地圖停在前一格畫面、泡泡照常前進。取消封鎖。
6. DevTools 裝置模式寬度 390：時間軸、整點標籤與圖例不重疊、不超出畫面。

- [ ] **Step 6：提交**

```bash
git add frontend/src/components/RadarTimeline.tsx frontend/src/components/Timeline.tsx frontend/src/styles.css
git commit -F - <<'EOF'
feat(web): add radar replay timeline

雷達圖層加上過去 3 小時的時間軸：整點刻度與時間、「N 分鐘前」
標籤、載入中與失敗的刻度樣式，以及 dBZ 圖例。全部格子有結果後
才能播放；停在「現在」按播放從最舊一格開始，播到現在停 1.5 秒
再重播。

Give the radar layer a three-hour timeline with hour ticks and
labels, "N minutes ago" captions, pending and failed tick styles,
and a dBZ legend. Playback waits until every frame has settled,
starts from the oldest when pressed on "now", and pauses 1.5 s
on the latest before looping.
EOF
```

---

### Task 9：README、截圖與最終驗證

**Files:**
- Modify: `README.md`
- Modify: `docs/screenshots/radar.png`

- [ ] **Step 1：README 文字**

`README.md`：

1. 第 3 行 `雷達回波、衛星雲圖與颱風路徑` 換成 `雷達回波（過去 3 小時回放）、衛星雲圖與颱風路徑`。
2. 截圖表 `| **雷達回波** | **衛星雲圖（色調強化）** |` 換成 `| **雷達回波（過去 3 小時回放）** | **衛星雲圖（色調強化）** |`。
3. 功能清單「時間軸」項目結尾的 `；雷達、颱風、行政區等無時間序列的圖層不顯示時間軸` 換成 `；雷達另有過去 3 小時的回放時間軸，颱風、行政區等無時間序列的圖層不顯示時間軸`。
4. 功能清單 `- **雷達／衛星**：…` 那行之前加：

```markdown
- **雷達回放**：過去 3 小時、每 10 分鐘一格的雷達回波格點（CWA 歷史 API `O-A0059-001`），server 依 CWA 官方色標畫成 PNG 並長期快取；可播放、拖曳與鍵盤切格，播到「現在」停 1.5 秒再重播，下方附 0–65 dBZ 圖例
```

5. 架構圖：
   - `API["路由<br/>observations · towns · forecast<br/>forecast-grid · radar · satellite · satellite-tile · typhoon · warnings · earthquakes"]` 換成 `API["路由<br/>observations · towns · forecast<br/>forecast-grid · radar · radar-frame · satellite · satellite-tile<br/>typhoon · warnings · earthquakes"]`
   - `FA["fileapi<br/>O-A0058-005 雷達<br/>O-B0033-003 衛星"]` 換成兩行：

```
    HA["historyapi<br/>O-A0059-001 雷達回波格點（過去 3 小時）"]
    FA["fileapi<br/>O-B0033-003 衛星"]
```

   - `S3["S3 公開檔<br/>雷達 PNG · 衛星 KMZ"]` 換成 `S3["S3 公開檔<br/>雷達格點 XML · 衛星 KMZ"]`
   - 刪掉 `  Render -- "雷達 PNG" --> S3`
   - `  Sync --> FA` 之後加兩行：

```
  Sync --> HA
  API -- "radar-frame：雷達格點 XML" --> S3
```

6. TTL 表 `| 雷達 | 10 分鐘 | 10 分鐘 |` 換成 `| 雷達時間清單 | 10 分鐘 | 10 分鐘（單格 PNG 長期快取） |`。
7. 專案結構：
   - `│   ├── cwa/              # CWA client、JSON/KMZ 解析` 之後加：

```
│   ├── radar.ts          # 雷達格點解析與上色
│   ├── radarFrame.ts     # 單格雷達 PNG 回應
│   ├── png.ts            # PNG 編碼
```

   - `├── shared/types.ts       # 前後端共用型別` 之後加 `├── shared/radar.ts       # 雷達色標與格點範圍（前後端共用）`
8. 技術棧 `fflate（解 KMZ）` 換成 `fflate（解 KMZ、PNG 壓縮）`。
9. API 表的這一行：

```markdown
| `GET /api/radar` | 最新雷達回波圖片資訊 |
```

換成下面兩行：

```markdown
| `GET /api/radar` | 過去 3 小時雷達格點的時間與各格網址 |
| `GET /api/radar-frame?t=YYYYMMDDHHmm` | 單格雷達回波（PNG，長期快取） |
```

- [ ] **Step 2：重截 `docs/screenshots/radar.png`**

`npm run dev`，**前景**瀏覽器視窗調成 1440×900 的可視區（DevTools 裝置模式選 Responsive 並填 1440×900 最準），開 `http://localhost:5173/?layer=radar`，等 19 格載入完成（刻度都不淡），拖曳時間軸停在回波最明顯的一格（泡泡顯示「N 分鐘前」），截取可視區，覆蓋 `docs/screenshots/radar.png`（1440×900 PNG，與其他截圖一致）。

- [ ] **Step 3：最終驗證**

Run: `npm test && npm run typecheck && npm run build`
Expected: 測試全過、型別無錯、`build:db` 輸出含 `✓ radar` 與 `radar_frames: 19`、`vite build` 成功。

Run: `git grep -n "O-A0058-005\|useOverlay\|useReprojected\|radarOverlay\|getImageOverlay" -- ':!docs'`
Expected: 無輸出。

Run: `git grep -n "CWA-[0-9A-F]\{8\}" -- ':!.env'`
Expected: 無輸出（沒有授權碼進版控）。

- [ ] **Step 4：提交**

```bash
git add README.md docs/screenshots/radar.png
git commit -F - <<'EOF'
docs: add radar replay to readme

README 補上雷達 3 小時回放：功能說明、架構圖改為 historyapi 的
O-A0059-001 與 /api/radar-frame、TTL 表、專案結構、API 表，並重
截含時間軸的雷達截圖。

Document the three-hour radar replay in the README: the feature
list, the architecture diagram now showing O-A0059-001 from the
history API and /api/radar-frame, the TTL table, project layout
and API table, plus a new radar screenshot with the timeline.
EOF
```
