import fs from 'node:fs'
import path from 'node:path'

/** build 時打包的種子 DB；獨立成檔，http.ts 才不會連帶載入 better-sqlite3 */
export const SEED = path.join(process.cwd(), 'data', 'weather.db')

export const seedExists = () => fs.existsSync(SEED)
