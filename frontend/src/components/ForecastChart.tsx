import { Bar, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ForecastSlot } from '../../../shared/types'
import { fmtHour } from '../lib/format'

const tick = { fill: '#9aa4b2', fontSize: 10 }

export default function ForecastChart({ slots }: { slots: ForecastSlot[] }) {
  const data = slots.map(s => ({ label: fmtHour(s.start), temp: s.temp, pop: s.pop }))
  return (
    <ResponsiveContainer width="100%" height={150}>
      <ComposedChart data={data} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
        <XAxis dataKey="label" tick={tick} interval={1} axisLine={false} tickLine={false} />
        <YAxis yAxisId="t" tick={tick} domain={['dataMin - 2', 'dataMax + 2']} axisLine={false} tickLine={false} />
        <YAxis yAxisId="p" hide domain={[0, 100]} />
        <Tooltip contentStyle={{ background: '#141824', border: 'none', borderRadius: 8 }} />
        <Bar yAxisId="p" dataKey="pop" name="降雨機率 %" fill="#4dabf7" fillOpacity={0.45} radius={[3, 3, 0, 0]} />
        <Line yAxisId="t" dataKey="temp" name="溫度 °C" stroke="#fdae61" strokeWidth={2} dot={false} type="monotone" />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
