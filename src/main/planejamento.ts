// Aplica o que o Daniel aprovou: as mudanças do replanejamento e o plano de ensino revisado.
// Nada aqui chama a IA: a IA só sugere, e estas funções rodam depois da aprovação.
import type { LeituraPlano, Mudanca } from '@shared/tipos'
import { CORES_MATERIA } from '@shared/padroes'
import type { Repositorio } from './repositorio'

/** Aplica as mudanças escolhidas (pelo id) e descarta a proposta. Mudança de tarefa que sumiu nesse meio-tempo é pulada. */
export function aplicarProposta(repo: Repositorio, escolhidas: number[]): number {
  const proposta = repo.propostaPlano()
  if (!proposta) return 0
  let aplicadas = 0
  repo.banco.transacao(() => {
    for (const m of proposta.mudancas.filter((x) => escolhidas.includes(x.id))) {
      if (aplicarMudanca(repo, m)) aplicadas++
    }
    repo.salvarPropostaPlano(null)
  })
  return aplicadas
}

function aplicarMudanca(repo: Repositorio, m: Mudanca): boolean {
  if (m.tipo === 'criar') {
    repo.salvarTarefa({ materiaId: m.materiaId, data: m.data, titulo: m.titulo, detalhe: m.detalhe, minutos: m.minutos })
    return true
  }
  const t = repo.tarefa(m.tarefaId)
  if (!t || t.feita) return false
  if (m.tipo === 'mover') repo.moverTarefa(t.id, m.data)
  else if (m.tipo === 'remover') repo.removerTarefa(t.id)
  else
    repo.salvarTarefa({
      ...t,
      minutos: m.minutos ?? t.minutos,
      titulo: m.titulo ?? t.titulo,
      detalhe: m.detalhe ?? t.detalhe
    })
  return true
}

/** Título curto de uma aula no calendário (o assunto inteiro fica no conteúdo). */
export function tituloAula(materia: string, conteudo: string): string {
  const assunto = conteudo.replace(/\s+/g, ' ').trim()
  const curto = assunto.length > 60 ? `${assunto.slice(0, 59)}…` : assunto
  return `Aula de ${materia}: ${curto}`
}

/**
 * Aplica o plano de ensino revisado: cria a matéria (se for nova) e põe no calendário as avaliações e as aulas marcadas.
 * Avaliação com o mesmo título de uma que já existe na matéria é atualizada em vez de duplicada.
 */
export function aplicarLeitura(repo: Repositorio, l: LeituraPlano): { materiaId: number; avaliacoes: number; aulas: number } {
  let materiaId = 0
  let avaliacoes = 0
  let aulas = 0
  repo.banco.transacao(() => {
    const existente = repo.materias().find((m) => m.id === l.materiaId)
    const nome = l.materia.trim() || 'Nova matéria'
    const bibliografia = l.bibliografia.join('\n')
    if (existente) {
      materiaId = existente.id
      repo.salvarMateria({ id: existente.id, nome: existente.nome, cor: existente.cor, bibliografia: bibliografia || existente.bibliografia })
    } else {
      const usadas = repo.materiasAtivas().map((m) => m.cor)
      const cor = CORES_MATERIA.find((c) => !usadas.includes(c)) ?? CORES_MATERIA[repo.materias().length % CORES_MATERIA.length]
      materiaId = repo.salvarMateria({ nome, cor, bibliografia })
    }
    const doCalendario = repo.eventos().filter((e) => e.materiaId === materiaId)
    for (const a of l.avaliacoes.filter((x) => x.incluir && x.titulo.trim())) {
      const igual = doCalendario.find((e) => e.titulo.toLowerCase() === a.titulo.trim().toLowerCase() && e.tipo !== 'aula')
      repo.salvarEvento({
        id: igual?.id,
        materiaId,
        data: a.data,
        titulo: a.titulo.trim(),
        tipo: a.tipo,
        pontos: a.pontos,
        meta: igual?.meta ?? null,
        nota: igual?.nota ?? null,
        conteudo: a.conteudo
      })
      avaliacoes++
    }
    const materia = repo.materias().find((m) => m.id === materiaId)!.nome
    for (const a of l.aulas.filter((x) => x.incluir && x.data)) {
      const titulo = tituloAula(materia, a.conteudo)
      if (doCalendario.some((e) => e.tipo === 'aula' && e.data === a.data && e.titulo === titulo)) continue
      repo.salvarEvento({ materiaId, data: a.data, titulo, tipo: 'aula', pontos: null, meta: null, nota: null, conteudo: a.conteudo })
      aulas++
    }
    repo.salvarLeituraPlano(null)
  })
  return { materiaId, avaliacoes, aulas }
}
