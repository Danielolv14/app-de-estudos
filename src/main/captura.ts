// Dados de mentira para as capturas de tela (só com --captura-ia, numa pasta de dados temporária).
// Servem para conferir o visual das telas da IA sem chamar o Claude Code.
import type { ArquivoCanvas, ConteudoAula, CursoCanvas, ItemCanvas, Mudanca } from '@shared/tipos'
import { compararCanvas } from '@shared/canvas'
import { dataLocal, somarDias } from '@shared/regras'
import type { Repositorio } from './repositorio'

const HORA = 3_600_000

export function dadosFalsosDeIa(repo: Repositorio, agora: number): void {
  const hoje = dataLocal(agora)
  const materias = repo.materiasAtivas()
  const calculo = materias.find((m) => /c[aá]lculo/i.test(m.nome)) ?? materias[0]
  const arquitetura = materias.find((m) => m.id !== calculo?.id)
  if (!calculo) return

  // Três semanas de estudo, para o mapa de calor e as barras da Constância.
  const horas = [2.5, 0, 1.2, 3.4, 2, 0.5, 0, 0, 2.2, 1.8, 3, 0, 0, 0, 2.6, 2.1, 0.8, 3.2, 1.5, 0, 0]
  horas.forEach((h, i) => {
    if (h === 0) return
    const dia = somarDias(hoje, -(horas.length - i))
    const inicio = new Date(`${dia}T14:00`).getTime()
    const id = repo.abrirSessao({ tarefaId: null, materiaId: i % 3 === 0 && arquitetura ? arquitetura.id : calculo.id, dia, inicio })
    repo.fecharSessao(id, { fim: inicio + h * HORA + 600_000, estudoSeg: Math.round(h * 3600), pausaSeg: 600, antesDaMeta: false })
  })

  const p3 = repo.eventos().find((e) => e.materiaId === calculo.id && /p3/i.test(e.titulo))
  const corrigido = repo.criarSimulado({
    materiaId: calculo.id,
    eventoId: p3?.id ?? null,
    conteudos: p3?.conteudo ?? 'Derivadas e otimização',
    duracaoMin: 100,
    criadoEm: agora - 26 * HORA,
    prova: {
      titulo: 'Simulado da P3 de Cálculo I',
      instrucoes: 'Resolva à mão, mostrando as contas. Calculadora não é permitida.',
      questoes: [
        {
          numero: 1,
          enunciado: 'Encontre dy/dx por derivação implícita:\nx² + xy + y³ = 7',
          pontos: 3,
          conteudo: '3.5 derivação implícita',
          resolucao: "Derivando os dois lados: 2x + y + x·y' + 3y²·y' = 0.\nLogo y' = −(2x + y) / (x + 3y²).",
          resposta: "y' = −(2x + y) / (x + 3y²)"
        },
        {
          numero: 2,
          enunciado:
            'Uma escada de 5 m está apoiada numa parede. A base se afasta a 0,5 m/s. Com que velocidade o topo desce quando a base está a 3 m da parede?',
          pontos: 3.5,
          conteudo: '3.9 taxas relacionadas',
          resolucao: "x² + y² = 25. Com x = 3, y = 4. Derivando: 2x·x' + 2y·y' = 0, então y' = −(3 · 0,5) / 4 = −0,375 m/s.",
          resposta: 'O topo desce a 0,375 m/s.'
        },
        {
          numero: 3,
          enunciado: 'Ache os pontos de máximo e mínimo locais de f(x) = x³ − 6x² + 9x + 1 e diga onde f é côncava para cima.',
          pontos: 3.5,
          conteudo: '4.1 extremos e 4.3 concavidade',
          resolucao: "f'(x) = 3x² − 12x + 9 = 3(x − 1)(x − 3). Máximo local em x = 1 (f = 5), mínimo local em x = 3 (f = 1). f''(x) = 6x − 12 > 0 para x > 2.",
          resposta: 'Máx. em (1, 5), mín. em (3, 1), côncava para cima em x > 2.'
        }
      ]
    }
  })
  repo.atualizarSimulado(corrigido, {
    iniciadoEm: agora - 25 * HORA,
    terminadoEm: agora - 23.4 * HORA,
    correcao: {
      questoes: [
        { numero: 1, nota: 3, situacao: 'certa', acertos: 'Derivou os dois lados certo e isolou y′.', erros: '' },
        {
          numero: 2,
          nota: 1.5,
          situacao: 'parcial',
          acertos: 'Montou x² + y² = 25 e achou y = 4.',
          erros: 'Esqueceu o sinal: a resposta deu +0,375 m/s, mas o topo está descendo.'
        },
        { numero: 3, nota: 0.5, situacao: 'errada', acertos: 'Derivou f certo.', erros: 'Trocou máximo e mínimo e não estudou a concavidade.' }
      ],
      nota: 5,
      total: 10,
      resumo: 'Boa base em derivação. O que pesou foi a interpretação: o sinal na taxa relacionada e o teste da derivada segunda.',
      pontosFracos: ['Sinal da taxa em taxas relacionadas', 'Teste da derivada segunda para máximo e mínimo', 'Concavidade'],
      sugestoes: [
        { titulo: 'Refazer taxas relacionadas (lista 3.9)', detalhe: 'Exercícios 5 a 12, prestando atenção no sinal', minutos: 60 },
        { titulo: 'Revisar 4.3 concavidade', detalhe: 'Teste da derivada segunda e pontos de inflexão', minutos: 45 }
      ],
      avisos: 'A foto 2 estava um pouco escura no fim da página.',
      corrigidaEm: agora - 23 * HORA
    }
  })
  if (arquitetura)
    repo.criarSimulado({
      materiaId: arquitetura.id,
      eventoId: null,
      conteudos: 'Unid. 4 e 5',
      duracaoMin: 60,
      criadoEm: agora - HORA,
      prova: {
        titulo: 'Simulado de Arquitetura (Unid. 4 e 5)',
        instrucoes: '',
        questoes: [{ numero: 1, enunciado: 'Explique o que é pipeline.', pontos: 10, conteudo: 'Unid. 4', resolucao: '...', resposta: '' }]
      }
    })

  // Proposta de replanejamento com um exemplo de cada tipo.
  const futuras = repo.tarefas().filter((t) => !t.feita && t.data >= hoje)
  const mudancas: Mudanca[] = []
  if (futuras[0]) mudancas.push({ id: 1, tipo: 'mover', tarefaId: futuras[0].id, data: somarDias(futuras[0].data, 1), motivo: 'Abre espaço para revisar antes da P3.' })
  if (futuras[1])
    mudancas.push({ id: 2, tipo: 'ajustar', tarefaId: futuras[1].id, minutos: 150, titulo: null, detalhe: null, motivo: 'O simulado mostrou que concavidade precisa de mais tempo.' })
  mudancas.push({
    id: 3,
    tipo: 'criar',
    data: somarDias(hoje, 2),
    materiaId: calculo.id,
    titulo: 'Refazer taxas relacionadas (lista 3.9)',
    detalhe: 'Exercícios 5 a 12',
    minutos: 60,
    motivo: 'Ponto fraco do último simulado.'
  })
  if (futuras[2]) mudancas.push({ id: 4, tipo: 'remover', tarefaId: futuras[2].id, motivo: 'Repetida: o mesmo conteúdo já está na terça.' })
  repo.salvarPropostaPlano({
    criadaEm: agora - 60_000,
    resumo: 'A semana estava pesada na sexta e leve na quarta. Movi uma tarefa e pus a revisão do ponto fraco antes da P3.',
    mudancas,
    descartadas: 1
  })

  repo.salvarLeituraPlano({
    arquivo: 'Plano de ensino - Cálculo I.pdf',
    materiaId: calculo.id,
    materia: calculo.nome,
    avaliacoes: [
      { incluir: true, titulo: 'P3', tipo: 'prova', data: somarDias(hoje, 9), pontos: 30, conteudo: '3.5 a 4.7' },
      { incluir: true, titulo: 'Lista 4', tipo: 'atividade', data: somarDias(hoje, 5), pontos: 5, conteudo: 'Otimização' },
      { incluir: false, titulo: 'Reavaliação', tipo: 'reavaliacao', data: null, pontos: null, conteudo: 'Todo o conteúdo' }
    ],
    aulas: [
      { incluir: true, data: somarDias(hoje, 1), conteudo: '4.4 Regra de L’Hôpital' },
      { incluir: true, data: somarDias(hoje, 3), conteudo: '4.5 Esboço de gráfico' },
      { incluir: true, data: somarDias(hoje, 8), conteudo: '4.7 Otimização, exercícios' },
      { incluir: false, data: null, conteudo: 'Aula de dúvidas (a combinar)' }
    ],
    bibliografia: ['STEWART, J. Cálculo, v. 1. 8. ed. Cengage, 2017.', 'THOMAS, G. Cálculo, v. 1. 12. ed. Pearson, 2012.'],
    observacoes: 'A data da reavaliação não aparece no PDF.',
    lidaEm: agora - 30_000
  })
}

/** Canvas conectado, com uma revisão aberta: um curso novo, provas juntadas com as do app e uma atividade nova. */
export function dadosFalsosDeCanvas(repo: Repositorio): void {
  const materias = repo.materiasAtivas()
  const calculo = materias.find((m) => /c[aá]lculo/i.test(m.nome))
  const arquitetura = materias.find((m) => /arquitetura/i.test(m.nome))
  if (!calculo || !arquitetura) return
  const cursos: CursoCanvas[] = [
    { id: 101, nome: 'CÁLCULO I - Turma 01 (2026/2)', codigo: 'CALC1' },
    { id: 102, nome: 'ARQUITETURA DE COMPUTADORES - Turma 03', codigo: 'ARQ' },
    { id: 103, nome: 'ALGORITMOS E ESTRUTURAS DE DADOS II', codigo: 'AED2' }
  ]
  const item = (o: Partial<ItemCanvas> & Pick<ItemCanvas, 'chave' | 'cursoId' | 'titulo'>): ItemCanvas => ({
    tipo: 'atividade',
    data: null,
    pontos: null,
    nota: null,
    conteudo: '',
    ...o
  })
  const p3 = repo.eventos().find((e) => e.materiaId === calculo.id && e.tipo === 'prova' && e.nota === null)
  const itens: ItemCanvas[] = [
    item({ chave: 'tarefa:9001', cursoId: 101, titulo: 'P3 - Cálculo I', tipo: 'prova', data: p3?.data ?? null, pontos: 25 }),
    item({ chave: 'tarefa:9002', cursoId: 101, titulo: 'Lista 7 - Otimização', data: '2026-11-18', pontos: 2, conteudo: 'Exercícios 4.7: 3, 5, 9, 14 e 21.' }),
    item({ chave: 'tarefa:9003', cursoId: 101, titulo: 'Fórum de dúvidas', pontos: 0 }),
    item({ chave: 'tarefa:9004', cursoId: 102, titulo: 'Prova 3', tipo: 'prova', data: '2026-12-01', pontos: 30 }),
    item({ chave: 'tarefa:9005', cursoId: 103, titulo: 'Trabalho prático 2: árvores AVL', data: '2026-11-27', pontos: 15 }),
    item({ chave: 'evento:9006', cursoId: 103, titulo: 'Prova 2 de AED II', tipo: 'prova', data: '2026-12-03' })
  ]
  const vinculos = { 'curso:101': calculo.id, 'curso:102': arquitetura.id }
  const r = compararCanvas({ cursos, itens }, { materias: repo.materias(), eventos: repo.eventos(), vinculos })
  repo.gravarKv('canvas_vinculos', vinculos)
  repo.gravarKv('revisao_canvas', { criadaEm: Date.now(), cursos: r.cursos, itens: r.itens })
  repo.gravarKv('canvas_token', 'falso')
  repo.gravarKv('canvas_usuario', 'Daniel Oliveira Menezes')
  repo.gravarKv('canvas_ultima_sync', Date.now() - 42 * 60_000)
  repo.gravarKv(
    'canvas_cursos',
    cursos.map((c) => ({ id: c.id, nome: c.nome }))
  )
}

/** PDFs de mentira do curso de Cálculo, para a sugestão de material na Nova aula. */
export const ARQUIVOS_FALSOS_CANVAS: ArquivoCanvas[] = [
  { id: 7001, cursoId: 101, nome: 'Slides 3.4 e 3.5 - Regra da cadeia e derivação implícita.pdf', tamanho: 2_340_000, modulo: 'Unidade 3: Derivadas' },
  { id: 7002, cursoId: 101, nome: 'Lista 3 - Derivadas.pdf', tamanho: 410_000, modulo: 'Unidade 3: Derivadas' },
  { id: 7003, cursoId: 101, nome: 'Slides 3.9 - Taxas relacionadas.pdf', tamanho: 1_800_000, modulo: 'Unidade 3: Derivadas' },
  { id: 7004, cursoId: 101, nome: 'Plano de ensino - Cálculo I.pdf', tamanho: 190_000, modulo: 'Informações gerais' },
  { id: 7005, cursoId: 101, nome: 'Slides 4.4 - Regra de LHôpital.pdf', tamanho: 1_200_000, modulo: 'Unidade 4: Aplicações' }
]

/** Duas aulas prontas: a da tarefa de hoje (Cálculo), com exercícios marcados e conversa, e uma mais antiga. */
export function dadosFalsosDeAula(repo: Repositorio, agora: number): void {
  const hoje = dataLocal(agora)
  const materias = repo.materiasAtivas()
  const calculo = materias.find((m) => /c[aá]lculo/i.test(m.nome))
  const arquitetura = materias.find((m) => /arquitetura/i.test(m.nome))
  if (!calculo) return
  const tarefa = repo.tarefas().find((t) => t.data === hoje && !t.feita && t.materiaId === calculo.id)

  const conteudo: ConteudoAula = {
    titulo: 'Regra da cadeia e derivação implícita',
    objetivo:
      'Derivar funções compostas sem esquecer a derivada de dentro e achar dy/dx quando o y não está isolado. É a base das taxas relacionadas, que caem na P3.',
    roteiro: [
      'Entender a regra da cadeia como "de fora para dentro"',
      'Treinar composições com potência, raiz, seno e exponencial',
      'Derivação implícita: derivar os dois lados e isolar y′',
      'Fazer os exercícios 1 a 4 sem olhar o gabarito',
      'Mandar as respostas para o professor corrigir'
    ],
    secoes: [
      {
        titulo: 'Regra da cadeia',
        texto:
          'Pense em engrenagens: se a de fora gira 3 vezes mais rápido que a do meio, e a do meio 2 vezes mais rápido que a de dentro, a de fora gira 6 vezes mais rápido que a de dentro. A derivada de uma composição é o produto das taxas.\n\nNa prática: derive a função de fora mantendo o miolo intacto e multiplique pela derivada do miolo. O erro clássico é parar no primeiro passo.',
        formulas: ["(f(g(x)))′ = f′(g(x)) · g′(x)", 'dy/dx = dy/du · du/dx'],
        exemplo: {
          enunciado: 'Derive y = (3x² + 1)⁵.',
          resolucao: 'Fora: u⁵, com u = 3x² + 1. A derivada de fora é 5u⁴ = 5(3x² + 1)⁴.\nDentro: u′ = 6x.\nResultado: y′ = 5(3x² + 1)⁴ · 6x = 30x(3x² + 1)⁴.'
        }
      },
      {
        titulo: 'Derivação implícita',
        texto:
          'Quando a equação mistura x e y (como x² + y² = 25), isolar o y dá trabalho ou nem é possível. Derive os dois lados em relação a x, tratando y como uma função de x: toda vez que derivar algo com y, multiplique por y′. É a regra da cadeia de novo.\n\nDepois junte os termos com y′ de um lado, ponha y′ em evidência e isole.',
        formulas: ['d/dx (y²) = 2y · y′', 'd/dx (xy) = y + x · y′'],
        exemplo: {
          enunciado: 'Ache dy/dx em x² + y² = 25 e a inclinação da tangente no ponto (3, 4).',
          resolucao: '2x + 2y · y′ = 0\ny′ = −x / y\nNo ponto (3, 4): y′ = −3/4.'
        }
      }
    ],
    armadilhas: [
      'Esquecer a derivada de dentro: (sen 3x)′ é 3 cos 3x, não cos 3x.',
      'Na implícita, derivar y² como 2y, sem o y′.',
      'Em xy, usar a regra do produto: a derivada é y + x · y′, não só y′.',
      'Errar o sinal ao passar um termo com y′ para o outro lado.'
    ],
    exercicios: [
      {
        numero: 1,
        enunciado: 'Derive f(x) = √(x² + 4x).',
        origem: 'Slide 12 (exemplos do professor)',
        nivel: 'facil',
        dica: 'Escreva a raiz como potência 1/2 e use a cadeia.',
        resolucao: 'f(x) = (x² + 4x)^(1/2)\nf′(x) = ½ (x² + 4x)^(−1/2) · (2x + 4) = (x + 2) / √(x² + 4x)',
        resposta: 'f′(x) = (x + 2) / √(x² + 4x)'
      },
      {
        numero: 2,
        enunciado: 'Derive y = sen(x³).',
        origem: 'Lista 3, exercício 9',
        nivel: 'facil',
        dica: 'Fora é o seno, dentro é x³.',
        resolucao: 'y′ = cos(x³) · 3x²',
        resposta: 'y′ = 3x² cos(x³)'
      },
      {
        numero: 3,
        enunciado: 'Derive y = e^(cos 2x).',
        origem: 'Lista 3, exercício 23',
        nivel: 'medio',
        dica: 'São três camadas: exponencial, cosseno e 2x.',
        resolucao: 'y′ = e^(cos 2x) · (−sen 2x) · 2',
        resposta: 'y′ = −2 sen(2x) · e^(cos 2x)'
      },
      {
        numero: 4,
        enunciado: 'Ache dy/dx em x³ + y³ = 6xy.',
        origem: 'Slide 20 (folium de Descartes)',
        nivel: 'medio',
        dica: 'O lado direito pede a regra do produto.',
        resolucao: '3x² + 3y² · y′ = 6y + 6x · y′\ny′ (3y² − 6x) = 6y − 3x²\ny′ = (2y − x²) / (y² − 2x)',
        resposta: 'y′ = (2y − x²) / (y² − 2x)'
      },
      {
        numero: 5,
        enunciado: 'Ache a equação da reta tangente à curva x² + xy + y² = 3 no ponto (1, 1).',
        origem: 'Parecido com o Stewart 3.5, exercício 27',
        nivel: 'dificil',
        dica: 'Ache y′ pela implícita, troque x e y por 1 e use y − y₀ = m(x − x₀).',
        resolucao: '2x + y + x · y′ + 2y · y′ = 0\ny′ = −(2x + y) / (x + 2y)\nEm (1, 1): y′ = −3/3 = −1\nReta: y − 1 = −(x − 1)',
        resposta: 'y = −x + 2'
      },
      {
        numero: 6,
        enunciado: 'Derive g(t) = (t² − 1)³ / (t + 2)².',
        origem: 'Criado a partir do slide 15',
        nivel: 'dificil',
        dica: 'Regra do quociente por fora e cadeia no numerador e no denominador.',
        resolucao:
          'g′ = [3(t² − 1)² · 2t · (t + 2)² − (t² − 1)³ · 2(t + 2)] / (t + 2)⁴\nPondo (t² − 1)² (t + 2) em evidência:\ng′ = (t² − 1)² [6t(t + 2) − 2(t² − 1)] / (t + 2)³',
        resposta: 'g′(t) = (t² − 1)² (4t² + 12t + 2) / (t + 2)³'
      }
    ],
    fontes: ['Slides 3.4 e 3.5 - Regra da cadeia e derivação implícita.pdf', 'Lista 3 - Derivadas.pdf'],
    avisos: ''
  }
  const id = repo.criarAula({
    tarefaId: tarefa?.id ?? null,
    materiaId: calculo.id,
    tema: tarefa ? `${tarefa.titulo}\n${tarefa.detalhe}` : 'Regra da cadeia e derivação implícita',
    criadaEm: agora - 50 * 60_000,
    conteudo,
    materiais: conteudo.fontes
  })
  repo.atualizarAula(
    id,
    {
      progresso: { '1': 'acertei', '2': 'acertei', '3': 'parcial', '4': 'errei' },
      conversa: [
        { de: 'aluno', texto: 'Deu y′ = (2y − x²) / (y² − x).', quando: agora - 20 * 60_000, fotos: [], exercicio: 4 },
        {
          de: 'professor',
          texto:
            'Quase. A estrutura está certa (juntar os y′ de um lado e isolar), mas o 6xy pede a regra do produto: a derivada é 6y + 6x · y′. Em algum passo você usou 3x · y′, por isso apareceu y² − x no denominador em vez de y² − 2x.\n\nRefaça só o lado direito com calma. Marquei como errado; o exercício 5 usa a mesma ideia e é um bom treino.',
          quando: agora - 19 * 60_000,
          fotos: [],
          exercicio: 4
        },
        { de: 'aluno', texto: 'Por que na implícita eu multiplico por y′ e na derivada normal não?', quando: agora - 12 * 60_000, fotos: [], exercicio: null },
        {
          de: 'professor',
          texto:
            'Porque o y é uma função de x escondida. Quando você deriva x², a variável é o próprio x, e a derivada de dentro é 1. Quando deriva y², é como derivar (g(x))²: pela regra da cadeia sai 2 g(x) · g′(x), ou seja, 2y · y′. O y′ é a "derivada de dentro".',
          quando: agora - 11 * 60_000,
          fotos: [],
          exercicio: null
        }
      ]
    },
    agora - 11 * 60_000
  )

  if (!arquitetura) return
  const antiga = repo.criarAula({
    tarefaId: null,
    materiaId: arquitetura.id,
    tema: 'Desempenho e Lei de Amdahl',
    criadaEm: agora - 3 * 24 * HORA,
    materiais: ['Aula 05 - Desempenho.pdf'],
    conteudo: {
      titulo: 'Desempenho e Lei de Amdahl',
      objetivo: 'Calcular o ganho de uma melhoria que só acelera parte do programa.',
      roteiro: ['Tempo de CPU', 'Lei de Amdahl', 'Exercícios'],
      secoes: [{ titulo: 'Lei de Amdahl', texto: 'O ganho total é limitado pela parte que não melhora.', formulas: ['S = 1 / ((1 − Fm) + Fm / Sm)'], exemplo: null }],
      armadilhas: ['Somar os ganhos das partes em vez de somar os tempos.'],
      exercicios: [1, 2, 3, 4, 5].map((n) => ({
        numero: n,
        enunciado: `Exercício ${n} sobre speedup.`,
        origem: 'Slide 18',
        nivel: 'medio' as const,
        dica: '',
        resolucao: '...',
        resposta: '...'
      })),
      fontes: ['Aula 05 - Desempenho.pdf'],
      avisos: ''
    }
  })
  repo.atualizarAula(antiga, { progresso: { '1': 'acertei', '2': 'acertei', '3': 'acertei', '4': 'errei', '5': 'acertei' } }, agora - 3 * 24 * HORA)
}
