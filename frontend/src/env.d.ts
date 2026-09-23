// frontend/src/env.d.ts — 512KB 的 TopoJSON 不讓 tsc 推導型別
declare module 'taiwan-atlas/towns-10t.json' {
  const topology: unknown
  export default topology
}
