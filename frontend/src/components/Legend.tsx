import { SCALES, gradientCss, type ScaleId } from '../lib/colorScale'

export default function Legend({ scale }: { scale: ScaleId }) {
  const { unit, stops } = SCALES[scale]
  return (
    <div className="legend">
      <span>{stops[0][0]}</span>
      <div className="legend-bar" style={{ background: gradientCss(stops) }} />
      <span>{stops[stops.length - 1][0]}</span>
      <span>{unit}</span>
    </div>
  )
}
