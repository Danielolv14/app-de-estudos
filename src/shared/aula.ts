// A aula da IA em Markdown, no mesmo formato das notas de estudo do vault (a ideia, as fórmulas, os exemplos,
// as armadilhas, os exercícios e o gabarito no fim). Sem rede e sem disco: só texto, para dar para testar.
import type { Aula, ConteudoAula, SituacaoExercicio } from './tipos'
import { dataLocal, diaMes } from './regras'
import { normalizarTextoIa } from './texto'

const SITUACAO: Record<SituacaoExercicio, string> = { acertei: 'acertei', parcial: 'acertei em parte', errei: 'errei' }

/**
 * A aula que vai para o professor corrigir ou tirar dúvida: os exercícios vão sem a resolução e sem a resposta,
 * para ele não entregar o gabarito de um exercício que o aluno ainda está tentando.
 */
export function aulaSemGabarito(c: ConteudoAula): ConteudoAula {
  return { ...c, exercicios: c.exercicios.map((e) => ({ ...e, resolucao: '', resposta: '' })) }
}

/** Nome de arquivo que o Windows e o Obsidian aceitam: "ERS - Diagrama de classes.md". */
export function nomeArquivoAula(sigla: string, titulo: string): string {
  const limpar = (x: string) =>
    x
      .replace(/[\\/:*?"<>|#^[\]]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  const t = limpar(titulo)
  if (!t) return 'Aula.md'
  const s = limpar(sigla)
  return `${(s ? `${s} - ${t}` : t).slice(0, 90).trim()}.md`
}

/** Bloco de código para fórmulas: não deixa uma crase tripla de dentro quebrar o bloco. */
const bloco = (linhas: string[]) => ['```', ...linhas.map((l) => l.replace(/```/g, "'''")), '```']

export function aulaEmMarkdown(a: Aula, materia: string): string {
  const c = a.conteudo
  const dia = dataLocal(a.criadaEm)
  const l: string[] = [
    '---',
    'tipo: estudo',
    `tags: [faculdade, aula-do-app]`,
    `atualizado: ${dataLocal(a.atualizadaEm)}`,
    '---',
    `# ${c.titulo}`,
    '',
    `> Aula de **${materia}** montada pelo App de Estudos em ${diaMes(dia)}. Tema: ${a.tema.replace(/\n+/g, ' ')}.` +
      (c.fontes.length > 0 ? ` Feita a partir de ${c.fontes.map((f) => `\`${f}\``).join(', ')}.` : '')
  ]
  if (c.avisos) l.push(`> ${c.avisos.replace(/\n+/g, ' ')}`)
  l.push('')
  if (c.objetivo) l.push(`**Objetivo:** ${c.objetivo}`, '')
  if (c.roteiro.length > 0) l.push('**Ordem de estudo:**', ...c.roteiro.map((r, i) => `${i + 1}. ${r}`), '')
  l.push('---', '')

  c.secoes.forEach((s, i) => {
    l.push(`## Parte ${i + 1}: ${s.titulo}`, '', s.texto, '')
    if (s.formulas.length > 0) l.push(...bloco(s.formulas), '')
    if (s.exemplo) {
      l.push('**Exemplo**', '', s.exemplo.enunciado, '')
      if (s.exemplo.resolucao) l.push('*Resolução:*', '', s.exemplo.resolucao, '')
    }
  })

  if (c.armadilhas.length > 0) l.push('## Armadilhas', '', ...c.armadilhas.map((x) => `- ${x}`), '')

  if (c.exercicios.length > 0) {
    l.push('## Exercícios', 'Faça sem olhar o gabarito.', '')
    for (const e of c.exercicios) {
      const sit = a.progresso[String(e.numero)]
      l.push(`**${e.numero}.** ${e.enunciado}${e.origem ? ` *(${e.origem})*` : ''}${sit ? ` (${SITUACAO[sit]})` : ''}`, '')
    }
    l.push('---', '', '## Gabarito (só depois de tentar)', '')
    for (const e of c.exercicios) {
      l.push(`**${e.numero}.** ${e.resolucao || e.resposta}`)
      if (e.resposta && e.resolucao) l.push('', `**Resposta:** ${e.resposta}`)
      l.push('')
    }
  }

  if (a.conversa.length > 0) {
    l.push('## Conversa com o professor', '')
    for (const m of a.conversa) {
      const quem = m.de === 'aluno' ? '**Eu:**' : '**Professor:**'
      const extra = m.fotos.length > 0 ? ` *(mandei ${m.fotos.length === 1 ? 'uma foto' : `${m.fotos.length} fotos`})*` : ''
      l.push(`${quem} ${m.texto || ''}${extra}`.trimEnd(), '')
    }
  }
  // As aulas salvas antes da correção do prompt podem ter "\n" escrito como texto.
  return normalizarTextoIa(l.join('\n')).replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}
