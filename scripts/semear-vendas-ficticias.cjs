/**
 * Semeia vendas INVENTADAS num banco separado, só para treinar consulta analítica.
 * Nada aqui representa venda real do Haru e este banco nunca é lido pelo site.
 * Uso: node scripts/semear-vendas-ficticias.cjs
 */
const { DatabaseSync } = require('node:sqlite');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.resolve(__dirname, '..');
const ALVO = '.local/haru_ficticio.db';
const arquivo = path.resolve(ROOT, ALVO);

// Trava: dado inventado jamais pode cair no banco que a aplicação usa.
for (const proibido of ['DATABASE_FILE', 'TEST_DATABASE_FILE']) {
  const valor = process.env[proibido];
  if (valor && path.resolve(ROOT, valor) === arquivo) {
    throw new Error(`${proibido} aponta para ${ALVO}. Separe os bancos antes de semear.`);
  }
}

fs.rmSync(arquivo, { force: true });               // recomeça sempre do zero
fs.mkdirSync(path.dirname(arquivo), { recursive: true });
const migracao = spawnSync(process.execPath, ['apps/api/scripts/migrate.cjs'], {
  cwd: ROOT, encoding: 'utf8', env: { ...process.env, DATABASE_FILE: ALVO },
});
if (migracao.status !== 0) throw new Error(`Migração falhou: ${migracao.stderr}`);

// Gerador determinístico: as mesmas consultas devolvem sempre os mesmos números,
// então dá para conferir um resultado à mão sem ele mudar na próxima execução.
let semente = 20260914;
const sorteio = () => (semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648;
const entre = (min, max) => min + Math.floor(sorteio() * (max - min + 1));

const db = new DatabaseSync(arquivo);
db.exec('PRAGMA foreign_keys = ON');

const variantes = db.prepare('SELECT v.sku, v.price_cents, p.name FROM variants v JOIN products p ON p.id = v.product_id ORDER BY v.sku').all();
const STATUS = ['paid', 'paid', 'paid', 'delivered', 'delivered', 'shipped', 'cancelled', 'pending'];
const quandoHaDias = (dias) => new Date(Date.now() - dias * 86400000).toISOString().slice(0, 19).replace('T', ' ');

const inserePedido = db.prepare('INSERT INTO orders(id,status,subtotal_cents,shipping_cents,discount_cents,total_cents,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)');
const insereItem = db.prepare('INSERT INTO order_items VALUES(?,?,?,?,?,?)');
const insereMovimento = db.prepare('INSERT INTO stock_movements(sku,delta,reason,order_id,created_at) VALUES(?,?,?,?,?)');

db.exec('BEGIN');
for (const v of variantes) {
  insereMovimento.run(v.sku, 300, 'entrada', null, quandoHaDias(200));
}
for (let n = 0; n < 120; n++) {
  const dias = entre(0, 179);
  const quando = quandoHaDias(dias);
  const status = STATUS[entre(0, STATUS.length - 1)];
  const escolhidos = variantes.filter(() => sorteio() > 0.45);
  if (!escolhidos.length) continue;
  const id = `FAKE-${String(n + 1).padStart(4, '0')}`;
  let subtotal = 0;
  const itens = escolhidos.map((v) => {
    const quantidade = entre(1, 3);
    const linha = v.price_cents * quantidade;
    subtotal += linha;
    return { v, quantidade, linha };
  });
  const frete = subtotal >= 15000 ? 0 : 1990;
  const desconto = sorteio() > 0.75 ? Math.round(subtotal * 0.1) : 0;
  inserePedido.run(id, status, subtotal, frete, desconto, subtotal + frete - desconto, quando, quando);
  for (const { v, quantidade, linha } of itens) {
    insereItem.run(id, v.sku, v.name, v.price_cents, quantidade, linha);
    // Só venda confirmada tira do estoque; pendente e cancelado não movimentam.
    if (status !== 'cancelled' && status !== 'pending') {
      insereMovimento.run(v.sku, -quantidade, 'venda', id, quando);
    }
  }
}
// variants.stock passa a refletir o razão, como aconteceria em operação real.
db.exec('UPDATE variants SET stock = (SELECT COALESCE(SUM(delta),0) FROM stock_movements m WHERE m.sku = variants.sku)');
db.exec('COMMIT');

const conta = (sql) => Object.values(db.prepare(sql).get())[0];
console.log(`Banco fictício: ${ALVO}`);
console.log(`  pedidos: ${conta('SELECT count(*) FROM orders')}`);
console.log(`  itens: ${conta('SELECT count(*) FROM order_items')}`);
console.log(`  movimentos: ${conta('SELECT count(*) FROM stock_movements')}`);
console.log('  saldos:', db.prepare('SELECT sku, stock FROM variants ORDER BY sku').all());
db.close();
