// Compara o que veio do Canvas com o que está no app. Sem rede e sem banco: só dados, para dar para testar.
// Regra: o que já está ligado ao Canvas é atualizado sozinho (data, pontos e nota são do Canvas);
// o que é novo vai para uma revisão, onde o Daniel escolhe o que entra e junta com o que já existia.
import type { ArquivoCanvas, CursoCanvas, CursoNaRevisao, Evento, ItemCanvas, ItemNaRevisao, Materia, TipoItemCanvas } from './tipos'

/** Ligações Canvas → app: "curso:12" → id da matéria, "tarefa:34" ou "evento:56" → id do evento. 0 = ignorado de propósito. */
export type Vinculos = Record<string, number>

export type MudancaCanvas = {
  eventoId: number
  titulo: string
  data?: string | null
  pontos?: number
  nota?: number
  /** Passou a constar como entregue (ou deixou de constar) no Canvas. Muda sem aviso. */
  entregue?: boolean
}

/** Sem acento, minúsculo e sem pontuação, para comparar nomes. */
export function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Texto simples de um HTML do Canvas (descrição de atividade). */
export function textoDeHtml(html: string | null | undefined, max = 400): string {
  if (!html) return ''
  const texto = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
  return texto.length > max ? `${texto.slice(0, max - 1).trimEnd()}…` : texto
}

/** Tipo pelo nome: "Prova 3", "P2", "Reavaliação", "Aula 12"; o resto é atividade (ou "outro" no calendário). */
export function tipoDoTitulo(titulo: string, padrao: TipoItemCanvas): TipoItemCanvas {
  const t = normalizar(titulo)
  if (/\b(reavaliacao|reposicao|substitutiva|exame especial|recuperacao)\b/.test(t)) return 'reavaliacao'
  if (/\b(prova|p\d|avaliacao final|exame)\b/.test(t)) return 'prova'
  if (/\baula\b/.test(t)) return 'aula'
  return padrao
}

/** Nome curto para a matéria nova: "CÁLCULO I - Turma 01 (2026/2)" → "Cálculo I". */
export function nomeCurto(nome: string): string {
  const base = nome.split(/\s+[-–|]\s+|\s*\(/)[0].trim() || nome.trim()
  const minusculas = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'a', 'o'])
  const romano = /^(i{1,3}|iv|v|vi{0,3}|ix|x)$/i
  const bonito =
    base === base.toUpperCase()
      ? base
          .toLowerCase()
          .split(/\s+/)
          .map((p, i) => (romano.test(p) ? p.toUpperCase() : i > 0 && minusculas.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
          .join(' ')
      : base
  return bonito.slice(0, 40)
}

const PALAVRAS_FRACAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'i', 'ii', 'iii', 'iv', 'a', 'o', 'turma', 'computacao', 'ciencia'])

/** Matéria do app com o mesmo nome do curso (ex.: "Cálculo" para "CÁLCULO I"). */
export function sugerirMateria(curso: CursoCanvas, materias: Materia[]): number | null {
  const nome = ` ${normalizar(`${curso.nome} ${curso.codigo}`)} `
  const achada = materias
    .filter((m) => !m.arquivada)
    .find((m) => {
      const palavras = normalizar(m.nome)
        .split(' ')
        .filter((p) => p.length > 2 && !PALAVRAS_FRACAS.has(p))
      return palavras.length > 0 && palavras.every((p) => nome.includes(` ${p}`))
    })
  return achada?.id ?? null
}

/** "Prova 3", "P3", "3ª prova" → "prova 3". "AA2", "Atividade avaliativa 2" → "atividade 2". */
function rotulo(titulo: string): string | null {
  const t = normalizar(titulo)
  let m = t.match(/\breposicao\b.*?\b(?:prova|p)\s*(\d+)\b/)
  if (m) return `reposicao ${m[1]}`
  if (/\b(reavaliacao|substitutiva)\b/.test(t)) return 'reavaliacao'
  m = t.match(/\b(?:prova|p)\s*(\d+)\b/) ?? t.match(/\b(\d+)\s*a?\s*prova\b/)
  if (m) return `prova ${m[1]}`
  m = t.match(/\b(?:atividade avaliativa|aa|atividade)\s*(\d+)\b/)
  if (m) return `atividade ${m[1]}`
  return null
}

/** Avaliação do app (ainda sem ligação com o Canvas) que parece ser a mesma: mesmo rótulo ou mesmo dia. */
export function sugerirEvento(item: ItemCanvas, candidatos: Evento[]): number | null {
  const daqui = candidatos.filter((e) => e.tipo !== 'aula' && e.tipo !== 'outro')
  const r = rotulo(item.titulo)
  if (r) {
    const mesmo = daqui.filter((e) => rotulo(e.titulo) === r)
    if (mesmo.length === 1) return mesmo[0].id
  }
  if (item.data) {
    const mesmoDia = daqui.filter((e) => e.data === item.data)
    if (mesmoDia.length === 1 && (item.tipo === mesmoDia[0].tipo || r === null)) return mesmoDia[0].id
  }
  return null
}

/** Atividade que vale nota (ou prova) entra marcada; aula, aviso e coisa sem ponto, desmarcada. */
export function incluirPorPadrao(item: ItemCanvas): boolean {
  if (item.tipo === 'aula' || item.tipo === 'outro') return false
  return (item.pontos ?? 0) > 0 || item.tipo === 'prova' || item.tipo === 'reavaliacao'
}

/**
 * Compara o Canvas com o app. Devolve o que mudou nas avaliações já ligadas e o que é novo (para a revisão).
 * Curso ignorado leva junto as atividades dele. Evento ligado que o Daniel apagou conta como ignorado.
 */
export function compararCanvas(
  canvas: { cursos: CursoCanvas[]; itens: ItemCanvas[] },
  app: { materias: Materia[]; eventos: Evento[]; vinculos: Vinculos }
): { mudancas: MudancaCanvas[]; cursos: CursoNaRevisao[]; itens: ItemNaRevisao[] } {
  const materiaExiste = (id: number) => app.materias.some((m) => m.id === id)
  const ligados = new Set(Object.entries(app.vinculos).filter(([k, v]) => !k.startsWith('curso:') && v > 0).map(([, v]) => v))

  const cursos: CursoNaRevisao[] = []
  const destinoDe = new Map<number, number | 'nova' | 'ignorar'>()
  for (const c of canvas.cursos) {
    const v = app.vinculos[`curso:${c.id}`]
    if (v === 0) destinoDe.set(c.id, 'ignorar')
    else if (v !== undefined && materiaExiste(v)) destinoDe.set(c.id, v)
    else {
      const sugerida = sugerirMateria(c, app.materias)
      const novo: CursoNaRevisao = { ...c, destino: sugerida ?? 'nova', nomeMateria: nomeCurto(c.nome) }
      cursos.push(novo)
      destinoDe.set(c.id, novo.destino)
    }
  }

  const mudancas: MudancaCanvas[] = []
  const itens: ItemNaRevisao[] = []
  for (const item of canvas.itens) {
    const destino = destinoDe.get(item.cursoId)
    if (destino === undefined || destino === 'ignorar') continue
    const v = app.vinculos[item.chave]
    if (v === 0) continue
    if (v !== undefined) {
      const e = app.eventos.find((x) => x.id === v)
      if (!e) continue
      const m: MudancaCanvas = { eventoId: e.id, titulo: e.titulo }
      if (item.data && item.data !== e.data) m.data = item.data
      if (item.pontos !== null && item.pontos > 0 && item.pontos !== e.pontos) m.pontos = item.pontos
      if (item.nota !== null && item.nota !== e.nota) m.nota = item.nota
      if (item.chave.startsWith('tarefa:') && item.entregue !== e.entregue) m.entregue = item.entregue
      if (Object.keys(m).length > 2) mudancas.push(m)
      continue
    }
    // O que o Daniel já entregou não vira novidade (nem aviso): não tem mais o que fazer.
    if (item.entregue) continue
    const candidatos = typeof destino === 'number' ? app.eventos.filter((e) => e.materiaId === destino && !ligados.has(e.id)) : []
    itens.push({ ...item, incluir: incluirPorPadrao(item), juntarCom: sugerirEvento(item, candidatos) })
  }
  return { mudancas, cursos, itens }
}

/** Frase curta para o aviso: "Nota da Prova 2 de Cálculo: 13. Data da P3 mudou para 04/12." */
export function descreverMudancas(mudancas: MudancaCanvas[], diaMes: (d: string) => string, nota: (n: number) => string): string {
  const partes: string[] = []
  for (const m of mudancas) {
    if (m.nota !== undefined) partes.push(`nota de ${m.titulo}: ${nota(m.nota)}`)
    if (m.data) partes.push(`${m.titulo} mudou para ${diaMes(m.data)}`)
    if (m.pontos !== undefined) partes.push(`${m.titulo} passou a valer ${nota(m.pontos)}`)
  }
  if (partes.length === 0) return ''
  const texto = partes.slice(0, 3).join('; ') + (partes.length > 3 ? ` e mais ${partes.length - 3}` : '')
  return `Canvas: ${texto}.`
}

// ---------- PDFs do curso que combinam com o tema da sessão ----------

const VAZIAS = new Set(
  (
    'de da do das dos e em a o os as um uma uns umas para pra com por no na nos nas ao aos que se mais sobre entre ' +
    'pdf aula aulas slide slides lista listas exercicio exercicios questao questoes revisar revisao refazer estudar fazer ' +
    'parte partes unidade unid cap capitulo material impares pares ver todos todas resolver'
  ).split(' ')
)

/** Palavras (pelo começo, para "derivada" bater com "derivadas") e números de seção ("3.9", "14") de um texto. */
function termos(texto: string): { palavras: Set<string>; numeros: Set<string> } {
  const palavras = new Set(
    normalizar(texto)
      .split(' ')
      .filter((p) => p.length >= 4 && !/^\d+$/.test(p) && !VAZIAS.has(p))
      .map((p) => p.slice(0, 6))
  )
  // Números dentro de parênteses são exercícios ("3.9 (1, 3, 5)"), não o assunto.
  const numeros = new Set(texto.replace(/\([^)]*\)/g, ' ').match(/\d+(?:\.\d+)*/g) ?? [])
  return { palavras, numeros }
}

/**
 * Os PDFs do curso que parecem ser do tema (pelo nome do arquivo e do módulo), do mais parecido ao menos.
 * Palavra no nome vale 3, no módulo 2; número de seção ("3.9") vale 4 e número solto ("aula 14"), 1.
 * Só entra quem faz 3 pontos ou mais: sem nada parecido, a lista volta vazia e o Daniel escolhe à mão.
 */
export function sugerirPdfs(arquivos: ArquivoCanvas[], tema: string, max = 4): ArquivoCanvas[] {
  const t = termos(tema)
  if (t.palavras.size === 0 && t.numeros.size === 0) return []
  const pontuar = (a: ArquivoCanvas): number => {
    const nome = termos(a.nome)
    const modulo = termos(a.modulo)
    let pontos = 0
    for (const p of t.palavras) pontos += nome.palavras.has(p) ? 3 : modulo.palavras.has(p) ? 2 : 0
    for (const n of t.numeros) {
      const achou = nome.numeros.has(n) || modulo.numeros.has(n)
      if (achou) pontos += n.includes('.') ? 4 : 1
    }
    return pontos
  }
  return arquivos
    .map((a, i) => ({ a, i, p: pontuar(a) }))
    .filter((x) => x.p >= 3)
    .sort((x, y) => y.p - x.p || x.i - y.i)
    .slice(0, max)
    .map((x) => x.a)
}
