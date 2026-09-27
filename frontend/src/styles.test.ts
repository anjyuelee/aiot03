import { describe, it, expect } from 'vitest'
import { transform } from 'lightningcss'
import styles from './styles.css?raw'

// 與 Vite 8 正式 build 相同：lightningcss 壓縮，目標為預設的 baseline-widely-available
const v = (major: number, minor = 0) => (major << 16) | (minor << 8)
const targets = { chrome: v(111), edge: v(111), firefox: v(114), safari: v(16, 4), ios_saf: v(16, 4) }

describe('styles.css production build', () => {
  it('keeps the unprefixed backdrop-filter beside every -webkit- one', () => {
    const { code } = transform({ filename: 'styles.css', code: new TextEncoder().encode(styles), minify: true, targets })
    const css = new TextDecoder().decode(code)
    const prefixed = css.match(/-webkit-backdrop-filter:/g) ?? []
    const unprefixed = css.match(/(?<!-webkit-)backdrop-filter:/g) ?? []
    expect(prefixed.length).toBeGreaterThan(0)
    expect(unprefixed.length).toBe(prefixed.length)
  })
})
