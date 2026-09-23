import fs from 'node:fs'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const fixture = (name: string): any =>
  JSON.parse(fs.readFileSync(new URL(`./${name}`, import.meta.url), 'utf8'))
