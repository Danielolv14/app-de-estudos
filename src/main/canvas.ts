// Cliente da API do Canvas (REST v1), só leitura, com o token pessoal do Daniel.
// Cuidados:
// - O token só vai para o endereço do Canvas: links de outra origem (paginação ou download) não levam o cabeçalho.
// - O token nunca aparece em mensagem de erro, log ou arquivo.
import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ArquivoCanvas, CursoCanvas, ItemCanvas } from '@shared/tipos'
import { dataLocal } from '@shared/regras'
import { textoDeHtml, tipoDoTitulo } from '@shared/canvas'

export type Buscar = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<Response>

export class ErroCanvas extends Error {
  constructor(
    mensagem: string,
    readonly status: number | null = null
  ) {
    super(mensagem)
  }
}

const MAX_PAGINAS = 40
const LIMITE_MS = 30_000
const MAX_ARQUIVO = 60 * 1024 * 1024

/** "https://pucminas.instructure.com/" ou "pucminas.instructure.com/courses/1" → "https://pucminas.instructure.com". */
export function origemCanvas(url: string): string {
  const t = url.trim()
  const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`)
  // http só no próprio PC (o Canvas falso dos testes).
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(u.hostname)))
    throw new ErroCanvas('Use o endereço do Canvas com https.')
  return u.origin
}

/** Próxima página do cabeçalho Link do Canvas. */
export function proximaPagina(link: string | null): string | null {
  if (!link) return null
  for (const parte of link.split(',')) {
    const m = parte.match(/<([^>]+)>\s*;\s*rel="next"/)
    if (m) return m[1]
  }
  return null
}

function explicarStatus(status: number, oque: string): string {
  if (status === 401) return 'O Canvas recusou o token (ele venceu ou foi excluído). Crie um novo em Conta > Configurações e cole em Ajustes.'
  if (status === 403) return `O Canvas não deixa ver ${oque}.`
  if (status === 404) return `Não achei ${oque} no Canvas. Confira o endereço em Ajustes.`
  if (status === 429) return 'O Canvas pediu para ir mais devagar. Tente de novo em alguns minutos.'
  if (status >= 500) return 'O Canvas está com problema agora. Tente de novo mais tarde.'
  return `O Canvas respondeu com erro ${status} ao buscar ${oque}.`
}

type Assignment = {
  id: number
  name?: string
  description?: string | null
  due_at?: string | null
  points_possible?: number | null
  grading_type?: string
  submission?: { score?: number | null; workflow_state?: string; submitted_at?: string | null; excused?: boolean | null } | null
}

/** Entregue: o aluno mandou (submitted, pending_review), o professor já corrigiu (graded) ou dispensou (excused). */
export function foiEntregue(s: Assignment['submission']): boolean {
  if (!s) return false
  return Boolean(s.submitted_at) || s.excused === true || ['submitted', 'pending_review', 'graded'].includes(s.workflow_state ?? '')
}
type CalendarEvent = { id: number; title?: string; description?: string | null; start_at?: string | null; all_day_date?: string | null; context_code?: string }
type FileInfo = { id: number; display_name?: string; filename?: string; size?: number; 'content-type'?: string; url?: string }
type ModuleItem = { type?: string; title?: string; content_id?: number }
type Module = { id: number; name?: string; items?: ModuleItem[]; items_url?: string }

/** Dia local (AAAA-MM-DD) de uma data do Canvas. Prazo às 23:59 de Brasília chega como 02:59Z do dia seguinte. */
export function diaDoCanvas(iso: string | null | undefined): string | null {
  if (!iso) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : dataLocal(t)
}

export class ClienteCanvas {
  readonly origem: string

  constructor(
    url: string,
    private readonly token: string,
    private readonly buscar: Buscar = fetch
  ) {
    this.origem = origemCanvas(url)
  }

  private async pedir(url: string, oque: string): Promise<Response> {
    const mesmoLugar = new URL(url).origin === this.origem
    const controle = new AbortController()
    const relogio = setTimeout(() => controle.abort(), LIMITE_MS)
    try {
      const r = await this.buscar(url, {
        headers: mesmoLugar ? { Authorization: `Bearer ${this.token}`, Accept: 'application/json' } : {},
        signal: controle.signal
      })
      if (!r.ok) throw new ErroCanvas(explicarStatus(r.status, oque), r.status)
      return r
    } catch (e) {
      if (e instanceof ErroCanvas) throw e
      if ((e as Error).name === 'AbortError') throw new ErroCanvas('O Canvas demorou demais para responder. Tente de novo.')
      throw new ErroCanvas('Sem conexão com o Canvas. Confira a internet e o endereço em Ajustes.')
    } finally {
      clearTimeout(relogio)
    }
  }

  /** GET de uma lista, seguindo as páginas (só dentro do próprio Canvas). */
  private async lista<T>(caminho: string, oque: string): Promise<T[]> {
    let url: string | null = `${this.origem}${caminho}${caminho.includes('?') ? '&' : '?'}per_page=100`
    const tudo: T[] = []
    for (let i = 0; url && i < MAX_PAGINAS; i++) {
      const r = await this.pedir(url, oque)
      const pagina = (await r.json()) as T[]
      if (!Array.isArray(pagina)) throw new ErroCanvas(`O Canvas devolveu ${oque} num formato inesperado.`)
      tudo.push(...pagina)
      const proxima = proximaPagina(r.headers.get('link'))
      url = proxima && new URL(proxima).origin === this.origem ? proxima : null
    }
    return tudo
  }

  private async um<T>(caminho: string, oque: string): Promise<T> {
    const r = await this.pedir(`${this.origem}${caminho}`, oque)
    return (await r.json()) as T
  }

  async usuario(): Promise<{ id: number; nome: string }> {
    const u = await this.um<{ id: number; name?: string; short_name?: string }>('/api/v1/users/self', 'a sua conta')
    return { id: u.id, nome: u.short_name || u.name || 'sem nome' }
  }

  /** Cursos em andamento (os de semestres passados ficam de fora). */
  async cursos(): Promise<CursoCanvas[]> {
    const lista = await this.lista<{ id: number; name?: string; course_code?: string; access_restricted_by_date?: boolean }>(
      '/api/v1/courses?enrollment_state=active&state[]=available',
      'os seus cursos'
    )
    return lista
      .filter((c) => c.name && !c.access_restricted_by_date)
      .map((c) => ({ id: c.id, nome: c.name!.trim(), codigo: (c.course_code ?? '').trim() }))
  }

  /** Atividades do curso, com a nota quando o professor publicou. */
  async atividades(cursoId: number): Promise<ItemCanvas[]> {
    const lista = await this.lista<Assignment>(`/api/v1/courses/${cursoId}/assignments?include[]=submission&order_by=due_at`, 'as atividades')
    return lista
      .filter((a) => a.name)
      .map((a) => {
        const pontos = a.grading_type === 'not_graded' ? null : (a.points_possible ?? null)
        const nota = a.submission && a.submission.workflow_state === 'graded' && typeof a.submission.score === 'number' ? a.submission.score : null
        return {
          chave: `tarefa:${a.id}`,
          cursoId,
          titulo: a.name!.trim(),
          tipo: tipoDoTitulo(a.name!, 'atividade'),
          data: diaDoCanvas(a.due_at),
          pontos: pontos !== null && pontos > 0 ? pontos : null,
          nota,
          conteudo: textoDeHtml(a.description),
          entregue: foiEntregue(a.submission)
        }
      })
  }

  /** Eventos do calendário dos cursos (provas marcadas como evento, aulas, avisos), de `de` até `ate`. */
  async eventos(cursoIds: number[], de: string, ate: string): Promise<ItemCanvas[]> {
    const itens: ItemCanvas[] = []
    // O Canvas aceita até 10 cursos por pedido.
    for (let i = 0; i < cursoIds.length; i += 10) {
      const grupo = cursoIds.slice(i, i + 10)
      const contextos = grupo.map((id) => `context_codes[]=course_${id}`).join('&')
      const lista = await this.lista<CalendarEvent>(
        `/api/v1/calendar_events?type=event&${contextos}&start_date=${de}&end_date=${ate}`,
        'o calendário'
      )
      for (const e of lista) {
        const cursoId = Number((e.context_code ?? '').replace('course_', ''))
        if (!e.title || !grupo.includes(cursoId)) continue
        itens.push({
          chave: `evento:${e.id}`,
          cursoId,
          titulo: e.title.trim(),
          tipo: tipoDoTitulo(e.title, 'outro'),
          data: diaDoCanvas(e.all_day_date ?? e.start_at),
          pontos: null,
          nota: null,
          conteudo: textoDeHtml(e.description),
          entregue: false
        })
      }
    }
    return itens
  }

  /**
   * PDFs do curso. Muitos cursos escondem a aba Arquivos do aluno: aí a lista vem dos módulos
   * (cada item do tipo arquivo), e o tipo e o tamanho vêm de um pedido por arquivo.
   */
  async arquivos(cursoId: number): Promise<ArquivoCanvas[]> {
    const pdf = (f: FileInfo) => (f['content-type'] ?? '').includes('pdf') || /\.pdf$/i.test(f.display_name ?? f.filename ?? '')
    const doModulo = new Map<number, string>()
    let modulosOk = true
    try {
      const modulos = await this.lista<Module>(`/api/v1/courses/${cursoId}/modules?include[]=items`, 'os módulos')
      for (const m of modulos) {
        const itens = m.items ?? (m.items_url ? await this.lista<ModuleItem>(new URL(m.items_url).pathname, 'os itens do módulo') : [])
        for (const it of itens) if (it.type === 'File' && it.content_id) doModulo.set(it.content_id, m.name ?? '')
      }
    } catch (e) {
      if (e instanceof ErroCanvas && e.status === 401) throw e
      modulosOk = false
    }

    let arquivos: FileInfo[] = []
    try {
      arquivos = (await this.lista<FileInfo>(`/api/v1/courses/${cursoId}/files?content_types[]=application/pdf&sort=updated_at&order=desc`, 'os arquivos')).filter(pdf)
    } catch (e) {
      if (e instanceof ErroCanvas && e.status === 401) throw e
      if (!modulosOk) throw new ErroCanvas('O Canvas não deixa ver os arquivos nem os módulos deste curso.')
      // Sem a aba Arquivos: busca cada arquivo dos módulos (de 6 em 6).
      const ids = [...doModulo.keys()]
      for (let i = 0; i < ids.length; i += 6) {
        const lote = await Promise.all(
          ids.slice(i, i + 6).map((id) => this.um<FileInfo>(`/api/v1/courses/${cursoId}/files/${id}`, 'o arquivo').catch(() => null))
        )
        arquivos.push(...lote.filter((f): f is FileInfo => f !== null && pdf(f)))
      }
    }
    return arquivos.map((f) => ({
      id: f.id,
      cursoId,
      nome: (f.display_name ?? f.filename ?? `arquivo ${f.id}`).trim(),
      tamanho: f.size ?? 0,
      modulo: doModulo.get(f.id) ?? ''
    }))
  }

  /** Baixa um PDF para a pasta (reaproveita se já baixou o mesmo arquivo com o mesmo tamanho). */
  async baixar(arquivoId: number, pasta: string): Promise<string> {
    const f = await this.um<FileInfo>(`/api/v1/files/${arquivoId}`, 'o arquivo')
    if (!f.url) throw new ErroCanvas('O Canvas não liberou o download deste arquivo.')
    const nome = (f.display_name ?? f.filename ?? 'arquivo.pdf').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80)
    if (!/\.pdf$/i.test(nome) && !(f['content-type'] ?? '').includes('pdf')) throw new ErroCanvas('Esse arquivo não é PDF.')
    if ((f.size ?? 0) > MAX_ARQUIVO) throw new ErroCanvas('Esse PDF é grande demais (mais de 60 MB).')
    mkdirSync(pasta, { recursive: true })
    const destino = join(pasta, `${arquivoId}-${/\.pdf$/i.test(nome) ? nome : `${nome}.pdf`}`)
    if (existsSync(destino) && f.size && statSync(destino).size === f.size) return destino
    // O link de download já tem a autorização dele e costuma mandar para outro servidor: o token não vai junto.
    const r = await this.pedir(f.url, 'o arquivo')
    if (!r.body) throw new ErroCanvas('O download veio vazio.')
    await pipeline(Readable.fromWeb(r.body as import('node:stream/web').ReadableStream), createWriteStream(destino))
    return destino
  }
}
