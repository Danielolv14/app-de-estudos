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
  cor TEXT NOT NULL,
  arquivada INTEGER NOT NULL DEFAULT 0,
  semestre TEXT NOT NULL DEFAULT '',
  bibliografia TEXT NOT NULL DEFAULT ''
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
  data TEXT,
  titulo TEXT NOT NULL,
  tipo TEXT NOT NULL,
  pontos REAL,
  meta REAL,
  nota REAL,
  conteudo TEXT NOT NULL DEFAULT ''
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
  antes_da_meta INTEGER NOT NULL DEFAULT 0,
  checkin_feito TEXT NOT NULL DEFAULT '',
  checkin_travou TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS sessoes_dia ON sessoes(dia);
CREATE TABLE IF NOT EXISTS metas_dia (
  data TEXT PRIMARY KEY,
  minutos INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS simulados (
  id INTEGER PRIMARY KEY,
  materia_id INTEGER REFERENCES materias(id) ON DELETE SET NULL,
  evento_id INTEGER REFERENCES eventos(id) ON DELETE SET NULL,
  conteudos TEXT NOT NULL DEFAULT '',
  duracao_min INTEGER NOT NULL,
  criado_em INTEGER NOT NULL,
  prova TEXT NOT NULL,
  iniciado_em INTEGER,
  terminado_em INTEGER,
  sessao_id INTEGER REFERENCES sessoes(id) ON DELETE SET NULL,
  fotos TEXT NOT NULL DEFAULT '[]',
  correcao TEXT
);
CREATE TABLE IF NOT EXISTS ia_usos (
  id INTEGER PRIMARY KEY,
  quando INTEGER NOT NULL,
  tipo TEXT NOT NULL,
  modelo TEXT NOT NULL,
  segundos REAL NOT NULL,
  tokens_entrada INTEGER NOT NULL DEFAULT 0,
  tokens_saida INTEGER NOT NULL DEFAULT 0,
  ok INTEGER NOT NULL,
  erro TEXT NOT NULL DEFAULT ''
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
    const banco = new Banco(db, arquivo)
    if (banco.atualizarEsquema()) banco.salvarDepois()
    return banco
  }

  private colunas(tabela: string): { nome: string; obrigatoria: boolean }[] {
    return this.todos(`PRAGMA table_info(${tabela})`).map((l) => ({ nome: String(l.name), obrigatoria: Number(l.notnull) === 1 }))
  }

  /**
   * Bancos de versões anteriores: a data do evento passa a poder ficar vazia (v1.1), as sessões ganham o check-in (v1.1),
   * os eventos ganham o conteúdo e as matérias, o semestre e a bibliografia (v1.2).
   */
  private atualizarEsquema(): boolean {
    let mudou = false
    if (this.colunas('eventos').find((c) => c.nome === 'data')?.obrigatoria) {
      this.transacao(() => {
        this.db.exec(`
          CREATE TABLE eventos_novo (
            id INTEGER PRIMARY KEY,
            materia_id INTEGER REFERENCES materias(id) ON DELETE SET NULL,
            data TEXT,
            titulo TEXT NOT NULL,
            tipo TEXT NOT NULL,
            pontos REAL,
            meta REAL,
            nota REAL
          );
          INSERT INTO eventos_novo SELECT id, materia_id, data, titulo, tipo, pontos, meta, nota FROM eventos;
          DROP TABLE eventos;
          ALTER TABLE eventos_novo RENAME TO eventos;
        `)
      })
      mudou = true
    }
    const novas: [tabela: string, coluna: string, tipo: string][] = [
      ['sessoes', 'checkin_feito', "TEXT NOT NULL DEFAULT ''"],
      ['sessoes', 'checkin_travou', "TEXT NOT NULL DEFAULT ''"],
      ['eventos', 'conteudo', "TEXT NOT NULL DEFAULT ''"],
      ['materias', 'arquivada', 'INTEGER NOT NULL DEFAULT 0'],
      ['materias', 'semestre', "TEXT NOT NULL DEFAULT ''"],
      ['materias', 'bibliografia', "TEXT NOT NULL DEFAULT ''"]
    ]
    for (const [tabela, coluna, tipo] of novas) {
      if (!this.colunas(tabela).some((c) => c.nome === coluna)) {
        this.db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${tipo}`)
        mudou = true
      }
    }
    return mudou
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
