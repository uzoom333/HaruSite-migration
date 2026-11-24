const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const request = require('supertest');

const ROOT = path.resolve(__dirname, '../../..');
const FILE = 'apps/api/.local/shipping_test.db';
const KEY = 'k'.repeat(40);
const original = global.fetch;
let app, db, server, calls, handler;
const json = (status, body) => new Response(JSON.stringify(body), { status });
const RATES = [
  { id: 2, name: 'SEDEX', price: '30.00', custom_price: '28.55', delivery_range: { min: 1, max: 3 }, company: { name: 'Correios' },
    packages: [{ weight: '0.20', dimensions: { height: 4, width: 12, length: 25 } }] },
  { id: 1, name: 'PAC', price: '19.90', delivery_time: 7, company: { name: 'Correios' },
    packages: [{ weight: '0.20', dimensions: { height: 4, width: 12, length: 25 } }] },
  { id: 3, name: '.Package', error: 'Não atende', company: { name: 'Jadlog' } },
];
before(async () => {
  for (const s of ['', '-wal', '-shm']) fs.rmSync(path.join(ROOT, FILE) + s, { force: true });
  Object.assign(process.env, {
    DATABASE_FILE: FILE, WEB_ORIGIN: 'http://localhost:3000,https://loja.example', ADMIN_KEY: KEY,
    MELHOR_ENVIO_ENV: 'sandbox', MELHOR_ENVIO_USER_AGENT: 'Teste (teste@example.com)', MELHOR_ENVIO_TOKEN: '',
    MELHOR_ENVIO_SERVICES: '', MELHOR_ENVIO_CLIENT_ID: '1', MELHOR_ENVIO_CLIENT_SECRET: 'segredo',
    MELHOR_ENVIO_REDIRECT_URI: 'https://api.example/api/melhor-envio/callback', SHIP_FROM_CEP: '74000-000',
    SHIP_FROM_NAME: 'Loja', SHIP_FROM_DOCUMENT: '00000000000', SHIP_FROM_COMPANY_DOCUMENT: '', SHIP_FROM_ADDRESS: 'Rua', SHIP_FROM_NUMBER: '1',
    SHIP_FROM_DISTRICT: 'Centro', SHIP_FROM_CITY: 'Goiânia', SHIP_FROM_UF: 'GO',
  });
  const m = spawnSync(process.execPath, ['scripts/migrate.cjs'], { env: process.env, encoding: 'utf8' });
  assert.equal(m.status, 0, m.stderr);
  db = new DatabaseSync(path.join(ROOT, FILE));
  db.exec("UPDATE variants SET weight_g=100,width_cm=12,height_cm=4,length_cm=25 WHERE sku='HARU-ESCOVA'");
  app = await require('../dist/bootstrap').createApp();
  await app.init();
  server = app.getHttpServer();
});
after(async () => { global.fetch = original; await app?.close(); db?.close(); });
beforeEach(() => {
  calls = [];
  handler = () => json(200, RATES);
  global.fetch = async (url, init) => { const c = { url: String(url), headers: init.headers, body: JSON.parse(init.body) }; calls.push(c); return handler(c); };
  db.exec('DELETE FROM oauth_tokens; DELETE FROM shipments');
  token('a1', 30);
});
const token = (t, days) => db.prepare("INSERT OR REPLACE INTO oauth_tokens VALUES('sandbox',?,'r1',?)").run(t, Date.now() + days * 86400000);
const post = (p, body = {}) => request(server).post('/api' + p).set('X-Haru-Request', '1').send(body);
const admin = (p, body) => post(p, body).set('Authorization', 'Bearer ' + KEY);
const quote = (cep, items = [{ slug: 'escova', quantity: 2 }]) => post('/shipping/quote', { cep, items });

test('cotação usa dados do banco, ordena por preço, descarta erro e usa cache', async () => {
  const r = await quote('01001000').expect(200);
  assert.deepEqual(r.body.rates.map(x => [x.serviceId, x.priceCents, x.minDays, x.maxDays]), [[1, 1990, 7, 7], [2, 2855, 1, 3]]);
  assert.equal(calls[0].url, 'https://sandbox.melhorenvio.com.br/api/v2/me/shipment/calculate');
  assert.equal(calls[0].headers['User-Agent'], 'Teste (teste@example.com)');
  assert.deepEqual(calls[0].body.products[0], { id: 'escova', width: 12, height: 4, length: 25, weight: 0.1, insurance_value: 48, quantity: 2 });
  await quote('01001000').expect(200);
  assert.equal(calls.length, 1);
});
test('cotação rejeita entrada adulterada, produto inativo, repetido e sem medidas', async () => {
  for (const items of [[], [{ slug: 'escova', quantity: 0 }], [{ slug: 'escova', quantity: 1, price: 1 }], [{ slug: 'suporte', quantity: 1 }],
    [{ slug: 'escova', quantity: 1 }, { slug: 'escova', quantity: 1 }]]) await quote('01001001', items).expect(400);
  await quote('123').expect(400);
  await quote('01001001', [{ slug: 'kit', quantity: 1 }]).expect(503);
  assert.equal(calls.length, 0);
});
test('CORS libera só as origens configuradas', async () => {
  const ok = await request(server).options('/api/shipping/quote').set('Origin', 'https://loja.example').set('Access-Control-Request-Method', 'POST');
  assert.equal(ok.headers['access-control-allow-origin'], 'https://loja.example');
  const bad = await request(server).options('/api/shipping/quote').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'POST');
  assert.equal(bad.headers['access-control-allow-origin'], undefined);
});
test('falha externa vira 503 e 401 renova o token uma única vez em paralelo', async () => {
  handler = () => { throw new Error('rede'); };
  await quote('01001002').expect(503);
  let refreshes = 0;
  handler = async c => {
    if (c.url.endsWith('/oauth/token')) { refreshes++; await new Promise(r => setTimeout(r, 30)); return json(200, { access_token: 'a2', refresh_token: 'r2', expires_in: 2592000 }); }
    return c.headers.Authorization === 'Bearer a2' ? json(200, RATES) : json(401, {});
  };
  const [a, b] = await Promise.all([quote('01001003'), quote('01001004')]);
  assert.deepEqual([a.status, b.status, refreshes], [200, 200, 1]);
  assert.equal(db.prepare('SELECT refresh_token r FROM oauth_tokens').get().r, 'r2');
});
test('token perto do vencimento é renovado antes da chamada', async () => {
  token('velho', 1);
  handler = c => c.url.endsWith('/oauth/token') ? json(200, { access_token: 'novo', refresh_token: 'r2', expires_in: 2592000 }) : json(200, RATES);
  await quote('01001005').expect(200);
  assert.equal(calls[1].headers.Authorization, 'Bearer novo');
});
test('OAuth exige chave administrativa e state de uso único', async () => {
  await post('/melhor-envio/connect').expect(401);
  const { body } = await admin('/melhor-envio/connect').expect(200);
  const state = new URL(body.url).searchParams.get('state');
  handler = () => json(200, { access_token: 'x', refresh_token: 'y', expires_in: 100 });
  const cb = s => request(server).get('/api/melhor-envio/callback').query({ code: 'c', state: s });
  await cb('falso').expect(400);
  await cb(state).expect(200);
  await cb(state).expect(400);
});
const order = { reference: 'haru-1', serviceId: 1, items: [{ slug: 'escova', quantity: 1 }],
  to: { name: 'Cliente', document: '00000000000', address: 'Rua', number: '2', district: 'Sé', city: 'São Paulo', uf: 'SP', cep: '01001000' } };
const ID = '11111111-1111-1111-1111-111111111111';
const remote = c => c.url.endsWith('/calculate') ? json(200, RATES)
  : c.url.endsWith('/me/cart') ? json(201, { id: ID, price: 19.9 })
  : c.url.endsWith('/generate') ? json(200, { [ID]: { status: true } })
  : c.url.endsWith('/print') ? json(200, { url: 'https://sandbox.melhorenvio.com.br/imprimir/x' })
  : json(200, { [ID]: { status: 'posted', tracking: 'AA1BR' } });
test('etiqueta: criar, comprar uma vez, gerar, imprimir e rastrear', async () => {
  handler = remote;
  await post('/shipments', order).expect(401);
  assert.equal((await admin('/shipments', order).expect(201)).body.status, 'cart');
  await admin('/shipments', order).expect(409);
  const buys = await Promise.all([admin('/shipments/haru-1/buy'), admin('/shipments/haru-1/buy')]);
  assert.deepEqual(buys.map(r => r.status).sort(), [200, 409]);
  assert.equal(calls.filter(c => c.url.endsWith('/checkout')).length, 1);
  await admin('/shipments/haru-1/generate').expect(200);
  await admin('/shipments/haru-1/print').expect(200);
  assert.equal((await admin('/shipments/haru-1/sync').expect(200)).body.tracking, 'AA1BR');
});
test('compra sem resposta não pode ser repetida; recusa clara pode', async () => {
  handler = remote;
  await admin('/shipments', order).expect(201);
  handler = () => json(422, { message: 'saldo' });
  await admin('/shipments/haru-1/buy').expect(422);
  handler = () => { throw new Error('timeout'); };
  await admin('/shipments/haru-1/buy').expect(503);
  handler = remote;
  await admin('/shipments/haru-1/buy').expect(409);
});
test('webhook valida assinatura e não regride estado final', async () => {
  handler = remote;
  await admin('/shipments', order).expect(201);
  const send = (status, sig) => {
    const raw = JSON.stringify({ event: 'order.' + status, data: { id: ID, status, tracking: 'AA1BR' } });
    return request(server).post('/api/melhor-envio/webhook').set('Content-Type', 'application/json')
      .set('X-ME-Signature', sig ?? createHmac('sha256', 'segredo').update(raw).digest('base64')).send(raw);
  };
  await send('posted', 'errada').expect(401);
  await admin('/shipments/haru-1/buy').expect(200);
  await send('pending').expect(200);
  await admin('/shipments/haru-1/buy').expect(409);
  await send('delivered').expect(200);
  await send('posted').expect(200);
  const r = await request(server).get('/api/shipments/haru-1').set('Authorization', 'Bearer ' + KEY).expect(200);
  assert.equal(r.body.status, 'delivered');
});
