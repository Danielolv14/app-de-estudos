// Regras puras do app (sem Electron nem banco), para poderem ser testadas sozinhas.
import type { EstadoLembrete, Evento, Lembrete, Sessao, SessaoAtiva, Tarefa } from './tipos'

const MINUTO = 60_000
const DIA = 86_400_000

// ---------- Datas ----------

/** Data local no formato AAAA-MM-DD. */
export function dataLocal(momento: number | Date = Date.now()): string {
  const d = typeof momento === 'number' ? new Date(momento) : momento
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** Converte AAAA-MM-DD em meia-noite local. */
export function paraData(data: string): Date {
  const [a, m, d] = data.split('-').map(Number)
  return new Date(a, m - 1, d)
}

export function somarDias(data: string, dias: number): string {
  const d = paraData(data)
  d.setDate(d.getDate() + dias)
  return dataLocal(d)
}

/** Quantos dias faltam de `hoje` até `data` (0 = hoje, negativo = já passou). */
export function diasAte(hoje: string, data: string): number {
  return Math.round((paraData(data).getTime() - paraData(hoje).getTime()) / DIA)
}

/** Segunda-feira da semana de `data`. */
export function inicioDaSemana(data: string): string {
  const d = paraData(data)
  const desloc = (d.getDay() + 6) % 7
  return somarDias(data, -desloc)
}

// ---------- Timer ----------

export function estudoMs(ativa: SessaoAtiva, agora: number): number {
  return ativa.estudoMs + (ativa.status === 'estudando' ? Math.max(0, agora - ativa.marco) : 0)
}

export function pausaMs(ativa: SessaoAtiva, agora: number): number {
  return ativa.pausaMs + (ativa.status === 'pausado' ? Math.max(0, agora - ativa.marco) : 0)
}

export function pausar(ativa: SessaoAtiva, agora: number): SessaoAtiva {
  if (ativa.status === 'pausado') return ativa
  return { ...ativa, status: 'pausado', estudoMs: estudoMs(ativa, agora), marco: agora, batimento: agora }
}

export function retomar(ativa: SessaoAtiva, agora: number): SessaoAtiva {
  if (ativa.status === 'estudando') return ativa
  return { ...ativa, status: 'estudando', pausaMs: pausaMs(ativa, agora), marco: agora, batimento: agora }
}

/**
 * Sessão encontrada ao abrir o app (o PC desligou ou o app foi fechado à força).
 * Conta só até o último sinal de vida salvo e volta pausada: o tempo com o PC desligado
 * não vira estudo nem pausa.
 */
export function recuperar(ativa: SessaoAtiva, agora: number): SessaoAtiva {
  const ate = Math.min(Math.max(ativa.batimento, ativa.marco), agora)
  const estudo = ativa.estudoMs + (ativa.status === 'estudando' ? Math.max(0, ate - ativa.marco) : 0)
  const pausa = ativa.pausaMs + (ativa.status === 'pausado' ? Math.max(0, ate - ativa.marco) : 0)
  return { ...ativa, status: 'pausado', estudoMs: estudo, pausaMs: pausa, marco: agora, batimento: agora }
}

// ---------- Meta do dia ----------

/** Meta do dia em minutos: o valor ajustado à mão, ou a soma das estimativas das tarefas do dia. */
export function metaDoDia(data: string, tarefas: Tarefa[], metasDia: Record<string, number>): number {
  if (metasDia[data] !== undefined) return metasDia[data]
  return tarefas.filter((t) => t.data === data).reduce((soma, t) => soma + t.minutos, 0)
}

/** Tempo estudado no dia, somando as sessões encerradas e a sessão em andamento. */
export function estudadoNoDia(data: string, sessoes: Sessao[], ativa: SessaoAtiva | null, agora: number): number {
  const encerradas = sessoes
    .filter((s) => s.dia === data && s.fim !== null)
    .reduce((soma, s) => soma + s.estudoSeg * 1000, 0)
  const emAndamento = ativa && ativa.dia === data ? estudoMs(ativa, agora) : 0
  return encerradas + emAndamento
}

/** Com a meta batida (ou sem meta), a sessão termina sem trava. */
export function podeEncerrarLivre(metaMin: number, estudadoMsHoje: number): boolean {
  return metaMin <= 0 || estudadoMsHoje >= metaMin * MINUTO
}

// ---------- Trava ----------

/** Próximas avaliações (provas, atividades e reavaliações) a partir de hoje, em ordem. */
export function proximasAvaliacoes(eventos: Evento[], hoje: string): Evento[] {
  return eventos
    .filter((e) => e.tipo !== 'aula' && e.tipo !== 'outro' && diasAte(hoje, e.data) >= 0)
    .sort((a, b) => a.data.localeCompare(b.data) || a.id - b.id)
}

/** Frase que precisa ser digitada para encerrar antes da meta. */
export function fraseTrava(hoje: string, faltamMin: number, proxima: Evento | null): string {
  const tempo = formatarDuracao(faltamMin * MINUTO)
  if (proxima) {
    const dias = diasAte(hoje, proxima.data)
    const quando =
      dias === 0
        ? `mesmo com a ${proxima.titulo} sendo hoje`
        : `mesmo faltando ${dias} ${dias === 1 ? 'dia' : 'dias'} para a ${proxima.titulo}`
    return `Vou parar ${tempo} antes da meta de hoje, ${quando}.`
  }
  return `Vou parar ${tempo} antes da meta de hoje e aceito que o plano vai atrasar.`
}

/** Compara sem diferenciar maiúsculas, acentos, pontuação e espaços repetidos. */
export function normalizarFrase(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function fraseConfere(digitado: string, alvo: string): boolean {
  return normalizarFrase(digitado) === normalizarFrase(alvo) && normalizarFrase(alvo).length > 0
}

// ---------- Lembrete ----------

export function minutosDoDia(hora: string): number {
  const [h, m] = hora.split(':').map(Number)
  return h * 60 + m
}

/**
 * Decide se o lembrete aparece agora. Regras:
 * o dia tem lembrete ligado e o horário chegou; existe tarefa pendente hoje;
 * nenhuma sessão começou hoje; não foi dispensado nem adiado; e o último aviso foi há `insistirMin` ou mais.
 */
export function deveLembrar(p: {
  agora: number
  lembretes: Lembrete[]
  insistirMin: number
  estado: EstadoLembrete | null
  tarefasPendentesHoje: number
  sessaoHoje: boolean
}): boolean {
  const d = new Date(p.agora)
  const cfg = p.lembretes[d.getDay()]
  if (!cfg || !cfg.ativo) return false
  if (d.getHours() * 60 + d.getMinutes() < minutosDoDia(cfg.hora)) return false
  if (p.tarefasPendentesHoje === 0 || p.sessaoHoje) return false
  const e = p.estado && p.estado.data === dataLocal(p.agora) ? p.estado : null
  if (!e) return true
  if (e.dispensado) return false
  if (e.adiadoAte !== null && p.agora < e.adiadoAte) return false
  if (e.ultimoAviso === null) return true
  if (e.adiadoAte !== null && e.ultimoAviso < e.adiadoAte) return true
  return p.agora - e.ultimoAviso >= p.insistirMin * MINUTO
}

// ---------- Formatação ----------

/** 3h05, 45 min, 0 min. */
export function formatarDuracao(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / MINUTO))
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`
}

/** 01:05:09 */
export function formatarRelogio(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':')
}

const DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export function nomeDiaSemana(data: string, curto = false): string {
  const i = paraData(data).getDay()
  return curto ? DIAS_CURTOS[i] : DIAS_SEMANA[i]
}

/** 10/11 */
export function diaMes(data: string): string {
  const [, m, d] = data.split('-')
  return `${d}/${m}`
}

/** 10 de nov */
export function diaMesExtenso(data: string): string {
  const [, m, d] = data.split('-')
  return `${Number(d)} de ${MESES[Number(m) - 1]}`
}

export function textoContagem(hoje: string, data: string): string {
  const dias = diasAte(hoje, data)
  if (dias === 0) return 'hoje'
  if (dias === 1) return 'amanhã'
  if (dias < 0) return dias === -1 ? 'ontem' : `há ${-dias} dias`
  return `em ${dias} dias`
}
