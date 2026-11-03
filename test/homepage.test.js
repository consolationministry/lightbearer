import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
test('homepage provides requested sections and preserves hymn and app routes',async()=>{const html=await readFile(resolve(root,'index.html'),'utf8');for(const id of ['about','worship','centres','word','prayer'])assert.match(html,new RegExp(`id="${id}"`));assert.match(html,/href="\.\/hymnal\.html"/);assert.match(html,/href="\.\/download\.html"/);assert.match(html,/Seraph Media/);assert.match(html,/homepage\.js/);});
test('all supplied church photos are included in local assets',async()=>{const js=await readFile(resolve(root,'js/homepage.js'),'utf8');const names=[...js.matchAll(/'(img_[a-f0-9]+\.jpg)'/g)].map(m=>m[1]);assert.equal(names.length,22);for(const n of names)await stat(resolve(root,'assets/church',n));});
test('prayer submission uses only configured publishable Supabase key and no client reads',async()=>{const js=await readFile(resolve(root,'js/prayer-form.js'),'utf8'),migration=await readFile(resolve(root,'supabase/migrations/202611030001_prayer_requests.sql'),'utf8');assert.match(js,/SUPABASE_PUBLISHABLE_KEY/);assert.match(js,/rest\/v1\/prayer_requests/);assert.doesNotMatch(js,/service_role|localStorage|\.select\(/i);assert.match(migration,/enable row level security/i);assert.match(migration,/using \(\(select public\.is_admin\(\)\)\)/);assert.match(migration,/for insert to anon, authenticated/);});
