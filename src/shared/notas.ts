// Calculadora de nota: quanto falta para passar em cada matéria (60 de 100 na PUC).
// Regras puras, usadas pelas telas e pelo resumo do vault.
import type { Evento, Materia } from './tipos'

export const NOTA_MINIMA = 60

export const ehAvaliacao = (e: Pick<Evento, 'tipo'>): boolean =>
  e.tipo === 'prova' || e.tipo === 'atividade' || e.tipo === 'reavaliacao'

/**
 * garantido: as notas lançadas já passam de 60.
 * folga: com as metas que você fixou, chega a 60 sem precisar das automáticas.
 * possivel: dá para passar tirando `fracao` de cada avaliação com meta automática.
 * abaixo: todas as que faltam têm meta fixa, e elas não chegam a 60.
 * impossivel: nem a nota máxima no que falta chega a 60.
 */
export type Situacao = 'garantido' | 'folga' | 'possivel' | 'abaixo' | 'impossivel' | 'sem-avaliacoes'

export type NotasDaMateria = {
  materiaId: number
  /** Avaliações da matéria, na ordem de exibição. */
  avaliacoes: Evento[]
  /** Soma dos pontos das avaliações, sem contar a reavaliação. */
  total: number
  /** Pontos já tirados (com a troca da reavaliação, quando ela entrou na conta). */
  obtido: number
  /** Soma das metas fixadas à mão nas avaliações que faltam. */
  previsto: number
  /** Pontos das avaliações com meta automática. */
  emJogo: number
  /** Quanto ainda falta tirar nas avaliações com meta automática (zero ou menos: já chega). */
  faltam: number
  /** `faltam / emJogo`: a fração de cada avaliação automática que precisa tirar. */
  fracao: number | null
  reavaliacao: Evento | null
  /** Prova que a reavaliação substitui na conta (a de menor nota). Nula se a reavaliação não entrou. */
  trocada: Evento | null
  situacao: Situacao
  /** Meta automática de cada avaliação sem nota e sem meta fixa. */
  metas: Map<number, number>
}

/** Arredonda para cima com uma casa (a meta é o mínimo para passar). */
const subir = (x: number): number => Math.ceil(x * 10 - 1e-6) / 10

const fracaoDe = (e: Evento): number => (e.nota ?? 0) / (e.pontos || 1)

type Cenario = {
  obtido: number
  previsto: number
  emJogo: number
  faltam: number
  trocada: Evento | null
  /** Avaliações com meta automática: `vale` é a escala da própria avaliação. */
  auto: { id: number; vale: number }[]
}

function cenario(normais: Evento[], reav: Evento | null, usarReav: boolean, minimo: number): Cenario | null {
  let trocada: Evento | null = null
  if (usarReav) {
    if (!reav) return null
    const provasFeitas = normais.filter((e) => e.tipo === 'prova' && e.nota !== null)
    if (provasFeitas.length === 0) return null
    trocada = provasFeitas.reduce((a, b) => (fracaoDe(b) < fracaoDe(a) ? b : a))
  }
  let obtido = 0
  let previsto = 0
  let emJogo = 0
  const auto: Cenario['auto'] = []
  for (const e of normais) {
    if (e === trocada) continue
    const pontos = e.pontos ?? 0
    if (e.nota !== null) obtido += e.nota
    else if (e.meta !== null) previsto += e.meta
    else {
      emJogo += pontos
      auto.push({ id: e.id, vale: pontos })
    }
  }
  if (reav && trocada) {
    // A reavaliação vale o mesmo que a prova trocada; se tiver outra escala, converte.
    const peso = trocada.pontos ?? 0
    const vale = reav.pontos ?? peso
    const fator = vale > 0 ? peso / vale : 1
    if (reav.nota !== null) obtido += reav.nota * fator
    else if (reav.meta !== null) previsto += reav.meta * fator
    else {
      emJogo += peso
      auto.push({ id: reav.id, vale })
    }
  }
  return { obtido, previsto, emJogo, faltam: minimo - obtido - previsto, trocada, auto }
}

/** Menor é mais fácil de passar. */
function dificuldade(c: Cenario): number {
  if (c.faltam <= 0) return c.faltam / 1000 - 1
  return c.emJogo > 0 ? c.faltam / c.emJogo : Number.POSITIVE_INFINITY
}

function ordemDeExibicao(e: Evento): string {
  if (e.data) return e.data
  if (e.nota !== null) return '0000'
  return `9999-${e.tipo === 'prova' ? 0 : e.tipo === 'atividade' ? 1 : 2}`
}

export function notasDaMateria(eventos: Evento[], materiaId: number, minimo = NOTA_MINIMA): NotasDaMateria {
  const daMateria = eventos
    .filter((e) => e.materiaId === materiaId && ehAvaliacao(e))
    .sort((a, b) => ordemDeExibicao(a).localeCompare(ordemDeExibicao(b)) || a.id - b.id)
  const reav = daMateria.find((e) => e.tipo === 'reavaliacao') ?? null
  const normais = daMateria.filter((e) => e.tipo !== 'reavaliacao' && e.pontos !== null)
  const avaliacoes = daMateria.filter((e) => e.pontos !== null || e === reav)
  const total = normais.reduce((s, e) => s + (e.pontos ?? 0), 0)

  const semReav = cenario(normais, reav, false, minimo)!
  const comReav = cenario(normais, reav, true, minimo)
  let c = semReav
  if (comReav) {
    const da = dificuldade(comReav)
    const ds = dificuldade(semReav)
    c = da < ds || (da === ds && comReav.faltam < semReav.faltam) ? comReav : semReav
  }

  const pendentes = normais.some((e) => e.nota === null) || (!!c.trocada && reav?.nota === null)
  const fracao = c.emJogo > 0 ? c.faltam / c.emJogo : null
  let situacao: Situacao
  if (total === 0) situacao = 'sem-avaliacoes'
  else if (c.obtido >= minimo) situacao = 'garantido'
  else if (c.faltam <= 0) situacao = 'folga'
  else if (!pendentes) situacao = 'impossivel'
  else if (c.emJogo === 0) situacao = 'abaixo'
  else if (fracao! > 1) situacao = 'impossivel'
  else situacao = 'possivel'

  const metas = new Map<number, number>()
  for (const a of c.auto) {
    if (situacao === 'possivel') metas.set(a.id, subir(fracao! * a.vale))
    else if (situacao === 'impossivel') metas.set(a.id, a.vale)
    else if (situacao === 'garantido' || situacao === 'folga') metas.set(a.id, 0)
  }

  return {
    materiaId,
    avaliacoes,
    total,
    obtido: c.obtido,
    previsto: c.previsto,
    emJogo: c.emJogo,
    faltam: c.faltam,
    fracao,
    reavaliacao: reav,
    trocada: c.trocada,
    situacao,
    metas
  }
}

/** Metas automáticas de todas as matérias, por id do evento. */
export function metasAutomaticas(eventos: Evento[], materias: Materia[], minimo = NOTA_MINIMA): Map<number, number> {
  const todas = new Map<number, number>()
  for (const m of materias) for (const [id, v] of notasDaMateria(eventos, m.id, minimo).metas) todas.set(id, v)
  return todas
}

/** Meta que vale para a avaliação: a fixada à mão ou a automática. */
export function metaDe(e: Evento, automaticas: Map<number, number>): { valor: number; automatica: boolean } | null {
  if (e.nota !== null) return null
  if (e.meta !== null) return { valor: e.meta, automatica: false }
  const v = automaticas.get(e.id)
  return v === undefined ? null : { valor: v, automatica: true }
}

/** 6,5 · 16 · 17,7 */
export function formatarNota(n: number): string {
  const r = Math.round(n * 10) / 10
  return Number.isInteger(r) ? String(r) : r.toFixed(1).replace('.', ',')
}
