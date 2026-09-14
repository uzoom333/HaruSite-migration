/** Roda os blocos de scripts/consultas.sql contra o banco fictício e imprime o resultado. */
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.resolve(__dirname, '..');
const arquivo = path.resolve(ROOT, '.local/haru_ficticio.db');
if (!fs.existsSync(arquivo)) throw new Error('Rode antes: node scripts/semear-vendas-ficticias.cjs');

const texto = fs.readFileSync(path.join(__dirname, 'consultas.sql'), 'utf8');
const filtro = process.argv[2];
const db = new DatabaseSync(arquivo);

// Separa em blocos "-- @nome"; descarta comentários para saber se sobrou SQL.
for (const bruto of texto.split(/^-- @/m).slice(1)) {
  const nome = bruto.slice(0, bruto.indexOf('\n')).trim();
  const corpo = bruto.slice(bruto.indexOf('\n') + 1);
  if (filtro && nome !== filtro) continue;
  const sql = corpo.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').trim();
  if (!sql) { console.log(`\n== ${nome} — vazia, ainda não escrita`); continue; }
  console.log(`\n== ${nome}`);
  // Objetos null-prototype do node:sqlite não imprimem bem em tabela: copiar antes.
  try { console.table(db.prepare(sql).all().map((l) => ({ ...l }))); }
  catch (erro) { console.log('  erro:', erro.message); }
}
db.close();
