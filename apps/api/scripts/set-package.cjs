/** Grava peso (g) e medidas (cm) da embalagem: npm run package:set -- escova 120 5 4 25 */
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const [slug, ...raw] = process.argv.slice(2);
const n = raw.map(Number);
if (!slug || n.length !== 4 || n.some(v => !Number.isInteger(v) || v <= 0) || !process.env.DATABASE_FILE) {
  console.error('Uso: npm run package:set -- <slug> <peso_g> <largura_cm> <altura_cm> <comprimento_cm>');
  process.exit(1);
}
const db = new DatabaseSync(path.resolve(__dirname, '../../..', process.env.DATABASE_FILE));
const { changes } = db.prepare(`UPDATE variants SET weight_g=?,width_cm=?,height_cm=?,length_cm=?
  WHERE product_id=(SELECT id FROM products WHERE slug=?)`).run(...n, slug);
db.close();
console.log(changes ? 'Medidas gravadas.' : 'Produto não encontrado.');
process.exitCode = changes ? 0 : 1;
