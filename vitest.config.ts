import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['server/**/*.test.ts', 'frontend/src/**/*.test.ts'],
    environment: 'node',
    // styles.test.ts 以 ?raw 讀原始 CSS；vitest 預設把 CSS 換成空字串
    css: { include: [/styles\.css/] },
  },
})
