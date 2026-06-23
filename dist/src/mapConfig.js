import { municipalities, municipalityDistrictMap } from "./referenceData.js";

export const noMunicipalityLabel = "No Municipality";

// Coordinates are municipality/city center points for the Leaflet fallback
// heatmap. They avoid visual-only/random placement while keeping the map
// independent from database schema changes.
export const ilocosSurBounds = [
  [16.78, 120.28],
  [17.94, 120.82]
];

export const municipalityCoordinates = {
  Alilem: [16.8846, 120.5322],
  Banayoyo: [17.2333, 120.4833],
  Bantay: [17.5847, 120.3906],
  Burgos: [17.3328, 120.4952],
  Cabugao: [17.7931, 120.4581],
  "Candon City": [17.1947, 120.4483],
  Caoayan: [17.5619, 120.3975],
  Cervantes: [16.9909, 120.7351],
  Galimuyod: [17.1842, 120.4717],
  "Gregorio del Pilar": [17.1306, 120.6119],
  Lidlidda: [17.2687, 120.5217],
  Magsingal: [17.685, 120.4242],
  Nagbukel: [17.4481, 120.5239],
  Narvacan: [17.4192, 120.475],
  Quirino: [17.1561, 120.6736],
  Salcedo: [17.1545, 120.5391],
  "San Emilio": [17.2264, 120.6114],
  "San Esteban": [17.3297, 120.4442],
  "San Ildefonso": [17.6222, 120.3964],
  "San Juan": [17.7422, 120.4583],
  "San Vicente": [17.5969, 120.3758],
  Santa: [17.4864, 120.4347],
  "Santa Catalina": [17.5969, 120.3594],
  "Santa Cruz": [17.085, 120.4525],
  "Santa Lucia": [17.1172, 120.4525],
  "Santa Maria": [17.3667, 120.4808],
  Santiago: [17.2931, 120.4447],
  Sinait: [17.8664, 120.4578],
  Sigay: [17.0433, 120.5792],
  Sugpon: [16.8422, 120.5158],
  Suyo: [16.9769, 120.5258],
  "Santo Domingo": [17.635, 120.4108],
  Tagudin: [16.9361, 120.4442],
  "Vigan City": [17.5747, 120.3869]
};

export const municipalityMapPoints = municipalities.map((name) => ({
  name,
  district: municipalityDistrictMap[name] || "No District",
  coordinates: municipalityCoordinates[name]
})).filter((item) => item.coordinates);

export const municipalityMapBounds = municipalityMapPoints.map((item) => item.coordinates);

const aliases = new Map();

function key(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\bcity of\b/g, "")
    .replace(/\bcity\b/g, "")
    .replace(/\bmunicipality of\b/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

for (const municipality of municipalities) {
  aliases.set(key(municipality), municipality);
  aliases.set(key(municipality.replace(/\s+City$/i, "")), municipality);
  if (/^Santa\s+/i.test(municipality)) aliases.set(key(municipality.replace(/^Santa\s+/i, "Sta. ")), municipality);
  if (/^Santo\s+/i.test(municipality)) aliases.set(key(municipality.replace(/^Santo\s+/i, "Sto. ")), municipality);
}

aliases.set("vigan", "Vigan City");
aliases.set("candon", "Candon City");
aliases.set("gregoriodelpilar", "Gregorio del Pilar");
aliases.set("gregorio", "Gregorio del Pilar");
aliases.set("lapog", "San Juan");

export function normalizeMunicipality(value) {
  const normalizedKey = key(value);
  if (!normalizedKey) return noMunicipalityLabel;
  return aliases.get(normalizedKey) || noMunicipalityLabel;
}

export function getMunicipalityCoordinates(name) {
  return municipalityCoordinates[name] || null;
}

export function getMunicipalityDistrictName(name) {
  return municipalityDistrictMap[name] || "No District";
}
