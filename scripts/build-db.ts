import fs from 'node:fs'
import { openDb } from '../server/db.js'
import { syncForecast, syncImage, syncObservations, syncTyphoons } from '../server/sync.js'

const FILE = 'data/weather.db'

if (!process.env.CWA_API_KEY) {
  console.error('CWA_API_KEY is not set')
  process.exit(1)
}

fs.mkdirSync('data', { recursive: true })
fs.rmSync(FILE, { force: true })
const db = openDb(FILE)

const steps: [string, () => Promise<void>][] = [
  ['observations', () => syncObservations(db)],
  ['forecast', () => syncForecast(db)],
  ['radar', () => syncImage(db, 'radar')],
  ['satellite', () => syncImage(db, 'satellite')],
  ['typhoon', () => syncTyphoons(db)],
]
// 單一資料集失敗不中斷 build：執行期會再向 CWA 補抓
for (const [name, run] of steps) {
  try {
    await run()
    console.log(`✓ ${name}`)
  } catch (e) {
    console.error(`✗ ${name}`, e)
  }
}

const count = (table: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n
console.log(Object.fromEntries(['stations', 'observations', 'towns', 'forecast_3h', 'forecast_week', 'images', 'satellite_tiles', 'typhoons'].map(t => [t, count(t)])))
db.close()
