// scripts/local_update.js
// Node 18+ recommended (has global fetch). Saves prices.json in repo root.
// Usage: set env RAPIDAPI_KEY (and optionally SOURCE_URL) then `node scripts/local_update.js`

import fs from 'fs/promises';

const DEFAULT_URL = 'https://daily-petrol-diesel-lpg-cng-fuel-prices-in-india.p.rapidapi.com/v1/fuel-prices/history/india/kerala/palakkad';
const SOURCE_URL = process.env.SOURCE_URL || DEFAULT_URL;
const RAPIDAPI_HOST = 'daily-petrol-diesel-lpg-cng-fuel-prices-in-india.p.rapidapi.com';
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

if (!RAPIDAPI_KEY) {
  console.error('Set RAPIDAPI_KEY environment variable (your RapidAPI key).');
  process.exit(1);
}

function findNumbersInObject(obj) {
  // try to find petrol/diesel by key name heuristics
  const petrolKeys = ['petrol','petrol_price','petrolPrice','petrol_rate','p'];
  const dieselKeys = ['diesel','diesel_price','dieselPrice','diesel_rate','d'];

  let petrol = null, diesel = null, updated_at = null;

  function scan(o) {
    if (o && typeof o === 'object') {
      for (const k of Object.keys(o)) {
        const v = o[k];
        const kn = k.toLowerCase();
        if (!petrol && petrolKeys.includes(kn) && (typeof v === 'number' || /^\d/.test(String(v)))) petrol = Number(v);
        if (!diesel && dieselKeys.includes(kn) && (typeof v === 'number' || /^\d/.test(String(v)))) diesel = Number(v);
        if (!updated_at && (kn.includes('updated') || kn.includes('date')|| kn.includes('time'))) updated_at = String(v);
        if (typeof v === 'object') scan(v);
      }
    }
  }
  scan(obj);
  return {petrol, diesel, updated_at};
}

async function run(){
  try {
    console.log('Fetching', SOURCE_URL);
    const res = await fetch(SOURCE_URL, {
      headers: {
        'x-rapidapi-host': RAPIDAPI_HOST,
        'x-rapidapi-key': RAPIDAPI_KEY,
        'Accept': 'application/json'
      }
    });
    if (!res.ok) throw new Error(`Fetch failed ${res.status}`);
    const data = await res.json();
    // Heuristic: if response is an array, take the last element (most recent)
    let candidate = data;
    if (Array.isArray(data) && data.length) candidate = data[data.length - 1];
    // try to find numbers
    let {petrol, diesel, updated_at} = findNumbersInObject(candidate);

    // fallback: search numbers in stringified JSON (last-resort)
    if ((!petrol || !diesel)) {
      const s = JSON.stringify(data);
      const nums = s.match(/(\d{2,3}\.\d{2})/g) || s.match(/(\d{2,3}\.\d{1,2})/g) || [];
      if (nums.length >= 2) {
        petrol = petrol || Number(nums[0]);
        diesel = diesel || Number(nums[1]);
      }
    }

    if (!petrol || !diesel) {
      console.error('Could not reliably extract petrol/diesel from response. Dumping sample to console for inspection.');
      console.error(JSON.stringify(data, null, 2).slice(0, 2000));
      process.exit(2);
    }

    const out = {
      petrol: Number(petrol),
      diesel: Number(diesel),
      updated_at: updated_at || new Date().toISOString()
    };

    await fs.writeFile('prices.json', JSON.stringify(out, null, 2), 'utf8');
    console.log('Wrote prices.json:', out);
  } catch (err) {
    console.error('Error:', err.message || err);
    process.exit(3);
  }
}

run();
