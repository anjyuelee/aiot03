# 特報描邊 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 看溫度、風、雨量、濕度、雷達、衛星、颱風圖層時，有特報的縣市以嚴重度色描邊標示，不必切到特報圖層。

**Architecture:** 純函式（`frontend/src/lib/warnings.ts`）產生 MapLibre 的 filter、顏色、排序運算式與描邊透明度；`Boundaries` 在縣市界之上、選取外框之下加兩層 `line`（黑色襯線＋嚴重度色線），共用既有的 `county-shape` source。特報圖層的填色改用同一個顏色運算式。

**Tech Stack:** TypeScript、React 19、MapLibre GL 6、Zustand、TanStack Query、Vitest。

**Spec:** `docs/superpowers/specs/2026-09-26-warning-outline-design.md`

**Commit 規則：** 英文 subject＋中英雙語 body。每個 Task 最後一步已附上完整訊息，用 `git commit -F -` 搭配 heredoc 提交。

**測試指令：** `npm test`（Vitest 一次跑完 server 與 frontend）、`npm run typecheck`。單檔可用 `npx vitest run <path>`。

本計畫的程式碼已在 repo 副本跑過：測試、型別檢查、`vite build`，以及用 fixture 餵特報的瀏覽器實測（七個天氣圖層、三個隱藏圖層、時間軸淡出、淺色底圖、換底圖、選取縣市）。

## Global Constraints

- 出現描邊的圖層：`temp`、`wind`、`rain`、`humidity`、`radar`、`satellite`、`typhoon`；`warning`、`quake`、`admin` 不畫
- 無開關；沒有特報時什麼都不畫；不新增 API 請求（沿用 `useWarnings()`）
- 透明度：`max(0, 1 − pos)`，`pos` 先量化成 1/20 格
- 襯線：`rgba(0,0,0,0.55)`，`line-width` zoom 7 → 11 由 5 到 6.5；色線 `line-width` zoom 7 → 11 由 2 到 3.5；兩層 `line-join: round`
- 圖層順序（由下往上）：資料圖層 → `town-hit` → `town-line` → `county-line` → `warning-casing` → `warning-line` → `county-selected` → `town-selected` → 地名
- 相鄰縣市共用邊界顯示較嚴重者（`line-sort-key` = 嚴重度 rank）
- 特報圖層的填色行為不變

## Review Focus

1. **換底圖後描邊要還在**：線色（`ink`）改變會讓 `Boundaries` 主 effect 重建圖層，重建時必須帶入目前的特報與透明度，而不是空 filter → Task 2 Step 8 手動檢查
2. **特報比界線早到或晚到都要畫出來**：先到的一方建立圖層時帶目前值，後到的由更新 effect 補上 → Task 2 Step 8 重新整理頁面檢查
3. **播放預報時不能每一幀都重設 paint，拖到 `pos ≥ 1` 後不能殘留描邊** → Task 2 `outlineOpacity` 測試（0.52 量化為 0.5、`pos` 3 為 0）
4. **相鄰縣市不同嚴重度時，共用邊界顯示較嚴重者** → Task 2 `countyRank` 測試＋Step 8 宜蘭／花蓮手動檢查
5. **選取的縣市本身有特報時，選取外框和特報顏色都要看得出來** → Task 2 Step 8 手動檢查（選取外框在描邊中央，兩側仍有特報色）

---

## 檔案結構

| 檔案 | 動作 | 責任 |
|---|---|---|
| `frontend/src/lib/warnings.ts` | 修改 | `worstByCounty` 改回傳 `Severity`；新增 `countyColor`、`countyRank`、`countyFilter`、`outlineOpacity` |
| `frontend/src/lib/warnings.test.ts` | 修改 | 上述函式的測試 |
| `frontend/src/components/WarningLayer.tsx` | 修改 | 改用 `countyColor` |
| `frontend/src/components/Boundaries.tsx` | 修改 | `warning-casing`、`warning-line` 兩層與更新 effect |
| `README.md` | 修改 | 「特報」項目補描邊說明 |

---

### Task 1：共用縣市顏色運算式

把 `WarningLayer.tsx` 裡的 `fillColor` 移到 `lib/warnings.ts` 成為 `countyColor`，讓 Task 2 的描邊共用；`worstByCounty` 改回傳整個 `Severity`，Task 2 的排序要用 rank。行為不變。

**Files:**
- Modify: `frontend/src/lib/warnings.ts:1-30`
- Modify: `frontend/src/components/WarningLayer.tsx`
- Test: `frontend/src/lib/warnings.test.ts:1-28`

**Interfaces:**
- Consumes: 既有 `severityOf(phenomena): Severity`、`Severity { rank: number; color: string }`
- Produces:
  - `worstByCounty(list: Warning[]): Map<string, Severity>`（key 為 5 碼 `countyCode`，依第一次出現順序）
  - `countyColor(list: Warning[]): string | ExpressionSpecification`：無特報回傳 `'rgba(0,0,0,0)'`；否則 `['match', ['get', 'COUNTYCODE'], code1, color1, …, 'rgba(0,0,0,0)']`
  - 模組內私有 `byCounty(list, pick, fallback)`，Task 2 的 `countyRank` 也用它

- [ ] **Step 1：改寫測試**

`frontend/src/lib/warnings.test.ts` 第 2 行 import 改為：

```ts
import { badgeText, countyColor, fmtValid, groupByKind, severityOf, worstByCounty } from './warnings'
```

把整個 `describe('worstByCounty', …)` 區塊換成：

```ts
describe('worstByCounty', () => {
  it('keeps the most severe warning per county', () => {
    const m = worstByCounty([w('10002', '宜蘭縣', '大雨'), w('10002', '宜蘭縣', '豪雨'), w('10015', '花蓮縣', '濃霧')])
    expect(m.get('10002')).toEqual(severityOf('豪雨'))
    expect(m.get('10015')).toEqual(severityOf('濃霧'))
    expect(m.size).toBe(2)
    expect(worstByCounty([w('10002', '宜蘭縣', '豪雨'), w('10002', '宜蘭縣', '陸上強風')]).get('10002')).toEqual(severityOf('豪雨'))
  })
})

describe('countyColor', () => {
  it('is transparent without warnings', () => {
    expect(countyColor([])).toBe('rgba(0,0,0,0)')
  })
  it('matches each county to its most severe colour', () => {
    expect(countyColor([w('10002', '宜蘭縣', '大雨'), w('10002', '宜蘭縣', '豪雨'), w('10015', '花蓮縣', '濃霧')])).toEqual(
      ['match', ['get', 'COUNTYCODE'], '10002', severityOf('豪雨').color, '10015', severityOf('濃霧').color, 'rgba(0,0,0,0)'])
  })
})
```

- [ ] **Step 2：跑測試確認失敗**

Run: `npx vitest run frontend/src/lib/warnings.test.ts`
Expected: FAIL，3 failed | 5 passed（`worstByCounty` 拿到顏色字串而非 `Severity`；兩個 `countyColor` 測試 `countyColor is not a function`）

- [ ] **Step 3：實作**

`frontend/src/lib/warnings.ts` 檔頭加一行型別 import（放第一行）：

```ts
import type { ExpressionSpecification } from 'maplibre-gl'
import type { Warning } from '../../../shared/types'
import { fmtMD } from './format'
```

把現有的 `worstByCounty`（註解「每個縣市取最嚴重特報的顏色」那段）整段換成：

```ts
/** 每個縣市取最嚴重的特報 */
export function worstByCounty(list: Warning[]): Map<string, Severity> {
  const best = new Map<string, Severity>()
  for (const w of list) {
    const s = severityOf(w.phenomena)
    if ((best.get(w.countyCode)?.rank ?? -1) < s.rank) best.set(w.countyCode, s)
  }
  return best
}

const NONE = 'rgba(0,0,0,0)'

/** 依縣市代碼對應最嚴重特報的 match 運算式；match 至少要一組對應，沒有特報時直接回傳預設值 */
function byCounty<T extends string | number>(list: Warning[], pick: (s: Severity) => T, fallback: T): T | ExpressionSpecification {
  const pairs = [...worstByCounty(list)].flatMap(([code, s]) => [code, pick(s)])
  if (pairs.length === 0) return fallback
  const expr: unknown[] = ['match', ['get', 'COUNTYCODE'], ...pairs, fallback]
  return expr as ExpressionSpecification
}

/** 有特報的縣市給最嚴重種類的顏色，其餘透明；特報填色與描邊共用 */
export const countyColor = (list: Warning[]) => byCounty(list, s => s.color, NONE)
```

`frontend/src/components/WarningLayer.tsx`：

- 第 2 行改為 `import type { Map as MlMap } from 'maplibre-gl'`
- 第 5 行改為 `import { countyColor } from '../lib/warnings'`
- 刪除 `fillColor` 函式（連同上方註解，共 7 行）；`const NONE` 保留，建立圖層時的初始 `fill-color` 仍用它
- 更新 effect 那行改為：

```ts
    if (counties) map.setPaintProperty(ID, 'fill-color', countyColor(list))
```

- [ ] **Step 4：跑測試與型別檢查**

Run: `npx vitest run frontend/src/lib/warnings.test.ts && npm run typecheck`
Expected: 8 passed；typecheck 無輸出錯誤

- [ ] **Step 5：Commit**

```bash
git add frontend/src/lib/warnings.ts frontend/src/lib/warnings.test.ts frontend/src/components/WarningLayer.tsx
git commit -F - <<'EOF'
refactor(web): share the county warning colour expression

特報填色的 match 運算式從 WarningLayer 移到 lib/warnings.ts 成為
countyColor，接下來的特報描邊也要用同一份顏色；worstByCounty 改
回傳整個 Severity，排序描邊時要用到 rank。特報圖層的畫面不變。

Move the warning fill's match expression out of WarningLayer into
lib/warnings.ts as countyColor, so the upcoming warning outline can
use the same colours. worstByCounty now returns the whole Severity,
since the outline needs the rank to order shared borders. The
warning layer looks the same.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2：特報描邊

**Files:**
- Modify: `frontend/src/lib/warnings.ts`（檔頭 import、`countyColor` 之後）
- Modify: `frontend/src/components/Boundaries.tsx`（整檔替換）
- Modify: `README.md:48`
- Test: `frontend/src/lib/warnings.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `worstByCounty`、`byCounty`、`countyColor`；既有 `useWarnings()`（`frontend/src/api.ts`，回傳 `ApiResponse<Warning[]>` 的 query）、`useStore` 的 `layer: LayerId` 與 `pos: number`
- Produces:
  - `countyRank(list: Warning[]): number | ExpressionSpecification`：無特報回傳 `0`；否則 `['match', ['get', 'COUNTYCODE'], code1, rank1, …, 0]`
  - `countyFilter(list: Warning[]): FilterSpecification`：`['in', ['get', 'COUNTYCODE'], ['literal', codes]]`，無特報時 `codes` 為 `[]`
  - `outlineOpacity(layer: LayerId, pos: number): number`
  - 地圖圖層 `warning-casing`、`warning-line`

- [ ] **Step 1：寫失敗的測試**

`frontend/src/lib/warnings.test.ts` 第 2 行 import 改為：

```ts
import { badgeText, countyColor, countyFilter, countyRank, fmtValid, groupByKind, outlineOpacity, severityOf, worstByCounty } from './warnings'
```

在 `describe('groupByKind', …)` 之前插入：

```ts
describe('countyFilter', () => {
  it('selects no county without warnings', () => {
    expect(countyFilter([])).toEqual(['in', ['get', 'COUNTYCODE'], ['literal', []]])
  })
  it('lists each warned county once, unknown kinds included', () => {
    expect(countyFilter([w('10002', '宜蘭縣', '大雨'), w('10002', '宜蘭縣', '陸上強風'), w('10015', '花蓮縣', '高溫')])).toEqual(
      ['in', ['get', 'COUNTYCODE'], ['literal', ['10002', '10015']]])
  })
})

describe('countyRank', () => {
  it('is 0 without warnings', () => {
    expect(countyRank([])).toBe(0)
  })
  it('matches each county to its highest rank', () => {
    expect(countyRank([w('10002', '宜蘭縣', '陸上強風'), w('10002', '宜蘭縣', '大雨'), w('10015', '花蓮縣', '豪雨')])).toEqual(
      ['match', ['get', 'COUNTYCODE'], '10002', 4, '10015', 5, 0])
  })
})

describe('outlineOpacity', () => {
  it('hides the outline on the warning, quake and admin layers', () => {
    expect((['warning', 'quake', 'admin'] as const).map(l => outlineOpacity(l, 0))).toEqual([0, 0, 0])
  })
  it('fades out between now and the first forecast slot', () => {
    expect([0, 0.5, 1, 3].map(p => outlineOpacity('temp', p))).toEqual([1, 0.5, 0, 0])
    expect(outlineOpacity('temp', 0.52)).toBe(0.5)
    expect(outlineOpacity('radar', 0)).toBe(1)
  })
})

```

- [ ] **Step 2：跑測試確認失敗**

Run: `npx vitest run frontend/src/lib/warnings.test.ts`
Expected: FAIL，6 failed | 8 passed（`countyFilter`／`countyRank`／`outlineOpacity` is not a function）

- [ ] **Step 3：實作純函式**

`frontend/src/lib/warnings.ts` 檔頭換成：

```ts
import type { ExpressionSpecification, FilterSpecification } from 'maplibre-gl'
import type { Warning } from '../../../shared/types'
import { fmtMD } from './format'
import type { LayerId } from './layers'
```

在 `export const countyColor = …` 那行之後加入：

```ts

/** 描邊的 line-sort-key：較嚴重者畫在上面，相鄰縣市共用邊界顯示較嚴重的顏色 */
export const countyRank = (list: Warning[]) => byCounty(list, s => s.rank, 0)

/** 只留有特報的縣市；沒有特報時一個都不選 */
export const countyFilter = (list: Warning[]): FilterSpecification =>
  ['in', ['get', 'COUNTYCODE'], ['literal', [...worstByCounty(list).keys()]]]

// 特報圖層已整塊填色；地震、行政區與天氣特報無關
const NO_OUTLINE: LayerId[] = ['warning', 'quake', 'admin']

/** 描邊只代表「現在」：由現在到第一個預報時段隨觀測熱圖淡出；量化成 1/20 格，播放時不必每幀重設 */
export function outlineOpacity(layer: LayerId, pos: number): number {
  if (NO_OUTLINE.includes(layer)) return 0
  return Math.max(0, 1 - Math.round(pos * 20) / 20)
}
```

- [ ] **Step 4：跑測試確認通過**

Run: `npx vitest run frontend/src/lib/warnings.test.ts`
Expected: 14 passed

- [ ] **Step 5：`Boundaries` 加上描邊**

`frontend/src/components/Boundaries.tsx` 整檔替換為：

```tsx
import { useEffect } from 'react'
import type { FilterSpecification, Map as MlMap } from 'maplibre-gl'
import { useBoundaries, useTownShapes, useWarnings } from '../api'
import { useStore } from '../store'
import { inkOf } from '../lib/basemaps'
import { countyColor, countyFilter, countyRank, outlineOpacity } from '../lib/warnings'
import { TOWN_HIT, firstSymbolLayer, removeLayerAndSource } from '../map/helpers'

const TOWN_LINE = 'town-line'
const COUNTY_LINE = 'county-line'
const SELECTED = 'town-selected'
const COUNTY = 'county-shape'
const COUNTY_SELECTED = 'county-selected'
const WARNING_CASING = 'warning-casing'
const WARNING_LINE = 'warning-line'
const selected = (town: string | null): FilterSpecification => ['==', ['get', 'TOWNCODE'], town ?? '']
const selectedCounty = (county: string | null): FilterSpecification => ['==', ['get', 'COUNTYCODE'], county ?? '']

/** 縣市／鄉鎮界線、特報縣市描邊，以及鄉鎮點擊判定用的透明多邊形與縣市／鄉鎮選取外框 */
export default function Boundaries({ map }: { map: MlMap }) {
  const town = useStore(s => s.town)
  const county = useStore(s => s.county)
  const ink = useStore(s => inkOf(s.basemap))
  const outline = useStore(s => outlineOpacity(s.layer, s.pos))
  const warnings = useWarnings().data?.data
  const shapes = useTownShapes()
  const lines = useBoundaries()
  const ready = !!shapes.data && !!lines.data

  useEffect(() => {
    if (!ready) return
    const before = firstSymbolLayer(map)
    map.addSource(TOWN_HIT, { type: 'geojson', data: shapes.data! })
    map.addSource(TOWN_LINE, { type: 'geojson', data: lines.data!.towns })
    map.addSource(COUNTY_LINE, { type: 'geojson', data: lines.data!.counties })
    map.addSource(COUNTY, { type: 'geojson', data: lines.data!.countyShapes })
    // 透明度 0 仍可被 queryRenderedFeatures 查到
    map.addLayer({ id: TOWN_HIT, type: 'fill', source: TOWN_HIT, paint: { 'fill-opacity': 0 } }, before)
    // 縮小時鄉鎮界太密，放大後才漸漸出現
    map.addLayer({ id: TOWN_LINE, type: 'line', source: TOWN_LINE,
      paint: { 'line-color': ink, 'line-width': 0.6, 'line-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0, 9, 0.3] } }, before)
    map.addLayer({ id: COUNTY_LINE, type: 'line', source: COUNTY_LINE,
      paint: { 'line-color': ink, 'line-opacity': 0.45, 'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.8, 11, 1.6] } }, before)
    // 特報描邊疊在縣市界之上、選取外框之下；以目前的值建立，之後由下方 effect 更新
    const list = warnings ?? []
    map.addLayer({ id: WARNING_CASING, type: 'line', source: COUNTY, filter: countyFilter(list), layout: { 'line-join': 'round' },
      paint: { 'line-color': 'rgba(0,0,0,0.55)', 'line-opacity': outline, 'line-width': ['interpolate', ['linear'], ['zoom'], 7, 5, 11, 6.5] } }, before)
    map.addLayer({ id: WARNING_LINE, type: 'line', source: COUNTY, filter: countyFilter(list),
      layout: { 'line-join': 'round', 'line-sort-key': countyRank(list) },
      paint: { 'line-color': countyColor(list), 'line-opacity': outline, 'line-width': ['interpolate', ['linear'], ['zoom'], 7, 2, 11, 3.5] } }, before)
    map.addLayer({ id: COUNTY_SELECTED, type: 'line', source: COUNTY, filter: selectedCounty(useStore.getState().county),
      paint: { 'line-color': ink, 'line-width': 2 } }, before)
    map.addLayer({ id: SELECTED, type: 'line', source: TOWN_HIT, filter: selected(useStore.getState().town),
      paint: { 'line-color': '#3b82f6', 'line-width': 2.5 } }, before)
    return () => {
      removeLayerAndSource(map, WARNING_LINE)
      removeLayerAndSource(map, WARNING_CASING)
      removeLayerAndSource(map, COUNTY_SELECTED)
      removeLayerAndSource(map, COUNTY)
      removeLayerAndSource(map, SELECTED)
      removeLayerAndSource(map, COUNTY_LINE)
      removeLayerAndSource(map, TOWN_LINE)
      removeLayerAndSource(map, TOWN_HIT)
    }
  }, [map, ready, shapes.data, lines.data, ink])

  useEffect(() => {
    if (ready) map.setFilter(SELECTED, selected(town))
  }, [map, ready, town])

  useEffect(() => {
    if (ready) map.setFilter(COUNTY_SELECTED, selectedCounty(county))
  }, [map, ready, county])

  // 特報變動時只換篩選、顏色與排序，不重建圖層
  useEffect(() => {
    if (!ready) return
    const list = warnings ?? []
    map.setFilter(WARNING_CASING, countyFilter(list))
    map.setFilter(WARNING_LINE, countyFilter(list))
    map.setPaintProperty(WARNING_LINE, 'line-color', countyColor(list))
    map.setLayoutProperty(WARNING_LINE, 'line-sort-key', countyRank(list))
  }, [map, ready, warnings])

  useEffect(() => {
    if (!ready) return
    map.setPaintProperty(WARNING_CASING, 'line-opacity', outline)
    map.setPaintProperty(WARNING_LINE, 'line-opacity', outline)
  }, [map, ready, outline])

  return null
}
```

要點（review 時對照）：
- 兩層描邊用 `COUNTY`（`county-shape`）source，不另開 source；cleanup 必須先移除這兩層再移除 `COUNTY`，source 還被圖層使用時移除會失敗
- 主 effect 建立圖層時直接帶入目前的 `warnings` 與 `outline`（同選取外框以 `useStore.getState()` 建 filter 的做法）；主 effect 因 `ink` 改變重建時，描邊不會變回空的
- `outline` 的 selector 回傳量化後的數字，播放時只有數值改變才重新渲染；`pos ≥ 1` 後恆為 0

- [ ] **Step 6：全部測試、型別檢查、build**

Run: `npm test && npm run typecheck && npx vite build --config frontend/vite.config.ts`
Expected: 20 test files、177 tests passed；typecheck 無錯誤；`✓ built`

- [ ] **Step 7：README**

`README.md` 第 48 行「特報」項目，句尾加上描邊說明，整行變成：

```markdown
- **特報**：發布中的縣市天氣特報依最嚴重種類為縣市著色（颱風警報、大豪雨、豪雨、大雨、低溫、強風、濃霧），資訊卡依種類列出縣市與有效時間；左上角徽章在任何圖層都提示目前特報，點了切到特報圖層；在溫度、風、雨量、濕度、雷達、衛星、颱風圖層上，有特報的縣市以同色描邊標示，時間軸拖到未來預報時淡出
```

- [ ] **Step 8：手動驗證（fixture 餵特報，不提交）**

線上目前沒有特報。暫時把 `api/warnings.ts` 換成下面內容，讓本機 API 回傳 fixture（宜蘭大雨＋陸上強風、花蓮豪雨、臺北市大雨、連江縣濃霧）：

```ts
import fs from 'node:fs'
import { handle, json } from '../server/http.js'
import { parseWarnings } from '../server/cwa/parse.js'

// 暫時：以 fixture 模擬發布中的特報（不提交）
export async function GET(): Promise<Response> {
  const raw = JSON.parse(fs.readFileSync(new URL('../server/__fixtures__/W-C0033-001.json', import.meta.url), 'utf8'))
  return handle(async () => json({ data: parseWarnings(raw), updatedAt: new Date().toISOString(), stale: false }))
}
```

`npm run dev`，開 http://localhost:5173/?layer=temp。瀏覽器分頁要在前景：背景分頁會暫停 requestAnimationFrame，MapLibre 不觸發 `load`，界線與描邊都不會出現。逐項確認：

- 溫度圖層：臺北市、宜蘭縣黃色描邊，花蓮縣橘色；宜蘭／花蓮共用邊界是橘色；黃色描邊在熱圖黃橘區仍可辨識（黑色襯線）
- 點時間軸「明天」：描邊淡出消失；拖回「現在」：描邊出現
- 依序切風、雨量、濕度、雷達、衛星、颱風：都有描邊；切特報（只有整塊填色）、地震、行政區：沒有描邊
- 右下角換淺色底圖：描邊仍在、看得清楚；再換回深色也一樣
- 重新整理頁面數次：描邊都會出現（特報比界線早到或晚到都要畫）
- 點宜蘭縣：縣市選取外框疊在描邊中央，兩側仍看得到黃色；逐層選取照常

確認後還原：

Run: `git checkout -- api/warnings.ts && git status --short`
Expected: 只剩 `frontend/src/lib/warnings.ts`、`frontend/src/lib/warnings.test.ts`、`frontend/src/components/Boundaries.tsx`、`README.md` 四個修改

- [ ] **Step 9：Commit**

```bash
git add frontend/src/lib/warnings.ts frontend/src/lib/warnings.test.ts frontend/src/components/Boundaries.tsx README.md
git commit -F - <<'EOF'
feat(web): outline warned counties on the weather layers

溫度、風、雨量、濕度、雷達、衛星、颱風圖層上，有特報的縣市以嚴重
度色描邊、外加黑色襯線，疊在縣市界之上、選取外框之下；相鄰縣市
共用邊界以 line-sort-key 顯示較嚴重者。描邊只代表「現在」，時間
軸拖到未來預報時隨觀測熱圖淡出；特報、地震、行政區圖層不畫。
README 補上說明。

Outline counties under a weather warning in their severity colour,
with a dark casing, on the temperature, wind, rain, humidity,
radar, satellite and typhoon layers. The outline sits above county
lines and below the selection outlines, and line-sort-key puts the
more severe colour on shared borders. It only stands for "now", so
it fades out with the observation heat map as the timeline moves
into the forecast. The warning, quake and admin layers skip it.
The README describes it.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```
