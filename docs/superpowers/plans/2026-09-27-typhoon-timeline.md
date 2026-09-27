# 颱風圖層時間軸 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 颱風圖層也能拖動或播放預報時間軸，颱風中心、七級風暴風圈與會隨時間變大的 70% 潛勢圓沿預測路徑移動；天氣圖層上的颱風也加上同樣的潛勢圓。

**Architecture:** `LayerDef` 新增 `timeline` 旗標，把「有預報時間軸」與「有預報色階（`future`）」分開，`store.setLayer`、`Timeline`、`DataLayers` 改看 `timeline`。`typhoonAt` 多內插 `radius70`（最新觀測點為 0），`followGeoJSON` 多產生 `cone`。`TyphoonFollow` 加 `tracks` 參數，颱風圖層也掛上它（不畫細路徑）；`TyphoonLayer` 拿掉固定的目前位置與七級風圈。手機版颱風卡移到時間軸上方。

**Tech Stack:** TypeScript、React 19、MapLibre GL 6、Zustand、TanStack Query、Vitest。

**Spec:** `docs/superpowers/specs/2026-09-27-typhoon-timeline-design.md`（前一版：`docs/superpowers/specs/2026-09-27-typhoon-follow-design.md`）

**Commit 規則：** 英文 subject＋中英雙語 body。每個 Task 最後一步已附上完整訊息，用 `git commit -F -` 搭配 heredoc 提交。分支 `feat/typhoon-timeline`（spec 已 commit 在上面）。

**測試指令：** `npm test`、`npm run typecheck`。單檔可用 `npx vitest run <path>`。目前 199 個測試全過。

本計畫的程式碼已在 repo 副本跑過：測試、型別檢查，以及 headless Chrome 實測（颱風圖層時間軸無圖例、逐格的中心與潛勢半徑、`?layer=typhoon&t=8`、圖層順序、紅點下的最新觀測點仍查得到、風圖層 +24h／+45h、手機 390×844 版面）。`gridA`／`gridB` 的條件是 plan 階段補上的，Task 3 Step 7 驗證。

## Global Constraints

- 有時間軸的圖層：`temp`、`wind`、`rain`、`humidity`、`typhoon`（`timeline: true`）；`future` 只給前四個（預報色階）
- 時間軸共用：72 小時、3 小時一格（`useFutureTimes()`）；颱風圖層無色階圖例；`t` 寫進網址
- `radius70`：最新觀測點為 0；預測點之間線性內插；只有一端有值時取該端；剛好落在預測點取該值；`radius70 > 0` 才畫
- 移動的潛勢圓樣式：`line-color: ink`、`line-width: 1.5`、`line-opacity: 0.8`，不填色；兩種圖層都畫
- 颱風群組順序（由下往上）：`typhoon-follow-wind-fill`（`TYPHOON_FOLLOW_BOTTOM`）→ `typhoon-follow-wind-line` → `typhoon-follow-cone` → `typhoon-follow-past` → `typhoon-follow-forecast` → `typhoon-follow-center`；`typhoon-follow-label` 最上層
- 颱風圖層：`TyphoonFollow tracks={false}`；`TyphoonLayer` 保留固定潛勢圓（`ink`、1px、0.35）、路徑、路徑點（半徑 4、白框 1、過去 `ink`／預測 `#0b0e17`）、popup、`fitBounds`，全部以 `dataLayerBefore` 插入
- 資訊卡不隨時間軸變動；手機版（≤ 640px）颱風卡移到時間軸上方、`max-height: 40%`
- 颱風圖層不抓預報格點（`usePrefetchGrids`、`gridA`、`gridB` 都看 `def.future`）
- 本機 dev server 用 `--port 5174`（5173 被其他專案占用）

## Review Focus

1. **手機版颱風卡不能擋住時間軸** → Task 3 Step 7 手機截圖檢查
2. **颱風圖層上移動的紅點不能被路徑點蓋住，且紅點下的最新觀測點仍點得出 popup** → Task 3 Step 7 `verify-typhoon.js`（圖層順序、`queryRenderedFeatures`）
3. **天氣圖層與颱風圖層互切時，細路徑與總覽要跟著出現／消失、不殘留，播放不中斷** → Task 3 Step 7 `verify-switch.js`
4. **颱風圖層拖動或播放時不抓預報格點** → Task 3 Step 7 `verify-switch.js` 從颱風圖層開始播放時的請求計數
5. **潛勢圓在「現在」不畫、之後隨時間變大，且超過七級風圈** → Task 1 `typhoonAt`／`followGeoJSON` 測試＋Task 3 Step 7 逐格半徑

---

## 檔案結構

| 檔案 | 動作 | 責任 |
|---|---|---|
| `frontend/src/lib/typhoon.ts` | 修改 | `TyphoonState.radius70`、`lerpRadius`、`typhoonAt`、`followGeoJSON` 的 `cone`；`toGeoJSON` 移除目前位置的 `wind` 與 `current` |
| `frontend/src/lib/typhoon.test.ts` | 修改 | 上述測試 |
| `frontend/src/lib/layers.ts` | 修改 | `LayerDef.timeline` |
| `frontend/src/lib/layers.test.ts` | 新增 | 哪些圖層有時間軸 |
| `frontend/src/store.ts`、`store.test.ts` | 修改 | `setLayer` 改看 `timeline` |
| `frontend/src/components/Timeline.tsx` | 修改 | 改看 `timeline`；無色階不顯示圖例 |
| `frontend/src/components/TyphoonFollow.tsx` | 修改 | `tracks` 參數、`typhoon-follow-cone` |
| `frontend/src/components/TyphoonLayer.tsx` | 修改 | 移除固定七級風圈與放大紅點；路徑點以 `before` 插入 |
| `frontend/src/components/DataLayers.tsx` | 修改 | 改看 `timeline` 掛 `TyphoonFollow`；`gridA`／`gridB` 看 `future` |
| `frontend/src/components/TyphoonCard.tsx`、`frontend/src/styles.css` | 修改 | 手機版颱風卡移到時間軸上方 |
| `README.md`、`docs/screenshots/typhoon.png`、`typhoon-mobile.png`、`typhoon-follow.png` | 修改 | 說明與截圖 |

---

### Task 1：潛勢半徑沿時間軸內插

**Files:**
- Modify: `frontend/src/lib/typhoon.ts`（`TyphoonState`、`stateOf`、`typhoonAt`、`followGeoJSON`）
- Test: `frontend/src/lib/typhoon.test.ts`

**Interfaces:**
- Consumes: 既有 `timeAtPos`、`circlePolygon`、`feature`、`Typhoon`／`TyphoonFix`（`radius70: number | null`，僅預測點有值）
- Produces:
  - `interface TyphoonState { lon: number; lat: number; radius15ms: number | null; radius70: number | null }`
  - `typhoonAt(t, time)`：最新觀測點（含 `time` 不晚於它時）回傳 `radius70: 0`
  - `followGeoJSON(list, times, pos)`：每個颱風依序 `center`、`wind`（若 `radius15ms`）、`cone`（若 `radius70 > 0`），`cone` 為 `Polygon`，`properties: { role: 'cone' }`

- [ ] **Step 1：改寫測試**

`frontend/src/lib/typhoon.test.ts`：

第 4 行 import 改為：

```ts
import type { LineString, Polygon } from 'geojson'
```

把 `// 最新觀測點 26 日 20:00；…` 那行註解到 `moving` 定義結束（`}` 那行）整段換成：

```ts
// 最新觀測點 26 日 20:00；預測點 +6h、+12h、+24h，後兩點沒有七級風半徑；70% 半徑依序 30、60 km，最後一點沒有
const T0 = Date.parse('2026-09-26T20:00:00+08:00')
const H = 3600_000
const moving: Typhoon = {
  id: '2026-30', name: '舒力基', nameEn: 'SURIGAE',
  past: [
    fix(130, 20, { time: '2026-09-26T14:00:00+08:00', radius15ms: 150 }),
    fix(128, 22, { time: '2026-09-26T20:00:00+08:00', radius15ms: 100 }),
  ],
  forecast: [
    fix(127, 23, { time: '2026-09-27T02:00:00+08:00', forecastHour: 6, radius15ms: 80, radius70: 30 }),
    fix(126, 24, { time: '2026-09-27T08:00:00+08:00', forecastHour: 12, radius15ms: null, radius70: 60 }),
    fix(125, 25, { time: '2026-09-27T20:00:00+08:00', forecastHour: 24, radius15ms: null, radius70: null }),
  ],
}
```

`describe('timeAtPos', …)` 不動。把整個 `describe('typhoonAt', …)` 區塊換成：

```ts
describe('typhoonAt', () => {
  it('returns the latest fix at or before its time', () => {
    expect(typhoonAt(moving, T0)).toEqual({ lon: 128, lat: 22, radius15ms: 100, radius70: 0 })
    expect(typhoonAt(moving, T0 - 3 * H)).toEqual({ lon: 128, lat: 22, radius15ms: 100, radius70: 0 })
  })
  it('returns a forecast fix exactly at its time', () => {
    expect(typhoonAt(moving, T0 + 6 * H)).toEqual({ lon: 127, lat: 23, radius15ms: 80, radius70: 30 })
    expect(typhoonAt(moving, T0 + 12 * H)).toEqual({ lon: 126, lat: 24, radius15ms: null, radius70: 60 })
    expect(typhoonAt(moving, T0 + 24 * H)).toEqual({ lon: 125, lat: 25, radius15ms: null, radius70: null })
  })
  it('interpolates position and radius between fixes', () => {
    expect(typhoonAt(moving, T0 + 3 * H)).toEqual({ lon: 127.5, lat: 22.5, radius15ms: 90, radius70: 15 })
  })
  it('takes the radius from the only end that has one', () => {
    expect(typhoonAt(moving, T0 + 9 * H)).toEqual({ lon: 126.5, lat: 23.5, radius15ms: 80, radius70: 45 })
    expect(typhoonAt(moving, T0 + 18 * H)).toEqual({ lon: 125.5, lat: 24.5, radius15ms: null, radius70: 60 })
  })
  it('grows the 70% radius from zero at the latest fix', () => {
    expect(typhoonAt(moving, T0)!.radius70).toBe(0)
    expect(typhoonAt(moving, T0 + 3 * H)!.radius70).toBe(15)
    expect(typhoonAt(moving, T0 + 6 * H)!.radius70).toBe(30)
    expect(typhoonAt(moving, T0 + 9 * H)!.radius70).toBe(45)
  })
  it('is null after the last forecast fix', () => {
    expect(typhoonAt(moving, T0 + 25 * H)).toBeNull()
  })
  it('only has a position at the latest fix when there is no forecast', () => {
    const still = { ...moving, forecast: [] }
    expect(typhoonAt(still, T0)).toEqual({ lon: 128, lat: 22, radius15ms: 100, radius70: 0 })
    expect(typhoonAt(still, T0 + H)).toBeNull()
  })
  it('is null without any fix', () => {
    expect(typhoonAt({ ...moving, past: [] }, T0)).toBeNull()
  })
  it('ignores forecast points at or before the latest fix', () => {
    // 觀測點比預報新：最新觀測 27 日 03:00，+6h 預測點（02:00）已過時，03:00 → 08:00 之間不能改走舊預測點
    const late = { ...moving, past: [...moving.past, fix(127.5, 22.5, { time: '2026-09-27T03:00:00+08:00', radius15ms: 90 })] }
    expect(typhoonAt(late, T0 + 9.5 * H)).toEqual({ lon: 126.75, lat: 23.25, radius15ms: 90, radius70: 30 })
  })
})
```

把整個 `describe('followGeoJSON', …)` 區塊換成：

```ts
describe('followGeoJSON', () => {
  it('emits a named centre and a wind circle for each typhoon', () => {
    const { features } = followGeoJSON([moving], [], 0)
    expect(features.map(f => f.properties!.role)).toEqual(['center', 'wind'])
    expect(features[0].geometry).toEqual({ type: 'Point', coordinates: [128, 22] })
    expect(features[0].properties!.name).toBe('舒力基')
    expect(features[1].geometry.type).toBe('Polygon')
  })
  it('follows the timeline position', () => {
    const { features } = followGeoJSON([moving], ['2026-09-27T02:00:00+08:00'], 1)
    expect(features[0].geometry).toEqual({ type: 'Point', coordinates: [127, 23] })
  })
  it('skips the wind circle without a radius', () => {
    const { features } = followGeoJSON([moving], ['2026-09-27T08:00:00+08:00'], 1)
    expect(features.map(f => f.properties!.role)).toEqual(['center', 'cone'])
  })
  it('adds a 70% circle once the time is past the latest fix', () => {
    // 「現在」時半徑為 0，不產生潛勢圓（見第一個測試）；+6h 為 30 km
    const { features } = followGeoJSON([moving], ['2026-09-27T02:00:00+08:00'], 1)
    expect(features.map(f => f.properties!.role)).toEqual(['center', 'wind', 'cone'])
    const ring = (features[2].geometry as Polygon).coordinates[0]
    for (const p of ring) expect(km([127, 23], p)).toBeCloseTo(30, 0)
  })
  it('skips typhoons without a fix or past their forecast', () => {
    expect(followGeoJSON([{ ...moving, past: [] }], [], 0).features).toEqual([])
    expect(followGeoJSON([moving], ['2026-09-28T08:00:00+08:00'], 1).features).toEqual([])
  })
})
```

（`km` 是檔頭既有的 haversine 輔助函式。）

- [ ] **Step 2：跑測試確認失敗**

Run: `npx vitest run frontend/src/lib/typhoon.test.ts`
Expected: FAIL，9 failed | 17 passed（`typhoonAt` 回傳物件缺 `radius70`；`followGeoJSON` 沒有 `cone`）

- [ ] **Step 3：實作**

`frontend/src/lib/typhoon.ts`：把 `export interface TyphoonState …` 起到 `typhoonAt` 函式結束的整段換成：

```ts
export interface TyphoonState { lon: number; lat: number; radius15ms: number | null; radius70: number | null }

const stateOf = ({ lon, lat, radius15ms, radius70 }: TyphoonFix): TyphoonState => ({ lon, lat, radius15ms, radius70 })

/** 半徑只有一端有值時取有值的那端，同 lerpValues */
const lerpRadius = (a: number | null, b: number | null, f: number) =>
  a == null ? b : b == null ? a : a + (b - a) * f

/** 颱風在某時刻的位置、七級風與 70% 潛勢半徑：在最新觀測點與預測點之間線性內插；晚於最後一個預測點時為 null，不外推 */
export function typhoonAt(t: Typhoon, time: number): TyphoonState | null {
  const last = t.past.at(-1)
  if (!last) return null
  // 觀測點是實測位置，潛勢半徑為 0，往後隨預報時間變大
  const now = { ...last, radius70: 0 }
  const start = Date.parse(now.time)
  if (time <= start) return stateOf(now)
  // 觀測點可能比預報新；不晚於它的預測點已過時，留著會跳過觀測位置
  const seq = [now, ...t.forecast.filter(f => Date.parse(f.time) > start)]
  for (let k = 1; k < seq.length; k++) {
    const a = seq[k - 1]
    const b = seq[k]
    const tb = Date.parse(b.time)
    if (time === tb) return stateOf(b)
    if (time > tb) continue
    const ta = Date.parse(a.time)
    const f = (time - ta) / (tb - ta)
    return {
      lon: a.lon + (b.lon - a.lon) * f,
      lat: a.lat + (b.lat - a.lat) * f,
      radius15ms: lerpRadius(a.radius15ms, b.radius15ms, f),
      radius70: lerpRadius(a.radius70, b.radius70, f),
    }
  }
  return null
}
```

`followGeoJSON` 的文件註解改為：

```ts
/** 跟著時間軸移動的颱風中心（帶名稱）、七級風圈與 70% 潛勢圓 */
```

並在 `if (s.radius15ms) features.push(feature('wind', …))` 下一行加：

```ts
    if (s.radius70) features.push(feature('cone', { type: 'Polygon', coordinates: [circlePolygon(s.lon, s.lat, s.radius70)] }))
```

- [ ] **Step 4：跑測試與型別檢查**

Run: `npx vitest run frontend/src/lib/typhoon.test.ts && npm test && npm run typecheck`
Expected: 該檔 26 passed；全部 201 passed；typecheck 無錯誤

- [ ] **Step 5：Commit**

```bash
git add frontend/src/lib/typhoon.ts frontend/src/lib/typhoon.test.ts
git commit -F - <<'EOF'
feat(web): grow the typhoon 70% circle along the timeline

typhoonAt 多內插 70% 潛勢半徑：最新觀測點是實測位置，半徑視為
0，往後依預測點線性變大，缺值時取有值的那端；followGeoJSON 在半
徑大於 0 時多產生一個潛勢圓。七級風半徑的內插改用同一個輔助函式。

typhoonAt now also interpolates the 70% probability radius. The
latest fix is an observed position, so its radius counts as 0 and
grows through the forecast points, taking the known end when one is
missing. followGeoJSON adds a 70% circle once that radius is above
zero. The gale radius uses the same helper.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2：颱風圖層加入預報時間軸

**Files:**
- Modify: `frontend/src/lib/layers.ts`、`frontend/src/store.ts`、`frontend/src/components/Timeline.tsx`
- Create: `frontend/src/lib/layers.test.ts`
- Test: `frontend/src/store.test.ts`

**Interfaces:**
- Produces: `LayerDef.timeline?: true`（`temp`、`wind`、`rain`、`humidity`、`typhoon`）；Task 3 的 `DataLayers` 以 `def.timeline` 決定是否掛 `TyphoonFollow`

- [ ] **Step 1：寫失敗的測試**

新增 `frontend/src/lib/layers.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { LAYERS, LAYER_IDS } from './layers'

describe('LAYERS', () => {
  it('gives the forecast timeline to the weather layers and the typhoon layer only', () => {
    expect(LAYER_IDS.filter(id => LAYERS[id].timeline)).toEqual(['temp', 'wind', 'rain', 'humidity', 'typhoon'])
  })
  it('keeps the typhoon layer without a forecast colour scale', () => {
    expect(LAYERS.typhoon.future).toBeUndefined()
  })
})
```

`frontend/src/store.test.ts`：在 `describe('setLayer', …)` 最後一個 `it`（`stops playback when entering the radar layer`）之後、`})` 之前加：

```ts

  it('keeps the forecast time and playback when switching to the typhoon layer', () => {
    useStore.setState({ layer: 'wind', playing: true, t: 8, pos: 8 })
    useStore.getState().setLayer('typhoon')
    expect(useStore.getState()).toMatchObject({ layer: 'typhoon', playing: true, t: 8, pos: 8 })
  })

  it('returns to now when leaving the typhoon layer for the radar', () => {
    useStore.setState({ layer: 'typhoon', playing: true, t: 8, pos: 8 })
    useStore.getState().setLayer('radar')
    expect(useStore.getState()).toMatchObject({ layer: 'radar', playing: false, t: 0, pos: 0 })
  })

  it('does not carry the radar replay into the typhoon timeline', () => {
    useStore.setState({ layer: 'radar', playing: true, radarPos: -5 })
    useStore.getState().setLayer('typhoon')
    expect(useStore.getState()).toMatchObject({ layer: 'typhoon', playing: false, radarPos: 0 })
  })
```

- [ ] **Step 2：跑測試確認失敗**

Run: `npx vitest run frontend/src/lib/layers.test.ts frontend/src/store.test.ts`
Expected: FAIL，2 failed | 6 passed（`gives the forecast timeline…` 得到空陣列；`keeps the forecast time and playback…` 得到 `t: 0`、`playing: false`）。其餘三個新測試守住既有行為，本來就會通過。

- [ ] **Step 3：實作**

`frontend/src/lib/layers.ts`：`LayerDef` 的 `icon: string` 下一行加：

```ts
  /** 有 72 小時預報時間軸 */
  timeline?: true
```

`LAYERS` 中五個圖層加上 `timeline: true`（其餘不動）：

```ts
  temp: { label: '溫度', icon: '🌡️', timeline: true, now: { field: 'temp', scale: 'temp' }, future: { field: 'temp', scale: 'temp' } },
  wind: { label: '風', icon: '💨', timeline: true, now: { field: 'windSpeed', scale: 'wind' }, future: { field: 'windSpeed', scale: 'wind' } },
  rain: { label: '雨量', icon: '🌧️', timeline: true, now: { field: 'rain1h', scale: 'rain1h' }, future: { field: 'pop', scale: 'pop' } },
  humidity: { label: '濕度', icon: '💧', timeline: true, now: { field: 'humidity', scale: 'humidity' }, future: { field: 'humidity', scale: 'humidity' } },
```

```ts
  typhoon: { label: '颱風', icon: '🌀', timeline: true },
```

`frontend/src/store.ts`：把

```ts
  // 雷達/衛星沒有未來時段，切換時回到「現在」；雷達時間軸每次切換都從「現在」開始。
  // 預報圖層之間繼續播放，但雷達回放不能延續成預報播放
  setLayer: layer => set(s => LAYERS[layer].future
    ? { layer, radarPos: 0, playing: s.playing && !!LAYERS[s.layer].future }
```

換成

```ts
  // 沒有預報時間軸的圖層切換時回到「現在」；雷達時間軸每次切換都從「現在」開始。
  // 有預報時間軸的圖層之間繼續播放，但雷達回放不能延續成預報播放
  setLayer: layer => set(s => LAYERS[layer].timeline
    ? { layer, radarPos: 0, playing: s.playing && !!LAYERS[s.layer].timeline }
```

`frontend/src/components/Timeline.tsx`：

```ts
  const max = def.timeline ? times.length : 0
```

```ts
  // 雷達播放過去 3 小時；特報、地震、行政區等沒有時間可播放，不顯示時間軸；衛星只留雲圖樣式切換
  if (!def.timeline) {
```

```ts
  // 颱風圖層沒有色階，不顯示圖例
  const scale = t > 0 ? def.future?.scale : def.now?.scale
```

（分別取代原本的 `const max = def.future ? …`、`// 雷達播放過去 3 小時；颱風、行政區等…` 與 `if (!def.future) {`、`const scale = t > 0 ? def.future.scale : …`。`{scale && <Legend scale={scale} />}` 不動。）

- [ ] **Step 4：跑測試與型別檢查**

Run: `npx vitest run frontend/src/lib/layers.test.ts frontend/src/store.test.ts && npm test && npm run typecheck`
Expected: 8 passed；全部 206 passed；typecheck 無錯誤

- [ ] **Step 5：Commit**

```bash
git add frontend/src/lib/layers.ts frontend/src/lib/layers.test.ts frontend/src/store.ts frontend/src/store.test.ts frontend/src/components/Timeline.tsx
git commit -F - <<'EOF'
feat(web): give the typhoon layer the forecast timeline

LayerDef 新增 timeline 旗標，把「有預報時間軸」和「有預報色階」
分開：溫度、風、雨量、濕度與颱風有時間軸，只有前四個有 future。
setLayer 與 Timeline 改看 timeline，這五個圖層之間切換保留時間與
播放；颱風圖層沒有色階，不顯示圖例。

Add a timeline flag to LayerDef so "has the forecast timeline" is
separate from "has a forecast colour scale": temperature, wind,
rain, humidity and typhoon get the timeline, and only the first four
keep future. setLayer and Timeline read the flag, so switching among
those five keeps the time and playback. The typhoon layer has no
scale, so no legend.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3：颱風圖層上移動的颱風、手機版面與文件

**Files:**
- Modify: `frontend/src/lib/typhoon.ts`（`toGeoJSON`）、`frontend/src/lib/typhoon.test.ts`（`describe('toGeoJSON')`）
- Modify: `frontend/src/components/TyphoonFollow.tsx`、`TyphoonLayer.tsx`、`DataLayers.tsx`、`TyphoonCard.tsx`、`frontend/src/styles.css`
- Modify: `README.md`、`docs/screenshots/typhoon.png`、`docs/screenshots/typhoon-mobile.png`、`docs/screenshots/typhoon-follow.png`

**Interfaces:**
- Consumes: Task 1 `followGeoJSON`（`center`／`wind`／`cone`）；Task 2 `LayerDef.timeline`；既有 `TYPHOON_FOLLOW_BOTTOM`、`overlayBefore`、`dataLayerBefore`
- Produces: `TyphoonFollow({ map, list, times, pos, tracks })`；`toGeoJSON` 不再產生 `wind` 與 `current`

- [ ] **Step 1：改寫 `toGeoJSON` 測試**

`frontend/src/lib/typhoon.test.ts` 的 `describe('toGeoJSON')` 中，把第一個 `it('emits tracks, points, wind circle and forecast cones', …)` 換成：

```ts
  it('emits tracks, points and forecast cones', () => {
    const roles = toGeoJSON([ty]).features.map(f => f.properties!.role)
    expect(roles.filter(r => r === 'track-past')).toHaveLength(1)
    expect(roles.filter(r => r === 'track-forecast')).toHaveLength(1)
    expect(roles.filter(r => r === 'point')).toHaveLength(3)
    expect(roles.filter(r => r === 'cone')).toHaveLength(1)
  })
  it('leaves the current position and its gale circle to the timeline', () => {
    const { features } = toGeoJSON([ty])
    expect(features.filter(f => f.properties!.role === 'wind')).toEqual([])
    for (const f of features.filter(f => f.properties!.role === 'point')) expect(f.properties).not.toHaveProperty('current')
  })
```

- [ ] **Step 2：跑測試確認失敗**

Run: `npx vitest run frontend/src/lib/typhoon.test.ts`
Expected: FAIL，1 failed | 26 passed（`leaves the current position…`：仍有 `wind`）

- [ ] **Step 3：改 `toGeoJSON`**

`frontend/src/lib/typhoon.ts` 的 `toGeoJSON` 中，把

```ts
    if (now?.radius15ms) features.push(feature('wind', { type: 'Polygon', coordinates: [circlePolygon(now.lon, now.lat, now.radius15ms)] }))
    t.past.forEach((f, i) => features.push(feature('point', { type: 'Point', coordinates: pos(f) },
      { ti, kind: 'past', i, current: i === t.past.length - 1 })))
    t.forecast.forEach((f, i) => features.push(feature('point', { type: 'Point', coordinates: pos(f) },
      { ti, kind: 'forecast', i, current: false })))
```

換成

```ts
    // 目前位置與七級風圈由 followGeoJSON 依時間軸畫出
    t.past.forEach((f, i) => features.push(feature('point', { type: 'Point', coordinates: pos(f) }, { ti, kind: 'past', i })))
    t.forecast.forEach((f, i) => features.push(feature('point', { type: 'Point', coordinates: pos(f) }, { ti, kind: 'forecast', i })))
```

Run: `npx vitest run frontend/src/lib/typhoon.test.ts`
Expected: 27 passed

- [ ] **Step 4：`TyphoonFollow` 加 `tracks` 與潛勢圓**

`frontend/src/components/TyphoonFollow.tsx` 整個換成：

```tsx
import { useEffect, useMemo, useRef } from 'react'
import type { FilterSpecification, GeoJSONSource, Map as MlMap } from 'maplibre-gl'
import type { Typhoon } from '../../../shared/types'
import { followGeoJSON, toGeoJSON } from '../lib/typhoon'
import { TYPHOON_FOLLOW_BOTTOM, overlayBefore, removeLayerAndSource } from '../map/helpers'
import { useStore } from '../store'
import { BASEMAPS, inkOf } from '../lib/basemaps'

const TRACK = 'typhoon-follow'
const NOW = 'typhoon-follow-now'
const LABEL = 'typhoon-follow-label'
const LAYER_IDS = [TYPHOON_FOLLOW_BOTTOM, 'typhoon-follow-wind-line', 'typhoon-follow-cone', 'typhoon-follow-past', 'typhoon-follow-forecast', 'typhoon-follow-center', LABEL]
const role = (r: string): FilterSpecification => ['==', ['get', 'role'], r]

/**
 * 跟著預報時間軸移動的颱風：中心、名稱、七級風圈與 70% 潛勢圓；不參與點擊。
 * tracks 為 true 時另畫路徑細線（天氣圖層）；颱風圖層已有自己的路徑，傳 false
 */
export default function TyphoonFollow({ map, list, times, pos, tracks }: {
  map: MlMap; list: Typhoon[]; times: string[]; pos: number; tracks: boolean
}) {
  const ink = useStore(s => inkOf(s.basemap))
  const dark = useStore(s => BASEMAPS[s.basemap].dark)
  // 時間軸位置上的中心與風圈；重建圖層時帶入目前位置，不必讓時間軸的每一步都重建
  const atPos = useMemo(() => followGeoJSON(list, times, pos), [list, times, pos])
  const latest = useRef(atPos)
  latest.current = atPos

  useEffect(() => {
    const before = overlayBefore(map)
    map.addSource(NOW, { type: 'geojson', data: latest.current })
    // 先加的在下：風圈 → 潛勢圓 → 路徑 → 中心
    map.addLayer({ id: TYPHOON_FOLLOW_BOTTOM, type: 'fill', source: NOW, filter: role('wind'),
      paint: { 'fill-color': '#fa5252', 'fill-opacity': 0.15 } }, before)
    map.addLayer({ id: 'typhoon-follow-wind-line', type: 'line', source: NOW, filter: role('wind'),
      paint: { 'line-color': '#fa5252', 'line-width': 1.5 } }, before)
    map.addLayer({ id: 'typhoon-follow-cone', type: 'line', source: NOW, filter: role('cone'),
      paint: { 'line-color': ink, 'line-width': 1.5, 'line-opacity': 0.8 } }, before)
    if (tracks) {
      map.addSource(TRACK, { type: 'geojson', data: toGeoJSON(list) })
      map.addLayer({ id: 'typhoon-follow-past', type: 'line', source: TRACK, filter: role('track-past'),
        paint: { 'line-color': ink, 'line-width': 1, 'line-opacity': 0.6 } }, before)
      map.addLayer({ id: 'typhoon-follow-forecast', type: 'line', source: TRACK, filter: role('track-forecast'),
        paint: { 'line-color': ink, 'line-width': 1, 'line-opacity': 0.6, 'line-dasharray': [2, 2] } }, before)
    }
    map.addLayer({ id: 'typhoon-follow-center', type: 'circle', source: NOW, filter: role('center'),
      paint: { 'circle-radius': 6, 'circle-color': '#fa5252', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } }, before)
    // 名稱放最上層：插在界線之下會變成最下面的文字圖層，Boundaries 重建時會把界線插進中心與名稱之間
    map.addLayer({ id: LABEL, type: 'symbol', source: NOW, filter: role('center'),
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Open Sans Bold', 'Noto Sans Regular'],
        'text-size': 12,
        'text-anchor': 'left',
        'text-offset': [0.8, 0],
        'text-allow-overlap': true,
      },
      paint: { 'text-color': ink, 'text-halo-color': dark ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.85)', 'text-halo-width': 1.5 } })
    return () => {
      for (const id of LAYER_IDS) removeLayerAndSource(map, id)
      removeLayerAndSource(map, TRACK)
      removeLayerAndSource(map, NOW)
    }
  }, [map, list, ink, dark, tracks])

  useEffect(() => {
    map.getSource<GeoJSONSource>(NOW)?.setData(atPos)
  }, [map, atPos])

  return null
}
```

`tracks` 為 `false` 時 `TRACK` source 不存在，`removeLayerAndSource` 會先檢查存在才移除，cleanup 不必分支。`tracks` 在依賴裡：在風圖層與颱風圖層互切時，同一個元件實例重建成有／無細路徑。

- [ ] **Step 5：`TyphoonLayer`、`DataLayers`、手機版颱風卡**

`frontend/src/components/TyphoonLayer.tsx`：

```ts
const LAYER_IDS = ['typhoon-cone', 'typhoon-track-past', 'typhoon-track-forecast', POINTS]
```

刪除 `typhoon-wind-fill`、`typhoon-wind-line` 兩個 `map.addLayer(…)`（共 4 行）。把路徑點圖層換成（注意最後多了 `before`：原本沒指定、會疊在最上層蓋住移動的紅點）：

```ts
    // 目前位置、七級風圈與移動的潛勢圓由 TyphoonFollow 依時間軸畫在這些圖層之上
    map.addLayer({ id: POINTS, type: 'circle', source: SRC, filter: role('point'),
      paint: {
        'circle-radius': 4,
        'circle-color': ['case', ['==', ['get', 'kind'], 'past'], ink, '#0b0e17'],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1,
      } }, before)
```

`frontend/src/components/DataLayers.tsx`：

```ts
  // 颱風圖層有時間軸但沒有色階，不必抓預報格點
  const gridA = useForecastGrid(def.future && i >= 1 ? times[i - 1] ?? null : null)
  const gridB = useForecastGrid(def.future && f > 0 ? times[i] ?? null : null)
```

```ts
  const typhoon = useTyphoons(!!def.timeline)
```

```tsx
      {def.timeline && typhoon.data && typhoon.data.data.length > 0
        && <TyphoonFollow map={map} list={typhoon.data.data} times={times} pos={q} tracks={layer !== 'typhoon'} />}
```

（分別取代原本的 `gridA`／`gridB` 兩行、`useTyphoons(layer === 'typhoon' || !!def.future)` 與 `{def.future && typhoon.data && … <TyphoonFollow … />}`。）

`frontend/src/components/TyphoonCard.tsx`：

```tsx
    <aside className="card glass typhoon-card" aria-label="颱風資訊">
```

`frontend/src/styles.css` 的 `@media (max-width: 640px)` 內，`.card { top: auto; … }` 下一行加：

```css
  /* 颱風卡關不掉，而颱風圖層有時間軸：卡片移到時間軸上方，兩者都看得到 */
  .card.typhoon-card { left: var(--gap); right: var(--gap); bottom: calc(var(--gap) + var(--timeline-h, 110px) + 8px + env(safe-area-inset-bottom)); max-height: 40%; border-radius: 16px; padding-bottom: 16px; }
```

- [ ] **Step 6：全部測試、型別檢查、build**

Run: `npm test && npm run typecheck && npx vite build --config frontend/vite.config.ts --outDir .superpowers/sdd/2026-09-27-typhoon-timeline/dist-check`
Expected: 207 passed；typecheck 無錯誤；build 成功（輸出到 plan workspace，不覆蓋 `dist/`）

- [ ] **Step 7：headless 驗證**

背景啟動 `npx vite --config frontend/vite.config.ts --port 5174 --strictPort`，確認 `curl -s http://localhost:5174/api/typhoon` 有颱風。若沒有活動中的颱風，依前一版 plan（`docs/superpowers/plans/2026-09-27-typhoon-follow.md` Task 3 Step 4）暫時以 fixture 取代 `api/typhoon.ts`（不提交）。

使用者的 Chrome 視窗可能不在前景（`document.hidden` 時地圖不會載入），一律用 headless Chrome。把下面的工具存成 `.superpowers/sdd/2026-09-27-typhoon-timeline/cdp.mjs`（workspace，git 不追蹤）：

```js
// 以 headless Chrome + DevTools Protocol 開頁面、執行檢查腳本並截圖（一次性工具，不進 repo）
// 用法：node cdp.mjs <url> <out.png|-> <width> <height> <dpr> [script.js]
// script.js 的內容包在 async 函式裡執行，可使用變數 map（MapLibre 實例）與 sleep(ms)，回傳值印成 JSON
import { spawn } from 'node:child_process'
import fs from 'node:fs'

const [url, out, width, height, dpr, scriptFile] = process.argv.slice(2)
const PORT = 9333
const profile = new URL('./chrome-prof', import.meta.url).pathname
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  `--window-size=${width},${height}`, '--hide-scrollbars', '--enable-unsafe-swiftshader', '--no-first-run', 'about:blank',
], { stdio: 'ignore' })
const sleep = ms => new Promise(r => setTimeout(r, ms))

try {
  let target
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200)
    try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find(t => t.type === 'page') } catch {}
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(r => ws.addEventListener('open', r, { once: true }))
  let id = 0
  const pending = new Map()
  ws.addEventListener('message', e => {
    const msg = JSON.parse(e.data)
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id
    pending.set(n, m => (m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)))
    ws.send(JSON.stringify({ id: n, method, params }))
  })
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails))
    return r.result.value
  }

  const mobile = Number(width) < 640
  await send('Emulation.setDeviceMetricsOverride', { width: Number(width), height: Number(height), deviceScaleFactor: Number(dpr), mobile })
  await send('Page.enable')
  await send('Page.navigate', { url })
  // 等到搜尋框的 React fiber 往上找得到帶 map prop 的元件（地圖載入完成）
  const findMap = `(() => {
    const el = document.querySelector('.top-left input')
    if (!el) return null
    let f = el[Object.keys(el).find(k => k.startsWith('__reactFiber'))]
    while (f && !(f.memoizedProps && f.memoizedProps.map && f.memoizedProps.map.getLayersOrder)) f = f.return
    return f ? f.memoizedProps.map : null
  })()`
  for (let i = 0; i < 60; i++) {
    if (await evaluate(`!!${findMap}`)) break
    await sleep(500)
  }
  await sleep(3000)
  const body = scriptFile ? fs.readFileSync(scriptFile, 'utf8') : 'return null'
  const result = await evaluate(`(async () => {
    const map = ${findMap}
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    ${body}
  })()`)
  console.log(JSON.stringify(result, null, 1))
  if (out !== '-') {
    const { data } = await send('Page.captureScreenshot', { format: 'png' })
    fs.writeFileSync(out, Buffer.from(data, 'base64'))
  }
  ws.close()
} finally {
  chrome.kill()
}
```

同一目錄存 `verify-typhoon.js`：

```js
const ring = async () => {
  const d = await map.getSource('typhoon-follow-now').getData()
  const c = d.features.find(f => f.properties.role === 'center')
  const r = ([lo, la]) => { const [clo, cla] = c.geometry.coordinates; const k = Math.PI / 180
    return Math.round(2 * 6371 * Math.asin(Math.sqrt(Math.sin((la - cla) * k / 2) ** 2 + Math.cos(la * k) * Math.cos(cla * k) * Math.sin((lo - clo) * k / 2) ** 2))) }
  const radius = role => d.features.filter(f => f.properties.role === role).map(f => r(f.geometry.coordinates[0][0]))[0] ?? null
  return { bubble: document.querySelector('.bubble')?.textContent, center: c && c.geometry.coordinates.map(v => +v.toFixed(2)), wind: radius('wind'), cone: radius('cone') }
}
const out = {
  hasTrack: !!document.querySelector('.timeline .track'),
  legend: document.querySelectorAll('.timeline .legend').length,
  order: map.getLayersOrder().filter(id => /typhoon|town-hit/.test(id)),
  steps: [await ring()],
}
const track = document.querySelector('.track')
for (const k of ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'End']) {
  track.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))
  await sleep(400)
  out.steps.push(await ring())
}
track.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
await sleep(400)
// 最新觀測點被紅點蓋住時，路徑點圖層仍查得到（圖層點擊事件只查該圖層）
const ty = (await (await fetch('/api/typhoon')).json()).data[0]
out.pointUnderCentre = map.queryRenderedFeatures(map.project([ty.past.at(-1).lon, ty.past.at(-1).lat]), { layers: ['typhoon-points'] }).map(f => f.properties.kind + f.properties.i)
return out
```

與 `verify-switch.js`（從颱風圖層開始：在風圖層播放過會先預抓格點，量不出颱風圖層自己的請求）：

```js
// 只比對中文字，避免「風」也比對到「颱風」
const pick = name => [...document.querySelectorAll('button')].find(b => b.textContent.replace(/[^\u4e00-\u9fff]/g, '') === name).click()
const follow = () => map.getLayersOrder().filter(id => id.startsWith('typhoon'))
const grids = () => performance.getEntriesByType('resource').filter(e => e.name.includes('forecast-grid?time=')).length
const play = () => document.querySelector('.timeline .play').click()
const playing = () => document.querySelector('.timeline .play').getAttribute('aria-label') === '暫停'
const out = { typhoon: follow() }
const before = grids()
play()
await sleep(3000)
out.gridRequestsWhilePlayingOnTyphoon = grids() - before
pick('風')
await sleep(1500)
out.wind = follow()
out.stillPlayingOnWind = playing()
pick('颱風')
await sleep(1500)
out.backToTyphoon = follow()
out.stillPlayingOnTyphoon = playing()
play()
pick('雷達')
await sleep(1500)
out.radar = { layers: follow(), bubble: document.querySelector('.bubble')?.textContent }
return out
```

執行（在 workspace 目錄）：

```bash
cd .superpowers/sdd/2026-09-27-typhoon-timeline
node cdp.mjs "http://localhost:5174/?layer=typhoon" v-typhoon.png 1440 900 1 verify-typhoon.js
node cdp.mjs "http://localhost:5174/?layer=typhoon" - 1440 900 1 verify-switch.js
node cdp.mjs "http://localhost:5174/?layer=typhoon&t=16" v-mobile.png 390 844 2
```

Expected：
- `verify-typhoon.js`：`hasTrack: true`、`legend: 0`；`order` 中 `typhoon-cone`、`typhoon-track-*`、`typhoon-points` 都在 `typhoon-follow-wind-fill` 之下，沒有 `typhoon-follow-past`／`forecast`，`typhoon-follow-label` 在 `town-hit` 之上；第一步 `cone: null`，之後 `cone` 隨步數變大、`End`（+72h）時明顯大於 `wind`；`pointUnderCentre` 為最新觀測點（`past` 加最後索引）
- `verify-switch.js`：`typhoon` 與 `backToTyphoon` 含 `typhoon-cone`、`typhoon-points` 且不含 `typhoon-follow-past`／`forecast`；`gridRequestsWhilePlayingOnTyphoon: 0`；`wind` 含 `typhoon-follow-past`／`forecast` 且沒有 `typhoon-cone`／`typhoon-points`（總覽已移除）；`stillPlayingOnWind`、`stillPlayingOnTyphoon` 皆為 `true`；`radar.layers` 為空陣列、`bubble` 是雷達時間軸的時間
- 讀 `v-typhoon.png`：時間軸在底部、無色階圖例，紅點在最新觀測點上方、名稱清楚
- 讀 `v-mobile.png`：颱風卡在時間軸上方，兩者都完整可見

- [ ] **Step 8：README 與截圖**

本機 `/api/typhoon` 回傳 `stale: true`（CWA 無法存取）時不截圖、只改文字，並在 ledger 記一條 ruling；截圖等 CWA 恢復再另開 docs commit。

截圖（同一 workspace 目錄；`t=16` 約 +48h，潛勢圓才會大於七級風圈）：

```bash
node cdp.mjs "http://localhost:5174/?layer=typhoon&t=16" ../../../docs/screenshots/typhoon.png 1440 900 1
node cdp.mjs "http://localhost:5174/?layer=typhoon&t=16" ../../../docs/screenshots/typhoon-mobile.png 390 844 2
```

風圖層要手動取景：先存 `frame.js`，內容如下，其中 `[127.3, 25.3]`、`5.6` 依颱風當下位置調整，讓台灣與颱風（含潛勢圓）都在畫面內、不被右上角圖層選單遮住：

```js
map.jumpTo({ center: [127.3, 25.3], zoom: 5.6 })
await new Promise(r => map.once('idle', r))
await sleep(1000)
return document.querySelector('.bubble')?.textContent
```

```bash
node cdp.mjs "http://localhost:5174/?layer=wind&t=16" ../../../docs/screenshots/typhoon-follow.png 1440 900 1 frame.js
```

逐張讀圖確認：桌機 1440×900、手機 780×1688；狀態徽章不是「資料可能非最新」；潛勢圓大於紅色七級風圈。

`README.md`：

「時間軸」項目中的 `颱風、行政區等無時間序列的圖層不顯示時間軸` 改為：

```markdown
特報、地震、行政區等無時間序列的圖層不顯示時間軸
```

「颱風」項目中的 `；溫度、風、雨量、濕度圖層上也會畫出颱風路徑，中心與七級風暴風圈跟著預報時間軸移動` 改為：

```markdown
；拖曳或播放預報時間軸時，颱風中心、七級風暴風圈與 70% 潛勢圓沿預測路徑移動，潛勢圓隨預報時間變大；溫度、風、雨量、濕度圖層上也會畫出颱風路徑與同樣移動的颱風
```

截圖表格說明：

```markdown
| 颱風路徑（約 +48 小時：中心、暴風圈與 70% 潛勢圓沿預測路徑移動，點路徑點看數值） | 颱風（手機版） |
```

```markdown
| 颱風跟著時間軸移動（風圖層約 +48 小時；中心、七級風暴風圈與 70% 潛勢圓沿預測路徑內插） |
```

（分別取代原本 `| 颱風路徑（過去／預測路徑、暴風圈、潛勢圓，點路徑點看數值） | 颱風（手機版） |` 與 `| 颱風跟著時間軸移動（風圖層 +24 小時；中心與七級風暴風圈沿預測路徑內插） |`。）

結束後停掉 5174 的 dev server。

- [ ] **Step 9：Commit**

```bash
git add frontend/src/lib/typhoon.ts frontend/src/lib/typhoon.test.ts frontend/src/components/TyphoonFollow.tsx frontend/src/components/TyphoonLayer.tsx frontend/src/components/DataLayers.tsx frontend/src/components/TyphoonCard.tsx frontend/src/styles.css README.md docs/screenshots/typhoon.png docs/screenshots/typhoon-mobile.png docs/screenshots/typhoon-follow.png
git commit -F - <<'EOF'
feat(web): move the typhoon along the timeline on the typhoon layer

颱風圖層也掛上 TyphoonFollow（不畫細路徑），中心、名稱、七級風圈
與會變大的 70% 潛勢圓跟著時間軸移動；TyphoonLayer 拿掉固定的目
前位置與七級風圈，路徑點改插在颱風群組之下。天氣圖層上的颱風也
多了潛勢圓。颱風圖層不抓預報格點；手機版颱風卡移到時間軸上方。
README 說明與截圖更新。

The typhoon layer now mounts TyphoonFollow too (without the thin
tracks), so the centre, name, gale circle and a growing 70% circle
move with the timeline. TyphoonLayer drops its fixed current position
and gale circle, and its track points now sit under the typhoon
group. The typhoon on the weather layers gains the 70% circle as
well. The typhoon layer skips the forecast grids, and on phones the
typhoon card sits above the timeline. README text and screenshots
are updated.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

若 Step 8 沒有截圖，`git add` 去掉三張 png，body 最後一句改為「README 說明更新，截圖等 CWA 恢復後再補」／「README text is updated; the screenshots wait for the CWA API」。
