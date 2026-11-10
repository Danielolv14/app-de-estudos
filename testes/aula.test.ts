// Aula da IA (o professor da sessão) e a sigla da matéria: o que é texto puro e o fluxo com um Claude de mentira.
import { createRequire } from 'node:module'
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ArquivoCanvas, Aula, ConteudoAula } from '../src/shared/tipos'
import { siglaAutomatica, siglaDe, tituloSemMateria } from '../src/shared/sigla'
import { sugerirPdfs } from '../src/shared/canvas'
import { validarAula, validarExercicios, validarRespostaProfessor } from '../src/shared/respostas-ia'
import { aulaEmMarkdown, nomeArquivoAula } from '../src/shared/aula'
import { Banco } from '../src/main/banco'
import { Repositorio } from '../src/main/repositorio'
import { prepararDados } from '../src/main/seed'
import { Assistente } from '../src/main/assistente'
import type { ChamadaClaude, RespostaClaude } from '../src/main/claude'

const wasm = createRequire(import.meta.url).resolve('sql.js/dist/sql-wasm.wasm')
const AGORA = new Date(2026, 10, 10, 14, 0).getTime()

describe('sigla da matéria', () => {
  it('monta pelas iniciais, pelas 3 primeiras letras ou com o número no fim', () => {
    expect(siglaAutomatica('Engenharia de Requisitos de Software')).toBe('ERS')
    expect(siglaAutomatica('Interação Humano-Computador')).toBe('IHC')
    expect(siglaAutomatica('Cálculo')).toBe('CAL')
    expect(siglaAutomatica('Arquitetura')).toBe('ARQ')
    expect(siglaAutomatica('Cálculo II')).toBe('CAL2')
    expect(siglaAutomatica('Algoritmos e Estruturas de Dados II')).toBe('AED2')
    expect(siglaAutomatica('Trabalho Interdisciplinar: Desenvolvimento de Aplicações Móveis')).toBe('TI')
    expect(siglaAutomatica('Física 3')).toBe('FIS3')
    expect(siglaAutomatica('')).toBe('?')
  })

  it('a sigla escrita em Ajustes vale mais que a automática', () => {
    expect(siglaDe({ nome: 'Cálculo', sigla: '' })).toBe('CAL')
    expect(siglaDe({ nome: 'Cálculo', sigla: ' calc1 ' })).toBe('CALC1')
  })

  it('tira o nome da matéria do fim do título, porque a sigla já diz', () => {
    expect(tituloSemMateria('Prova 3 de Cálculo', 'Cálculo')).toBe('Prova 3')
    expect(tituloSemMateria('Prova 3 de Calculo', 'Cálculo')).toBe('Prova 3')
    expect(tituloSemMateria('Lista 2 - Arquitetura', 'Arquitetura')).toBe('Lista 2')
    expect(tituloSemMateria('Cálculo', 'Cálculo')).toBe('Cálculo')
    expect(tituloSemMateria('Atividade avaliativa 2', 'Cálculo')).toBe('Atividade avaliativa 2')
    // Só tira quando é a matéria inteira, não um pedaço de palavra.
    expect(tituloSemMateria('Pré-cálculo', 'Cálculo')).toBe('Pré-cálculo')
  })
})

describe('sugestão de PDFs do Canvas', () => {
  const pdf = (id: number, nome: string, modulo = ''): ArquivoCanvas => ({ id, cursoId: 1, nome, tamanho: 1000, modulo })
  const arquivos = [
    pdf(1, 'Plano de ensino.pdf', 'Informações gerais'),
    pdf(2, 'Slides 3.9 - Taxas relacionadas.pdf', 'Unidade 3'),
    pdf(3, 'Lista 3 - Derivadas.pdf', 'Unidade 3: Derivadas'),
    pdf(4, 'Aula 05 - Desempenho.pdf', 'Arquitetura'),
    pdf(5, 'Slides 3.4 - Regra da cadeia.pdf', 'Unidade 3: Derivadas')
  ]

  it('acha pelo número da seção e pelas palavras do tema, do mais parecido ao menos', () => {
    expect(sugerirPdfs(arquivos, '3.9 taxas relacionadas (1, 3, 5, 7)').map((a) => a.id)).toEqual([2])
    expect(sugerirPdfs(arquivos, 'Derivadas: regra da cadeia').map((a) => a.id)).toEqual([5, 3])
    expect(sugerirPdfs(arquivos, 'Lei de Amdahl e desempenho').map((a) => a.id)).toEqual([4])
  })

  it('os números entre parênteses são exercícios, não o assunto', () => {
    // "(3)" não pode puxar a "Lista 3".
    expect(sugerirPdfs(arquivos, 'revisão geral (3)')).toEqual([])
  })

  it('sem nada parecido, volta vazio', () => {
    expect(sugerirPdfs(arquivos, 'árvores AVL')).toEqual([])
    expect(sugerirPdfs(arquivos, '')).toEqual([])
  })
})

const AULA_IA = {
  titulo: 'Regra da cadeia',
  objetivo: 'Derivar funções compostas.',
  roteiro: ['Teoria (15 min)', 'Exercícios (30 min)'],
  secoes: [
    { titulo: 'A ideia', texto: 'Derive de fora para dentro.', formulas: ["(f(g(x)))' = f'(g(x)) g'(x)", ''], exemplo: { enunciado: 'Derive (3x+1)^2', resolucao: '6(3x+1)' } },
    { titulo: '', texto: 'Teoria sem exemplo.', formulas: [], exemplo: null },
    { titulo: 'Vazia', texto: '', formulas: [], exemplo: null }
  ],
  armadilhas: ['Esquecer a derivada de dentro.'],
  exercicios: [
    { numero: 7, enunciado: 'Derive sen(x²).', origem: 'slide 12 de Slides.pdf', nivel: 'facil', dica: 'Fora é o seno.', resolucao: 'cos(x²)·2x', resposta: '2x cos(x²)' },
    { numero: 7, enunciado: 'Derive e^(2x).', origem: '', nivel: 'impossivel', dica: '', resolucao: '2e^(2x)', resposta: '2e^(2x)' },
    { enunciado: '', resolucao: 'sem enunciado não entra' }
  ],
  fontes: ['C:\\Users\\x\\aula-nova\\Slides 3.4.pdf', 'livro-inventado.pdf', 'slides 3.4.PDF'],
  avisos: ''
}

describe('validação da aula da IA', () => {
  it('confere as partes, numera os exercícios e só aceita fontes que existem', () => {
    const c = validarAula(AULA_IA, ['Slides 3.4.pdf', 'Lista 3.pdf'])
    expect(c.titulo).toBe('Regra da cadeia')
    expect(c.secoes).toHaveLength(2)
    expect(c.secoes[0].formulas).toEqual(["(f(g(x)))' = f'(g(x)) g'(x)"])
    expect(c.secoes[0].exemplo).toEqual({ enunciado: 'Derive (3x+1)^2', resolucao: '6(3x+1)' })
    expect(c.secoes[1]).toMatchObject({ titulo: 'Parte 2', exemplo: null })
    expect(c.exercicios.map((e) => [e.numero, e.nivel])).toEqual([
      [1, 'facil'],
      [2, 'medio']
    ])
    expect(c.fontes).toEqual(['Slides 3.4.pdf'])
  })

  it('sem explicação nenhuma, não serve', () => {
    expect(() => validarAula({ ...AULA_IA, secoes: [] }, [])).toThrow(/explicação/)
    expect(() => validarAula(null, [])).toThrow()
  })

  it('exercícios novos continuam a numeração da aula', () => {
    expect(validarExercicios(AULA_IA.exercicios, 7).map((e) => e.numero)).toEqual([7, 8])
    expect(validarExercicios('lixo', 1)).toEqual([])
  })

  it('a resposta do professor só marca exercício que existe, com situação conhecida', () => {
    expect(validarRespostaProfessor({ resposta: 'Certo!', exercicio: 2, situacao: 'acertei' }, [1, 2])).toEqual({
      resposta: 'Certo!',
      exercicio: 2,
      situacao: 'acertei'
    })
    expect(validarRespostaProfessor({ resposta: 'Hum', exercicio: 9, situacao: 'errei' }, [1, 2])).toMatchObject({ exercicio: null, situacao: null })
    expect(validarRespostaProfessor({ resposta: 'Hum', exercicio: 1, situacao: 'talvez' }, [1, 2])).toMatchObject({ exercicio: null, situacao: null })
    expect(validarRespostaProfessor({ resposta: 'Explicação', exercicio: null, situacao: null }, [1])).toMatchObject({ exercicio: null })
    expect(() => validarRespostaProfessor({ resposta: '  ' }, [1])).toThrow(/não respondeu/)
  })
})

describe('aula em Markdown para o vault', () => {
  const conteudo: ConteudoAula = validarAula(AULA_IA, ['Slides 3.4.pdf'])
  const aula: Aula = {
    id: 1,
    tarefaId: null,
    materiaId: 1,
    tema: 'Regra da cadeia\nexercícios 1 a 5',
    criadaEm: AGORA,
    atualizadaEm: AGORA,
    conteudo,
    progresso: { '1': 'errei' },
    conversa: [
      { de: 'aluno', texto: 'Deu cos(x²)', quando: AGORA, fotos: ['resposta-1.jpg'], exercicio: 1 },
      { de: 'professor', texto: 'Faltou o 2x.', quando: AGORA, fotos: [], exercicio: 1 }
    ],
    materiais: ['Slides 3.4.pdf']
  }

  it('segue o formato das notas de estudo: partes, fórmulas, exercícios e o gabarito no fim', () => {
    const md = aulaEmMarkdown(aula, 'Cálculo')
    expect(md.startsWith('---\ntipo: estudo\n')).toBe(true)
    expect(md).toContain('# Regra da cadeia')
    expect(md).toContain('Aula de **Cálculo**')
    expect(md).toContain('Tema: Regra da cadeia exercícios 1 a 5.')
    expect(md).toContain('## Parte 1: A ideia')
    expect(md).toContain("```\n(f(g(x)))' = f'(g(x)) g'(x)\n```")
    expect(md).toContain('**1.** Derive sen(x²). *(slide 12 de Slides.pdf)* (errei)')
    expect(md.indexOf('## Exercícios')).toBeLessThan(md.indexOf('## Gabarito'))
    expect(md).toContain('**Resposta:** 2x cos(x²)')
    expect(md).toContain('**Eu:** Deu cos(x²) *(mandei uma foto)*')
    expect(md).not.toMatch(/\n{3,}/)
  })

  it('o nome do arquivo não tem caractere que o Windows recusa', () => {
    expect(nomeArquivoAula('CAL', 'Limites: 0/0 e "∞"?')).toBe('CAL - Limites 0 0 e ∞.md')
    expect(nomeArquivoAula('', 'Limites')).toBe('Limites.md')
    expect(nomeArquivoAula('', '???')).toBe('Aula.md')
  })
})

// ---------- Fluxo com um Claude de mentira ----------

type Fila = (c: ChamadaClaude) => RespostaClaude | Promise<RespostaClaude>
const ok = (dados: unknown): RespostaClaude => ({ ok: true, dados, segundos: 3, tokensEntrada: 1000, tokensSaida: 200 })

async function montar(respostas: Fila[] = []) {
  const repo = new Repositorio(await Banco.abrir(null, wasm))
  prepararDados(repo)
  const pastaDados = mkdtempSync(join(tmpdir(), 'aula-'))
  const chamadas: ChamadaClaude[] = []
  let relogio = AGORA
  const ia = new Assistente(repo, {
    pastaDados,
    agora: () => relogio,
    mudou: () => undefined,
    acharExe: () => 'claude.exe',
    rodar: async (c) => {
      chamadas.push(c)
      const r = respostas.shift()
      if (!r) throw new Error('chamada a mais')
      return r(c)
    }
  })
  return { repo, ia, chamadas, pastaDados, andar: (ms: number) => (relogio += ms) }
}

const arquivo = (pasta: string, nome: string) => {
  const p = join(pasta, nome)
  writeFileSync(p, 'x')
  return p
}

describe('aula com a IA', () => {
  /** Monta uma aula de Cálculo; `depois` são as próximas respostas da IA. */
  async function comAula(depois: Fila[] = []) {
    const m = await montar([() => ok(AULA_IA), ...depois])
    const fora = mkdtempSync(join(tmpdir(), 'material-'))
    const doCanvas = arquivo(fora, 'Slides 3.4.pdf')
    const doPc = arquivo(fora, 'lista#3 derivadas!.pdf')
    const calculo = m.repo.materias().find((x) => x.nome === 'Cálculo')!
    const tarefa = m.repo.tarefas().find((t) => t.materiaId === calculo.id && !t.feita)!
    let pedidos: number[] = []
    const r = await m.ia.montarAula(
      { tarefaId: tarefa.id, materiaId: calculo.id, tema: 'Regra da cadeia', arquivosCanvas: [7001], arquivosPc: [doPc], pedido: 'mais contas' },
      async (ids) => {
        pedidos = ids
        return [doCanvas]
      }
    )
    return { ...m, r, pedidos, calculo, tarefa }
  }

  it('monta a aula com o material do professor e guarda a pasta para as perguntas depois', async () => {
    const { repo, ia, chamadas, pastaDados, r, pedidos, calculo, tarefa } = await comAula()
    expect(r).toEqual({ ok: true, mensagem: 'Aula pronta: 2 partes e 2 exercícios.' })
    expect(pedidos).toEqual([7001])
    const c = chamadas[0]
    expect(c).toMatchObject({ modelo: 'opus', esforco: 'high', limiteMs: 12 * 60_000 })
    expect(c.pedido).toContain('Matéria: Cálculo')
    expect(c.pedido).toContain('Tema da sessão: Regra da cadeia')
    expect(c.pedido).toContain(`Tarefa do plano: ${tarefa.titulo}`)
    expect(c.pedido).toContain('Pedido do aluno: mais contas')
    // O material foi copiado com o nome original (limpo), e o pedido cita os dois.
    expect(c.pedido).toContain('Slides 3.4.pdf')
    expect(c.pedido).toContain('lista_3 derivadas_.pdf')

    const [resumo] = repo.aulas()
    expect(resumo).toMatchObject({ tarefaId: tarefa.id, materiaId: calculo.id, titulo: 'Regra da cadeia', exercicios: 2, feitos: 0, certos: 0 })
    const aula = repo.aula(resumo.id)!
    expect(aula.materiais.sort()).toEqual(['Slides 3.4.pdf', 'lista_3 derivadas_.pdf'])
    expect(aula.conteudo.fontes).toEqual(['Slides 3.4.pdf'])
    expect(readdirSync(ia.pastaAula(aula.id)).sort()).toEqual(['Slides 3.4.pdf', 'lista_3 derivadas_.pdf'])
    expect(existsSync(join(pastaDados, 'ia', 'aula-nova'))).toBe(false)
  })

  it('sem tema ou com material de formato errado, nem chama a IA', async () => {
    const { ia, chamadas } = await montar()
    const base = { tarefaId: null, materiaId: null, arquivosCanvas: [], arquivosPc: [], pedido: '' }
    expect(await ia.montarAula({ ...base, tema: '  ' }, async () => [])).toMatchObject({ ok: false, mensagem: 'Escreva o tema da aula.' })
    expect(await ia.montarAula({ ...base, tema: 'x', arquivosPc: ['C:/a.docx'] }, async () => [])).toMatchObject({ ok: false })
    expect(chamadas).toHaveLength(0)
  })

  it('o professor corrige a resposta, marca o exercício e a conversa fica salva', async () => {
    const m = await comAula([() => ok({ resposta: 'Faltou multiplicar por 2x.', exercicio: 1, situacao: 'errei' })])
    const aulaId = m.repo.aulas()[0].id
    const fotos = mkdtempSync(join(tmpdir(), 'fotos-'))
    const foto = arquivo(fotos, 'IMG_2031.jpg')
    m.andar(60_000)
    const r = await m.ia.perguntar({ aulaId, texto: 'Deu cos(x²)', fotos: [foto], exercicio: 1 })
    expect(r).toEqual({ ok: true, mensagem: 'Exercício 1: errado. Veja a resposta do professor.' })
    const c = m.chamadas.at(-1)!
    expect(c.pasta).toBe(m.ia.pastaAula(aulaId))
    expect(c.pedido).toContain('Deu cos(x²)')
    expect(c.pedido).toContain('Slides 3.4.pdf')
    expect(c.esforco).toBe('medium')

    const aula = m.repo.aula(aulaId)!
    expect(aula.progresso).toEqual({ '1': 'errei' })
    expect(aula.conversa).toHaveLength(2)
    expect(aula.conversa[0]).toMatchObject({ de: 'aluno', texto: 'Deu cos(x²)', exercicio: 1 })
    expect(aula.conversa[0].fotos).toHaveLength(1)
    expect(existsSync(join(m.ia.pastaAula(aulaId), aula.conversa[0].fotos[0]))).toBe(true)
    expect(aula.conversa[1]).toMatchObject({ de: 'professor', texto: 'Faltou multiplicar por 2x.', exercicio: 1 })
    expect(m.repo.aulas()[0]).toMatchObject({ feitos: 1, certos: 0, paraRever: [expect.stringContaining('exercício 1')] })
  })

  it('se a IA falhar, nada entra na conversa', async () => {
    const m = await comAula([() => ({ ok: false, mensagem: 'Sem internet.', segundos: 1 })])
    const aulaId = m.repo.aulas()[0].id
    expect(await m.ia.perguntar({ aulaId, texto: 'Por quê?', fotos: [], exercicio: null })).toEqual({ ok: false, mensagem: 'Sem internet.' })
    expect(m.repo.aula(aulaId)!.conversa).toEqual([])
    expect(await m.ia.perguntar({ aulaId, texto: ' ', fotos: [], exercicio: null })).toMatchObject({ ok: false })
    expect(await m.ia.perguntar({ aulaId, texto: 'x', fotos: ['C:/foto.heic'], exercicio: null })).toMatchObject({
      ok: false,
      mensagem: expect.stringContaining('HEIC')
    })
  })

  it('mais exercícios entram no fim, focando nos errados, e o Daniel marca os dele à mão', async () => {
    const novos = { exercicios: [{ enunciado: 'Derive e^(x³).', nivel: 'medio', resolucao: '3x²e^(x³)', resposta: '3x²e^(x³)' }] }
    const m = await comAula([() => ok(novos)])
    const aulaId = m.repo.aulas()[0].id
    m.ia.marcarExercicio(aulaId, 2, 'errei')
    m.ia.marcarExercicio(aulaId, 99, 'acertei')
    expect(m.repo.aula(aulaId)!.progresso).toEqual({ '2': 'errei' })

    expect(await m.ia.maisExercicios(aulaId, '')).toEqual({ ok: true, mensagem: '1 exercício novo no fim da aula.' })
    expect(m.chamadas.at(-1)!.pedido).toContain('errou o exercício 2')
    const aula = m.repo.aula(aulaId)!
    expect(aula.conteudo.exercicios.map((e) => e.numero)).toEqual([1, 2, 3])
    expect(aula.progresso).toEqual({ '2': 'errei' })

    m.ia.marcarExercicio(aulaId, 2, null)
    expect(m.repo.aula(aulaId)!.progresso).toEqual({})

    m.ia.removerAula(aulaId)
    expect(m.repo.aulas()).toEqual([])
    expect(existsSync(m.ia.pastaAula(aulaId))).toBe(false)
  })
})
