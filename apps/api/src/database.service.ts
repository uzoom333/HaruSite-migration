import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import * as path from "node:path";

/**
 * Acesso ao SQLite local. A forma dos métodos (all/first/run) copia de propósito
 * a API do Cloudflare D1, para que trocar de driver depois não reescreva consulta.
 * node:sqlite é síncrono: nada aqui devolve Promise.
 */

// DATABASE_FILE é relativo à raiz do repositório. A API executa com o diretório
// de trabalho em apps/api, então abrir o caminho direto criaria um banco vazio
// paralelo em apps/api/.local/ — e a migração pareceria não ter rodado.
// Este arquivo compila para apps/api/dist/, à mesma profundidade de apps/api/scripts/.
const ROOT = path.resolve(__dirname, "../../..");

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly db: DatabaseSync;

  constructor() {
    if (!process.env.DATABASE_FILE)
      throw new Error("DATABASE_FILE não configurada");
    this.db = new DatabaseSync(path.resolve(ROOT, process.env.DATABASE_FILE));
    // O SQLite ignora chave estrangeira por padrão; o D1 já valida. Ligar aqui
    // mantém o mesmo comportamento nos dois ambientes.
    this.db.exec("PRAGMA foreign_keys = ON");
    // WAL permite ler enquanto se escreve, em vez de a escrita bloquear as leituras.
    this.db.exec("PRAGMA journal_mode = WAL");
    // Com WAL ainda existe um único escritor: esperar meio segundo é melhor do que
    // devolver erro ao primeiro conflito de escrita simultânea.
    this.db.exec("PRAGMA busy_timeout = 5000");
  }

  /** Várias linhas. Equivale a env.DB.prepare(sql).bind(...).all() no D1. */
  all<T>(sql: string, params: SQLInputValue[] = []): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }

  /** Uma linha ou undefined. Equivale a .first() no D1. */
  first<T>(sql: string, params: SQLInputValue[] = []): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }

  /** Escrita. changes diz quantas linhas mudaram: é assim que se verifica se a regra passou. */
  run(sql: string, params: SQLInputValue[] = []): { changes: number } {
    // Em execução o driver já devolve number, mas o tipo declarado é number|bigint.
    // A conversão existe para satisfazer o tipo, não para corrigir o valor.
    return { changes: Number(this.db.prepare(sql).run(...params).changes) };
  }

  onModuleDestroy() {
    this.db.close();
  }
}
