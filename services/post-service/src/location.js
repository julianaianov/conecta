function normalizeCoordinates(latitude, longitude) {
  const lat = latitude == null || (typeof latitude === 'string' && latitude.trim() === '') ? NaN : Number(latitude);
  const lon = longitude == null || (typeof longitude === 'string' && longitude.trim() === '') ? NaN : Number(longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;

  return { latitude: lat, longitude: lon };
}

module.exports = { normalizeCoordinates };
