# 颱風跟隨時間軸 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 看溫度、風、雨量、濕度圖層時，有活動中的颱風就疊畫路徑，中心與七級風暴風圈隨預報時間軸移動。

**Architecture:** 純函式（`frontend/src/lib/typhoon.ts`）把時間軸位置換成時刻，再在最新觀測點與預測點之間內插出颱風中心與七級風半徑，輸出 GeoJSON；新元件 `TyphoonFollow` 用兩個 source（靜態路徑、隨時間軸 `setData` 的中心與風圈）畫在資料圖層之上、行政界線之下，名稱放最上層。`map/helpers.ts` 的 `dataLayerBefore` 改為有颱風群組時插在它之下，後來才加入的預報色階、重建的熱圖不會蓋住颱風。

**Tech Stack:** TypeScript、React 19、MapLibre GL 6、Zustand、TanStack Query、Vitest。

**Spec:** `docs/superpowers/specs/2026-09-27-typhoon-follow-design.md`

**Commit 規則：** 英文 subject＋中英雙語 body。每個 Task 最後一步已附上完整訊息，用 `git commit -F -` 搭配 heredoc 提交。分支 `feat/typhoon-follow`（spec 已 commit 在上面）。

**測試指令：** `npm test`（Vitest 一次跑完 server 與 frontend）、`npm run typecheck`。單檔可用 `npx vitest run <path>`。

本計畫的程式碼已在 repo 副本跑過：測試、型別檢查、`vite build`，以及瀏覽器實測（風圖層由「現在」拖到 +24h 後的圖層順序、逐格位置與手算內插值相符、淺色底圖、切換雷達／颱風／溫度／特報圖層、點選縣市）。背景分頁的 `requestAnimationFrame` 會暫停，播放要在前景視窗檢查。

## Global Constraints

- 出現颱風的圖層：`LAYERS[layer].future` 存在者，即 `temp`、`wind`、`rain`、`humidity`；`typhoon` 圖層維持現行全路徑總覽、不加時間軸；`radar`、`satellite`、`warning`、`quake`、`admin` 不畫
- 無開關；颱風清單為空時不掛載；不新增 API（`useTyphoons` 啟用條件改為 `layer === 'typhoon' || !!def.future`）
- 時間對應：位置 0 為最新觀測點（`past` 最後一點）時刻；第 k 格為 `times[k - 1]`；格間線性內插；結果不早於最新觀測點；`pos` 用 `DataLayers` 量化成 1/20 格的 `q`
- 內插：經緯度線性；七級風半徑兩端都有值時內插，只有一端有值時取該端；晚於最後一個預測點時不畫中心與風圈（不外推）；氣壓、風速不內插、不顯示
- 樣式：風圈 `#fa5252`，填色透明度 0.15、外框 1.5px；路徑 `ink` 色 1px、透明度 0.6，預測路徑 `line-dasharray: [2, 2]`；中心 `#fa5252` 半徑 6、白框 2px；名稱 12px、`text-font: ['Open Sans Bold', 'Noto Sans Regular']`、`text-anchor: left`、`text-offset: [0.8, 0]`、`text-allow-overlap: true`、`text-color: ink`、halo 深色底圖 `rgba(0,0,0,0.75)`／淺色底圖 `rgba(255,255,255,0.85)`、寬 1.5
- 圖層順序（由下往上）：資料圖層（熱圖、預報色階）→ `typhoon-follow-wind-fill` → `typhoon-follow-wind-line` → `typhoon-follow-past` → `typhoon-follow-forecast` → `typhoon-follow-center` → `town-hit` 與其餘界線、特報描邊、選取外框 → 底圖地名 → `typhoon-follow-label`
- 颱風圖層不綁滑鼠事件；點地圖照常逐層選取縣市、鄉鎮
- 不自動縮放、不加畫面外提示

## Review Focus

1. **拖進未來時段後，預報色階不能蓋住颱風**：色階在拖離「現在」那一刻才加入地圖，熱圖也會隨觀測資料重建 → Task 2 `dataLayerBefore` 測試＋Task 3 Step 4 手動檢查圖層順序
2. **換底圖後順序、線色與 halo 都要對**：`Boundaries` 重建時以 `firstSymbolLayer` 找插入點，颱風名稱若不在最上層，界線會插進中心與名稱之間 → Task 3 Step 4 手動檢查（淺色底圖）
3. **颱風在「現在」與第一格之間、以及新觀測點剛發布時，不能往回走或跳動** → Task 1 `timeAtPos` 測試（`times[0]` 早於 `start`、位置 0.5）
4. **切到雷達、衛星、特報、地震、行政區時颱風群組要完全移除；颱風圖層總覽不受影響** → Task 3 Step 4 手動檢查
5. **播放時颱風與色階同步、平滑移動，停下時對齊整格** → Task 3 Step 4 前景視窗手動檢查

---

## 檔案結構

| 檔案 | 動作 | 責任 |
|---|---|---|
| `frontend/src/lib/typhoon.ts` | 修改 | 新增 `timeAtPos`、`typhoonAt`、`followGeoJSON`、`TyphoonState`；`Role` 加 `'center'` |
| `frontend/src/lib/typhoon.test.ts` | 修改 | 上述函式的測試 |
| `frontend/src/map/helpers.ts` | 修改 | 新增 `TYPHOON_FOLLOW_BOTTOM`、`overlayBefore`；`dataLayerBefore` 改為先找颱風群組 |
| `frontend/src/map/helpers.test.ts` | 新增 | 插入點測試（假 map 物件） |
| `frontend/src/components/TyphoonFollow.tsx` | 新增 | 天氣圖層上的颱風圖層群組 |
| `frontend/src/components/DataLayers.tsx` | 修改 | 擴大 `useTyphoons` 啟用條件、掛上 `TyphoonFollow` |
| `README.md` | 修改 | 「颱風」項目補一句、新增截圖列 |
| `docs/screenshots/typhoon-follow.png` | 新增 | README 截圖 |

---

### Task 1：颱風位置沿時間軸內插

**Files:**
- Modify: `frontend/src/lib/typhoon.ts:35`（`Role`）、`:58`（`toGeoJSON` 之後、`fixLines` 之前插入）
- Test: `frontend/src/lib/typhoon.test.ts`（第 2 行 import、檔尾新增）

**Interfaces:**
- Consumes: 既有 `circlePolygon(lon, lat, radiusKm, steps = 64): Position[]`、模組內私有 `feature(role, geometry, props)`、`Typhoon`／`TyphoonFix`（`shared/types.ts`，`time` 為 +08:00 ISO 字串）
- Produces:
  - `timeAtPos(pos: number, times: string[], start: number): number`（epoch ms）
  - `interface TyphoonState { lon: number; lat: number; radius15ms: number | null }`
  - `typhoonAt(t: Typhoon, time: number): TyphoonState | null`
  - `followGeoJSON(list: Typhoon[], times: string[], pos: number): FeatureCollection`：每個颱風依序一個 `Point`（`properties: { role: 'center', name }`），`radius15ms` 有值時再一個 `Polygon`（`properties: { role: 'wind' }`）

- [ ] **Step 1：寫失敗的測試**

`frontend/src/lib/typhoon.test.ts` 第 2 行 import 改為：

```ts
import { circlePolygon, fixLines, followGeoJSON, timeAtPos, toGeoJSON, typhoonAt, typhoonBounds } from './typhoon'
```

檔尾加上（沿用檔頭既有的 `fix()` 工廠函式）：

```ts
// 最新觀測點 26 日 20:00；預測點 +6h、+12h、+24h，後兩點沒有七級風半徑
const T0 = Date.parse('2026-09-26T20:00:00+08:00')
const H = 3600_000
const moving: Typhoon = {
  id: '2026-30', name: '舒力基', nameEn: 'SURIGAE',
  past: [
    fix(130, 20, { time: '2026-09-26T14:00:00+08:00', radius15ms: 150 }),
    fix(128, 22, { time: '2026-09-26T20:00:00+08:00', radius15ms: 100 }),
  ],
  forecast: [
    fix(127, 23, { time: '2026-09-27T02:00:00+08:00', forecastHour: 6, radius15ms: 80 }),
    fix(126, 24, { time: '2026-09-27T08:00:00+08:00', forecastHour: 12, radius15ms: null }),
    fix(125, 25, { time: '2026-09-27T20:00:00+08:00', forecastHour: 24, radius15ms: null }),
  ],
}

describe('timeAtPos', () => {
  const times = ['2026-09-27T00:00:00+08:00', '2026-09-27T03:00:00+08:00', '2026-09-27T06:00:00+08:00']
  it('maps 0 to the latest fix and k to the k-th forecast slot', () => {
    expect(timeAtPos(0, times, T0)).toBe(T0)
    expect(timeAtPos(1, times, T0)).toBe(Date.parse(times[0]))
    expect(timeAtPos(3, times, T0)).toBe(Date.parse(times[2]))
  })
  it('interpolates between neighbouring anchors', () => {
    expect(timeAtPos(0.5, times, T0)).toBe(T0 + 2 * H)
    expect(timeAtPos(1.5, times, T0)).toBe(Date.parse('2026-09-27T01:30:00+08:00'))
  })
  it('clamps positions outside the timeline', () => {
    expect(timeAtPos(-1, times, T0)).toBe(T0)
    expect(timeAtPos(5, times, T0)).toBe(Date.parse(times[2]))
  })
  it('never goes before the latest fix', () => {
    const start = Date.parse('2026-09-27T01:00:00+08:00')
    expect(timeAtPos(1, times, start)).toBe(start)
    expect(timeAtPos(2, times, start)).toBe(Date.parse(times[1]))
  })
  it('stays at the latest fix without forecast slots', () => {
    expect(timeAtPos(3, [], T0)).toBe(T0)
  })
})

describe('typhoonAt', () => {
  it('returns the latest fix at or before its time', () => {
    expect(typhoonAt(moving, T0)).toEqual({ lon: 128, lat: 22, radius15ms: 100 })
    expect(typhoonAt(moving, T0 - 3 * H)).toEqual({ lon: 128, lat: 22, radius15ms: 100 })
  })
  it('returns a forecast fix exactly at its time', () => {
    expect(typhoonAt(moving, T0 + 6 * H)).toEqual({ lon: 127, lat: 23, radius15ms: 80 })
    expect(typhoonAt(moving, T0 + 12 * H)).toEqual({ lon: 126, lat: 24, radius15ms: null })
    expect(typhoonAt(moving, T0 + 24 * H)).toEqual({ lon: 125, lat: 25, radius15ms: null })
  })
  it('interpolates position and radius between fixes', () => {
    expect(typhoonAt(moving, T0 + 3 * H)).toEqual({ lon: 127.5, lat: 22.5, radius15ms: 90 })
  })
  it('takes the radius from the only end that has one', () => {
    expect(typhoonAt(moving, T0 + 9 * H)).toEqual({ lon: 126.5, lat: 23.5, radius15ms: 80 })
    expect(typhoonAt(moving, T0 + 18 * H)).toEqual({ lon: 125.5, lat: 24.5, radius15ms: null })
  })
  it('is null after the last forecast fix', () => {
    expect(typhoonAt(moving, T0 + 25 * H)).toBeNull()
  })
  it('only has a position at the latest fix when there is no forecast', () => {
    const still = { ...moving, forecast: [] }
    expect(typhoonAt(still, T0)).toEqual({ lon: 128, lat: 22, radius15ms: 100 })
    expect(typhoonAt(still, T0 + H)).toBeNull()
  })
  it('is null without any fix', () => {
    expect(typhoonAt({ ...moving, past: [] }, T0)).toBeNull()
  })
})

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
    expect(features.map(f => f.properties!.role)).toEqual(['center'])
  })
  it('skips typhoons without a fix or past their forecast', () => {
    expect(followGeoJSON([{ ...moving, past: [] }], [], 0).features).toEqual([])
    expect(followGeoJSON([moving], ['2026-09-28T08:00:00+08:00'], 1).features).toEqual([])
  })
})
```

- [ ] **Step 2：跑測試確認失敗**

Run: `npx vitest run frontend/src/lib/typhoon.test.ts`
Expected: FAIL，16 failed | 6 passed（新函式皆 `is not a function`；既有 6 個測試照常通過）

- [ ] **Step 3：實作**

`frontend/src/lib/typhoon.ts` 的 `Role` 型別加上 `'center'`：

```ts
type Role = 'track-past' | 'track-forecast' | 'point' | 'wind' | 'cone' | 'center'
```

在 `toGeoJSON` 之後、`/** popup 與資訊卡共用的數值列；缺值的欄位不顯示 */` 之前插入：

```ts
/** 時間軸位置換成時刻（epoch ms）：0 為最新觀測點 start，第 k 格為 times[k - 1]，格與格之間線性內插 */
export function timeAtPos(pos: number, times: string[], start: number): number {
  const p = Math.min(Math.max(pos, 0), times.length)
  const at = (k: number) => (k === 0 ? start : Date.parse(times[k - 1]))
  const i = Math.floor(p)
  const f = p - i
  const t = f > 0 ? at(i) + (at(i + 1) - at(i)) * f : at(i)
  // 剛發布新觀測點時，目前所在的時段可能比觀測點早，不讓颱風往回走
  return Math.max(start, t)
}

export interface TyphoonState { lon: number; lat: number; radius15ms: number | null }

const stateOf = ({ lon, lat, radius15ms }: TyphoonFix): TyphoonState => ({ lon, lat, radius15ms })

/** 颱風在某時刻的位置與七級風半徑：在最新觀測點與預測點之間線性內插；晚於最後一個預測點時為 null，不外推 */
export function typhoonAt(t: Typhoon, time: number): TyphoonState | null {
  const now = t.past.at(-1)
  if (!now) return null
  if (time <= Date.parse(now.time)) return stateOf(now)
  const seq = [now, ...t.forecast]
  for (let k = 1; k < seq.length; k++) {
    const a = seq[k - 1]
    const b = seq[k]
    const tb = Date.parse(b.time)
    if (time === tb) return stateOf(b)
    if (time > tb) continue
    const ta = Date.parse(a.time)
    const f = (time - ta) / (tb - ta)
    // 半徑只有一端有值時取有值的那端，同 lerpValues
    const r = a.radius15ms == null ? b.radius15ms
      : b.radius15ms == null ? a.radius15ms
      : a.radius15ms + (b.radius15ms - a.radius15ms) * f
    return { lon: a.lon + (b.lon - a.lon) * f, lat: a.lat + (b.lat - a.lat) * f, radius15ms: r }
  }
  return null
}

/** 天氣圖層上跟著時間軸移動的颱風中心（帶名稱）與七級風圈 */
export function followGeoJSON(list: Typhoon[], times: string[], pos: number): FeatureCollection {
  const features: Feature[] = []
  for (const t of list) {
    const now = t.past.at(-1)
    if (!now) continue
    const s = typhoonAt(t, timeAtPos(pos, times, Date.parse(now.time)))
    if (!s) continue
    features.push(feature('center', { type: 'Point', coordinates: [s.lon, s.lat] }, { name: t.name }))
    if (s.radius15ms) features.push(feature('wind', { type: 'Polygon', coordinates: [circlePolygon(s.lon, s.lat, s.radius15ms)] }))
  }
  return { type: 'FeatureCollection', features }
}
```

`time > tb` 時 `continue`，所以進到內插時必定 `ta < time < tb`，不會除以零。

- [ ] **Step 4：跑測試與型別檢查**

Run: `npx vitest run frontend/src/lib/typhoon.test.ts && npm test && npm run typecheck`
Expected: 該檔 22 passed；全部 194 passed；typecheck 無錯誤

- [ ] **Step 5：Commit**

```bash
git add frontend/src/lib/typhoon.ts frontend/src/lib/typhoon.test.ts
git commit -F - <<'EOF'
feat(web): interpolate typhoon position along the forecast timeline

新增三個純函式：timeAtPos 把時間軸位置換成時刻（0 為最新觀測
點、第 k 格為第 k 個預報時段，且不早於觀測點）；typhoonAt 在觀測
點與預測點之間內插颱風中心與七級風半徑，超過最後一個預測點時回
傳 null；followGeoJSON 把結果轉成中心點與風圈的 GeoJSON，給天氣
圖層上跟著時間軸移動的颱風使用。

Add three pure helpers. timeAtPos turns a timeline position into a
time (0 is the latest fix, slot k is the k-th forecast slot, never
earlier than the fix). typhoonAt interpolates the centre and gale
radius between the latest fix and the forecast points and returns
null past the last one. followGeoJSON turns that into centre and
wind-circle features for the typhoon that follows the timeline on
the weather layers.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2：資料圖層插在颱風群組之下

預報色階在時間軸拖進未來時段那一刻才加入地圖，觀測熱圖在資料更新時重建；兩者都以 `dataLayerBefore()` 找插入點。先把插入點改好，Task 3 的颱風群組才不會被它們蓋住。颱風群組還沒出現前行為不變。

**Files:**
- Modify: `frontend/src/map/helpers.ts:10-12`
- Create: `frontend/src/map/helpers.test.ts`

**Interfaces:**
- Consumes: 既有 `TOWN_HIT = 'town-hit'`、`firstSymbolLayer(map): string | undefined`
- Produces:
  - `TYPHOON_FOLLOW_BOTTOM = 'typhoon-follow-wind-fill'`（Task 3 用作颱風群組最底層圖層的 id）
  - `overlayBefore(map: MlMap): string | undefined`：`town-hit` 存在時回傳它，否則回傳第一個 symbol 圖層（即原本的 `dataLayerBefore`）
  - `dataLayerBefore(map: MlMap): string | undefined`：`TYPHOON_FOLLOW_BOTTOM` 存在時回傳它，否則同 `overlayBefore`

- [ ] **Step 1：寫失敗的測試**

新增 `frontend/src/map/helpers.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import type { Map as MlMap } from 'maplibre-gl'
import { TOWN_HIT, TYPHOON_FOLLOW_BOTTOM, dataLayerBefore, overlayBefore } from './helpers'

// 只模擬插入點會用到的兩個方法；layers 由下往上，firstSymbolLayer 靠 type 找文字圖層
const fakeMap = (layers: [id: string, type: string][]) => ({
  getLayer: (id: string) => {
    const l = layers.find(([l]) => l === id)
    return l && { id, type: l[1] }
  },
  getLayersOrder: () => layers.map(([id]) => id),
}) as unknown as MlMap

describe('layer insertion points', () => {
  const base: [string, string][] = [['background', 'background'], ['water', 'fill'], ['place', 'symbol']]
  it('falls back to the first symbol layer before the boundaries load', () => {
    const map = fakeMap(base)
    expect(dataLayerBefore(map)).toBe('place')
    expect(overlayBefore(map)).toBe('place')
  })
  it('puts data layers and overlays under the boundaries', () => {
    const map = fakeMap([...base.slice(0, 2), [TOWN_HIT, 'fill'], base[2]])
    expect(dataLayerBefore(map)).toBe(TOWN_HIT)
    expect(overlayBefore(map)).toBe(TOWN_HIT)
  })
  it('puts data layers under the typhoon overlay', () => {
    const map = fakeMap([...base.slice(0, 2), [TYPHOON_FOLLOW_BOTTOM, 'fill'], [TOWN_HIT, 'fill'], base[2]])
    expect(dataLayerBefore(map)).toBe(TYPHOON_FOLLOW_BOTTOM)
    expect(overlayBefore(map)).toBe(TOWN_HIT)
  })
})
```

- [ ] **Step 2：跑測試確認失敗**

Run: `npx vitest run frontend/src/map/helpers.test.ts`
Expected: FAIL，3 failed（前兩個 `overlayBefore is not a function`；第三個 `expected 'town-hit' to be undefined`，因為 `TYPHOON_FOLLOW_BOTTOM` 尚未匯出）

- [ ] **Step 3：實作**

`frontend/src/map/helpers.ts` 中把

```ts
/** 鄉鎮點擊用的透明填色，也是行政界線群組最底層；資料圖層插在它之下，界線才不會被熱圖蓋住 */
export const TOWN_HIT = 'town-hit'
export const dataLayerBefore = (map: MlMap) => map.getLayer(TOWN_HIT) ? TOWN_HIT : firstSymbolLayer(map)
```

換成：

```ts
/** 鄉鎮點擊用的透明填色，也是行政界線群組最底層；資料圖層插在它之下，界線才不會被熱圖蓋住 */
export const TOWN_HIT = 'town-hit'
/** 天氣圖層上颱風群組的最底層 */
export const TYPHOON_FOLLOW_BOTTOM = 'typhoon-follow-wind-fill'
/** 疊在資料圖層之上、行政界線之下 */
export const overlayBefore = (map: MlMap) => map.getLayer(TOWN_HIT) ? TOWN_HIT : firstSymbolLayer(map)
/** 預報色階在時間軸拖進未來時才加入、熱圖隨資料重建，一律插在颱風群組之下，才不會蓋住颱風 */
export const dataLayerBefore = (map: MlMap) => map.getLayer(TYPHOON_FOLLOW_BOTTOM) ? TYPHOON_FOLLOW_BOTTOM : overlayBefore(map)
```

其他呼叫 `dataLayerBefore` 的地方（`useChoropleth`、`useImageOverlay`、`RadarLayer`、`TyphoonLayer`、`WarningLayer`、`QuakeLayer`、`AdminLayer`）不必改：颱風群組只在四個天氣圖層存在，切到其他圖層時它在同一次 commit 的 cleanup 中先被移除。

- [ ] **Step 4：跑測試與型別檢查**

Run: `npx vitest run frontend/src/map/helpers.test.ts && npm test && npm run typecheck`
Expected: 該檔 3 passed；全部 197 passed；typecheck 無錯誤

- [ ] **Step 5：Commit**

```bash
git add frontend/src/map/helpers.ts frontend/src/map/helpers.test.ts
git commit -F - <<'EOF'
refactor(web): keep data layers under the typhoon overlay

dataLayerBefore 改為先找天氣圖層上颱風群組的最底層：預報色階在
時間軸拖進未來時才加入，熱圖也會隨資料重建，都要插在颱風之下。原
本的規則（town-hit 之下，否則第一個文字圖層之下）改名為
overlayBefore，給颱風群組本身使用。颱風群組出現前行為不變。

dataLayerBefore now looks for the bottom of the typhoon overlay on
the weather layers first, because the forecast choropleth is only
added once the timeline leaves "now" and the heat map is rebuilt
with new data, and both must stay under the typhoon. The old rule
(under town-hit, else under the first symbol layer) becomes
overlayBefore for the overlay itself. Nothing changes until the
overlay exists.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3：天氣圖層上的颱風

**Files:**
- Create: `frontend/src/components/TyphoonFollow.tsx`
- Modify: `frontend/src/components/DataLayers.tsx:15`（import）、`:40`（`useTyphoons`）、`:71`（掛載）
- Modify: `README.md`（「颱風」功能項目、截圖區）
- Create: `docs/screenshots/typhoon-follow.png`

**Interfaces:**
- Consumes:
  - Task 1：`followGeoJSON(list, times, pos): FeatureCollection`（`role` 為 `'center'`，帶 `name`；或 `'wind'`）
  - 既有 `toGeoJSON(list)`（`role` 為 `'track-past'`、`'track-forecast'` 的線）
  - Task 2：`TYPHOON_FOLLOW_BOTTOM`、`overlayBefore(map)`；既有 `removeLayerAndSource(map, id)`
  - 既有 `inkOf(basemap)`、`BASEMAPS[basemap].dark`、`useStore`
  - `DataLayers` 內既有的 `times = useFutureTimes()`、量化位置 `q`、`def = LAYERS[layer]`
- Produces: `TyphoonFollow({ map, list, times, pos })`，無回傳 UI

- [ ] **Step 1：新增元件**

`frontend/src/components/TyphoonFollow.tsx`：

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
const LAYER_IDS = [TYPHOON_FOLLOW_BOTTOM, 'typhoon-follow-wind-line', 'typhoon-follow-past', 'typhoon-follow-forecast', 'typhoon-follow-center', LABEL]
const role = (r: string): FilterSpecification => ['==', ['get', 'role'], r]

/** 天氣圖層上的颱風：路徑細線，以及跟著預報時間軸移動的中心、名稱與七級風圈；不參與點擊 */
export default function TyphoonFollow({ map, list, times, pos }: { map: MlMap; list: Typhoon[]; times: string[]; pos: number }) {
  const ink = useStore(s => inkOf(s.basemap))
  const dark = useStore(s => BASEMAPS[s.basemap].dark)
  const now = useMemo(() => followGeoJSON(list, times, pos), [list, times, pos])
  // 重建圖層時帶入目前位置，不必讓時間軸的每一步都重建
  const latest = useRef(now)
  latest.current = now

  useEffect(() => {
    const before = overlayBefore(map)
    map.addSource(TRACK, { type: 'geojson', data: toGeoJSON(list) })
    map.addSource(NOW, { type: 'geojson', data: latest.current })
    // 先加的在下：風圈 → 路徑 → 中心
    map.addLayer({ id: TYPHOON_FOLLOW_BOTTOM, type: 'fill', source: NOW, filter: role('wind'),
      paint: { 'fill-color': '#fa5252', 'fill-opacity': 0.15 } }, before)
    map.addLayer({ id: 'typhoon-follow-wind-line', type: 'line', source: NOW, filter: role('wind'),
      paint: { 'line-color': '#fa5252', 'line-width': 1.5 } }, before)
    map.addLayer({ id: 'typhoon-follow-past', type: 'line', source: TRACK, filter: role('track-past'),
      paint: { 'line-color': ink, 'line-width': 1, 'line-opacity': 0.6 } }, before)
    map.addLayer({ id: 'typhoon-follow-forecast', type: 'line', source: TRACK, filter: role('track-forecast'),
      paint: { 'line-color': ink, 'line-width': 1, 'line-opacity': 0.6, 'line-dasharray': [2, 2] } }, before)
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
  }, [map, list, ink, dark])

  useEffect(() => {
    map.getSource<GeoJSONSource>(NOW)?.setData(now)
  }, [map, now])

  return null
}
```

說明：
- `latest` 在 render 時更新，做法同 `MapView` 的 `towns.current`；建立圖層的 effect 因此不必依賴 `pos`，時間軸移動只走第二個 effect 的 `setData`。`list` 改變時兩個 effect 都會重跑，順序是先重建、再 `setData`。
- 每個圖層 id 都不等於 source id，`removeLayerAndSource(map, layerId)` 只會移除圖層；兩個 source 最後另外移除（source 仍被圖層使用時無法移除）。
- 不綁任何滑鼠事件，`MapView` 的點擊只查 `town-hit`。

- [ ] **Step 2：掛進 `DataLayers`**

`frontend/src/components/DataLayers.tsx`：

在 `import TyphoonLayer from './TyphoonLayer'` 下一行加：

```ts
import TyphoonFollow from './TyphoonFollow'
```

把

```ts
  const typhoon = useTyphoons(layer === 'typhoon')
```

改成

```ts
  const typhoon = useTyphoons(layer === 'typhoon' || !!def.future)
```

在 `{layer === 'typhoon' && typhoon.data && <TyphoonLayer map={map} list={typhoon.data.data} />}` 下一行加：

```tsx
      {def.future && typhoon.data && typhoon.data.data.length > 0 && <TyphoonFollow map={map} list={typhoon.data.data} times={times} pos={q} />}
```

- [ ] **Step 3：全部測試、型別檢查、build**

Run: `npm test && npm run typecheck && npx vite build --config frontend/vite.config.ts`
Expected: 197 passed；typecheck 無錯誤；build 成功（既有的 chunk 大小警告不處理）

- [ ] **Step 4：手動驗證**

`npm run dev`，瀏覽器視窗保持在前景（背景分頁不跑 `requestAnimationFrame`，播放會停住）。先開 `http://localhost:5173/?layer=typhoon` 確認目前有活動中的颱風。沒有的話，暫時把 `api/typhoon.ts` 整個換成下面的內容（**不提交**），以 fixture 的舒力基模擬，各點時間平移成「最新觀測點＝現在」；驗證完用 `git checkout api/typhoon.ts` 還原：

```ts
// 暫時：以 fixture 模擬活動中的颱風（不提交）
import { json } from '../server/http.js'
import { parseTyphoons } from '../server/cwa/parse.js'
import { fixture } from '../server/__fixtures__/load.js'
import type { TyphoonFix } from '../shared/types.js'

const taipei = (ms: number) => new Date(ms + 8 * 3600_000).toISOString().slice(0, 19) + '+08:00'

export async function GET(): Promise<Response> {
  const list = parseTyphoons(fixture('W-C0034-005.json'))
  const shift = Date.now() - Date.parse(list[0].past.at(-1)!.time)
  const move = (f: TyphoonFix) => ({ ...f, time: taipei(Date.parse(f.time) + shift) })
  const data = list.map(t => ({ ...t, past: t.past.map(move), forecast: t.forecast.map(move) }))
  return json({ data, updatedAt: new Date().toISOString(), stale: false })
}
```

fixture 的舒力基在 135°E 附近，要縮得比較小才會與台灣同框。

逐項確認：
- 開 `http://localhost:5173/?layer=wind`，縮小地圖讓台灣與颱風同框：看得到過去路徑（細實線）、預測路徑（細虛線）、紅色中心與名稱、淡紅色七級風圈；「現在」時中心在最新觀測點
- 用鍵盤（點一下時間軸後按 →）逐格前進：中心沿預測路徑移動；落在兩個預測點之間的格子，位置介於兩點之間
- 拖離「現在」、預報色階出現後，颱風仍畫在色階之上（Review Focus 1）
- 按播放：颱風與色階同步平滑移動；按暫停後對齊整格
- 右下角換成淺色底圖：路徑與名稱改成深色、名稱外圈為白色 halo，颱風仍在色階之上、界線之下；再換回深色底圖亦同（Review Focus 2）
- 切到溫度、雨量、濕度：颱風都在；切到雷達、衛星、特報、地震、行政區：颱風消失；切到颱風圖層：全路徑總覽、潛勢圓、popup 照舊（Review Focus 4）
- 回到風圖層，點台灣本島：照常選到縣市並縮放，再點選到鄉鎮

- [ ] **Step 5：README 與截圖**

截圖：瀏覽器可視區調成 1440×900（DevTools 裝置模式選 Responsive 並填 1440×900、DPR 1），開 `http://localhost:5173/?layer=wind&t=8`（+24 小時），縮小並拖曳地圖讓台灣與颱風同框，以 DevTools 的 Capture screenshot 存成 `docs/screenshots/typhoon-follow.png`（1440×900 PNG，與其他截圖一致）。若 Step 4 是用 fixture 驗證，就不截圖、不加截圖列，只改功能項目，等實際有颱風時再補。

`README.md` 截圖區，在颱風那一組表格（`| 颱風路徑（過去／預測路徑、暴風圈、潛勢圓，點路徑點看數值） | 颱風（手機版） |` 開頭）之後、行政區表格之前，加一組：

```markdown
| 颱風跟著時間軸移動（風圖層 +24 小時；中心與七級風暴風圈沿預測路徑內插） |
|---|
| ![颱風跟隨時間軸](docs/screenshots/typhoon-follow.png) |
```

「功能」清單中的「颱風」項目，句末 `切入時自動縮放到台灣與整條路徑` 之後加上：

```markdown
；溫度、風、雨量、濕度圖層上也會畫出颱風路徑，中心與七級風暴風圈跟著預報時間軸移動
```

- [ ] **Step 6：Commit**

```bash
git add frontend/src/components/TyphoonFollow.tsx frontend/src/components/DataLayers.tsx README.md docs/screenshots/typhoon-follow.png
git commit -F - <<'EOF'
feat(web): follow typhoons along the forecast timeline

溫度、風、雨量、濕度圖層上有活動中的颱風時，疊畫過去與預測路徑
細線，中心、名稱與七級風暴風圈跟著預報時間軸移動，與預報色階同
步。颱風畫在資料圖層之上、行政界線之下，名稱放最上層；不參與點
擊，點地圖照常逐層選取。颱風圖層維持全路徑總覽。README 補上說
明與截圖。

On the temperature, wind, rain and humidity layers, draw thin past
and forecast tracks for any active typhoon, with its centre, name
and gale circle moving along the forecast timeline in step with the
choropleth. The overlay sits above the data layers and below the
boundaries, with the name on top, and ignores clicks so county and
town selection still works. The typhoon layer keeps its full-track
overview. The README gains a line and a screenshot.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

若 Step 5 沒有截圖，`git add` 去掉 `docs/screenshots/typhoon-follow.png`，body 的「README 補上說明與截圖」改為「README 補上說明，截圖等實際有颱風時再補」／「The README gains a line; the screenshot waits for a live typhoon」。
