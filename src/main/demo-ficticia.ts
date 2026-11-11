// Dados fictícios para o vídeo de demonstração (--video) e para prints com --ficticio: três matérias do fim do curso
// de Engenharia de Software, com notas, plano, Canvas, simulado e aula inventados. Só rodam num banco vazio,
// numa pasta de dados temporária.
import type { ArquivoCanvas, ConteudoAula, CursoCanvas, ItemCanvas, Mudanca } from '@shared/tipos'
import { compararCanvas } from '@shared/canvas'
import { dataLocal, somarDias } from '@shared/regras'
import type { Repositorio } from './repositorio'

const HORA = 3_600_000
const RECEITA = 'Leia o resumo da aula (10 min), resolva sem olhar a resposta e use os últimos 15 min para conferir e anotar os erros.'

// Matérias do fim do curso de Engenharia de Software.
const GP = 'Gerência de Projetos'
const SD = 'Sistemas Distribuídos'
const TS = 'Teste de Software'

type Ids = { gp: number; sd: number; ts: number }

function ids(repo: Repositorio): Ids | null {
  const m = repo.materias()
  const gp = m.find((x) => x.nome === GP)
  const sd = m.find((x) => x.nome === SD)
  const ts = m.find((x) => x.nome === TS)
  return gp && sd && ts ? { gp: gp.id, sd: sd.id, ts: ts.id } : null
}

/** Matérias, plano e avaliações (com notas). Roda antes dos dados de verdade, que então não entram. */
export function semearFicticio(repo: Repositorio, agora: number): void {
  if (!repo.vazio()) return
  const hoje = dataLocal(agora)
  const d = (n: number): string => somarDias(hoje, n)
  repo.banco.transacao(() => {
    const m: Ids = {
      gp: repo.salvarMateria({ nome: GP, cor: '#7FA8FF', sigla: 'GP' }),
      sd: repo.salvarMateria({ nome: SD, cor: '#5FD3A2', sigla: 'SD' }),
      ts: repo.salvarMateria({ nome: TS, cor: '#F2C14E', sigla: 'TS' })
    }
    const tarefas: [number, keyof Ids, string, number, string?, boolean?][] = [
      [-3, 'sd', 'Revisar a aula 9 (relógios lógicos de Lamport)', 60],
      [-1, 'ts', 'Lista 4: classes de equivalência (1 a 10)', 90, '', true],
      [-1, 'sd', 'Estudar para a P2: consistência e replicação', 120, '', true],
      [0, 'gp', 'Caminho crítico e PERT (lista 4: 1 a 12)', 120, RECEITA],
      [0, 'ts', 'Conferir a correção da P2', 30],
      [1, 'ts', 'Teste de mutação e cobertura (lista 5)', 120, RECEITA],
      [2, 'sd', 'Algoritmos de eleição: valentão e anel', 90],
      [2, 'gp', 'Valor agregado: lista 4 (13 a 20)', 60, RECEITA],
      [3, 'gp', 'Gestão de riscos (slides 10 a 18)', 120, RECEITA],
      [4, 'sd', 'Trabalho 2: chat com replicação', 150],
      [6, 'gp', 'Simulado cronometrado da P2', 120, 'Faça como prova: sem consulta e com o tempo da P2.'],
      [7, 'gp', 'Refazer os erros do simulado', 90, RECEITA],
      [7, 'gp', 'Revisão final para a P2', 60]
    ]
    for (const [dia, mat, titulo, minutos, detalhe = '', feita = false] of tarefas)
      repo.salvarTarefa({ materiaId: m[mat], data: d(dia), titulo, minutos, detalhe, feita })

    type Ev = [number | null, keyof Ids | null, string, 'prova' | 'atividade' | 'aula' | 'outro', number | null, number | null, string?]
    const eventos: Ev[] = [
      // Gerência de Projetos: 26,5 de 100 até agora.
      [-27, 'gp', `Prova 1 de ${GP}`, 'prova', 25, 14, 'Escopo, EAP e estimativas'],
      [-13, 'gp', `Lista 3 de ${GP}`, 'atividade', 5, 4],
      [-6, 'gp', `Trabalho de ${GP}`, 'atividade', 10, 8.5],
      [5, 'gp', `Lista 5 de ${GP}`, 'atividade', 5, null],
      [8, 'gp', `Prova 2 de ${GP}`, 'prova', 25, null, 'Cronograma, caminho crítico, valor agregado e riscos'],
      [30, 'gp', `Prova 3 de ${GP}`, 'prova', 30, null],
      // Sistemas Distribuídos: a P2 foi ontem e a nota ainda não foi lançada (o vídeo lança).
      [-34, 'sd', `Prova 1 de ${SD}`, 'prova', 30, 21],
      [-20, 'sd', `Trabalho 1 de ${SD}`, 'atividade', 15, 13],
      [-1, 'sd', `Prova 2 de ${SD}`, 'prova', 30, null, 'Consistência, replicação e relógios lógicos'],
      [16, 'sd', `Trabalho 2 de ${SD}`, 'atividade', 25, null],
      // Teste de Software: já passou (61,5).
      [-28, 'ts', `Prova 1 de ${TS}`, 'prova', 25, 22],
      [-21, 'ts', `Lista 1 de ${TS}`, 'atividade', 10, 9.5],
      [-7, 'ts', `Lista 2 de ${TS}`, 'atividade', 10, 9],
      [-2, 'ts', `Prova 2 de ${TS}`, 'prova', 25, 21, 'Classes de equivalência, valor limite e testes de unidade'],
      [23, 'ts', `Prova 3 de ${TS}`, 'prova', 30, null],
      // Aulas e outros.
      [2, 'sd', `Aula 11 de ${SD} (eleição)`, 'aula', null, null],
      [7, 'gp', `Aula de dúvidas de ${GP}`, 'aula', null, null],
      [10, null, 'Feriado', 'outro', null, null]
    ]
    for (const [dia, mat, titulo, tipo, pontos, nota, conteudo = ''] of eventos)
      repo.salvarEvento({ materiaId: mat ? m[mat] : null, data: dia === null ? null : d(dia), titulo, tipo, pontos, meta: null, nota, conteudo })
    repo.gravarKv('versao_dados', 3) // os dados de verdade (seed) não entram por cima
  })
}

/** Os dados das telas da IA e do Canvas: constância, simulado corrigido, replanejamento, plano de ensino e aula. */
export function extrasFicticios(repo: Repositorio, agora: number): void {
  const m = ids(repo)
  if (!m) return
  const hoje = dataLocal(agora)
  const tarefas = repo.tarefas()
  const eventos = repo.eventos()

  // Três semanas de estudo, para o mapa de calor e as barras da Constância.
  const horas = [2.5, 0, 1.2, 3.4, 2, 0.5, 0, 1, 2.2, 1.8, 3, 0, 0, 1.4, 2.6, 2.1, 0.8, 3.2, 1.5, 0, 2.4]
  const rodizio = [m.gp, m.sd, m.ts]
  horas.forEach((h, i) => {
    if (h === 0) return
    const dia = somarDias(hoje, -(horas.length - i))
    const inicio = new Date(`${dia}T14:00`).getTime()
    const id = repo.abrirSessao({ tarefaId: null, materiaId: rodizio[i % 3], dia, inicio })
    repo.fecharSessao(id, { fim: inicio + h * HORA + 600_000, estudoSeg: Math.round(h * 3600), pausaSeg: 600, antesDaMeta: false })
  })

  // Simulado da P2 de Gerência de Projetos, corrigido pela foto.
  const p2 = eventos.find((e) => e.materiaId === m.gp && e.titulo === `Prova 2 de ${GP}`)
  const simulado = repo.criarSimulado({
    materiaId: m.gp,
    eventoId: p2?.id ?? null,
    conteudos: p2?.conteudo ?? 'Cronograma e valor agregado',
    duracaoMin: 100,
    criadoEm: agora - 26 * HORA,
    prova: {
      titulo: `Simulado da P2 de ${GP}`,
      instrucoes: 'Resolva à mão, mostrando as contas.',
      questoes: [
        {
          numero: 1,
          enunciado: 'Uma tarefa tem estimativa otimista de 3 dias, mais provável de 5 e pessimista de 13. Qual a estimativa PERT e o desvio padrão?',
          pontos: 3,
          conteudo: 'Estimativa de três pontos (PERT)',
          resolucao: 'E = (3 + 4 · 5 + 13) / 6 = 36 / 6 = 6 dias\nσ = (13 − 3) / 6 ≈ 1,7 dia',
          resposta: 'E = 6 dias e σ ≈ 1,7 dia'
        },
        {
          numero: 2,
          enunciado:
            'Na semana 4, o valor planejado (VP) era R$ 40 mil, o valor agregado (VA) R$ 30 mil e o custo real (CR) R$ 37,5 mil. Calcule o IDC e o IDP e diga como está o projeto.',
          pontos: 3.5,
          conteudo: 'Valor agregado',
          resolucao: 'IDC = VA / CR = 30 / 37,5 = 0,8\nIDP = VA / VP = 30 / 40 = 0,75\nOs dois abaixo de 1: acima do custo e atrasado.',
          resposta: 'IDC = 0,8 e IDP = 0,75: acima do custo e atrasado'
        },
        {
          numero: 3,
          enunciado: 'A (2 dias) e B (4 dias) começam juntas. C (5 dias) depende de A, e D (1 dia) depende de B e C. Qual o caminho crítico e a duração do projeto?',
          pontos: 3.5,
          conteudo: 'Caminho crítico',
          resolucao: 'A → C → D = 2 + 5 + 1 = 8 dias\nB → D = 4 + 1 = 5 dias\nO caminho mais longo é o crítico.',
          resposta: 'A → C → D, com 8 dias'
        }
      ]
    }
  })
  repo.atualizarSimulado(simulado, {
    iniciadoEm: agora - 25 * HORA,
    terminadoEm: agora - 23.4 * HORA,
    correcao: {
      questoes: [
        { numero: 1, nota: 3, situacao: 'certa', acertos: 'Aplicou as duas fórmulas do PERT certo.', erros: '' },
        {
          numero: 2,
          nota: 1.5,
          situacao: 'parcial',
          acertos: 'Calculou o IDC certo.',
          erros: 'Inverteu o IDP (VP / VA = 1,33) e concluiu que o projeto estava adiantado.'
        },
        {
          numero: 3,
          nota: 0.5,
          situacao: 'errada',
          acertos: 'Montou a rede de dependências certo.',
          erros: 'Pegou o caminho com menos atividades (B → D) em vez de somar as durações.'
        }
      ],
      nota: 5,
      total: 10,
      resumo: 'Estimativa está firme. O que pesou foi a interpretação: o IDP invertido e a escolha do caminho crítico.',
      pontosFracos: ['Índices de valor agregado (IDP)', 'Caminho crítico: somar as durações de cada caminho'],
      sugestoes: [
        { titulo: 'Refazer a lista de valor agregado', detalhe: 'Exercícios 4 a 9, conferindo o que vai em cima e embaixo de cada índice', minutos: 45 },
        { titulo: 'Treinar caminho crítico', detalhe: 'Os 3 exemplos do slide 12, com a ida e a volta completas', minutos: 60 }
      ],
      avisos: 'A foto 2 estava um pouco escura no fim da página.',
      corrigidaEm: agora - 23 * HORA
    }
  })
  repo.criarSimulado({
    materiaId: m.ts,
    eventoId: null,
    conteudos: 'Classes de equivalência e valor limite',
    duracaoMin: 60,
    criadoEm: agora - HORA,
    prova: {
      titulo: `Simulado de ${TS}`,
      instrucoes: '',
      questoes: [{ numero: 1, enunciado: 'Monte as classes de equivalência de um campo de idade de 18 a 65.', pontos: 10, conteudo: 'Classes', resolucao: '...', resposta: '' }]
    }
  })

  // Proposta de replanejamento, com um exemplo de cada tipo.
  const tarefa = (titulo: string) => tarefas.find((t) => t.titulo === titulo)
  const mudancas: Mudanca[] = []
  const eleicao = tarefa('Algoritmos de eleição: valentão e anel')
  if (eleicao) mudancas.push({ id: 1, tipo: 'mover', tarefaId: eleicao.id, data: somarDias(hoje, 5), motivo: 'Abre espaço na quinta para o ponto fraco do simulado.' })
  const va = tarefa('Valor agregado: lista 4 (13 a 20)')
  if (va) mudancas.push({ id: 2, tipo: 'ajustar', tarefaId: va.id, minutos: 90, titulo: null, detalhe: null, motivo: 'O simulado mostrou que valor agregado precisa de mais tempo.' })
  mudancas.push({
    id: 3,
    tipo: 'criar',
    data: somarDias(hoje, 3),
    materiaId: m.gp,
    titulo: 'Refazer as questões de caminho crítico do simulado',
    detalhe: 'Questão 3 e os exemplos do slide 12',
    minutos: 45,
    motivo: 'Ponto fraco do último simulado.'
  })
  const repetida = tarefa('Revisão final para a P2')
  if (repetida) mudancas.push({ id: 4, tipo: 'remover', tarefaId: repetida.id, motivo: 'Repetida: refazer os erros do simulado já cobre essa revisão.' })
  repo.salvarPropostaPlano({
    criadaEm: agora - 60_000,
    resumo: 'A semana estava pesada na quinta e leve na quarta. Movi uma tarefa e pus o ponto fraco do simulado antes da P2.',
    mudancas,
    descartadas: 1
  })

  repo.salvarLeituraPlano({
    arquivo: `Plano de ensino - ${GP}.pdf`,
    materiaId: m.gp,
    materia: GP,
    avaliacoes: [
      { incluir: true, titulo: 'P2', tipo: 'prova', data: somarDias(hoje, 8), pontos: 25, conteudo: 'Cronograma, caminho crítico, valor agregado e riscos' },
      { incluir: true, titulo: 'Lista 6', tipo: 'atividade', data: somarDias(hoje, 12), pontos: 5, conteudo: 'Riscos' },
      { incluir: false, titulo: 'Reavaliação', tipo: 'reavaliacao', data: null, pontos: null, conteudo: 'Todo o conteúdo' }
    ],
    aulas: [
      { incluir: true, data: somarDias(hoje, 1), conteudo: 'Valor agregado' },
      { incluir: true, data: somarDias(hoje, 3), conteudo: 'Gestão de riscos' },
      { incluir: true, data: somarDias(hoje, 8), conteudo: 'Encerramento do projeto' },
      { incluir: false, data: null, conteudo: 'Aula de dúvidas (a combinar)' }
    ],
    bibliografia: ['PMI. Guia PMBOK. 7. ed. Project Management Institute, 2021.', 'SOMMERVILLE, I. Engenharia de Software. 10. ed. Pearson, 2018.'],
    observacoes: 'A data da reavaliação não aparece no PDF.',
    lidaEm: agora - 30_000
  })

  canvasFicticio(repo, m, hoje)
  aulasFicticias(repo, m, agora)
}

/** Canvas conectado, com uma revisão aberta: um curso novo, uma prova juntada com a do app e atividades novas. */
function canvasFicticio(repo: Repositorio, m: Ids, hoje: string): void {
  const d = (n: number): string => somarDias(hoje, n)
  const cursos: CursoCanvas[] = [
    { id: 101, nome: 'GERÊNCIA DE PROJETOS DE SOFTWARE - Turma 01 (2026/2)', codigo: 'GP' },
    { id: 102, nome: 'SISTEMAS DISTRIBUÍDOS - Turma 02', codigo: 'SD' },
    { id: 103, nome: 'TESTE DE SOFTWARE - Turma 01', codigo: 'TS' },
    { id: 104, nome: 'COMPUTAÇÃO EM NUVEM - Turma 01', codigo: 'NUVEM' }
  ]
  const item = (o: Partial<ItemCanvas> & Pick<ItemCanvas, 'chave' | 'cursoId' | 'titulo'>): ItemCanvas => ({
    tipo: 'atividade',
    data: null,
    pontos: null,
    nota: null,
    conteudo: '',
    entregue: false,
    ...o
  })
  const itens: ItemCanvas[] = [
    item({ chave: 'tarefa:9001', cursoId: 101, titulo: 'P2 - Gerência de Projetos', tipo: 'prova', data: d(8), pontos: 25 }),
    item({ chave: 'tarefa:9002', cursoId: 101, titulo: 'Lista 6 - Gestão de riscos', data: d(12), pontos: 5, conteudo: 'Exercícios 2, 5, 8, 11 e 14.' }),
    item({ chave: 'tarefa:9003', cursoId: 101, titulo: 'Fórum de dúvidas', pontos: 0 }),
    item({ chave: 'tarefa:9007', cursoId: 101, titulo: 'Lista 4 - Valor agregado', data: d(-2), pontos: 5, entregue: true }),
    item({ chave: 'tarefa:9004', cursoId: 102, titulo: 'Entrega parcial do Trabalho 2', data: d(9), pontos: 0 }),
    item({ chave: 'tarefa:9005', cursoId: 104, titulo: 'Trabalho prático 1: deploy com contêineres', data: d(17), pontos: 15 }),
    item({ chave: 'evento:9006', cursoId: 104, titulo: 'Prova 1 de Computação em Nuvem', tipo: 'prova', data: d(22) })
  ]
  // A Lista 5 já foi entregue no Canvas: fica riscada no Calendário e fora dos avisos de cima.
  const lista5 = repo.eventos().find((e) => e.titulo === `Lista 5 de ${GP}`)
  if (lista5) repo.salvarEvento({ ...lista5, entregue: true })
  const vinculos: Record<string, number> = { 'curso:101': m.gp, 'curso:102': m.sd, 'curso:103': m.ts }
  if (lista5) vinculos['tarefa:9008'] = lista5.id
  const r = compararCanvas({ cursos, itens }, { materias: repo.materias(), eventos: repo.eventos(), vinculos })
  repo.gravarKv('canvas_vinculos', vinculos)
  repo.gravarKv('revisao_canvas', { criadaEm: Date.now(), cursos: r.cursos, itens: r.itens })
  repo.gravarKv('canvas_token', 'falso')
  repo.gravarKv('canvas_usuario', 'Daniel Oliveira')
  repo.gravarKv('canvas_ultima_sync', Date.now() - 42 * 60_000)
  repo.gravarKv(
    'canvas_cursos',
    cursos.map((c) => ({ id: c.id, nome: c.nome }))
  )
}

/** PDFs fictícios do curso de Gerência de Projetos, para a sugestão de material na Nova aula. */
export const ARQUIVOS_FICTICIOS_CANVAS: ArquivoCanvas[] = [
  { id: 7001, cursoId: 101, nome: 'Slides 4 - Cronograma e caminho crítico.pdf', tamanho: 2_340_000, modulo: 'Unidade 2: Tempo' },
  { id: 7002, cursoId: 101, nome: 'Lista 4 - Caminho crítico e PERT.pdf', tamanho: 410_000, modulo: 'Unidade 2: Tempo' },
  { id: 7003, cursoId: 101, nome: 'Slides 5 - Valor agregado.pdf', tamanho: 1_800_000, modulo: 'Unidade 3: Custos' },
  { id: 7004, cursoId: 101, nome: `Plano de ensino - ${GP}.pdf`, tamanho: 190_000, modulo: 'Informações gerais' },
  { id: 7005, cursoId: 101, nome: 'Slides 3 - EAP e estimativas.pdf', tamanho: 1_200_000, modulo: 'Unidade 1: Escopo' }
]

/** A aula da tarefa de hoje (Gerência de Projetos), com exercícios marcados e conversa com o professor, e uma mais antiga. */
function aulasFicticias(repo: Repositorio, m: Ids, agora: number): void {
  const hoje = dataLocal(agora)
  const tarefa = repo.tarefas().find((t) => t.data === hoje && !t.feita && t.materiaId === m.gp)
  const conteudo: ConteudoAula = {
    titulo: 'Caminho crítico e estimativa PERT',
    objetivo:
      'Montar a rede de atividades, achar o caminho crítico e a folga de cada atividade, e estimar prazos incertos com o PERT. É o que mais cai na P2.',
    roteiro: [
      'Montar a rede a partir da tabela de dependências',
      'Ida: início e término mais cedo de cada atividade',
      'Volta: início e término mais tarde',
      'Folga e caminho crítico',
      'Estimativa de três pontos (PERT)',
      'Fazer os exercícios 1 a 4 sem olhar o gabarito e mandar para o professor'
    ],
    secoes: [
      {
        titulo: 'Caminho crítico',
        texto:
          'O caminho crítico é a sequência de atividades dependentes mais longa da rede. Ele define a duração do projeto: qualquer atraso numa atividade dele atrasa a entrega.\n\nNa ida, cada atividade começa quando a última das anteriores termina (pegue o maior término). Na volta, parta do fim do projeto e pegue o menor início das que vêm depois.',
        formulas: ['TC = IC + duração', 'IT = TT − duração', 'Folga = IT − IC'],
        exemplo: {
          enunciado: 'A (3 dias) e B (5 dias) começam juntas, e C (2 dias) depende das duas. Qual a duração do projeto e qual atividade tem folga?',
          resolucao: 'C só começa quando A e B terminam: no dia 5.\nDuração: 5 + 2 = 7 dias\nCaminho crítico: B → C\nA tem folga de 5 − 3 = 2 dias'
        }
      },
      {
        titulo: 'Estimativa de três pontos (PERT)',
        texto:
          'Quando a duração é incerta, estime três valores: otimista (O), mais provável (M) e pessimista (P). A média ponderada dá mais peso ao mais provável.\n\nO desvio padrão mostra o tamanho da incerteza: quanto mais longe o pessimista do otimista, maior o risco.',
        formulas: ['E = (O + 4M + P) / 6', 'σ = (P − O) / 6'],
        exemplo: {
          enunciado: 'Uma tarefa tem O = 4, M = 6 e P = 14 dias. Qual a estimativa PERT?',
          resolucao: 'E = (4 + 4 · 6 + 14) / 6\nE = 42 / 6\nE = 7 dias'
        }
      }
    ],
    armadilhas: [
      'Na ida, pegar o menor término das anteriores: tem que ser o maior.',
      'Achar que o caminho crítico é o que tem mais atividades: é o mais longo em tempo.',
      'Esquecer que pode haver mais de um caminho crítico.',
      'No PERT, dividir por 3 em vez de 6.'
    ],
    exercicios: [
      {
        numero: 1,
        enunciado: 'Uma tarefa tem O = 2, M = 5 e P = 8 dias. Qual a estimativa PERT?',
        origem: 'Slide 9 (exemplos do professor)',
        nivel: 'facil',
        dica: 'E = (O + 4M + P) / 6.',
        resolucao: 'E = (2 + 20 + 8) / 6 = 30 / 6',
        resposta: 'E = 5 dias'
      },
      {
        numero: 2,
        enunciado: 'Qual o desvio padrão da tarefa do exercício 1?',
        origem: 'Lista 4, exercício 2',
        nivel: 'facil',
        dica: 'σ = (P − O) / 6.',
        resolucao: 'σ = (8 − 2) / 6 = 6 / 6',
        resposta: 'σ = 1 dia'
      },
      {
        numero: 3,
        enunciado: 'A (4 dias) e B (6 dias) começam juntas. C (3 dias) depende de A, e D (2 dias) depende de B e C. Qual a duração do projeto?',
        origem: 'Lista 4, exercício 7',
        nivel: 'medio',
        dica: 'Faça a ida: D só começa quando B e C terminam.',
        resolucao: 'A termina no dia 4, e C vai do 4 ao 7.\nB termina no dia 6.\nD começa no maior dos dois (7) e termina no 9.',
        resposta: '9 dias'
      },
      {
        numero: 4,
        enunciado: 'No projeto do exercício 3, qual é o caminho crítico e qual a folga de B?',
        origem: 'Slide 12 (rede de atividades)',
        nivel: 'medio',
        dica: 'Some as durações de cada caminho até D.',
        resolucao: 'A → C → D = 4 + 3 + 2 = 9 dias\nB → D = 6 + 2 = 8 dias\nFolga de B = 9 − 8 = 1 dia',
        resposta: 'A → C → D, e B tem 1 dia de folga'
      },
      {
        numero: 5,
        enunciado: 'Uma atividade do caminho crítico atrasou 2 dias, e outra fora dele, com 3 dias de folga, também atrasou 2. Quanto o projeto atrasa?',
        origem: 'Parecido com o Sommerville, cap. 23, exercício 5',
        nivel: 'dificil',
        dica: 'A folga absorve atraso; o caminho crítico não tem folga.',
        resolucao: 'A atividade crítica não tem folga: o projeto atrasa 2 dias.\nA outra usa 2 dos 3 dias de folga e não atrasa nada.',
        resposta: '2 dias'
      },
      {
        numero: 6,
        enunciado: 'O projeto do exercício 3 precisa terminar em 8 dias. Com mais uma pessoa, C cai de 3 para 2 dias. Isso basta?',
        origem: 'Criado a partir do slide 15',
        nivel: 'dificil',
        dica: 'Recalcule os dois caminhos e veja se outro vira crítico.',
        resolucao: 'A → C → D = 4 + 2 + 2 = 8 dias\nB → D = 6 + 2 = 8 dias\nOs dois ficam com 8: basta, mas agora são dois caminhos críticos.',
        resposta: 'Sim: o projeto cai para 8 dias, com dois caminhos críticos'
      }
    ],
    fontes: ['Slides 4 - Cronograma e caminho crítico.pdf', 'Lista 4 - Caminho crítico e PERT.pdf'],
    avisos: ''
  }
  const id = repo.criarAula({
    tarefaId: tarefa?.id ?? null,
    materiaId: m.gp,
    tema: tarefa ? `${tarefa.titulo}\n${tarefa.detalhe}` : conteudo.titulo,
    criadaEm: agora - 50 * 60_000,
    conteudo,
    materiais: conteudo.fontes
  })
  repo.atualizarAula(
    id,
    {
      progresso: { '1': 'acertei', '2': 'acertei', '3': 'parcial', '4': 'errei' },
      conversa: [
        { de: 'aluno', texto: 'No 4 deu B → D, porque B é a atividade mais longa.', quando: agora - 20 * 60_000, fotos: [], exercicio: 4 },
        {
          de: 'professor',
          texto:
            'Quase. O caminho crítico não é o da atividade mais longa, é o **caminho mais longo** somando as durações.\n\n1. Some cada caminho até o fim:\nA → C → D = 4 + 3 + 2 = 9 dias\nB → D = 6 + 2 = 8 dias\n2. O maior define o projeto:\n**A → C → D, com 9 dias**\n3. A folga de B é a diferença: 9 − 8 = 1 dia.\n\nMarquei como errado; o exercício 6 usa a mesma ideia e é um bom treino.',
          quando: agora - 19 * 60_000,
          fotos: [],
          exercicio: 4
        },
        { de: 'aluno', texto: 'Por que a folga das atividades do caminho crítico é zero?', quando: agora - 12 * 60_000, fotos: [], exercicio: null },
        {
          de: 'professor',
          texto:
            'Porque o caminho crítico é o mais longo: não sobra tempo nenhum nele. Se uma atividade dele atrasa um dia, o fim do projeto anda um dia junto. Nas outras, a folga é justamente quanto elas podem atrasar sem empurrar o fim.',
          quando: agora - 11 * 60_000,
          fotos: [],
          exercicio: null
        }
      ]
    },
    agora - 11 * 60_000
  )

  const antiga = repo.criarAula({
    tarefaId: null,
    materiaId: m.sd,
    tema: 'Relógios lógicos de Lamport',
    criadaEm: agora - 3 * 24 * HORA,
    materiais: ['Aula 9 - Tempo e relógios.pdf'],
    conteudo: {
      titulo: 'Relógios lógicos de Lamport',
      objetivo: 'Ordenar eventos em processos diferentes sem um relógio comum.',
      roteiro: ['Relação "aconteceu antes"', 'Regras do relógio de Lamport', 'Exercícios'],
      secoes: [
        {
          titulo: 'Regras',
          texto: 'Cada processo soma 1 antes de cada evento. Ao receber uma mensagem, pega o maior entre o seu relógio e o da mensagem, e soma 1.',
          formulas: ['L = máx(L, Lmsg) + 1'],
          exemplo: null
        }
      ],
      armadilhas: ['Esquecer de somar 1 depois de pegar o máximo.'],
      exercicios: [1, 2, 3, 4, 5].map((n) => ({
        numero: n,
        enunciado: `Exercício ${n} sobre relógios lógicos.`,
        origem: 'Lista 3',
        nivel: 'medio' as const,
        dica: '',
        resolucao: '...',
        resposta: '...'
      })),
      fontes: ['Aula 9 - Tempo e relógios.pdf'],
      avisos: ''
    }
  })
  repo.atualizarAula(antiga, { progresso: { '1': 'acertei', '2': 'acertei', '3': 'acertei', '4': 'errei', '5': 'acertei' } }, agora - 3 * 24 * HORA)
}
