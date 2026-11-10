// Sincronia com o Canvas: busca os cursos, as atividades e as provas, atualiza o que já está ligado e
// guarda o que é novo numa revisão (o Daniel escolhe no Calendário o que entra).
// O token fica criptografado pelo Windows (safeStorage do Electron) e nunca vai para a tela, log ou vault.
import type { ArquivoCanvas, CursoCanvas, EstadoCanvas, ItemCanvas, RevisaoCanvas, TipoEvento } from '@shared/tipos'
import { CORES_MATERIA } from '@shared/padroes'
import { compararCanvas, descreverMudancas, nomeCurto, type Vinculos } from '@shared/canvas'
import { dataLocal, diaMes, somarDias } from '@shared/regras'
import { formatarNota } from '@shared/notas'
import { ClienteCanvas, ErroCanvas, type Buscar } from './canvas'
import type { Repositorio } from './repositorio'

const K = {
  vinculos: 'canvas_vinculos',
  revisao: 'revisao_canvas',
  usuario: 'canvas_usuario',
  ultima: 'canvas_ultima_sync',
  cursos: 'canvas_cursos',
  token: 'canvas_token',
  erro: 'canvas_erro'
} as const

export type Resultado = { ok: boolean; mensagem: string }

export type OpcoesCanvas = {
  agora: () => number
  mudou: () => void
  avisar: (texto: string, notificar?: boolean) => void
  /** Criptografa e abre o token (no app, o safeStorage do Windows). */
  cifrar: (texto: string) => string
  decifrar: (cifrado: string) => string
  /** Onde os PDFs baixados ficam. */
  pastaArquivos: string
  buscar?: Buscar
}

export function vinculosDe(repo: Repositorio): Vinculos {
  return repo.lerKv<Vinculos>(K.vinculos) ?? {}
}

export function revisaoCanvas(repo: Repositorio): RevisaoCanvas | null {
  return repo.lerKv<RevisaoCanvas>(K.revisao)
}

/**
 * Aplica a revisão: cria as matérias novas, liga (ou ignora) os cursos, põe no calendário as avaliações marcadas
 * e junta as que já existiam. Atividade desmarcada fica ignorada (não volta na próxima sincronia).
 */
export function aplicarRevisaoCanvas(repo: Repositorio, r: RevisaoCanvas): { materias: number; avaliacoes: number; juntadas: number } {
  let materias = 0
  let avaliacoes = 0
  let juntadas = 0
  repo.banco.transacao(() => {
    const vinculos = vinculosDe(repo)
    for (const c of r.cursos) {
      if (c.destino === 'ignorar') {
        vinculos[`curso:${c.id}`] = 0
        continue
      }
      const existe = typeof c.destino === 'number' && repo.materias().some((m) => m.id === c.destino)
      if (existe) vinculos[`curso:${c.id}`] = c.destino as number
      else {
        const usadas = repo.materiasAtivas().map((m) => m.cor)
        const cor = CORES_MATERIA.find((x) => !usadas.includes(x)) ?? CORES_MATERIA[repo.materias().length % CORES_MATERIA.length]
        vinculos[`curso:${c.id}`] = repo.salvarMateria({ nome: c.nomeMateria.trim() || nomeCurto(c.nome), cor })
        materias++
      }
    }
    const usados = new Set(Object.entries(vinculos).filter(([k, v]) => !k.startsWith('curso:') && v > 0).map(([, v]) => v))
    for (const it of r.itens) {
      if (vinculos[it.chave] !== undefined) continue
      const materiaId = vinculos[`curso:${it.cursoId}`]
      // Curso ignorado (ou que sumiu): a atividade fica de fora sem marca, e volta se o curso for ligado depois.
      if (!materiaId) continue
      if (!it.incluir) {
        vinculos[it.chave] = 0
        continue
      }
      const junto = it.juntarCom && !usados.has(it.juntarCom) ? repo.eventos().find((e) => e.id === it.juntarCom) : undefined
      if (junto) {
        // Fica o nome e o tipo que o Daniel deu; data, valor e nota passam a vir do Canvas.
        repo.salvarEvento({
          ...junto,
          data: it.data ?? junto.data,
          pontos: it.pontos ?? junto.pontos,
          nota: it.nota ?? junto.nota,
          conteudo: junto.conteudo || it.conteudo
        })
        vinculos[it.chave] = junto.id
        usados.add(junto.id)
        juntadas++
      } else {
        const id = repo.salvarEvento({
          materiaId,
          data: it.data,
          titulo: it.titulo,
          tipo: it.tipo as TipoEvento,
          pontos: it.pontos,
          meta: null,
          nota: it.nota,
          conteudo: it.conteudo
        })
        vinculos[it.chave] = id
        usados.add(id)
        avaliacoes++
      }
    }
    repo.gravarKv(K.vinculos, vinculos)
    repo.gravarKv(K.revisao, null)
  })
  return { materias, avaliacoes, juntadas }
}

const mesmaRevisao = (a: RevisaoCanvas, b: { cursos: CursoCanvas[]; itens: ItemCanvas[] }) => {
  const chaves = (r: { cursos: CursoCanvas[]; itens: ItemCanvas[] }) =>
    [...r.cursos.map((c) => `curso:${c.id}`), ...r.itens.map((i) => i.chave)].sort().join(',')
  return chaves(a) === chaves(b)
}

export class SincroniaCanvas {
  private sincronizando = false
  private cacheArquivos = new Map<number, { quando: number; lista: ArquivoCanvas[] }>()

  constructor(
    private readonly repo: Repositorio,
    private readonly o: OpcoesCanvas
  ) {}

  private token(): string | null {
    const cifrado = this.repo.lerKv<string>(K.token)
    if (!cifrado) return null
    try {
      return this.o.decifrar(cifrado)
    } catch {
      return null
    }
  }

  private cliente(): ClienteCanvas {
    const token = this.token()
    if (!token) throw new ErroCanvas('Conecte o Canvas em Ajustes primeiro.')
    return new ClienteCanvas(this.repo.config().canvasUrl, token, this.o.buscar)
  }

  estado(): EstadoCanvas {
    const vinculos = vinculosDe(this.repo)
    const eventos = new Set(this.repo.eventos().map((e) => e.id))
    const cursos = this.repo.lerKv<{ id: number; nome: string }[]>(K.cursos) ?? []
    return {
      url: this.repo.config().canvasUrl,
      conectado: this.repo.lerKv<string>(K.token) !== null,
      usuario: this.repo.lerKv<string>(K.usuario),
      sincronizando: this.sincronizando,
      ultimaSync: this.repo.lerKv<number>(K.ultima),
      erro: this.repo.lerKv<string>(K.erro),
      cursos: cursos.map((c) => ({ ...c, materiaId: vinculos[`curso:${c.id}`] ?? null })),
      eventosDoCanvas: [
        ...new Set(Object.entries(vinculos).filter(([k, v]) => !k.startsWith('curso:') && v > 0 && eventos.has(v)).map(([, v]) => v))
      ]
    }
  }

  /** Testa o token na conta (users/self) e só guarda se der certo. Depois, já sincroniza. */
  async conectar(url: string, token: string): Promise<Resultado> {
    const limpo = token.trim()
    if (limpo.length < 20) return { ok: false, mensagem: 'Esse token parece incompleto. Copie o token inteiro do Canvas.' }
    try {
      const cliente = new ClienteCanvas(url || this.repo.config().canvasUrl, limpo, this.o.buscar)
      const eu = await cliente.usuario()
      this.repo.salvarConfig({ ...this.repo.config(), canvasUrl: cliente.origem })
      this.repo.gravarKv(K.token, this.o.cifrar(limpo))
      this.repo.gravarKv(K.usuario, eu.nome)
      this.repo.gravarKv(K.erro, null)
      this.o.mudou()
      void this.sincronizar(false)
      return { ok: true, mensagem: `Canvas conectado: ${eu.nome}. Buscando as matérias e as atividades...` }
    } catch (e) {
      return { ok: false, mensagem: e instanceof ErroCanvas ? e.message : 'Não consegui conectar ao Canvas.' }
    }
  }

  /** Esquece o token. O que já veio do Canvas fica no app (e as ligações também, para não duplicar se conectar de novo). */
  desconectar(): void {
    for (const k of [K.token, K.usuario, K.erro, K.revisao, K.ultima]) this.repo.gravarKv(k, null)
    this.cacheArquivos.clear()
    this.o.mudou()
  }

  /**
   * Liga um curso a uma matéria (id), ignora (0) ou esquece a escolha (nulo: volta na próxima revisão).
   * Trocar a matéria de um curso não muda as avaliações que já vieram.
   */
  ligarCurso(cursoId: number, destino: number | null): void {
    const vinculos = vinculosDe(this.repo)
    if (destino === null) delete vinculos[`curso:${cursoId}`]
    else vinculos[`curso:${cursoId}`] = destino
    this.repo.gravarKv(K.vinculos, vinculos)
    this.o.mudou()
  }

  async sincronizar(manual: boolean): Promise<Resultado> {
    if (this.sincronizando) return { ok: false, mensagem: 'O Canvas já está sincronizando.' }
    if (!this.token()) return { ok: false, mensagem: 'Conecte o Canvas em Ajustes primeiro.' }
    this.sincronizando = true
    this.o.mudou()
    try {
      const cliente = this.cliente()
      const vinculos = vinculosDe(this.repo)
      const cursos = await cliente.cursos()
      const ativos = cursos.filter((c) => vinculos[`curso:${c.id}`] !== 0)
      const itens: ItemCanvas[] = []
      const falharam: string[] = []
      for (const c of ativos) {
        try {
          itens.push(...(await cliente.atividades(c.id)))
        } catch (e) {
          if (e instanceof ErroCanvas && e.status === 401) throw e
          falharam.push(nomeCurto(c.nome))
        }
      }
      // Do calendário só entram as provas (as aulas e os avisos encheriam a revisão) e o que já estava ligado.
      if (ativos.length > 0) {
        const hoje = dataLocal(this.o.agora())
        try {
          const doCalendario = await cliente.eventos(
            ativos.map((c) => c.id),
            somarDias(hoje, -120),
            somarDias(hoje, 240)
          )
          itens.push(...doCalendario.filter((i) => i.tipo === 'prova' || i.tipo === 'reavaliacao' || vinculos[i.chave] !== undefined))
        } catch (e) {
          if (e instanceof ErroCanvas && e.status === 401) throw e
          falharam.push('calendário')
        }
      }

      const r = compararCanvas({ cursos, itens }, { materias: this.repo.materias(), eventos: this.repo.eventos(), vinculos })
      this.repo.banco.transacao(() => {
        for (const m of r.mudancas) {
          const e = this.repo.eventos().find((x) => x.id === m.eventoId)
          if (!e) continue
          this.repo.salvarEvento({ ...e, data: m.data ?? e.data, pontos: m.pontos ?? e.pontos, nota: m.nota ?? e.nota })
        }
        const antes = revisaoCanvas(this.repo)
        const nova = { cursos: r.cursos, itens: r.itens }
        if (nova.cursos.length === 0 && nova.itens.length === 0) this.repo.gravarKv(K.revisao, null)
        // Mesmo conteúdo da revisão aberta: mantém a data, para a tela não perder o que o Daniel já marcou.
        else this.repo.gravarKv(K.revisao, { criadaEm: antes && mesmaRevisao(antes, nova) ? antes.criadaEm : this.o.agora(), ...nova })
        this.repo.gravarKv(
          K.cursos,
          cursos.map((c) => ({ id: c.id, nome: c.nome }))
        )
        this.repo.gravarKv(K.ultima, this.o.agora())
        this.repo.gravarKv(K.erro, falharam.length > 0 ? `Não consegui ler: ${falharam.join(', ')}.` : null)
      })
      this.cacheArquivos.clear()

      const partes: string[] = []
      const mudancas = descreverMudancas(r.mudancas, diaMes, formatarNota)
      if (mudancas) partes.push(mudancas)
      const novidades = r.cursos.length + r.itens.length
      if (novidades > 0) partes.push(`Canvas: ${novidades} ${novidades === 1 ? 'novidade' : 'novidades'} para revisar no Calendário.`)
      if (partes.length > 0) this.o.avisar(partes.join(' '), r.mudancas.some((m) => m.nota !== undefined))
      const mensagem = partes.length > 0 ? partes.join(' ') : 'Canvas em dia: nada novo.'
      if (manual && partes.length === 0) this.o.avisar(mensagem)
      return { ok: true, mensagem }
    } catch (e) {
      const mensagem = e instanceof ErroCanvas ? e.message : 'Não consegui falar com o Canvas.'
      this.repo.gravarKv(K.erro, mensagem)
      if (manual) this.o.avisar(mensagem)
      return { ok: false, mensagem }
    } finally {
      this.sincronizando = false
      this.o.mudou()
    }
  }

  aplicarRevisao(r: RevisaoCanvas): Resultado {
    const x = aplicarRevisaoCanvas(this.repo, r)
    const partes = [
      x.materias > 0 ? `${x.materias} ${x.materias === 1 ? 'matéria nova' : 'matérias novas'}` : '',
      x.avaliacoes > 0 ? `${x.avaliacoes} ${x.avaliacoes === 1 ? 'avaliação' : 'avaliações'} no calendário` : '',
      x.juntadas > 0 ? `${x.juntadas} ${x.juntadas === 1 ? 'juntada' : 'juntadas'} com o que já tinha` : ''
    ].filter(Boolean)
    const mensagem = partes.length > 0 ? `Canvas: ${partes.join(', ')}.` : 'Canvas: nada para incluir.'
    this.o.avisar(mensagem)
    return { ok: true, mensagem }
  }

  /** "Ignorar estas novidades": os cursos ainda sem matéria e as atividades da revisão não voltam mais. */
  ignorarRevisao(): void {
    const r = revisaoCanvas(this.repo)
    if (!r) return
    aplicarRevisaoCanvas(this.repo, {
      ...r,
      cursos: r.cursos.map((c) => ({ ...c, destino: 'ignorar' as const })),
      itens: r.itens.map((i) => ({ ...i, incluir: false }))
    })
    this.o.mudou()
  }

  /** PDFs do curso (guarda a lista por 10 minutos). */
  async arquivos(cursoId: number): Promise<{ ok: true; arquivos: ArquivoCanvas[] } | { ok: false; mensagem: string }> {
    const cache = this.cacheArquivos.get(cursoId)
    if (cache && this.o.agora() - cache.quando < 10 * 60_000) return { ok: true, arquivos: cache.lista }
    try {
      const lista = await this.cliente().arquivos(cursoId)
      this.cacheArquivos.set(cursoId, { quando: this.o.agora(), lista })
      return { ok: true, arquivos: lista }
    } catch (e) {
      return { ok: false, mensagem: e instanceof ErroCanvas ? e.message : 'Não consegui listar os arquivos.' }
    }
  }

  /** Baixa o PDF e devolve o caminho no PC (para ler o plano de ensino ou dar de material ao simulado). */
  async baixar(arquivoId: number): Promise<{ ok: true; caminho: string } | { ok: false; mensagem: string }> {
    try {
      return { ok: true, caminho: await this.cliente().baixar(arquivoId, this.o.pastaArquivos) }
    } catch (e) {
      return { ok: false, mensagem: e instanceof ErroCanvas ? e.message : 'Não consegui baixar o arquivo.' }
    }
  }
}
