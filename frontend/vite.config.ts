import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')

/** 本機開發時直接執行 api/*.ts 的 GET(request)，行為與 Vercel Functions 一致 */
function apiDev(): Plugin {
  return {
    name: 'api-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next()
        const url = new URL(req.url, 'http://localhost')
        const file = path.join(repoRoot, 'api', `${url.pathname.slice('/api/'.length)}.ts`)
        if (!fs.existsSync(file)) {
          res.statusCode = 404
          res.end('Not found')
          return
        }
        try {
          const mod = await server.ssrLoadModule(file)
          const response: Response = await mod.GET(new Request(url))
          res.statusCode = response.status
          response.headers.forEach((v, k) => res.setHeader(k, v))
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (e) {
          next(e)
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // 只給 server 端（api middleware）使用；前端的 envDir 是 frontend/，拿不到授權碼
  Object.assign(process.env, loadEnv(mode, repoRoot, ''))
  return {
    root: here,
    plugins: [react(), apiDev()],
    server: { fs: { allow: [repoRoot] } },
    build: { outDir: path.join(repoRoot, 'dist'), emptyOutDir: true },
  }
})
