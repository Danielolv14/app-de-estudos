// As tarefas de IA com um Claude de mentira: confere o que vai para a IA, o que volta para o banco e o registro de uso.
import { createRequire } from 'node:module'
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Banco } from '../src/main/banco'
import { Repositorio } from '../src/main/repositorio'
import { prepararDados } from '../src/main/seed'
import { Assistente } from '../src/main/assistente'
import type { ChamadaClaude, RespostaClaude } from '../src/main/claude'

const wasm = createRequire(import.meta.url).resolve('sql.js/dist/sql-wasm.wasm')
const AGORA = new Date(2026, 10, 10, 14, 0).getTime()
const NL = String.fromCharCode(10)

type Fila = (c: ChamadaClaude) => RespostaClaude | Promise<RespostaClaude>
const ok = (dados: unknown): RespostaClaude => ({ ok: true, dados, segundos: 3, tokensEntrada: 1000, tokensSaida: 200 })

async function montar(respostas: Fila[] = [], exe: string | null = 'claude.exe') {
  const repo = new Repositorio(await Banco.abrir(null, wasm))
  prepararDados(repo)
  const pastaDados = mkdtempSync(join(tmpdir(), 'assistente-'))
  const chamadas: ChamadaClaude[] = []
  let mudancas = 0
  const ia = new Assistente(repo, {
    pastaDados,
    agora: () => AGORA,
    mudou: () => mudancas++,
    acharExe: () => exe,
    rodar: async (c) => {
      chamadas.push(c)
      const r = respostas.shift()
      if (!r) throw new Error('chamada a mais')
      return r(c)
    }
  })
  return { repo, ia, chamadas, pastaDados, mudancas: () => mudancas }
}

const arquivo = (pasta: string, nome: string) => {
  const p = join(pasta, nome)
  writeFileSync(p, 'x')
  return p
}

describe('assistente de IA', () => {
  it('testa a conexão, registra o uso e guarda o resultado para a tela', async () => {
    const { repo, ia, chamadas, mudancas } = await montar([() => ok({ ok: true })])
    const r = await ia.testar()
    expect(r).toEqual({ ok: true, mensagem: 'O Claude Code está funcionando com o Opus.' })
    expect(chamadas[0]).toMatchObject({ exe: 'claude.exe', modelo: 'opus', esforco: 'low', limiteMs: 120_000 })
    expect(chamadas[0].pasta).toMatch(/[\\/]ia[\\/]teste$/)
    expect(repo.usoIaDesde(0)).toEqual({ usos: 1, tokens: 1200 })
    expect(ia.estado()).toMatchObject({ claude: 'claude.exe', trabalho: null, ultimo: { tipo: 'teste', ok: true }, usosMes: 1 })
    expect(mudancas()).toBeGreaterThan(1)
  })

  it('sem o Claude Code, avisa sem chamar nada', async () => {
    const { ia, chamadas } = await montar([], null)
    expect(await ia.testar()).toMatchObject({ ok: false, mensagem: expect.stringContaining('Não achei o Claude Code') })
    expect(chamadas).toHaveLength(0)
  })

  it('erro da IA vira mensagem, conta como uso que falhou e não cria nada', async () => {
    const { repo, ia } = await montar([() => ({ ok: false, mensagem: 'O Claude Code deste PC não está logado.', segundos: 1 })])
    const r = await ia.gerarSimulado({ materiaId: repo.materias()[0].id, eventoId: null, conteudos: 'derivadas', duracaoMin: 60, modelo: null, observacoes: '' })
    expect(r).toEqual({ ok: false, mensagem: 'O Claude Code deste PC não está logado.' })
    expect(repo.simulados()).toHaveLength(0)
    expect(repo.usoIaDesde(0).usos).toBe(0)
    expect(repo.banco.um('SELECT COUNT(*) AS n FROM ia_usos WHERE ok = 0')?.n).toBe(1)
    expect(ia.estado().ultimo).toMatchObject({ tipo: 'gerar-simulado', ok: false })
  })

  it('faz uma tarefa por vez e cancela pelo sinal', async () => {
    let sinal: AbortSignal | undefined
    const { ia } = await montar([
      (c) =>
        new Promise((resolver) => {
          sinal = c.sinal
          c.sinal!.addEventListener('abort', () => resolver({ ok: false, mensagem: 'Cancelado.', segundos: 1 }))
        })
    ])
    const primeira = ia.testar()
    await Promise.resolve()
    expect(ia.ocupado()).toBe(true)
    expect(ia.estado().trabalho).toMatchObject({ tipo: 'teste', descricao: 'Testando o Claude Code', desde: AGORA })
    expect(await ia.testar()).toMatchObject({ ok: false, mensagem: expect.stringContaining('já está trabalhando') })
    ia.cancelar()
    expect(sinal?.aborted).toBe(true)
    expect(await primeira).toEqual({ ok: false, mensagem: 'Cancelado.' })
    expect(ia.ocupado()).toBe(false)
  })

  it('gera o simulado com o conteúdo, a meta e a prova modelo, valendo o que a avaliação vale', async () => {
    const { repo, ia, chamadas, pastaDados } = await montar([
      () =>
        ok({
          titulo: 'Simulado da P3',
          instrucoes: 'Sem calculadora.',
          questoes: [
            { enunciado: 'Derive x³', pontos: 10, conteudo: '3.1', resolucao: '3x²', resposta: '3x²' },
            { enunciado: 'Otimize', pontos: 10, conteudo: '4.7', resolucao: '...', resposta: '' }
          ]
        })
    ])
    const calc = repo.materias().find((m) => m.nome === 'Cálculo')!
    const p3 = repo.eventos().find((e) => e.titulo === 'Prova 3 de Cálculo')!
    repo.salvarEvento({ ...p3, conteudo: '4.1 extremos' })
    const s = repo.abrirSessao({ tarefaId: null, materiaId: calc.id, dia: '2026-11-09', inicio: 1 })
    repo.fecharSessao(s, { fim: 2, estudoSeg: 60, pausaSeg: 0, antesDaMeta: false, checkinTravou: 'regra da cadeia' })
    const modelo = arquivo(mkdtempSync(join(tmpdir(), 'modelo-')), 'P2 antiga.PDF')

    const r = await ia.gerarSimulado({ materiaId: calc.id, eventoId: p3.id, conteudos: ' 4.1 extremos ', duracaoMin: 100, modelo, observacoes: 'mais contas' })
    expect(r).toEqual({ ok: true, mensagem: 'Simulado pronto: 2 questões, 25 pontos.' })
    const c = chamadas[0]
    expect(c).toMatchObject({ esforco: 'high', limiteMs: 600_000 })
    expect(c.pedido).toContain('4.1 extremos')
    expect(c.pedido).toContain('regra da cadeia')
    expect(c.pedido).toContain('mais contas')
    expect(c.pedido).toContain('25')
    expect(readdirSync(c.pasta)).toEqual(['modelo.pdf'])
    expect(c.pasta.startsWith(pastaDados)).toBe(true)

    const [sim] = repo.simulados()
    expect(sim).toMatchObject({ materiaId: calc.id, eventoId: p3.id, conteudos: '4.1 extremos', duracaoMin: 100, criadoEm: AGORA, fotos: [], correcao: null })
    expect(sim.prova.questoes.map((q) => q.pontos)).toEqual([12.5, 12.5])

    expect(await ia.gerarSimulado({ materiaId: calc.id, eventoId: null, conteudos: '', duracaoMin: 60, modelo: 'prova.docx', observacoes: '' })).toMatchObject({
      ok: false,
      mensagem: expect.stringContaining('PDF, JPG ou PNG')
    })
  })

  it('guarda as fotos, recusa HEIC e corrige pela pasta do simulado', async () => {
    const { repo, ia, chamadas } = await montar([
      () =>
        ok({
          questoes: [{ numero: 1, nota: 4, situacao: 'parcial', acertos: 'montou', erros: 'conta' }],
          resumo: 'Quase.',
          pontosFracos: ['conta'],
          sugestoes: [{ titulo: 'Refazer a 1', detalhe: '', minutos: 30 }],
          avisos: ''
        })
    ])
    const id = repo.criarSimulado({
      materiaId: repo.materias()[0].id,
      eventoId: null,
      conteudos: '',
      duracaoMin: 30,
      criadoEm: AGORA,
      prova: { titulo: 'S', instrucoes: '', questoes: [{ numero: 1, enunciado: 'q', pontos: 10, conteudo: '', resolucao: '', resposta: '' }] }
    })
    expect(await ia.corrigirSimulado(id)).toMatchObject({ ok: false, mensagem: expect.stringContaining('Adicione as fotos') })

    const origem = mkdtempSync(join(tmpdir(), 'fotos-'))
    const r = ia.adicionarFotos(id, [arquivo(origem, 'a.JPG'), arquivo(origem, 'b.png'), arquivo(origem, 'c.heic')])
    expect(r).toMatchObject({ ok: true, mensagem: expect.stringContaining('HEIC') })
    expect(repo.simulado(id)!.fotos).toEqual(['foto-1.jpg', 'foto-2.png'])
    ia.removerFoto(id, 'foto-1.jpg')
    expect(existsSync(join(ia.pastaSimulado(id), 'foto-1.jpg'))).toBe(false)
    ia.adicionarFotos(id, [arquivo(origem, 'd.webp')])
    expect(repo.simulado(id)!.fotos).toEqual(['foto-2.png', 'foto-3.webp'])

    const c = await ia.corrigirSimulado(id)
    expect(c).toEqual({ ok: true, mensagem: 'Correção pronta: 4 de 10 (estimativa).' })
    expect(chamadas[0].pasta).toBe(ia.pastaSimulado(id))
    expect(chamadas[0].pedido).toContain(join(ia.pastaSimulado(id), 'foto-2.png'))
    expect(chamadas[0].limiteMs).toBe(12 * 60_000)
    expect(repo.simulado(id)!.correcao).toMatchObject({ nota: 4, total: 10, resumo: 'Quase.', corrigidaEm: AGORA })

    ia.removerSimulado(id)
    expect(repo.simulado(id)).toBeUndefined()
    expect(existsSync(ia.pastaSimulado(id))).toBe(false)
  })

  it('lê o plano de ensino e deixa para revisar, sem mexer no calendário', async () => {
    const { repo, ia, chamadas } = await montar([
      () =>
        ok({
          materia: 'Cálculo I (nome do PDF)',
          avaliacoes: [{ titulo: 'P1', tipo: 'prova', data: '2027-04-10', pontos: 30, conteudo: 'limites' }],
          aulas: [{ data: '2027-03-01', conteudo: 'Apresentação' }],
          bibliografia: ['STEWART'],
          observacoes: ''
        })
    ])
    const pdf = arquivo(mkdtempSync(join(tmpdir(), 'pdf-')), 'Plano de ensino.pdf')
    expect(await ia.lerPlanoEnsino(join(tmpdir(), 'plano.docx'), null)).toMatchObject({ ok: false })
    const eventosAntes = repo.eventos().length
    const calc = repo.materias()[0]

    const r = await ia.lerPlanoEnsino(pdf, calc.id)
    expect(r.ok).toBe(true)
    expect(readdirSync(chamadas[0].pasta)).toEqual(['plano.pdf'])
    expect(chamadas[0].pedido).toContain(join(chamadas[0].pasta, 'plano.pdf'))
    expect(repo.leituraPlano()).toMatchObject({ arquivo: 'Plano de ensino.pdf', materiaId: calc.id, materia: calc.nome, lidaEm: AGORA })
    expect(repo.eventos()).toHaveLength(eventosAntes)
  })

  it('replaneja com a situação do plano e guarda só as mudanças válidas como proposta', async () => {
    const { repo, ia, chamadas } = await montar([
      (c) => {
        const json = c.pedido.split('A situação atual, em JSON:' + NL)[1].split(NL + NL + 'Devolva')[0]
        const situacao = JSON.parse(json) as {
          tarefasPendentes: { id: number; data: string }[]
        }
        const futura = situacao.tarefasPendentes.find((t) => t.data >= '2026-11-10')!
        return ok({
          resumo: 'Movi uma.',
          mudancas: [
            { tipo: 'mover', tarefaId: futura.id, data: '2026-11-20', motivo: 'folga' },
            { tipo: 'remover', tarefaId: 9999, motivo: 'não existe' }
          ]
        })
      }
    ])
    const r = await ia.replanejar()
    expect(r).toEqual({ ok: true, mensagem: 'A IA sugeriu 1 mudança. Revise na tela Plano antes de aplicar.' })
    expect(ia.estado().ultimo).toMatchObject({ tipo: 'replanejar', ok: true })
    expect(chamadas[0].pedido).toContain('"semanaPadrao"')
    expect(chamadas[0].pedido).toContain('Prova 3 de Cálculo')
    expect(repo.propostaPlano()).toMatchObject({ criadaEm: AGORA, resumo: 'Movi uma.', descartadas: 1, mudancas: [{ id: 1, tipo: 'mover', data: '2026-11-20' }] })
  })

  it('a situação do plano tem a semana padrão em ordem, as avaliações futuras e as pendentes', async () => {
    const { ia } = await montar()
    const s = ia.situacaoPlano('2026-11-10') as {
      hoje: string
      semanaPadrao: { dia: string; materia: string; horas: number }[]
      avaliacoesFuturas: { titulo: string; conteudo: string }[]
      tarefasPendentes: { atrasada: boolean }[]
    }
    expect(s.hoje).toBe('2026-11-10 (terça)')
    expect(s.semanaPadrao.map((b) => `${b.dia} ${b.materia} ${b.horas}`)).toEqual(['terça Cálculo 2', 'quarta Cálculo 2', 'quinta Cálculo 2', 'sexta Arquitetura 2'])
    expect(s.avaliacoesFuturas.find((a) => a.titulo === 'Prova 3 de Cálculo')?.conteudo).toContain('taxas relacionadas')
    expect(s.tarefasPendentes.some((t) => t.atrasada)).toBe(true)
  })
})
