// Painel de constância: horas por dia, sequência de dias cumpridos e semana planejada x feita.
// A sequência só conta os dias com meta: segunda (estágio) e fim de semana não quebram.
import type { Sessao, SessaoAtiva, Tarefa } from './tipos'
import { estudoMs, inicioDaSemana, metaDoDia, somarDias } from './regras'

const MINUTO = 60_000

export type DadosConstancia = {
  hoje: string
  agora: number
  tarefas: Tarefa[]
  sessoes: Sessao[]
  metasDia: Record<string, number>
  ativa: SessaoAtiva | null
}

/** Milissegundos estudados em cada dia (sessões encerradas mais a que está em andamento). */
export function estudoPorDia(d: Pick<DadosConstancia, 'sessoes' | 'ativa' | 'agora'>): Map<string, number> {
  const mapa = new Map<string, number>()
  for (const s of d.sessoes) if (s.fim !== null) mapa.set(s.dia, (mapa.get(s.dia) ?? 0) + s.estudoSeg * 1000)
  if (d.ativa) mapa.set(d.ativa.dia, (mapa.get(d.ativa.dia) ?? 0) + estudoMs(d.ativa, d.agora))
  return mapa
}

export type Dia = { data: string; estudoMs: number; metaMin: number; cumprido: boolean | null }

/** Dias de `de` até `ate`. `cumprido` é nulo em dia sem meta. */
export function dias(d: DadosConstancia, de: string, ate: string): Dia[] {
  const estudo = estudoPorDia(d)
  const out: Dia[] = []
  for (let data = de; data <= ate; data = somarDias(data, 1)) {
    const metaMin = metaDoDia(data, d.tarefas, d.metasDia)
    const ms = estudo.get(data) ?? 0
    out.push({ data, estudoMs: ms, metaMin, cumprido: metaMin > 0 ? ms >= metaMin * MINUTO : null })
  }
  return out
}

/**
 * Sequência de dias com meta cumprida. Hoje só entra se já cumpriu: enquanto o dia não acaba, não quebra.
 * `recorde` é a maior sequência desde o primeiro dia com meta ou estudo.
 */
export function sequencia(d: DadosConstancia): { atual: number; recorde: number } {
  const estudo = estudoPorDia(d)
  const datas = [...d.tarefas.map((t) => t.data), ...d.sessoes.map((s) => s.dia), ...Object.keys(d.metasDia)].filter((x) => x <= d.hoje)
  if (datas.length === 0) return { atual: 0, recorde: 0 }
  const primeira = datas.reduce((a, b) => (b < a ? b : a))
  let atual = 0
  let recorde = 0
  for (let data = primeira; data <= d.hoje; data = somarDias(data, 1)) {
    const meta = metaDoDia(data, d.tarefas, d.metasDia)
    if (meta <= 0) continue
    if ((estudo.get(data) ?? 0) >= meta * MINUTO) {
      atual++
      recorde = Math.max(recorde, atual)
    } else if (data < d.hoje) atual = 0
  }
  return { atual, recorde }
}

export type Semana = { inicio: string; planejadoMin: number; feitoMs: number; diasComMeta: number; diasCumpridos: number }

/** As últimas `n` semanas (segunda a domingo), da mais antiga para a atual. */
export function semanas(d: DadosConstancia, n: number): Semana[] {
  const atual = inicioDaSemana(d.hoje)
  const out: Semana[] = []
  for (let i = n - 1; i >= 0; i--) {
    const inicio = somarDias(atual, -7 * i)
    const ds = dias(d, inicio, somarDias(inicio, 6))
    out.push({
      inicio,
      planejadoMin: ds.reduce((a, x) => a + x.metaMin, 0),
      feitoMs: ds.reduce((a, x) => a + x.estudoMs, 0),
      diasComMeta: ds.filter((x) => x.cumprido !== null && x.data <= d.hoje).length,
      diasCumpridos: ds.filter((x) => x.cumprido === true).length
    })
  }
  return out
}

/** Nível de 0 a 4 do mapa de calor: nada, menos de 1 h, até 2 h, até 3 h, mais de 3 h. */
export function nivel(estudo: number): 0 | 1 | 2 | 3 | 4 {
  const h = estudo / 3_600_000
  if (estudo < MINUTO) return 0
  if (h < 1) return 1
  if (h < 2) return 2
  if (h < 3) return 3
  return 4
}
