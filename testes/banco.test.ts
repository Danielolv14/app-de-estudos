import { createRequire } from 'node:module'
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import initSqlJs from 'sql.js'
import { describe, expect, it } from 'vitest'
import { Banco } from '../src/main/banco'
import { Repositorio } from '../src/main/repositorio'
import { prepararDados, semear } from '../src/main/seed'
import { notasDaMateria } from '@shared/notas'

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

  it('config da v1.1 com "reiniciarChrome" vira "reiniciarNavegador"', async () => {
    const repo = new Repositorio(await Banco.abrir(null, wasm))
    repo.gravarKv('config', { insistirMin: 10, reiniciarChrome: false })
    expect(repo.config()).toMatchObject({ insistirMin: 10, reiniciarNavegador: false })
    expect(repo.config()).not.toHaveProperty('reiniciarChrome')
    repo.salvarConfig(repo.config())
    expect(repo.lerKv('config')).not.toHaveProperty('reiniciarChrome')
    expect(repo.config().reiniciarNavegador).toBe(false)
  })

  it('v1.1: importa as notas que já saíram e as metas das provas passam a ser calculadas', async () => {
    const repo = new Repositorio(await Banco.abrir(null, wasm))
    prepararDados(repo)
    prepararDados(repo) // abrir de novo não duplica nada
    const [calc, arq] = repo.materias()
    const eventos = repo.eventos()
    expect(eventos.filter((e) => e.titulo === 'Prova 1 de Cálculo')).toHaveLength(1)
    expect(eventos.find((e) => e.titulo === 'Prova 3 de Cálculo')).toMatchObject({ meta: null, pontos: 25 })
    expect(eventos.find((e) => e.titulo === 'Reavaliação de Cálculo')).toMatchObject({ data: null, pontos: 25 })
    expect(eventos.find((e) => e.titulo === 'Prova 3 de Arquitetura')?.pontos).toBe(30)
    expect(notasDaMateria(eventos, calc.id).faltam).toBe(39)
    expect(notasDaMateria(eventos, arq.id).faltam).toBe(53)
  })

  it('v1.1: não importa as notas se você já lançou alguma à mão', async () => {
    const repo = new Repositorio(await Banco.abrir(null, wasm))
    semear(repo)
    const p3 = repo.eventos().find((e) => e.titulo === 'Prova 3 de Cálculo')!
    repo.salvarEvento({ ...p3, nota: 20 })
    prepararDados(repo)
    expect(repo.eventos().some((e) => e.titulo === 'Prova 1 de Cálculo')).toBe(false)
    expect(repo.eventos().some((e) => e.titulo === 'Prova 1 de Arquitetura')).toBe(true)
  })

  it('atualiza um banco da v1.0: a data do evento pode ficar vazia e as sessões ganham o check-in', async () => {
    const arquivo = join(mkdtempSync(join(tmpdir(), 'estudos-')), 'estudos.sqlite')
    const SQL = await initSqlJs({ wasmBinary: readFileSync(wasm) as unknown as ArrayBuffer })
    const antigo = new SQL.Database()
    antigo.exec(`
      CREATE TABLE materias (id INTEGER PRIMARY KEY, nome TEXT NOT NULL, cor TEXT NOT NULL);
      CREATE TABLE eventos (id INTEGER PRIMARY KEY, materia_id INTEGER REFERENCES materias(id) ON DELETE SET NULL,
        data TEXT NOT NULL, titulo TEXT NOT NULL, tipo TEXT NOT NULL, pontos REAL, meta REAL, nota REAL);
      CREATE TABLE sessoes (id INTEGER PRIMARY KEY, tarefa_id INTEGER, materia_id INTEGER, dia TEXT NOT NULL,
        inicio INTEGER NOT NULL, fim INTEGER, estudo_seg INTEGER NOT NULL DEFAULT 0, pausa_seg INTEGER NOT NULL DEFAULT 0,
        antes_da_meta INTEGER NOT NULL DEFAULT 0);
      INSERT INTO materias VALUES (1, 'Física', '#fff');
      INSERT INTO eventos VALUES (7, 1, '2026-12-01', 'Prova de Física', 'prova', 30, 18, NULL);
      INSERT INTO sessoes (id, dia, inicio, fim, estudo_seg) VALUES (3, '2026-11-10', 1, 2, 600);
    `)
    writeFileSync(arquivo, Buffer.from(antigo.export()))
    antigo.close()

    const banco = await Banco.abrir(arquivo, wasm)
    const repo = new Repositorio(banco)
    expect(repo.eventos()).toEqual([
      { id: 7, materiaId: 1, data: '2026-12-01', titulo: 'Prova de Física', tipo: 'prova', pontos: 30, meta: 18, nota: null }
    ])
    expect(repo.sessoes()[0]).toMatchObject({ id: 3, estudoSeg: 600, checkinFeito: '', checkinTravou: '' })
    const id = repo.salvarEvento({ materiaId: 1, data: null, titulo: 'Reavaliação', tipo: 'reavaliacao', pontos: 30, meta: null, nota: null })
    expect(repo.eventos().find((e) => e.id === id)?.data).toBeNull()
    // Apagar a matéria ainda solta o evento (a chave estrangeira sobreviveu à troca de tabela).
    repo.removerMateria(1)
    expect(repo.eventos().every((e) => e.materiaId === null)).toBe(true)
    banco.fechar()
  })

  it('move a tarefa para outro dia, no fim da lista', async () => {
    const repo = new Repositorio(await Banco.abrir(null, wasm))
    semear(repo)
    const atrasada = repo.tarefas().find((t) => t.data === '2026-11-06')!
    repo.moverTarefa(atrasada.id, '2026-11-13')
    const doDia = repo.tarefas().filter((t) => t.data === '2026-11-13')
    expect(doDia.map((t) => t.id).at(-1)).toBe(atrasada.id)
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
