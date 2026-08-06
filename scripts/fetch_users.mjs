import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const API_BASE = process.env.WARERA_API_BASE || 'https://api2.warera.io/trpc/';
const API_KEY = process.env.WARERA_API_KEY || 'wae_5332b87af46c869ada4a932094c878b1537253435ae991b648bd6fc38b255c49';
const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const PAGE_SIZE = 100;
const CONCURRENCY = 20;
const MAX_RETRIES = 3;
const MIN_INTERVAL_MS = 125; // API token limit is 500 req/min -> keep ~480/min max

if (!API_KEY) {
  console.error('WARERA_API_KEY environment variable is required');
  process.exit(1);
}

let lastRequestAt = 0;

async function waitForSlot() {
  const now = Date.now();
  const wait = Math.max(0, lastRequestAt + MIN_INTERVAL_MS - now);
  lastRequestAt = Math.max(now, lastRequestAt + MIN_INTERVAL_MS);
  if (wait > 0) await sleep(wait);
}

async function trpc(endpoint, params = {}) {
  await waitForSlot();
  const url = `${API_BASE}${endpoint}?input=${encodeURIComponent(JSON.stringify(params))}`;
  const res = await fetch(url, { headers: { 'X-API-Key': API_KEY } });
  if (!res.ok) throw new Error(`${endpoint} ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json?.error?.message) throw new Error(`${endpoint}: ${json.error.message}`);
  return json?.result?.data;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getCountries() {
  return (await trpc('country.getAllCountries')) || [];
}

async function getUsersByCountry(countryId) {
  const items = [];
  let cursor = null;
  for (let i = 0; i < 500; i++) {
    const params = { countryId, limit: PAGE_SIZE };
    if (cursor) params.cursor = cursor;
    const data = await trpc('user.getUsersByCountry', params);
    const batch = data?.items || [];
    items.push(...batch);
    if (!data?.nextCursor || data.nextCursor === cursor) break;
    cursor = data.nextCursor;
  }
  return items;
}

async function getUserLite(userId) {
  const data = await trpc('user.getUserLite', { userId });
  return data?.username || null;
}

async function getUserWithRetry(userId) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const username = await getUserLite(userId);
      return { id: userId, username };
    } catch (e) {
      if (attempt === MAX_RETRIES - 1) {
        console.error(`failed after ${MAX_RETRIES} tries: ${userId}: ${e.message}`);
        return { id: userId, username: null };
      }
      await sleep(500 * (attempt + 1));
    }
  }
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

const cmp = (a, b) => a.localeCompare(b);

function buildUsersFile(users) {
  const sorted = [...users].sort((a, b) => cmp(a.username, b.username) || cmp(a.id, b.id));
  const lines = ['# All Users Link', '', `> Complete list of all ${sorted.length} users with links`, ''];
  for (const u of sorted) {
    const name = u.username.replace(/[\r\n]+/g, ' ');
    lines.push(`- [${name}](/user/${u.id})`);
  }
  return lines.join('\n') + '\n';
}

const countries = await getCountries();
console.log(`countries: ${countries.length}`);

const byId = new Map();
for (const c of countries) {
  const users = await getUsersByCountry(c._id);
  for (const u of users) byId.set(u._id, u.createdAt);
  console.log(`  ${c.code}: ${users.length} users (total ${byId.size})`);
}

const ids = [...byId.keys()];
console.log(`total users: ${ids.length}, fetching usernames...`);

const results = await mapLimit(ids, CONCURRENCY, getUserWithRetry);
const users = results.filter((u) => u.username);

const dup = new Map();
for (const u of users) {
  if (!dup.has(u.username)) dup.set(u.username, []);
  dup.get(u.username).push(u.id);
}
const dupNames = [...dup.entries()].filter(([, v]) => v.length > 1);
if (dupNames.length) {
  console.warn(`warning: ${dupNames.length} duplicate username(s):`, dupNames.slice(0, 10).map(([n, v]) => `${n} (${v.length})`).join(', '));
}

const content = buildUsersFile(users);
writeFileSync(join(DATA_DIR, 'allUsers.md'), content, 'utf8');
console.log(`wrote ${users.length} users to data/allUsers.md (${(content.length / 1024).toFixed(1)} KB)`);
