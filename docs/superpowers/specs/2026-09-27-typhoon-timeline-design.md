# 颱風圖層時間軸設計文件

- 日期：2026-09-27
- 目標：颱風圖層也能拖動或播放預報時間軸，颱風中心、七級風暴風圈與 70% 潛勢圓沿預測路徑移動，潛勢圓隨預報時間變大；天氣圖層上的颱風同樣加上會變大的潛勢圓。
- 前一版：`docs/superpowers/specs/2026-09-27-typhoon-follow-design.md`（天氣圖層上的颱風跟隨時間軸）。本文件修改其中「颱風圖層不加時間軸」與「天氣圖層不畫潛勢圓」兩項。

## 1. 需求

| 項目 | 內容 |
|---|---|
| 時間軸 | 颱風圖層使用與溫度／風／雨量／濕度共用的預報時間軸（72 小時、3 小時一格）；無色階圖例 |
| 切換圖層 | 五個有時間軸的圖層之間切換時保留時間軸位置與播放狀態；切到其他圖層回到「現在」並停止；由雷達回放切入不延續播放 |
| 網址 | 颱風圖層的 `t` 寫進網址，`?layer=typhoon&t=8` 直接開在 +24h |
| 移動的颱風 | 颱風圖層與天氣圖層都畫：中心、名稱、七級風暴風圈、70% 潛勢圓，位置與半徑依時間內插（規則見 §2.2） |
| 潛勢圓 | 最新觀測點為 0，隨預報時間變大；細外框、不填色 |
| 颱風圖層總覽 | 過去／預測路徑、路徑點、固定潛勢圓、點擊 popup、切入時自動縮放皆保留；固定在最新觀測點的七級風圈與紅點改由移動的颱風負責 |
| 資訊卡 | 照舊顯示最新狀態，不隨時間軸變動 |
| 沒有颱風 | 颱風圖層照舊顯示時間軸（可拖動，畫面不變） |
| 手機版面 | 寬度 ≤ 640px 時資訊卡是底部抽屜、疊在時間軸之上；颱風卡關不掉，改為移到時間軸上方（見 §2.9），卡片與時間軸同時可見。地點卡行為不變 |

實測資料（2026-09-27，舒力基）：七級風半徑最新觀測點 110 km、各預測點 100 km；70% 潛勢半徑 +6h 起為 30、40、80、90、100、150、230、360、460 km。會隨時間明顯變大的是潛勢圓。

## 2. 前端

### 2.1 `frontend/src/lib/layers.ts`

- `LayerDef` 新增 `timeline?: true`：有 72 小時預報時間軸。`temp`、`wind`、`rain`、`humidity`、`typhoon` 為 `true`。
- `future` 維持原意：預報色階的欄位與色標。`typhoon` 無 `future`。

### 2.2 `frontend/src/lib/typhoon.ts`

- `TyphoonState` 新增 `radius70: number | null`。
- `typhoonAt`：
  - 最新觀測點的 `radius70` 視為 `0`（實測位置沒有不確定性）；時刻不晚於它時回傳 `radius70: 0`。
  - 預測點剛好落在該時刻時取該點的 `radius70`。
  - 兩點之間：兩端都有值時線性內插，只有一端有值時取該端（同 `radius15ms`），皆無則 `null`。觀測點到第一個預測點之間即由 0 內插到該點半徑。
- `followGeoJSON`：`radius70 > 0` 時多加一個 `Polygon`（`circlePolygon`），`properties: { role: 'cone' }`。要素順序：中心、七級風圈（若有）、潛勢圓（若有）。
- `toGeoJSON`：不再產生最新觀測點的 `wind` 圓；路徑點移除 `current` 屬性。路徑、路徑點、各預測點的 `cone` 保留。

### 2.3 `frontend/src/store.ts`

`setLayer` 的判斷由 `LAYERS[layer].future` 改為 `LAYERS[layer].timeline`：

```ts
setLayer: layer => set(s => LAYERS[layer].timeline
  ? { layer, radarPos: 0, playing: s.playing && !!LAYERS[s.layer].timeline }
  : { layer, t: 0, pos: 0, playing: false, radarPos: 0 }),
```

### 2.4 `frontend/src/components/Timeline.tsx`

- `max = def.timeline ? times.length : 0`；沒有 `timeline` 時走原本的雷達／衛星／隱藏分支。
- 色階：`scale = t > 0 ? def.future?.scale : def.now?.scale`，沒有時不顯示 `Legend`（颱風圖層）。
- 其餘（播放、拖曳、刻度、網址 `t` 超出範圍時回到現在）不變。

### 2.5 `frontend/src/components/TyphoonFollow.tsx`

- 新增 prop `tracks: boolean`：`false` 時不建立 `typhoon-follow` source 與兩條路徑圖層。
- 新增圖層 `typhoon-follow-cone`（line，`role == cone`）：`line-color: ink`、`line-width: 1.5`、`line-opacity: 0.8`，不填色。
- 群組順序（由下往上）：`typhoon-follow-wind-fill`（仍為 `TYPHOON_FOLLOW_BOTTOM`）→ `typhoon-follow-wind-line` → `typhoon-follow-cone` → `typhoon-follow-past` → `typhoon-follow-forecast` → `typhoon-follow-center`；`typhoon-follow-label` 在最上層。

### 2.6 `frontend/src/components/TyphoonLayer.tsx`

- 移除 `typhoon-wind-fill`、`typhoon-wind-line` 兩層。
- `typhoon-points`：所有點半徑 4、白框 1；過去點 `ink`、預測點 `#0b0e17`（移除 `current` 的放大紅點）。
- 固定潛勢圓（`typhoon-cone`：`ink`、1px、透明度 0.35）、路徑、popup、`fitBounds`、`minZoom` 不變。
- 所有圖層（含原本未指定插入點、疊在最上層的 `typhoon-points`）都以 `dataLayerBefore` 插入，颱風群組存在時插在它之下，移動的颱風一定畫在總覽之上；路徑點不再蓋住移動的紅點。MapLibre 的圖層點擊事件只查該圖層，最新觀測點被紅點蓋住仍可點出 popup。

### 2.7 `frontend/src/components/DataLayers.tsx`

- `useTyphoons(!!def.timeline)`。
- `def.timeline` 且有颱風時掛上 `<TyphoonFollow … tracks={layer !== 'typhoon'} />`。
- `usePrefetchGrids` 仍看 `def.future`；目前時段的 `gridA`／`gridB` 也改為只在 `def.future` 存在時才帶時段（否則傳 `null`，即時段清單那一筆已快取的查詢）：颱風圖層拖動或播放時不抓預報格點。

### 2.8 連帶效果

- 特報描邊的透明度本來就依 `pos`（`outlineOpacity`），颱風圖層拖離「現在」時也會淡出，與其他四個圖層一致。
- 颱風圖層「現在」時與先前的差異：紅點半徑 7 → 6、七級風圈填色透明度 0.2 → 0.15、多了颱風名稱（沿用天氣圖層樣式，同一個颱風在各圖層外觀一致）。

### 2.9 手機版颱風卡（`TyphoonCard.tsx`、`styles.css`）

- `TyphoonCard` 的 `aside` 加上 class `typhoon-card`。
- `@media (max-width: 640px)` 內：

```css
.card.typhoon-card { left: var(--gap); right: var(--gap); bottom: calc(var(--gap) + var(--timeline-h, 110px) + 8px + env(safe-area-inset-bottom)); max-height: 40%; border-radius: 16px; padding-bottom: 16px; }
```

  `--timeline-h` 由 `Timeline` 量測寫入（同底圖切換鈕的做法）。桌機版不變。

## 3. 錯誤處理

- 沒有颱風或抓取失敗：不掛載 `TyphoonFollow`；颱風圖層顯示「目前無活動中的熱帶氣旋」，時間軸照舊顯示。
- 其餘沿用前一版：stale 資料照畫；預報時段未載入時停在最新觀測點；晚於最後一個預測點不畫。

## 4. 測試

- `frontend/src/lib/typhoon.test.ts`：
  - `typhoonAt` 的 `radius70`：最新觀測點為 0；觀測點與第一個預測點之間由 0 內插；預測點之間內插；剛好落在預測點取該值；只有一端有值時取該端；既有斷言補上 `radius70`
  - `followGeoJSON`：`radius70 > 0` 時有 `cone`；「現在」時沒有
  - `toGeoJSON`：沒有 `wind`、路徑點沒有 `current`
- `frontend/src/lib/layers.test.ts`（新檔）：只有 `temp`、`wind`、`rain`、`humidity`、`typhoon` 有 `timeline`；`typhoon` 沒有 `future`
- `frontend/src/store.test.ts`：風 → 颱風保留 `t` 與播放；颱風 → 雷達回到現在並停止；雷達 → 颱風不延續播放
- `npm test`、`npm run typecheck`、`vite build` 全過
- 手動：
  - 颱風圖層出現時間軸、無色階圖例；拖動與播放時紅點、七級風圈、潛勢圓移動，潛勢圓變大；固定潛勢圓仍淡；點路徑點（含紅點下的最新觀測點）有 popup；切入時自動縮放
  - 風圖層播到 +24h 切到颱風圖層：同一時刻且繼續播放；切到雷達回到現在
  - `?layer=typhoon&t=8` 開在 +24h
  - 手機寬度（390×844）：颱風卡在時間軸上方，兩者都看得到
  - 天氣圖層上看得到細外框潛勢圓

## 5. `README.md`

- 「時間軸」項目：「颱風、行政區等無時間序列的圖層不顯示時間軸」改為「特報、地震、行政區等無時間序列的圖層不顯示時間軸」。
- 「颱風」項目補一句：颱風圖層也可拖動或播放預報時間軸，70% 潛勢圓隨預報時間變大。
- 重拍截圖（headless Chrome，本機）：`typhoon.png`（桌機 1440×900，颱風圖層 `t=16`，約 +48h）、`typhoon-mobile.png`（390×844、DPR 2，颱風圖層 `t=16`）、`typhoon-follow.png`（桌機，風圖層 `t=16`，含潛勢圓）；表格說明文字配合更新。選 +48h 是因為 +24h 時潛勢半徑（約 90 km）還小於七級風半徑（100 km），看不出變大。

## 6. 不做

- 颱風專屬、到 +120h 的時間軸
- 資訊卡隨時間軸顯示該時刻數值
- 內插或顯示氣壓、風速
- 沒有颱風時隱藏時間軸
- 自訂七級風圈成長（照 CWA 數值）
