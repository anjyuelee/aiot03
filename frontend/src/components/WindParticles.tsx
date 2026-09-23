import { useEffect, useMemo, useRef } from 'react'
import type { Map as MlMap } from 'maplibre-gl'
import type { Observation } from '../../../shared/types'
import { buildWindField, sampleField } from '../lib/wind'
import { TAIWAN_BOUNDS } from '../lib/heat'

const COUNT = 3000
const MAX_AGE = 90
// zoom 6 時每 (m/s) 每幀移動的經緯度；10 m/s ≈ 2px/frame
const SPEED = 0.0022

interface Particle { lon: number; lat: number; age: number }

export default function WindParticles({ map, obs }: { map: MlMap; obs: Observation[] }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const field = useMemo(() => buildWindField(obs, TAIWAN_BOUNDS), [obs])

  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const { clientWidth: w, clientHeight: h } = map.getContainer()
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()

    const [w, s, e, n] = TAIWAN_BOUNDS
    const spawn = (p: Particle) => {
      p.lon = w + Math.random() * (e - w)
      p.lat = s + Math.random() * (n - s)
      p.age = Math.floor(Math.random() * MAX_AGE)
    }
    const particles = Array.from({ length: COUNT }, () => {
      const p = { lon: 0, lat: 0, age: 0 }
      spawn(p)
      return p
    })
    const clear = () => ctx.clearRect(0, 0, canvas.width, canvas.height)

    let raf = 0
    const frame = () => {
      // 讓舊軌跡逐漸淡出
      ctx.globalCompositeOperation = 'destination-in'
      ctx.fillStyle = 'rgba(0,0,0,0.92)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'
      ctx.lineWidth = 1.2
      ctx.beginPath()
      const k = SPEED / Math.pow(2, map.getZoom() - 6)
      for (const p of particles) {
        const uv = sampleField(field, p.lon, p.lat)
        if (!uv || ++p.age > MAX_AGE) { spawn(p); continue }
        const a = map.project([p.lon, p.lat])
        p.lon += (uv[0] * k) / Math.cos((p.lat * Math.PI) / 180)
        p.lat += uv[1] * k
        const b = map.project([p.lon, p.lat])
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
      }
      ctx.stroke()
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    map.on('move', clear)
    map.on('resize', resize)
    return () => {
      cancelAnimationFrame(raf)
      map.off('move', clear)
      map.off('resize', resize)
    }
  }, [map, field])

  return <canvas ref={ref} className="wind-canvas" />
}
