/** Aplica SQL versionado em transação. Não altera schema automaticamente ao iniciar a API. */
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

// DATABASE_FILE é relativo à raiz do repositório, não ao diretório de execução:
// a API roda com cwd em apps/ e este script em apps/api/scripts. Resolver aqui
// garante que os dois processos abram exatamente o mesmo arquivo.
const ROOT = path.resolve(__dirname, '../../..');
const resolveDatabaseFile = (value) => path.resolve(ROOT, value);

function migrate() {
  if (!process.env.DATABASE_FILE) throw new Error('Configure DATABASE_FILE no .env da raiz.');
  const file = resolveDatabaseFile(process.env.DATABASE_FILE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  try {
    // Fora da transação: o SQLite recusa alterar este pragma com transação aberta.
    db.exec('PRAGMA foreign_keys = ON');
    // Sem lock consultivo: o SQLite admite um único escritor por banco e já serializa.
    db.exec('BEGIN');
    db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at text NOT NULL DEFAULT (datetime('now')))");
    const dir = path.join(__dirname, '../migrations');
    for (const name of fs.readdirSync(dir).filter(n => n.endsWith('.sql')).sort()) {
      if (db.prepare('SELECT 1 FROM schema_migrations WHERE name=?').get(name)) continue;
      db.exec(fs.readFileSync(path.join(dir, name), 'utf8'));
      db.prepare('INSERT INTO schema_migrations(name) VALUES(?)').run(name);
      console.log('Aplicada:', name);
    }
    db.exec('COMMIT');
  } catch (error) {
    // Rollback protegido: se a falha ocorreu antes de a transação abrir, o próprio
    // ROLLBACK lança e substituiria a causa real pela mensagem genérica do SQLite.
    try { db.exec('ROLLBACK'); } catch { /* nada a reverter */ }
    throw error;
  }
  finally { db.close(); }
}

try { migrate(); }
catch (error) {
  // A causa é impressa: sem ela, erro de dialeto e erro de caminho ficam indistinguíveis.
  console.error('Falha na migração. Confira DATABASE_FILE e o SQL; transação revertida.');
  console.error(error.message);
  process.exitCode = 1;
}
