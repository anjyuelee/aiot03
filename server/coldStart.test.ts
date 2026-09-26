import { describe, it, expect, vi } from 'vitest'

// /api/radar-frame 用不到 SQLite；載入 native 的 better-sqlite3 只會拖慢冷啟動
vi.mock('better-sqlite3', () => { throw new Error('better-sqlite3 was loaded') })

describe('radar frame endpoint', () => {
  it('loads without the SQLite driver', async () => {
    await expect(import('../api/radar-frame.js')).resolves.toHaveProperty('GET')
  })
})
