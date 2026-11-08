// Banco SQLite local, rodando em WebAssembly (sql.js): não precisa compilar nada nativo no Windows.
// O banco fica em memória e é gravado no arquivo depois de cada alteração.
import { existsSync, readFileSync, renameSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import initSqlJs, { type Database, type SqlValue } from 'sql.js'

const ESQUEMA = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS materias (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  cor TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tarefas (
  id INTEGER PRIMARY KEY,
  materia_id INTEGER REFERENCES materias(id) ON DELETE SET NULL,
  data TEXT NOT NULL,
  titulo TEXT NOT NULL,
  detalhe TEXT NOT NULL DEFAULT '',
  minutos INTEGER NOT NULL DEFAULT 60,
  feita INTEGER NOT NULL DEFAULT 0,
  ordem INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS tarefas_data ON tarefas(data);
CREATE TABLE IF NOT EXISTS eventos (
  id INTEGER PRIMARY KEY,
  materia_id INTEGER REFERENCES materias(id) ON DELETE SET NULL,
  data TEXT NOT NULL,
  titulo TEXT NOT NULL,
  tipo TEXT NOT NULL,
  pontos REAL,
  meta REAL,
  nota REAL
);
CREATE TABLE IF NOT EXISTS sessoes (
  id INTEGER PRIMARY KEY,
  tarefa_id INTEGER REFERENCES tarefas(id) ON DELETE SET NULL,
  materia_id INTEGER REFERENCES materias(id) ON DELETE SET NULL,
  dia TEXT NOT NULL,
  inicio INTEGER NOT NULL,
  fim INTEGER,
  estudo_seg INTEGER NOT NULL DEFAULT 0,
  pausa_seg INTEGER NOT NULL DEFAULT 0,
  antes_da_meta INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS sessoes_dia ON sessoes(dia);
CREATE TABLE IF NOT EXISTS metas_dia (
  data TEXT PRIMARY KEY,
  minutos INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS kv (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
`

export type Linha = Record<string, SqlValue>

export class Banco {
  private timer: ReturnType<typeof setTimeout> | null = null

  private constructor(
    private readonly db: Database,
    private readonly arquivo: string | null
  ) {}

  /** Abre (ou cria) o banco. `arquivo` nulo deixa tudo só em memória, para os testes. */
  static async abrir(arquivo: string | null, caminhoWasm: string): Promise<Banco> {
    const SQL = await initSqlJs({ wasmBinary: readFileSync(caminhoWasm) as unknown as ArrayBuffer })
    const dados = arquivo && existsSync(arquivo) ? readFileSync(arquivo) : undefined
    const db = new SQL.Database(dados)
    db.exec(ESQUEMA)
    return new Banco(db, arquivo)
  }

  todos(sql: string, params: SqlValue[] = []): Linha[] {
    const stmt = this.db.prepare(sql)
    try {
      stmt.bind(params)
      const linhas: Linha[] = []
      while (stmt.step()) linhas.push(stmt.getAsObject())
      return linhas
    } finally {
      stmt.free()
    }
  }

  um(sql: string, params: SqlValue[] = []): Linha | undefined {
    return this.todos(sql, params)[0]
  }

  /** Executa um comando que altera dados e agenda a gravação no arquivo. Devolve o id inserido. */
  executar(sql: string, params: SqlValue[] = []): number {
    this.db.run(sql, params)
    const id = Number(this.db.exec('SELECT last_insert_rowid()')[0]?.values[0][0] ?? 0)
    this.salvarDepois()
    return id
  }

  /** Várias alterações de uma vez, tudo ou nada. */
  transacao(fn: () => void): void {
    this.db.exec('BEGIN')
    try {
      fn()
      this.db.exec('COMMIT')
    } catch (e) {
      this.db.exec('ROLLBACK')
      throw e
    }
  }

  salvarDepois(): void {
    if (!this.arquivo) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.salvarAgora(), 400)
  }

  /** Grava num arquivo temporário e troca de nome: se o PC desligar no meio, o banco antigo continua inteiro. */
  salvarAgora(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    if (!this.arquivo) return
    mkdirSync(dirname(this.arquivo), { recursive: true })
    const temp = `${this.arquivo}.tmp`
    writeFileSync(temp, Buffer.from(this.db.export()))
    // O export do sql.js reabre a conexão e zera os PRAGMAs.
    this.db.exec('PRAGMA foreign_keys = ON')
    renameSync(temp, this.arquivo)
  }

  fechar(): void {
    this.salvarAgora()
    this.db.close()
  }
}
