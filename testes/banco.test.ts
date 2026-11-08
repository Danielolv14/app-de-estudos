import { createRequire } from 'node:module'
import { mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Banco } from '../src/main/banco'
import { Repositorio } from '../src/main/repositorio'
import { semear } from '../src/main/seed'

const wasm = createRequire(import.meta.url).resolve('sql.js/dist/sql-wasm.wasm')

describe('banco e repositório', () => {
  it('semeia o plano atual uma única vez', async () => {
    const repo = new Repositorio(await Banco.abrir(null, wasm))
    semear(repo)
    semear(repo)
    expect(repo.materias().map((m) => m.nome)).toEqual(['Cálculo', 'Arquitetura'])
    expect(repo.tarefas().length).toBe(21)
    expect(repo.tarefas().find((t) => t.data === '2026-11-05')?.feita).toBe(true)
    const prova = repo.eventos().find((e) => e.titulo === 'Prova 3 de Cálculo')
    expect(prova).toMatchObject({ data: '2026-12-03', tipo: 'prova', pontos: 25, meta: 16 })
  })

  it('cria, edita, marca e remove tarefas; apagar a matéria não apaga a tarefa', async () => {
    const repo = new Repositorio(await Banco.abrir(null, wasm))
    const m = repo.salvarMateria({ nome: 'Teste', cor: '#fff' })
    const id = repo.salvarTarefa({ materiaId: m, data: '2026-11-10', titulo: 'A', detalhe: '', minutos: 30 })
    repo.salvarTarefa({ id, materiaId: m, data: '2026-11-11', titulo: 'B', detalhe: 'x', minutos: 45 })
    repo.marcarTarefa(id, true)
    expect(repo.tarefa(id)).toMatchObject({ data: '2026-11-11', titulo: 'B', minutos: 45, feita: true })
    repo.removerMateria(m)
    expect(repo.tarefa(id)?.materiaId).toBeNull()
    repo.removerTarefa(id)
    expect(repo.tarefa(id)).toBeUndefined()
  })

  it('guarda sessões, metas ajustadas e configuração com padrões', async () => {
    const repo = new Repositorio(await Banco.abrir(null, wasm))
    const s = repo.abrirSessao({ tarefaId: null, materiaId: null, dia: '2026-11-10', inicio: 1 })
    repo.fecharSessao(s, { fim: 2, estudoSeg: 3600, pausaSeg: 60, antesDaMeta: true })
    expect(repo.sessoes()[0]).toMatchObject({ estudoSeg: 3600, pausaSeg: 60, antesDaMeta: true, fim: 2 })
    repo.definirMeta('2026-11-10', 90)
    repo.definirMeta('2026-11-10', 100)
    expect(repo.metasDia()).toEqual({ '2026-11-10': 100 })
    repo.definirMeta('2026-11-10', null)
    expect(repo.metasDia()).toEqual({})
    expect(repo.config().dominios).toContain('web.whatsapp.com')
    repo.salvarConfig({ ...repo.config(), insistirMin: 5 })
    expect(repo.config().insistirMin).toBe(5)
  })

  it('grava no arquivo e lê de volta', async () => {
    const arquivo = join(mkdtempSync(join(tmpdir(), 'estudos-')), 'estudos.sqlite')
    const b1 = await Banco.abrir(arquivo, wasm)
    const repo1 = new Repositorio(b1)
    semear(repo1)
    b1.fechar()
    expect(existsSync(arquivo)).toBe(true)
    const repo2 = new Repositorio(await Banco.abrir(arquivo, wasm))
    expect(repo2.tarefas().length).toBe(21)
    // As chaves estrangeiras continuam valendo depois de reabrir.
    const t = repo2.tarefas()[0]
    repo2.removerMateria(t.materiaId!)
    expect(repo2.tarefa(t.id)?.materiaId).toBeNull()
  })
})
