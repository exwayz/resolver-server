import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const API_BASE = process.env.WARERA_API_BASE || 'https://api2.warera.io/trpc/';
const API_KEY = process.env.WARERA_API_KEY;
const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const PAGE_SIZE = 100;
const MAX_PAGES = 500;

if (!API_KEY) {
  console.error('WARERA_API_KEY environment variable is required');
  process.exit(1);
}

async function trpc(endpoint, params = {}) {
  const url = `${API_BASE}${endpoint}?input=${encodeURIComponent(JSON.stringify(params))}`;
  const res = await fetch(url, { headers: { 'X-API-Key': API_KEY } });
  if (!res.ok) throw new Error(`${endpoint} ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json?.error?.message) throw new Error(`${endpoint}: ${json.error.message}`);
  return json?.result?.data;
}

async function fetchPaginated(endpoint) {
  const items = [];
  let cursor = null;
  for (let i = 0; i < MAX_PAGES; i++) {
    const params = { limit: PAGE_SIZE };
    if (cursor) params.cursor = cursor;
    const data = await trpc(endpoint, params);
    const batch = data?.items || data?.data || [];
    items.push(...batch);
    const next = data?.nextCursor || data?.cursor || null;
    if (!next || next === cursor) break;
    cursor = next;
  }
  return items;
}

const cmp = (a, b) => a.localeCompare(b);

async function fetchAll() {
  const countries = (await trpc('country.getAllCountries')) || [];
  const regionsObj = (await trpc('region.getRegionsObject')) || {};
  const regions = Object.entries(regionsObj).map(([id, r]) => ({
    id,
    name: r.name,
    countryCode: r.countryCode,
    isCapital: !!r.isCapital,
  }));
  const alliances = await fetchPaginated('alliance.getManyPaginated');
  const parties = await fetchPaginated('party.getManyPaginated');
  const mus = await fetchPaginated('mu.getManyPaginated');
  return { countries, regions, alliances, parties, mus };
}

const CONTINENTS = {
  'The Americas': ['North America', 'Central America', 'Caribbean', 'South America'],
  Europe: ['British Isles', 'Western Europe', 'Iberia', 'Italy & Mediterranean', 'Balkans', 'Central Europe', 'Baltic', 'Scandinavia & Nordic', 'Eastern Europe'],
  'Middle East': ['Arabian Peninsula / Gulf', 'Levant', 'Anatolia & Caucasus', 'Persia'],
  Africa: ['North Africa', 'West Africa', 'Central Africa', 'East Africa', 'Southern Africa'],
  Asia: ['Central Asia', 'South Asia', 'East Asia', 'Southeast Asia'],
  Oceania: ['Australia & New Zealand', 'Pacific Islands'],
};

const COUNTRY_GROUPS = {
  ad: { continent: 'Europe', subregion: 'Western Europe' },
  ae: { continent: 'Middle East', subregion: 'Arabian Peninsula / Gulf' },
  af: { continent: 'Asia', subregion: 'South Asia' },
  al: { continent: 'Europe', subregion: 'Balkans' },
  am: { continent: 'Middle East', subregion: 'Anatolia & Caucasus' },
  ao: { continent: 'Africa', subregion: 'Southern Africa' },
  ar: { continent: 'The Americas', subregion: 'South America' },
  at: { continent: 'Europe', subregion: 'Western Europe' },
  au: { continent: 'Oceania', subregion: 'Australia & New Zealand' },
  az: { continent: 'Middle East', subregion: 'Anatolia & Caucasus' },
  ba: { continent: 'Europe', subregion: 'Balkans' },
  bd: { continent: 'Asia', subregion: 'South Asia' },
  be: { continent: 'Europe', subregion: 'Western Europe' },
  bf: { continent: 'Africa', subregion: 'West Africa' },
  bg: { continent: 'Europe', subregion: 'Balkans' },
  bh: { continent: 'Middle East', subregion: 'Arabian Peninsula / Gulf' },
  bi: { continent: 'Africa', subregion: 'East Africa' },
  bj: { continent: 'Africa', subregion: 'West Africa' },
  bn: { continent: 'Asia', subregion: 'Southeast Asia' },
  bo: { continent: 'The Americas', subregion: 'South America' },
  br: { continent: 'The Americas', subregion: 'South America' },
  bs: { continent: 'The Americas', subregion: 'Caribbean' },
  bt: { continent: 'Asia', subregion: 'South Asia' },
  bw: { continent: 'Africa', subregion: 'Southern Africa' },
  by: { continent: 'Europe', subregion: 'Eastern Europe' },
  bz: { continent: 'The Americas', subregion: 'Central America' },
  ca: { continent: 'The Americas', subregion: 'North America' },
  cd: { continent: 'Africa', subregion: 'Central Africa' },
  cf: { continent: 'Africa', subregion: 'Central Africa' },
  cg: { continent: 'Africa', subregion: 'Central Africa' },
  ch: { continent: 'Europe', subregion: 'Western Europe' },
  ci: { continent: 'Africa', subregion: 'West Africa' },
  cl: { continent: 'The Americas', subregion: 'South America' },
  cm: { continent: 'Africa', subregion: 'Central Africa' },
  cn: { continent: 'Asia', subregion: 'East Asia' },
  co: { continent: 'The Americas', subregion: 'South America' },
  cr: { continent: 'The Americas', subregion: 'Central America' },
  cu: { continent: 'The Americas', subregion: 'Caribbean' },
  cv: { continent: 'Africa', subregion: 'West Africa' },
  cy: { continent: 'Europe', subregion: 'Balkans' },
  cz: { continent: 'Europe', subregion: 'Central Europe' },
  de: { continent: 'Europe', subregion: 'Western Europe' },
  dj: { continent: 'Africa', subregion: 'East Africa' },
  dk: { continent: 'Europe', subregion: 'Scandinavia & Nordic' },
  do: { continent: 'The Americas', subregion: 'Caribbean' },
  dz: { continent: 'Africa', subregion: 'North Africa' },
  ec: { continent: 'The Americas', subregion: 'South America' },
  ee: { continent: 'Europe', subregion: 'Baltic' },
  eg: { continent: 'Africa', subregion: 'North Africa' },
  er: { continent: 'Africa', subregion: 'East Africa' },
  es: { continent: 'Europe', subregion: 'Iberia' },
  et: { continent: 'Africa', subregion: 'East Africa' },
  fi: { continent: 'Europe', subregion: 'Scandinavia & Nordic' },
  fj: { continent: 'Oceania', subregion: 'Pacific Islands' },
  fr: { continent: 'Europe', subregion: 'Western Europe' },
  ga: { continent: 'Africa', subregion: 'Central Africa' },
  ge: { continent: 'Middle East', subregion: 'Anatolia & Caucasus' },
  gh: { continent: 'Africa', subregion: 'West Africa' },
  gl: { continent: 'The Americas', subregion: 'North America' },
  gm: { continent: 'Africa', subregion: 'West Africa' },
  gn: { continent: 'Africa', subregion: 'West Africa' },
  gq: { continent: 'Africa', subregion: 'Central Africa' },
  gr: { continent: 'Europe', subregion: 'Balkans' },
  gt: { continent: 'The Americas', subregion: 'Central America' },
  gw: { continent: 'Africa', subregion: 'West Africa' },
  gy: { continent: 'The Americas', subregion: 'South America' },
  hn: { continent: 'The Americas', subregion: 'Central America' },
  hr: { continent: 'Europe', subregion: 'Balkans' },
  ht: { continent: 'The Americas', subregion: 'Caribbean' },
  hu: { continent: 'Europe', subregion: 'Central Europe' },
  id: { continent: 'Asia', subregion: 'Southeast Asia' },
  ie: { continent: 'Europe', subregion: 'British Isles' },
  il: { continent: 'Middle East', subregion: 'Levant' },
  in: { continent: 'Asia', subregion: 'South Asia' },
  iq: { continent: 'Middle East', subregion: 'Persia' },
  ir: { continent: 'Middle East', subregion: 'Persia' },
  is: { continent: 'Europe', subregion: 'Scandinavia & Nordic' },
  it: { continent: 'Europe', subregion: 'Italy & Mediterranean' },
  jm: { continent: 'The Americas', subregion: 'Caribbean' },
  jo: { continent: 'Middle East', subregion: 'Levant' },
  jp: { continent: 'Asia', subregion: 'East Asia' },
  ke: { continent: 'Africa', subregion: 'East Africa' },
  kg: { continent: 'Asia', subregion: 'Central Asia' },
  kh: { continent: 'Asia', subregion: 'Southeast Asia' },
  km: { continent: 'Africa', subregion: 'East Africa' },
  kp: { continent: 'Asia', subregion: 'East Asia' },
  kr: { continent: 'Asia', subregion: 'East Asia' },
  kw: { continent: 'Middle East', subregion: 'Arabian Peninsula / Gulf' },
  kz: { continent: 'Asia', subregion: 'Central Asia' },
  la: { continent: 'Asia', subregion: 'Southeast Asia' },
  lb: { continent: 'Middle East', subregion: 'Levant' },
  li: { continent: 'Europe', subregion: 'Western Europe' },
  lk: { continent: 'Asia', subregion: 'South Asia' },
  lr: { continent: 'Africa', subregion: 'West Africa' },
  ls: { continent: 'Africa', subregion: 'Southern Africa' },
  lt: { continent: 'Europe', subregion: 'Baltic' },
  lu: { continent: 'Europe', subregion: 'Western Europe' },
  lv: { continent: 'Europe', subregion: 'Baltic' },
  ly: { continent: 'Africa', subregion: 'North Africa' },
  ma: { continent: 'Africa', subregion: 'North Africa' },
  md: { continent: 'Europe', subregion: 'Eastern Europe' },
  me: { continent: 'Europe', subregion: 'Balkans' },
  mg: { continent: 'Africa', subregion: 'East Africa' },
  mk: { continent: 'Europe', subregion: 'Balkans' },
  ml: { continent: 'Africa', subregion: 'West Africa' },
  mm: { continent: 'Asia', subregion: 'Southeast Asia' },
  mn: { continent: 'Asia', subregion: 'East Asia' },
  mr: { continent: 'Africa', subregion: 'West Africa' },
  mt: { continent: 'Europe', subregion: 'Italy & Mediterranean' },
  mu: { continent: 'Africa', subregion: 'East Africa' },
  mw: { continent: 'Africa', subregion: 'Southern Africa' },
  mx: { continent: 'The Americas', subregion: 'Central America' },
  my: { continent: 'Asia', subregion: 'Southeast Asia' },
  mz: { continent: 'Africa', subregion: 'Southern Africa' },
  na: { continent: 'Africa', subregion: 'Southern Africa' },
  ne: { continent: 'Africa', subregion: 'West Africa' },
  ng: { continent: 'Africa', subregion: 'West Africa' },
  ni: { continent: 'The Americas', subregion: 'Central America' },
  nl: { continent: 'Europe', subregion: 'Western Europe' },
  no: { continent: 'Europe', subregion: 'Scandinavia & Nordic' },
  np: { continent: 'Asia', subregion: 'South Asia' },
  nz: { continent: 'Oceania', subregion: 'Australia & New Zealand' },
  om: { continent: 'Middle East', subregion: 'Arabian Peninsula / Gulf' },
  pa: { continent: 'The Americas', subregion: 'Central America' },
  pe: { continent: 'The Americas', subregion: 'South America' },
  pg: { continent: 'Oceania', subregion: 'Pacific Islands' },
  ph: { continent: 'Asia', subregion: 'Southeast Asia' },
  pk: { continent: 'Asia', subregion: 'South Asia' },
  pl: { continent: 'Europe', subregion: 'Central Europe' },
  pr: { continent: 'The Americas', subregion: 'Caribbean' },
  ps: { continent: 'Middle East', subregion: 'Levant' },
  pt: { continent: 'Europe', subregion: 'Iberia' },
  py: { continent: 'The Americas', subregion: 'South America' },
  qa: { continent: 'Middle East', subregion: 'Arabian Peninsula / Gulf' },
  ro: { continent: 'Europe', subregion: 'Balkans' },
  rs: { continent: 'Europe', subregion: 'Balkans' },
  ru: { continent: 'Europe', subregion: 'Eastern Europe' },
  rw: { continent: 'Africa', subregion: 'East Africa' },
  sa: { continent: 'Middle East', subregion: 'Arabian Peninsula / Gulf' },
  sb: { continent: 'Oceania', subregion: 'Pacific Islands' },
  sd: { continent: 'Africa', subregion: 'East Africa' },
  se: { continent: 'Europe', subregion: 'Scandinavia & Nordic' },
  sg: { continent: 'Asia', subregion: 'Southeast Asia' },
  si: { continent: 'Europe', subregion: 'Balkans' },
  sk: { continent: 'Europe', subregion: 'Central Europe' },
  sl: { continent: 'Africa', subregion: 'West Africa' },
  sn: { continent: 'Africa', subregion: 'West Africa' },
  so: { continent: 'Africa', subregion: 'East Africa' },
  sr: { continent: 'The Americas', subregion: 'South America' },
  ss: { continent: 'Africa', subregion: 'East Africa' },
  st: { continent: 'Africa', subregion: 'Central Africa' },
  sv: { continent: 'The Americas', subregion: 'Central America' },
  sy: { continent: 'Middle East', subregion: 'Levant' },
  sz: { continent: 'Africa', subregion: 'Southern Africa' },
  td: { continent: 'Africa', subregion: 'Central Africa' },
  tg: { continent: 'Africa', subregion: 'West Africa' },
  th: { continent: 'Asia', subregion: 'Southeast Asia' },
  tj: { continent: 'Asia', subregion: 'Central Asia' },
  tl: { continent: 'Asia', subregion: 'Southeast Asia' },
  tm: { continent: 'Asia', subregion: 'Central Asia' },
  tn: { continent: 'Africa', subregion: 'North Africa' },
  tr: { continent: 'Middle East', subregion: 'Anatolia & Caucasus' },
  tt: { continent: 'The Americas', subregion: 'Caribbean' },
  tw: { continent: 'Asia', subregion: 'East Asia' },
  tz: { continent: 'Africa', subregion: 'East Africa' },
  ua: { continent: 'Europe', subregion: 'Eastern Europe' },
  ug: { continent: 'Africa', subregion: 'East Africa' },
  uk: { continent: 'Europe', subregion: 'British Isles' },
  us: { continent: 'The Americas', subregion: 'North America' },
  uy: { continent: 'The Americas', subregion: 'South America' },
  uz: { continent: 'Asia', subregion: 'Central Asia' },
  va: { continent: 'Europe', subregion: 'Italy & Mediterranean' },
  ve: { continent: 'The Americas', subregion: 'South America' },
  vn: { continent: 'Asia', subregion: 'Southeast Asia' },
  vu: { continent: 'Oceania', subregion: 'Pacific Islands' },
  xk: { continent: 'Europe', subregion: 'Balkans' },
  ye: { continent: 'Middle East', subregion: 'Arabian Peninsula / Gulf' },
  za: { continent: 'Africa', subregion: 'Southern Africa' },
  zm: { continent: 'Africa', subregion: 'Southern Africa' },
  zw: { continent: 'Africa', subregion: 'Southern Africa' },
};

function buildCountriesFile(countries) {
  const lines = ['# All Countries Link'];
  const byGroup = new Map();
  for (const c of countries) {
    const g = COUNTRY_GROUPS[c.code?.toLowerCase()] || { continent: 'Other', subregion: 'Unclassified' };
    const key = `${g.continent}|${g.subregion}`;
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key).push(c);
  }
  const continents = Object.keys(CONTINENTS);
  let first = true;
  for (const continent of continents) {
    if (!first) lines.push('', '---');
    first = false;
    const subregions = CONTINENTS[continent];
    const block = [`## ${continent}`];
    for (const subregion of subregions) {
      const list = byGroup.get(`${continent}|${subregion}`) || [];
      if (!list.length) continue;
      block.push('', `### ${subregion}`);
      const sorted = [...list].sort((a, b) => cmp(a.name, b.name));
      for (const c of sorted) block.push(`- [${c.name}](/country/${c._id})`);
    }
    lines.push('', ...block);
  }
  const extra = [...byGroup.entries()].filter(([k]) => !CONTINENTS[k.split('|')[0]]);
  if (extra.length) {
    lines.push('', '## Other', '', '### Unclassified');
    for (const [k, list] of extra) {
      for (const c of [...list].sort((a, b) => cmp(a.name, b.name))) {
        lines.push(`- [${c.name}](/country/${c._id})`);
      }
    }
  }
  return lines.join('\n') + '\n';
}

function buildRegionsFile(regions) {
  const lines = ['# All Regions Link', '', `> Complete list of all ${regions.length} regions with links`];
  const byCode = new Map();
  for (const r of regions) {
    const code = (r.countryCode || '').toUpperCase() || '??';
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push(r);
  }
  const codes = [...byCode.keys()].sort(cmp);
  for (const code of codes) {
    const list = byCode.get(code).sort((a, b) => cmp(a.name, b.name));
    lines.push('', `## ${code}`, '');
    for (const r of list) {
      const marker = r.isCapital ? ' *' : '';
      lines.push(`- [${r.name}${marker}](/region/${r.id})`);
    }
    lines.push('', '---');
  }
  lines.push('');
  return lines.join('\n') + '\n';
}

function buildFlatFile(title, count, items, prefix) {
  const lines = [`# ${title}`, '', `> Complete list of all ${count} ${prefix}s with links`];
  const sorted = [...items].sort((a, b) => cmp(a.name, b.name));
  for (const it of sorted) lines.push(`- [${it.name}](/${prefix}/${it._id})`);
  return lines.join('\n') + '\n';
}

function buildAlliancesFile(alliances) {
  const lines = ['# All Alliances Link', '', `> Complete list of all ${alliances.length} alliances with links`, ''];
  const sorted = [...alliances].sort((a, b) => cmp(a.name, b.name));
  for (const a of sorted) lines.push(`- [${a.name}](/alliance/${a._id})`);
  return lines.join('\n') + '\n';
}

function buildPartiesFile(parties) {
  const lines = ['# All Parties Link', '', `> Complete list of all ${parties.length} parties with links`, ''];
  const sorted = [...parties].sort((a, b) => cmp(a.name, b.name));
  for (const p of sorted) lines.push(`- [${p.name}](/party/${p._id})`);
  return lines.join('\n') + '\n';
}

function buildMuFile(mus) {
  const lines = ['# All Military Units Link', '', `> Complete list of all ${mus.length} military units with links`, ''];
  const sorted = [...mus].sort((a, b) => cmp(a.name, b.name));
  for (const m of sorted) lines.push(`- [${m.name}](/mu/${m._id})`);
  return lines.join('\n') + '\n';
}

const { countries, regions, alliances, parties, mus } = await fetchAll();

const files = {
  'AllCountriesLink.md': buildCountriesFile(countries),
  'allRegion.md': buildRegionsFile(regions),
  'allAlliances.md': buildAlliancesFile(alliances),
  'allParties.md': buildPartiesFile(parties),
  'allMU.md': buildMuFile(mus),
};

for (const [name, content] of Object.entries(files)) {
  writeFileSync(join(DATA_DIR, name), content, 'utf8');
}

console.log(`countries=${countries.length} regions=${regions.length} alliances=${alliances.length} parties=${parties.length} mus=${mus.length}`);
console.log('Wrote data files.');
