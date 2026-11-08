// Acesso aos dados: converte as linhas do SQLite (snake_case) nos tipos do app (camelCase).
import type { Banco, Linha } from './banco'
import type { Config, EstadoLembrete, Evento, Materia, Sessao, SessaoAtiva, Tarefa, TipoEvento } from '@shared/tipos'
import { CONFIG_PADRAO } from '@shared/padroes'

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))

const paraMateria = (l: Linha): Materia => ({ id: Number(l.id), nome: String(l.nome), cor: String(l.cor) })

const paraTarefa = (l: Linha): Tarefa => ({
  id: Number(l.id),
  materiaId: num(l.materia_id),
  data: String(l.data),
  titulo: String(l.titulo),
  detalhe: String(l.detalhe ?? ''),
  minutos: Number(l.minutos),
  feita: Number(l.feita) === 1,
  ordem: Number(l.ordem)
})

const paraEvento = (l: Linha): Evento => ({
  id: Number(l.id),
  materiaId: num(l.materia_id),
  data: String(l.data),
  titulo: String(l.titulo),
  tipo: String(l.tipo) as TipoEvento,
  pontos: num(l.pontos),
  meta: num(l.meta),
  nota: num(l.nota)
})

const paraSessao = (l: Linha): Sessao => ({
  id: Number(l.id),
  tarefaId: num(l.tarefa_id),
  materiaId: num(l.materia_id),
  dia: String(l.dia),
  inicio: Number(l.inicio),
  fim: num(l.fim),
  estudoSeg: Number(l.estudo_seg),
  pausaSeg: Number(l.pausa_seg),
  antesDaMeta: Number(l.antes_da_meta) === 1
})

export type NovaTarefa = Omit<Tarefa, 'id' | 'feita' | 'ordem'> & { id?: number; feita?: boolean; ordem?: number }
export type NovoEvento = Omit<Evento, 'id'> & { id?: number }

export class Repositorio {
  constructor(readonly banco: Banco) {}

  // ---------- Matérias ----------
  materias(): Materia[] {
    return this.banco.todos('SELECT * FROM materias ORDER BY id').map(paraMateria)
  }

  salvarMateria(m: Omit<Materia, 'id'> & { id?: number }): number {
    if (m.id) {
      this.banco.executar('UPDATE materias SET nome = ?, cor = ? WHERE id = ?', [m.nome, m.cor, m.id])
      return m.id
    }
    return this.banco.executar('INSERT INTO materias (nome, cor) VALUES (?, ?)', [m.nome, m.cor])
  }

  removerMateria(id: number): void {
    this.banco.executar('DELETE FROM materias WHERE id = ?', [id])
  }

  // ---------- Tarefas ----------
  tarefas(): Tarefa[] {
    return this.banco.todos('SELECT * FROM tarefas ORDER BY data, ordem, id').map(paraTarefa)
  }

  tarefa(id: number): Tarefa | undefined {
    const l = this.banco.um('SELECT * FROM tarefas WHERE id = ?', [id])
    return l ? paraTarefa(l) : undefined
  }

  salvarTarefa(t: NovaTarefa): number {
    if (t.id) {
      this.banco.executar(
        'UPDATE tarefas SET materia_id = ?, data = ?, titulo = ?, detalhe = ?, minutos = ? WHERE id = ?',
        [t.materiaId, t.data, t.titulo, t.detalhe, t.minutos, t.id]
      )
      return t.id
    }
    const ordem =
      t.ordem ?? Number(this.banco.um('SELECT COALESCE(MAX(ordem), -1) + 1 AS o FROM tarefas WHERE data = ?', [t.data])?.o ?? 0)
    return this.banco.executar(
      'INSERT INTO tarefas (materia_id, data, titulo, detalhe, minutos, feita, ordem) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [t.materiaId, t.data, t.titulo, t.detalhe, t.minutos, t.feita ? 1 : 0, ordem]
    )
  }

  marcarTarefa(id: number, feita: boolean): void {
    this.banco.executar('UPDATE tarefas SET feita = ? WHERE id = ?', [feita ? 1 : 0, id])
  }

  removerTarefa(id: number): void {
    this.banco.executar('DELETE FROM tarefas WHERE id = ?', [id])
  }

  // ---------- Eventos (provas, atividades, aulas) ----------
  eventos(): Evento[] {
    return this.banco.todos('SELECT * FROM eventos ORDER BY data, id').map(paraEvento)
  }

  salvarEvento(e: NovoEvento): number {
    const valores = [e.materiaId, e.data, e.titulo, e.tipo, e.pontos, e.meta, e.nota]
    if (e.id) {
      this.banco.executar(
        'UPDATE eventos SET materia_id = ?, data = ?, titulo = ?, tipo = ?, pontos = ?, meta = ?, nota = ? WHERE id = ?',
        [...valores, e.id]
      )
      return e.id
    }
    return this.banco.executar(
      'INSERT INTO eventos (materia_id, data, titulo, tipo, pontos, meta, nota) VALUES (?, ?, ?, ?, ?, ?, ?)',
      valores
    )
  }

  removerEvento(id: number): void {
    this.banco.executar('DELETE FROM eventos WHERE id = ?', [id])
  }

  // ---------- Sessões ----------
  sessoes(): Sessao[] {
    return this.banco.todos('SELECT * FROM sessoes ORDER BY inicio').map(paraSessao)
  }

  abrirSessao(a: { tarefaId: number | null; materiaId: number | null; dia: string; inicio: number }): number {
    return this.banco.executar('INSERT INTO sessoes (tarefa_id, materia_id, dia, inicio) VALUES (?, ?, ?, ?)', [
      a.tarefaId,
      a.materiaId,
      a.dia,
      a.inicio
    ])
  }

  fecharSessao(id: number, f: { fim: number; estudoSeg: number; pausaSeg: number; antesDaMeta: boolean }): void {
    this.banco.executar('UPDATE sessoes SET fim = ?, estudo_seg = ?, pausa_seg = ?, antes_da_meta = ? WHERE id = ?', [
      f.fim,
      f.estudoSeg,
      f.pausaSeg,
      f.antesDaMeta ? 1 : 0,
      id
    ])
  }

  // ---------- Metas ajustadas à mão ----------
  metasDia(): Record<string, number> {
    const metas: Record<string, number> = {}
    for (const l of this.banco.todos('SELECT * FROM metas_dia')) metas[String(l.data)] = Number(l.minutos)
    return metas
  }

  /** `null` volta a usar a soma das tarefas do dia. */
  definirMeta(data: string, minutos: number | null): void {
    if (minutos === null) this.banco.executar('DELETE FROM metas_dia WHERE data = ?', [data])
    else
      this.banco.executar(
        'INSERT INTO metas_dia (data, minutos) VALUES (?, ?) ON CONFLICT(data) DO UPDATE SET minutos = excluded.minutos',
        [data, minutos]
      )
  }

  // ---------- Chave/valor: configuração e estado ----------
  lerKv<T>(chave: string): T | null {
    return this.ler<T>(chave)
  }

  gravarKv(chave: string, valor: unknown): void {
    this.gravar(chave, valor)
  }

  private ler<T>(chave: string): T | null {
    const l = this.banco.um('SELECT valor FROM kv WHERE chave = ?', [chave])
    return l ? (JSON.parse(String(l.valor)) as T) : null
  }

  private gravar(chave: string, valor: unknown): void {
    if (valor === null) this.banco.executar('DELETE FROM kv WHERE chave = ?', [chave])
    else
      this.banco.executar(
        'INSERT INTO kv (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor',
        [chave, JSON.stringify(valor)]
      )
  }

  /** Configuração salva, completada com os valores padrão (para campos novos de versões futuras). */
  config(): Config {
    return { ...CONFIG_PADRAO, ...(this.ler<Partial<Config>>('config') ?? {}) }
  }

  salvarConfig(c: Config): void {
    this.gravar('config', c)
  }

  sessaoAtiva(): SessaoAtiva | null {
    return this.ler<SessaoAtiva>('sessao_ativa')
  }

  salvarSessaoAtiva(a: SessaoAtiva | null): void {
    this.gravar('sessao_ativa', a)
  }

  estadoLembrete(): EstadoLembrete | null {
    return this.ler<EstadoLembrete>('lembrete')
  }

  salvarEstadoLembrete(e: EstadoLembrete): void {
    this.gravar('lembrete', e)
  }

  vazio(): boolean {
    return this.banco.um('SELECT COUNT(*) AS n FROM materias')?.n === 0
  }
}
