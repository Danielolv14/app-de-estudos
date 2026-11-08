import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { Banco } from '../src/main/banco'
import { Repositorio } from '../src/main/repositorio'
import { semear } from '../src/main/seed'
import { gerarResumo } from '@shared/resumo'

const wasm = createRequire(import.meta.url).resolve('sql.js/dist/sql-wasm.wasm')

describe('resumo no vault', () => {
  it('mostra avaliações, o dia, atrasadas, próximos dias, horas e sessões', async () => {
    const repo = new Repositorio(await Banco.abrir(null, wasm))
    semear(repo)
    const calc = repo.materias()[0].id
    const s = repo.abrirSessao({ tarefaId: null, materiaId: calc, dia: '2026-11-10', inicio: 1 })
    repo.fecharSessao(s, { fim: 2, estudoSeg: 5400, pausaSeg: 300, antesDaMeta: true })

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
    expect(md).toContain('| qui 26/11 | Cálculo | Atividade avaliativa 2 de Cálculo | em 16 dias | 10 | 7 |')
    expect(md).toContain('Meta: 2h. Estudado: 1h30.')
    expect(md).toContain('## Atrasadas\n- [ ] sex 06/11, Arquitetura: Revisar a aula 14')
    expect(md).toContain('### qua 11/11\n- [ ] Cálculo: 3.9 taxas relacionadas')
    expect(md).not.toContain('2026-12-08') // fora da janela de 14 dias
    expect(md).toContain('| Cálculo | 1h30 | 1h30 |')
    expect(md).toContain('| ter 10/11 | Cálculo | - | 1h30 | 5 min | antes da meta |')
  })
})
