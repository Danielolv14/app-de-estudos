// Dados de mentira para as capturas de tela (só com --captura-ia, numa pasta de dados temporária).
// Servem para conferir o visual das telas da IA sem chamar o Claude Code.
import type { CursoCanvas, ItemCanvas, Mudanca } from '@shared/tipos'
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
