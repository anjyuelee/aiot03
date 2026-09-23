const RAD = Math.PI / 180

export const latToMercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * RAD) / 2))
export const mercYToLat = (y: number) => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / RAD
