// Acesso aos dados: converte as linhas do SQLite (snake_case) nos tipos do app (camelCase).
import type { Banco, Linha } from './banco'
import type {
  Aula,
  Config,
  ConteudoAula,
  Correcao,
  EstadoLembrete,
  Evento,
  LeituraPlano,
  Materia,
  MensagemAula,
  PropostaPlano,
  ProvaSimulado,
  ResumoAula,
  Sessao,
  SessaoAtiva,
  Simulado,
  SituacaoExercicio,
  Tarefa,
  TipoEvento,
  TipoTrabalhoIa
} from '@shared/tipos'
import { CONFIG_PADRAO, SEMESTRE_PADRAO } from '@shared/padroes'

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))

const paraMateria = (l: Linha): Materia => ({
  id: Number(l.id),
  nome: String(l.nome),
  cor: String(l.cor),
  arquivada: Number(l.arquivada ?? 0) === 1,
  semestre: String(l.semestre ?? ''),
  bibliografia: String(l.bibliografia ?? ''),
  sigla: String(l.sigla ?? '')
})

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
  data: l.data === null || l.data === undefined || l.data === '' ? null : String(l.data),
  titulo: String(l.titulo),
  tipo: String(l.tipo) as TipoEvento,
  pontos: num(l.pontos),
  meta: num(l.meta),
  nota: num(l.nota),
  conteudo: String(l.conteudo ?? '')
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
  antesDaMeta: Number(l.antes_da_meta) === 1,
  checkinFeito: String(l.checkin_feito ?? ''),
  checkinTravou: String(l.checkin_travou ?? '')
})

const json = <T>(v: unknown, padrao: T): T => {
  if (v === null || v === undefined || v === '') return padrao
  try {
    return JSON.parse(String(v)) as T
  } catch {
    return padrao
  }
}

const paraSimulado = (l: Linha): Simulado => ({
  id: Number(l.id),
  materiaId: num(l.materia_id),
  eventoId: num(l.evento_id),
  conteudos: String(l.conteudos ?? ''),
  duracaoMin: Number(l.duracao_min),
  criadoEm: Number(l.criado_em),
  prova: json<ProvaSimulado>(l.prova, { titulo: '', instrucoes: '', questoes: [] }),
  iniciadoEm: num(l.iniciado_em),
  terminadoEm: num(l.terminado_em),
  sessaoId: num(l.sessao_id),
  fotos: json<string[]>(l.fotos, []),
  correcao: json<Correcao | null>(l.correcao, null)
})

const paraAula = (l: Linha): Aula => ({
  id: Number(l.id),
  tarefaId: num(l.tarefa_id),
  materiaId: num(l.materia_id),
  tema: String(l.tema),
  criadaEm: Number(l.criada_em),
  atualizadaEm: Number(l.atualizada_em),
  conteudo: json<ConteudoAula>(l.conteudo, {
    titulo: String(l.titulo),
    objetivo: '',
    roteiro: [],
    secoes: [],
    armadilhas: [],
    exercicios: [],
    fontes: [],
    avisos: ''
  }),
  progresso: json<Record<string, SituacaoExercicio>>(l.progresso, {}),
  conversa: json<MensagemAula[]>(l.conversa, []),
  materiais: json<string[]>(l.materiais, [])
})

export type NovaTarefa = Omit<Tarefa, 'id' | 'feita' | 'ordem'> & { id?: number; feita?: boolean; ordem?: number }
/** O conteúdo é opcional para quem salva (nem toda tela manda). */
export type NovoEvento = Omit<Evento, 'id' | 'conteudo'> & { id?: number; conteudo?: string }
export type NovaMateria = { id?: number; nome: string; cor: string; bibliografia?: string; sigla?: string }
export type UsoIa = {
  quando: number
  tipo: TipoTrabalhoIa
  modelo: string
  segundos: number
  tokensEntrada: number
  tokensSaida: number
  ok: boolean
  erro: string
}

export class Repositorio {
  constructor(readonly banco: Banco) {}

  // ---------- Matérias ----------
  materias(): Materia[] {
    return this.banco.todos('SELECT * FROM materias ORDER BY id').map(paraMateria)
  }

  materiasAtivas(): Materia[] {
    return this.materias().filter((m) => !m.arquivada)
  }

  salvarMateria(m: NovaMateria): number {
    if (m.id) {
      this.banco.executar('UPDATE materias SET nome = ?, cor = ? WHERE id = ?', [m.nome, m.cor, m.id])
      if (m.bibliografia !== undefined) this.banco.executar('UPDATE materias SET bibliografia = ? WHERE id = ?', [m.bibliografia, m.id])
      if (m.sigla !== undefined) this.banco.executar('UPDATE materias SET sigla = ? WHERE id = ?', [m.sigla.trim().toUpperCase().slice(0, 6), m.id])
      return m.id
    }
    return this.banco.executar('INSERT INTO materias (nome, cor, semestre, bibliografia, sigla) VALUES (?, ?, ?, ?, ?)', [
      m.nome,
      m.cor,
      this.semestre(),
      m.bibliografia ?? '',
      (m.sigla ?? '').trim().toUpperCase().slice(0, 6)
    ])
  }

  arquivarMateria(id: number, arquivada: boolean): void {
    this.banco.executar('UPDATE materias SET arquivada = ? WHERE id = ?', [arquivada ? 1 : 0, id])
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

  /** Muda a tarefa de dia e a coloca no fim da lista desse dia. */
  moverTarefa(id: number, data: string): void {
    const ordem = Number(
      this.banco.um('SELECT COALESCE(MAX(ordem), -1) + 1 AS o FROM tarefas WHERE data = ? AND id <> ?', [data, id])?.o ?? 0
    )
    this.banco.executar('UPDATE tarefas SET data = ?, ordem = ? WHERE id = ?', [data, ordem, id])
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
      if (e.conteudo !== undefined) this.banco.executar('UPDATE eventos SET conteudo = ? WHERE id = ?', [e.conteudo, e.id])
      return e.id
    }
    return this.banco.executar(
      'INSERT INTO eventos (materia_id, data, titulo, tipo, pontos, meta, nota, conteudo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [...valores, e.conteudo ?? '']
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

  fecharSessao(
    id: number,
    f: { fim: number; estudoSeg: number; pausaSeg: number; antesDaMeta: boolean; checkinFeito?: string; checkinTravou?: string }
  ): void {
    this.banco.executar(
      'UPDATE sessoes SET fim = ?, estudo_seg = ?, pausa_seg = ?, antes_da_meta = ?, checkin_feito = ?, checkin_travou = ? WHERE id = ?',
      [f.fim, f.estudoSeg, f.pausaSeg, f.antesDaMeta ? 1 : 0, f.checkinFeito ?? '', f.checkinTravou ?? '', id]
    )
  }

  // ---------- Simulados ----------
  simulados(): Simulado[] {
    return this.banco.todos('SELECT * FROM simulados ORDER BY criado_em DESC, id DESC').map(paraSimulado)
  }

  simulado(id: number): Simulado | undefined {
    const l = this.banco.um('SELECT * FROM simulados WHERE id = ?', [id])
    return l ? paraSimulado(l) : undefined
  }

  criarSimulado(s: Omit<Simulado, 'id' | 'iniciadoEm' | 'terminadoEm' | 'sessaoId' | 'fotos' | 'correcao'>): number {
    return this.banco.executar(
      'INSERT INTO simulados (materia_id, evento_id, conteudos, duracao_min, criado_em, prova) VALUES (?, ?, ?, ?, ?, ?)',
      [s.materiaId, s.eventoId, s.conteudos, s.duracaoMin, s.criadoEm, JSON.stringify(s.prova)]
    )
  }

  atualizarSimulado(
    id: number,
    p: Partial<Pick<Simulado, 'iniciadoEm' | 'terminadoEm' | 'sessaoId' | 'fotos' | 'correcao'>>
  ): void {
    const colunas: Record<string, string> = {
      iniciadoEm: 'iniciado_em',
      terminadoEm: 'terminado_em',
      sessaoId: 'sessao_id',
      fotos: 'fotos',
      correcao: 'correcao'
    }
    for (const [campo, valor] of Object.entries(p)) {
      const comoTexto = campo === 'fotos' || campo === 'correcao'
      const v = comoTexto ? (valor === null ? null : JSON.stringify(valor)) : (valor as number | null)
      this.banco.executar(`UPDATE simulados SET ${colunas[campo]} = ? WHERE id = ?`, [v, id])
    }
  }

  removerSimulado(id: number): void {
    this.banco.executar('DELETE FROM simulados WHERE id = ?', [id])
  }

  // ---------- Aulas da IA ----------
  aula(id: number): Aula | undefined {
    const l = this.banco.um('SELECT * FROM aulas WHERE id = ?', [id])
    return l ? paraAula(l) : undefined
  }

  /** Só o necessário para as listas (o conteúdo inteiro de cada aula é grande e vai para a tela só quando ela abre). */
  aulas(): ResumoAula[] {
    return this.banco
      .todos('SELECT id, tarefa_id, materia_id, tema, titulo, criada_em, atualizada_em, conteudo, progresso FROM aulas ORDER BY criada_em DESC, id DESC')
      .map((l) => {
        const a = paraAula(l)
        const situacoes = Object.entries(a.progresso)
        return {
          id: a.id,
          tarefaId: a.tarefaId,
          materiaId: a.materiaId,
          tema: a.tema,
          titulo: String(l.titulo),
          criadaEm: a.criadaEm,
          atualizadaEm: a.atualizadaEm,
          exercicios: a.conteudo.exercicios.length,
          certos: situacoes.filter(([, s]) => s === 'acertei').length,
          feitos: situacoes.length,
          paraRever: situacoes
            .filter(([, s]) => s !== 'acertei')
            .map(([n]) => a.conteudo.exercicios.find((e) => String(e.numero) === n))
            .filter((e) => e !== undefined)
            .map((e) => `exercício ${e.numero} (${(e.origem || e.enunciado).slice(0, 80)})`)
        }
      })
  }

  criarAula(a: Omit<Aula, 'id' | 'atualizadaEm' | 'progresso' | 'conversa'>): number {
    return this.banco.executar(
      'INSERT INTO aulas (tarefa_id, materia_id, tema, titulo, criada_em, atualizada_em, conteudo, materiais) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [a.tarefaId, a.materiaId, a.tema, a.conteudo.titulo, a.criadaEm, a.criadaEm, JSON.stringify(a.conteudo), JSON.stringify(a.materiais)]
    )
  }

  atualizarAula(id: number, p: Partial<Pick<Aula, 'conteudo' | 'progresso' | 'conversa'>>, quando: number): void {
    this.banco.transacao(() => {
      for (const [campo, valor] of Object.entries(p)) {
        this.banco.executar(`UPDATE aulas SET ${campo} = ? WHERE id = ?`, [JSON.stringify(valor), id])
        if (campo === 'conteudo') this.banco.executar('UPDATE aulas SET titulo = ? WHERE id = ?', [(valor as ConteudoAula).titulo, id])
      }
      this.banco.executar('UPDATE aulas SET atualizada_em = ? WHERE id = ?', [quando, id])
    })
  }

  removerAula(id: number): void {
    this.banco.executar('DELETE FROM aulas WHERE id = ?', [id])
  }

  // ---------- Uso da IA ----------
  registrarUsoIa(u: UsoIa): void {
    this.banco.executar(
      'INSERT INTO ia_usos (quando, tipo, modelo, segundos, tokens_entrada, tokens_saida, ok, erro) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [u.quando, u.tipo, u.modelo, u.segundos, u.tokensEntrada, u.tokensSaida, u.ok ? 1 : 0, u.erro]
    )
  }

  /** Usos que deram certo desde `desde`, e a soma dos tokens. */
  usoIaDesde(desde: number): { usos: number; tokens: number } {
    const l = this.banco.um(
      'SELECT COUNT(*) AS n, COALESCE(SUM(tokens_entrada + tokens_saida), 0) AS t FROM ia_usos WHERE ok = 1 AND quando >= ?',
      [desde]
    )
    return { usos: Number(l?.n ?? 0), tokens: Number(l?.t ?? 0) }
  }

  // ---------- Semestre ----------
  semestre(): string {
    return this.ler<string>('semestre') ?? SEMESTRE_PADRAO
  }

  /**
   * Fecha o semestre: as matérias de agora são arquivadas (o histórico continua) e o app passa a usar o novo nome.
   * Com `apagarPendentes`, as tarefas não feitas dessas matérias saem do plano (senão ficariam atrasadas para sempre).
   */
  virarSemestre(novo: string, apagarPendentes: boolean): { arquivadas: number; apagadas: number } {
    let arquivadas = 0
    let apagadas = 0
    this.banco.transacao(() => {
      const ids = this.materiasAtivas().map((m) => m.id)
      arquivadas = ids.length
      if (ids.length > 0) {
        const marcas = ids.map(() => '?').join(', ')
        if (apagarPendentes) {
          apagadas = Number(this.banco.um(`SELECT COUNT(*) AS n FROM tarefas WHERE feita = 0 AND materia_id IN (${marcas})`, ids)?.n ?? 0)
          this.banco.executar(`DELETE FROM tarefas WHERE feita = 0 AND materia_id IN (${marcas})`, ids)
        }
        this.banco.executar(`UPDATE materias SET arquivada = 1 WHERE id IN (${marcas})`, ids)
      }
      const c = this.config()
      this.salvarConfig({ ...c, semanaPadrao: c.semanaPadrao.filter((b) => !ids.includes(b.materiaId)) })
      this.gravar('semestre', novo)
      this.gravar('proposta_plano', null)
    })
    return { arquivadas, apagadas }
  }

  // ---------- Trabalhos da IA esperando revisão ----------
  leituraPlano(): LeituraPlano | null {
    return this.ler<LeituraPlano>('leitura_plano')
  }

  salvarLeituraPlano(l: LeituraPlano | null): void {
    this.gravar('leitura_plano', l)
  }

  propostaPlano(): PropostaPlano | null {
    return this.ler<PropostaPlano>('proposta_plano')
  }

  salvarPropostaPlano(p: PropostaPlano | null): void {
    this.gravar('proposta_plano', p)
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
    // Até a v1.1 a opção se chamava `reiniciarChrome` (só o Chrome era reiniciado).
    const { reiniciarChrome, ...salvo } = this.ler<Partial<Config> & { reiniciarChrome?: boolean }>('config') ?? {}
    return { ...CONFIG_PADRAO, ...(reiniciarChrome !== undefined ? { reiniciarNavegador: reiniciarChrome } : {}), ...salvo }
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
