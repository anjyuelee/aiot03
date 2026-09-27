import { describe, it, expect, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { openDb } from './db.js'
import { getFetchedAt } from './repo.js'

let dir: string
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

describe('openDb', () => {
  it('drops an old warnings table and its fetch log so it is fetched again', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiot03-db-'))
    const file = path.join(dir, 'old.db')
    const old = new Database(file)
    old.exec(`
      CREATE TABLE warnings (county_code TEXT, county TEXT, phenomena TEXT, significance TEXT, start_time TEXT, end_time TEXT,
        PRIMARY KEY (county_code, phenomena, significance));
      INSERT INTO warnings VALUES ('10002', '宜蘭縣', '大雨', '特報', NULL, NULL);
      CREATE TABLE fetch_log (dataset TEXT PRIMARY KEY, fetched_at TEXT);
      INSERT INTO fetch_log VALUES ('warnings', '2026-09-27T00:00:00.000Z'), ('observations', '2026-09-27T00:00:00.000Z');
    `)
    old.close()

    const db = openDb(file)
    const cols = (db.prepare('PRAGMA table_info(warnings)').all() as { name: string }[]).map(c => c.name)
    expect(cols).toContain('level')
    expect(db.prepare('SELECT COUNT(*) AS n FROM warnings').get()).toEqual({ n: 0 })
    expect(getFetchedAt(db, 'warnings')).toBeNull()
    expect(getFetchedAt(db, 'observations')).toBe('2026-09-27T00:00:00.000Z')
    db.close()
  })

  it('keeps a current warnings table', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiot03-db-'))
    const file = path.join(dir, 'current.db')
    const first = openDb(file)
    first.exec(`INSERT INTO warnings (county_code, county, phenomena, significance) VALUES ('10002', '宜蘭縣', '大雨', '特報');
      INSERT INTO fetch_log VALUES ('warnings', '2026-09-27T00:00:00.000Z')`)
    first.close()

    const db = openDb(file)
    expect(db.prepare('SELECT COUNT(*) AS n FROM warnings').get()).toEqual({ n: 1 })
    expect(getFetchedAt(db, 'warnings')).toBe('2026-09-27T00:00:00.000Z')
    db.close()
  })
})
