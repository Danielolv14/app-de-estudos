import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { Banco } from '../src/main/banco'
import { Repositorio } from '../src/main/repositorio'
import { prepararDados } from '../src/main/seed'
import { gerarResumo } from '@shared/resumo'

const wasm = createRequire(import.meta.url).resolve('sql.js/dist/sql-wasm.wasm')

describe('resumo no vault', () => {
  it('mostra avaliações, notas, o dia, atrasadas, próximos dias, horas e sessões', async () => {
    const repo = new Repositorio(await Banco.abrir(null, wasm))
    prepararDados(repo)
    const calc = repo.materias()[0].id
    const s = repo.abrirSessao({ tarefaId: null, materiaId: calc, dia: '2026-11-10', inicio: 1 })
    repo.fecharSessao(s, { fim: 2, estudoSeg: 5400, pausaSeg: 300, antesDaMeta: true, checkinFeito: '3.4 | 3.5', checkinTravou: '' })

    const md = gerarResumo({
      hoje: '2026-11-10',
      agora: new Date(2026, 10, 10, 18).getTime(),
      materias: repo.materias(),
      tarefas: repo.tarefas(),
      eventos: repo.eventos(),
      sessoes: repo.sessoes(),
      metasDia: repo.metasDia(),
      ativa: null
    })

    expect(md).toContain('atualizado: 2026-11-10')
    expect(md).toContain('| qui 26/11 | Cálculo | Atividade avaliativa 2 de Cálculo | em 16 dias | 10 | 6,5 (calculada) |')
    expect(md).toContain('## Notas (para passar: 60)')
    expect(md).toContain('- **Cálculo:** precisa de 39 dos 60 pontos em jogo (65% de cada avaliação).')
    expect(md).toContain(
      '  - Metas: Atividade avaliativa 2 de Cálculo 6,5 (calculada); Prova 3 de Cálculo 16,3 (calculada); ADA de Cálculo 3; Reavaliação de Cálculo 16,3 (calculada).'
    )
    expect(md).toContain('  - Supõe que a reavaliação entra no lugar da Prova 1 de Cálculo (10).')
    expect(md).toContain('- **Arquitetura:** precisa de 53 dos 90 pontos em jogo (59% de cada avaliação).')
    expect(md).toContain('Meta: 2h. Estudado: 1h30.')
    expect(md).toContain('## Atrasadas\n- [ ] sex 06/11, Arquitetura: Revisar a aula 14')
    expect(md).toContain('### qua 11/11\n- [ ] Cálculo: 3.9 taxas relacionadas')
    expect(md).not.toContain('2026-12-08') // fora da janela de 14 dias
    expect(md).toContain('| Cálculo | 1h30 | 1h30 |')
    expect(md).toContain('| ter 10/11 | Cálculo | - | 1h30 | 5 min | antes da meta | 3.4 / 3.5 | - |')
  })
})
