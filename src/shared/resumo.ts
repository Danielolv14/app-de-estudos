// Gera a nota de resumo que o app grava no vault do Obsidian.
import type { Evento, Materia, Sessao, SessaoAtiva, Tarefa } from './tipos'
import {
  diaMes,
  estudadoNoDia,
  formatarDuracao,
  inicioDaSemana,
  metaDoDia,
  nomeDiaSemana,
  proximasAvaliacoes,
  somarDias,
  textoContagem
} from './regras'

export type DadosResumo = {
  hoje: string
  agora: number
  materias: Materia[]
  tarefas: Tarefa[]
  eventos: Evento[]
  sessoes: Sessao[]
  metasDia: Record<string, number>
  ativa: SessaoAtiva | null
}

const celula = (s: string) => s.replace(/\|/g, '/').replace(/\r?\n/g, ' ')

export function gerarResumo(d: DadosResumo): string {
  const materia = (id: number | null) => d.materias.find((m) => m.id === id)?.nome ?? 'Sem matéria'
  const dia = (data: string) => `${nomeDiaSemana(data, true)} ${diaMes(data)}`
  const linhaTarefa = (t: Tarefa, comData = false) =>
    `- [${t.feita ? 'x' : ' '}] ${comData ? dia(t.data) + ', ' : ''}${materia(t.materiaId)}: ${t.titulo} (${formatarDuracao(t.minutos * 60_000)})`

  const out: string[] = []
  out.push('---', 'tipo: area', 'tags: [faculdade, estudos, gerado]', `atualizado: ${d.hoje}`, '---')
  out.push('# Painel de estudos (app)', '')
  out.push(
    '> Nota gerada pelo [[App de Estudos]]. Não edite aqui: ela é reescrita a cada mudança. O plano se edita no app.',
    ''
  )

  // Avaliações
  out.push('## Próximas avaliações')
  const prox = proximasAvaliacoes(d.eventos, d.hoje)
  if (prox.length === 0) out.push('Nenhuma avaliação marcada.')
  else {
    out.push('| Data | Matéria | Avaliação | Quando | Vale | Meta |', '|---|---|---|---|---|---|')
    for (const e of prox)
      out.push(
        `| ${dia(e.data)} | ${materia(e.materiaId)} | ${celula(e.titulo)} | ${textoContagem(d.hoje, e.data)} | ${e.pontos ?? '-'} | ${e.meta ?? '-'} |`
      )
  }
  out.push('')

  // Hoje
  const meta = metaDoDia(d.hoje, d.tarefas, d.metasDia)
  const estudado = estudadoNoDia(d.hoje, d.sessoes, d.ativa, d.agora)
  out.push(`## Hoje (${dia(d.hoje)})`)
  out.push(`Meta: ${formatarDuracao(meta * 60_000)}. Estudado: ${formatarDuracao(estudado)}.`)
  const deHoje = d.tarefas.filter((t) => t.data === d.hoje)
  if (deHoje.length === 0) out.push('', 'Sem tarefas hoje.')
  else out.push('', ...deHoje.map((t) => linhaTarefa(t)))
  out.push('')

  // Atrasadas
  const atrasadas = d.tarefas.filter((t) => !t.feita && t.data < d.hoje)
  if (atrasadas.length > 0) {
    out.push('## Atrasadas', ...atrasadas.map((t) => linhaTarefa(t, true)), '')
  }

  // Próximos 14 dias
  out.push('## Próximos 14 dias')
  const fimJanela = somarDias(d.hoje, 14)
  const proximas = d.tarefas.filter((t) => t.data > d.hoje && t.data <= fimJanela)
  if (proximas.length === 0) out.push('Nada planejado.')
  let diaAtual = ''
  for (const t of proximas) {
    if (t.data !== diaAtual) {
      diaAtual = t.data
      out.push(`### ${dia(t.data)}`)
    }
    out.push(linhaTarefa(t))
  }
  out.push('')

  // Horas
  const semana = inicioDaSemana(d.hoje)
  out.push('## Horas estudadas', '| Matéria | Esta semana | Total |', '|---|---|---|')
  const ids = [...d.materias.map((m) => m.id as number | null), null]
  for (const id of ids) {
    const doId = d.sessoes.filter((s) => s.materiaId === id && s.fim !== null)
    const total = doId.reduce((a, s) => a + s.estudoSeg * 1000, 0)
    if (id === null && total === 0) continue
    const naSemana = doId.filter((s) => s.dia >= semana).reduce((a, s) => a + s.estudoSeg * 1000, 0)
    out.push(`| ${materia(id)} | ${formatarDuracao(naSemana)} | ${formatarDuracao(total)} |`)
  }
  out.push('')

  // Sessões
  const ultimas = d.sessoes.filter((s) => s.fim !== null).slice(-10).reverse()
  out.push('## Últimas sessões')
  if (ultimas.length === 0) out.push('Nenhuma sessão ainda.')
  else {
    out.push('| Dia | Matéria | Tarefa | Estudo | Pausa | Encerrou |', '|---|---|---|---|---|---|')
    for (const s of ultimas) {
      const t = d.tarefas.find((x) => x.id === s.tarefaId)
      out.push(
        `| ${dia(s.dia)} | ${materia(s.materiaId)} | ${celula(t?.titulo ?? '-')} | ${formatarDuracao(s.estudoSeg * 1000)} | ${formatarDuracao(s.pausaSeg * 1000)} | ${s.antesDaMeta ? 'antes da meta' : 'com a meta batida'} |`
      )
    }
  }
  out.push('', '## Ver também', '[[Rotina de estudos (fim de 2026-2)]] · [[App de Estudos]]', '')
  return out.join('\n')
}
