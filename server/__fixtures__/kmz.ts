import { strToU8, zipSync } from 'fflate'

// 形狀取自實際 O-B0033-003 圖塊 KML：Region 的 LatLonAltBox 在前，GroundOverlay 的 LatLonBox 在後
const tileKml = (n: number, s: number, e: number, w: number) => `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
	<Document>
		<Region>
			<LatLonAltBox>
				<north>99.000000</north>
				<south>-99.000000</south>
				<east>199.000000</east>
				<west>-199.000000</west>
			</LatLonAltBox>
		</Region>
		<GroundOverlay>
			<Icon><href>2.png</href></Icon>
			<LatLonBox>
				<north>${n.toFixed(6)}</north>
				<south>${s.toFixed(6)}</south>
				<east>${e.toFixed(6)}</east>
				<west>${w.toFixed(6)}</west>
			</LatLonBox>
		</GroundOverlay>
	</Document>
</kml>`

export const sampleKmz = () => zipSync({
  'doc.kml': strToU8('<kml/>'),
  '2/1/2.kml': strToU8(tileKml(37.44, 24.96, 126.96, 114.48)),
  '2/1/2.png': new Uint8Array([1, 2, 3]),
  '2/0/3.kml': strToU8(tileKml(49.92, 37.44, 114.48, 102)),
  '2/0/3.png': new Uint8Array([4, 5]),
  '3/2/4.kml': strToU8(tileKml(31.2, 24.96, 120.72, 114.48)),
  '3/2/4.png': new Uint8Array([6]),
})
