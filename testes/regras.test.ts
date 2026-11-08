import { describe, expect, it } from 'vitest'
import {
  dataLocal,
  deveLembrar,
  diasAte,
  estudadoNoDia,
  estudoMs,
  fraseConfere,
  fraseTrava,
  formatarDuracao,
  formatarRelogio,
  inicioDaSemana,
  metaDoDia,
  pausaMs,
  pausar,
  podeEncerrarLivre,
  proximasAvaliacoes,
  proximoDiaDaMateria,
  recuperar,
  retomar
} from '@shared/regras'
import type { Evento, Lembrete, Sessao, SessaoAtiva, Tarefa } from '@shared/tipos'

const MIN = 60_000
const t0 = new Date(2026, 10, 10, 14, 0, 0).getTime() // ter 10/11/2026 14:00

const ativa = (parcial: Partial<SessaoAtiva> = {}): SessaoAtiva => ({
  sessaoId: 1,
  tarefaId: 1,
  materiaId: 1,
  dia: '2026-11-10',
  status: 'estudando',
  inicio: t0,
  estudoMs: 0,
  pausaMs: 0,
  marco: t0,
  batimento: t0,
  ...parcial
})

describe('timer que conta para cima', () => {
  it('conta o estudo, separa a pausa e retoma', () => {
    let a = ativa()
    expect(estudoMs(a, t0 + 30 * MIN)).toBe(30 * MIN)
    a = pausar(a, t0 + 30 * MIN)
    expect(estudoMs(a, t0 + 45 * MIN)).toBe(30 * MIN)
    expect(pausaMs(a, t0 + 45 * MIN)).toBe(15 * MIN)
    a = retomar(a, t0 + 45 * MIN)
    expect(estudoMs(a, t0 + 75 * MIN)).toBe(60 * MIN)
    expect(pausaMs(a, t0 + 75 * MIN)).toBe(15 * MIN)
  })

  it('pausar duas vezes não muda nada', () => {
    const a = pausar(ativa(), t0 + MIN)
    expect(pausar(a, t0 + 5 * MIN)).toBe(a)
  })

  it('ao recuperar depois de o PC desligar, conta só até o último sinal de vida e volta pausada', () => {
    const a = ativa({ batimento: t0 + 40 * MIN })
    const r = recuperar(a, t0 + 300 * MIN)
    expect(r.status).toBe('pausado')
    expect(estudoMs(r, t0 + 300 * MIN)).toBe(40 * MIN)
    expect(pausaMs(r, t0 + 300 * MIN)).toBe(0)
  })
})

describe('meta do dia e trava', () => {
  const tarefas = [
    { id: 1, data: '2026-11-10', minutos: 90 },
    { id: 2, data: '2026-11-10', minutos: 30 },
    { id: 3, data: '2026-11-11', minutos: 120 }
  ] as Tarefa[]

  it('soma as estimativas do dia, a não ser que a meta tenha sido ajustada', () => {
    expect(metaDoDia('2026-11-10', tarefas, {})).toBe(120)
    expect(metaDoDia('2026-11-10', tarefas, { '2026-11-10': 60 })).toBe(60)
    expect(metaDoDia('2026-11-09', tarefas, {})).toBe(0)
  })

  it('soma sessões encerradas do dia e a sessão em andamento', () => {
    const sessoes = [
      { dia: '2026-11-10', fim: t0, estudoSeg: 1800 },
      { dia: '2026-11-09', fim: t0, estudoSeg: 9999 },
      { dia: '2026-11-10', fim: null, estudoSeg: 0 }
    ] as Sessao[]
    expect(estudadoNoDia('2026-11-10', sessoes, ativa(), t0 + 10 * MIN)).toBe(40 * MIN)
  })

  it('só encerra livre com a meta batida ou sem meta', () => {
    expect(podeEncerrarLivre(120, 119 * MIN)).toBe(false)
    expect(podeEncerrarLivre(120, 120 * MIN)).toBe(true)
    expect(podeEncerrarLivre(0, 0)).toBe(true)
  })

  it('monta a frase com a próxima avaliação e aceita sem acento e sem maiúscula', () => {
    const eventos = [
      { id: 1, data: '2026-11-13', tipo: 'aula', titulo: 'Aula 15' },
      { id: 2, data: '2026-11-26', tipo: 'atividade', titulo: 'Atividade avaliativa 2 de Cálculo' },
      { id: 3, data: '2026-11-05', tipo: 'prova', titulo: 'P2 antiga' },
      { id: 4, data: null, tipo: 'reavaliacao', titulo: 'Reavaliação sem data' }
    ] as Evento[]
    expect(proximasAvaliacoes(eventos, '2026-11-10').map((e) => e.id)).toEqual([2])
    const proxima = proximasAvaliacoes(eventos, '2026-11-10')[0]
    expect(proxima.id).toBe(2)
    const frase = fraseTrava('2026-11-10', 48, proxima)
    expect(frase).toBe('Vou parar 48 min antes da meta de hoje, mesmo faltando 16 dias para a Atividade avaliativa 2 de Cálculo.')
    expect(fraseConfere('vou parar 48 min antes da meta de hoje mesmo faltando 16 dias para a atividade avaliativa 2 de calculo', frase)).toBe(true)
    expect(fraseConfere('vou parar', frase)).toBe(false)
  })
})

describe('tarefas atrasadas', () => {
  it('acha o próximo dia que já tem tarefa da mesma matéria', () => {
    const tarefas = [
      { id: 1, materiaId: 2, data: '2026-11-06' },
      { id: 2, materiaId: 1, data: '2026-11-11' },
      { id: 3, materiaId: 2, data: '2026-11-20' },
      { id: 4, materiaId: 2, data: '2026-11-13' }
    ] as Tarefa[]
    expect(proximoDiaDaMateria(tarefas, 2, '2026-11-10')).toBe('2026-11-13')
    expect(proximoDiaDaMateria(tarefas, 2, '2026-11-13')).toBe('2026-11-20')
    expect(proximoDiaDaMateria(tarefas, 3, '2026-11-10')).toBeNull()
  })
})

describe('lembrete da hora de estudar', () => {
  const lembretes: Lembrete[] = Array.from({ length: 7 }, (_, i) => ({ ativo: i >= 2 && i <= 5, hora: '14:00' }))
  const base = { lembretes, insistirMin: 15, tarefasPendentesHoje: 1, sessaoHoje: false }

  it('avisa a partir do horário, só em dia ligado e com tarefa pendente', () => {
    expect(deveLembrar({ ...base, agora: t0 - MIN, estado: null })).toBe(false)
    expect(deveLembrar({ ...base, agora: t0, estado: null })).toBe(true)
    expect(deveLembrar({ ...base, agora: t0, estado: null, tarefasPendentesHoje: 0 })).toBe(false)
    const segunda = new Date(2026, 10, 9, 15, 0).getTime()
    expect(deveLembrar({ ...base, agora: segunda, estado: null })).toBe(false)
  })

  it('insiste a cada 15 min, para quando a sessão começa e respeita o adiar e o dispensar', () => {
    const estado = { data: '2026-11-10', ultimoAviso: t0, adiadoAte: null, dispensado: false }
    expect(deveLembrar({ ...base, agora: t0 + 10 * MIN, estado })).toBe(false)
    expect(deveLembrar({ ...base, agora: t0 + 15 * MIN, estado })).toBe(true)
    expect(deveLembrar({ ...base, agora: t0 + 15 * MIN, estado, sessaoHoje: true })).toBe(false)
    const adiado = { ...estado, adiadoAte: t0 + 30 * MIN }
    expect(deveLembrar({ ...base, agora: t0 + 20 * MIN, estado: adiado })).toBe(false)
    expect(deveLembrar({ ...base, agora: t0 + 30 * MIN, estado: adiado })).toBe(true)
    expect(deveLembrar({ ...base, agora: t0 + 60 * MIN, estado: { ...estado, dispensado: true } })).toBe(false)
  })
})

describe('datas e formatação', () => {
  it('calcula dias, semana e formatos', () => {
    expect(dataLocal(t0)).toBe('2026-11-10')
    expect(diasAte('2026-11-08', '2026-11-26')).toBe(18)
    expect(diasAte('2026-11-08', '2026-11-08')).toBe(0)
    expect(inicioDaSemana('2026-11-08')).toBe('2026-11-02')
    expect(inicioDaSemana('2026-11-10')).toBe('2026-11-09')
    expect(formatarDuracao(125 * MIN)).toBe('2h05')
    expect(formatarDuracao(120 * MIN)).toBe('2h')
    expect(formatarDuracao(45 * MIN)).toBe('45 min')
    expect(formatarRelogio(3_725_000)).toBe('01:02:05')
  })
})
