// Pedidos para a IA e o formato (JSON Schema) de cada resposta.
// O Claude Code confere a resposta contra o formato; o app ainda confere de novo em respostas-ia.ts.

const str = { type: 'string' }
const num = { type: 'number' }
const int = { type: 'integer' }
const ouNulo = (t: object) => ({ anyOf: [t, { type: 'null' }] })
const objeto = (props: Record<string, object>) => ({
  type: 'object',
  properties: props,
  required: Object.keys(props),
  additionalProperties: false
})

const ESCRITA = `Escreva em português do Brasil. Matemática em texto simples com Unicode (x², x³, √(x+1), f'(x), dy/dx, ∫, lim x→0, π, ≤, ≥), sem LaTeX e sem Markdown. Use \\n para quebrar linha.`

// ---------- Teste ----------

export const FORMATO_TESTE = objeto({ ok: { type: 'boolean' } })
export const PEDIDO_TESTE = 'Teste de conexão do App de Estudos. Responda só com ok = true. Não use ferramentas.'

// ---------- Gerar simulado ----------

export const FORMATO_PROVA = objeto({
  titulo: str,
  instrucoes: str,
  questoes: {
    type: 'array',
    items: objeto({ numero: int, enunciado: str, pontos: num, conteudo: str, resolucao: str, resposta: str })
  }
})

export type DadosGerar = {
  materia: string
  avaliacao: string | null
  conteudos: string
  duracaoMin: number
  total: number
  meta: string | null
  travou: string[]
  observacoes: string
  /** Caminho completo do arquivo de prova antiga, se houver. */
  modelo: string | null
  /** Caminhos completos do material de aula (PDFs do Canvas). */
  materiais?: string[]
}

export function pedidoGerar(d: DadosGerar): string {
  const linhas = [
    'Monte um simulado de prova para um aluno de graduação (PUC Minas) treinar sozinho, resolvendo no papel.',
    '',
    `Matéria: ${d.materia}`,
    d.avaliacao ? `Avaliação que o simulado imita: ${d.avaliacao}` : 'Avaliação que o simulado imita: uma prova comum da matéria',
    `Conteúdos que podem cair: ${d.conteudos || 'os mais importantes da matéria até agora'}`,
    `Duração: ${d.duracaoMin} minutos`,
    `Pontuação total do simulado: ${d.total} pontos (a soma dos pontos das questões tem que dar exatamente isso)`
  ]
  if (d.meta) linhas.push(`Meta do aluno nessa avaliação: ${d.meta}`)
  if (d.travou.length > 0) linhas.push('', 'Onde o aluno travou nas últimas sessões de estudo (cubra esses pontos):', ...d.travou.map((t) => `- ${t}`))
  if (d.observacoes.trim()) linhas.push('', `Pedido do aluno: ${d.observacoes.trim()}`)
  if (d.modelo)
    linhas.push(
      '',
      `Leia com a ferramenta Read a prova antiga em "${d.modelo}" e imite o estilo, o tipo de questão, o tamanho dos enunciados e a dificuldade. Não copie as questões.`
    )
  if (d.materiais && d.materiais.length > 0)
    linhas.push(
      '',
      'Material de aula do professor (leia com a ferramenta Read; num PDF grande, leia só as páginas dos conteúdos pedidos):',
      ...d.materiais.map((m) => `- "${m}"`),
      'Siga a notação, os exemplos e o nível desse material. Não copie os exercícios resolvidos dele.'
    )
  linhas.push(
    '',
    'Regras:',
    '- Nível da prova real, sem facilitar. As questões têm que caber na duração.',
    '- Cubra os conteúdos pedidos sem repetir o mesmo tipo de questão. Itens a), b) dentro de uma questão são permitidos.',
    '- Em "conteudo", diga o tema da questão em poucas palavras (ex.: "3.9 taxas relacionadas").',
    '- Resolva cada questão você mesmo, passo a passo, e confira a conta antes de responder. A resolução completa vai em "resolucao" e só o resultado final em "resposta". O aluno só vê isso depois de terminar.',
    '- "instrucoes": uma ou duas frases para o começo da prova (ex.: "Sem consulta. Mostre as contas.").',
    `- ${ESCRITA}`
  )
  return linhas.join('\n')
}

// ---------- Corrigir simulado ----------

export const FORMATO_CORRECAO = objeto({
  questoes: {
    type: 'array',
    items: objeto({
      numero: int,
      nota: num,
      situacao: { type: 'string', enum: ['certa', 'parcial', 'errada', 'em-branco'] },
      acertos: str,
      erros: str
    })
  },
  resumo: str,
  pontosFracos: { type: 'array', items: str },
  sugestoes: { type: 'array', items: objeto({ titulo: str, detalhe: str, minutos: int }) },
  avisos: str
})

export function pedidoCorrigir(d: { materia: string; prova: string; fotos: string[] }): string {
  return [
    `Corrija um simulado de ${d.materia} que um aluno resolveu à mão. As fotos da folha de resposta são estes arquivos:`,
    ...d.fotos.map((f) => `- ${f}`),
    'Leia todas com a ferramenta Read antes de corrigir.',
    '',
    'A prova, com a resolução de referência (o aluno não viu a resolução):',
    d.prova,
    '',
    'Como corrigir:',
    '1. Antes de olhar a resposta do aluno, resolva cada questão de novo. Se a resolução de referência estiver errada, corrija com base na sua e explique em "avisos".',
    '2. Ache nas fotos a resposta de cada questão (pode estar fora de ordem). Se não achar, a situação é "em-branco". Se não der para ler, diga isso em "erros".',
    '3. Dê nota parcial pelo raciocínio certo, como um professor justo. A nota vai de 0 até os pontos da questão.',
    '4. "acertos": o que está certo. "erros": exatamente o passo em que errou e por quê, em uma ou duas frases. Vazio se não errou nada.',
    '5. "pontosFracos": até 4 frases curtas com o tipo de erro que se repete (ex.: "substituiu os números antes de derivar").',
    '6. "sugestoes": de 1 a 3 tarefas para refazer o que errou, com título curto no estilo de um plano de estudos (ex.: "Refazer taxas relacionadas: 3.9 (5, 13, 21)"), "detalhe" com como fazer, e "minutos" entre 20 e 120.',
    '7. "resumo": duas ou três frases sobre o desempenho, direto ao ponto.',
    `- ${ESCRITA}`
  ].join('\n')
}

// ---------- Ler plano de ensino ----------

export const FORMATO_LEITURA = objeto({
  materia: str,
  avaliacoes: {
    type: 'array',
    items: objeto({
      titulo: str,
      tipo: { type: 'string', enum: ['prova', 'atividade', 'reavaliacao'] },
      data: ouNulo(str),
      pontos: ouNulo(num),
      conteudo: str
    })
  },
  aulas: { type: 'array', items: objeto({ data: ouNulo(str), conteudo: str }) },
  bibliografia: { type: 'array', items: str },
  observacoes: str
})

export function pedidoLer(d: { arquivo: string; hoje: string; materia: string | null }): string {
  return [
    `Leia o plano de ensino em "${d.arquivo}" com a ferramenta Read. Se tiver mais de 10 páginas, leia por partes com o parâmetro pages.`,
    d.materia ? `É o plano de ensino da matéria "${d.materia}".` : '',
    `Hoje é ${d.hoje}. Datas sem ano são do semestre que começa por agora.`,
    '',
    'Extraia:',
    '- "materia": o nome curto da disciplina (ex.: "Cálculo 2", "Algoritmos e Estruturas de Dados").',
    '- "avaliacoes": cada avaliação que vale nota, com título com o nome da matéria (ex.: "Prova 1 de Cálculo 2"), tipo (prova, atividade ou reavaliacao), data AAAA-MM-DD (null se não tiver), pontos (null se não tiver) e o conteúdo que cai.',
    '- "aulas": cada aula do cronograma, com data AAAA-MM-DD (null se não tiver) e o assunto em poucas palavras. Não repita as avaliações aqui.',
    '- "bibliografia": os livros da bibliografia básica.',
    '- "observacoes": regras de nota importantes (ex.: se a reavaliação substitui a menor nota, nota mínima, faltas), em até três frases.',
    'Não invente nada que não esteja no arquivo.',
    `- ${ESCRITA}`
  ]
    .filter((l) => l !== '')
    .join('\n')
}

// ---------- Replanejar ----------

export const FORMATO_MUDANCAS = objeto({
  resumo: str,
  mudancas: {
    type: 'array',
    items: objeto({
      tipo: { type: 'string', enum: ['mover', 'ajustar', 'criar', 'remover'] },
      tarefaId: ouNulo(int),
      data: ouNulo(str),
      materiaId: ouNulo(int),
      titulo: ouNulo(str),
      detalhe: ouNulo(str),
      minutos: ouNulo(int),
      motivo: str
    })
  }
})

export function pedidoReplanejar(situacao: string, montar: boolean): string {
  return [
    montar
      ? 'Monte o plano de estudos diário de um aluno de graduação, dentro da semana padrão dele.'
      : 'Replaneje o plano de estudos diário de um aluno de graduação. Ele precisa de um plano realista para chegar à nota mínima em cada matéria.',
    '',
    'A situação atual, em JSON:',
    situacao,
    '',
    'Devolva uma lista de mudanças. Cada mudança tem "tipo":',
    '- "mover": muda a tarefa "tarefaId" para o dia "data".',
    '- "ajustar": muda "minutos", "titulo" ou "detalhe" da tarefa "tarefaId" (os outros campos ficam null).',
    '- "criar": tarefa nova no dia "data", da matéria "materiaId", com "titulo", "detalhe" e "minutos".',
    '- "remover": tira a tarefa "tarefaId" do plano.',
    'Campos que não se aplicam ao tipo ficam null. Todo item tem "motivo": uma frase curta.',
    '',
    'Regras:',
    '- Só mexa em tarefas pendentes (atrasadas ou de hoje em diante). Datas sempre de hoje em diante, no formato AAAA-MM-DD.',
    '- Atrasadas: mova para um dia livre antes da próxima avaliação da matéria, ou remova se não fizer mais sentido.',
    '- Respeite a semana padrão: cada dia só recebe as matérias dela, com o total perto das horas previstas para o dia (pode passar até 1 hora em semana de prova). Dia que não está na semana padrão é folga. Se a semana padrão estiver vazia, use os dias e as horas que o aluno já costuma ter no plano.',
    '- Priorize a matéria com mais risco (a que precisa de mais % no que falta) e as avaliações mais próximas. Na véspera de prova, revisão da matéria da prova.',
    '- Use os check-ins ("travou") e os pontos fracos dos simulados para criar tarefas de refazer.',
    '- Títulos curtos dizendo o que fazer, no estilo do plano atual (ex.: "4.7 otimização (1, 3, 5, 7)").',
    '- Não planeje além da última avaliação nem mais de 4 semanas à frente.',
    montar
      ? '- O plano está vazio ou quase: crie as tarefas das próximas semanas a partir das aulas e das avaliações.'
      : '- Poucas mudanças boas valem mais que muitas. Se o plano já está bom, devolva poucas mudanças ou nenhuma.',
    '- "resumo": duas ou três frases dizendo o que mudou e por quê.',
    `- ${ESCRITA}`
  ].join('\n')
}
