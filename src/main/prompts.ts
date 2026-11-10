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

// ---------- Aula da sessão (a IA como professor) ----------

const EXERCICIO = objeto({
  enunciado: str,
  origem: str,
  nivel: { type: 'string', enum: ['facil', 'medio', 'dificil'] },
  dica: str,
  resolucao: str,
  resposta: str
})

export const FORMATO_AULA = objeto({
  titulo: str,
  objetivo: str,
  roteiro: { type: 'array', items: str },
  secoes: {
    type: 'array',
    items: objeto({
      titulo: str,
      texto: str,
      formulas: { type: 'array', items: str },
      exemplo: ouNulo(objeto({ enunciado: str, resolucao: str }))
    })
  },
  armadilhas: { type: 'array', items: str },
  exercicios: { type: 'array', items: EXERCICIO },
  fontes: { type: 'array', items: str },
  avisos: str
})

export type DadosAula = {
  materia: string
  tema: string
  /** Tarefa do plano ligada à sessão (título e detalhe). */
  tarefa: string | null
  minutos: number | null
  /** Próxima avaliação da matéria, com o que cai. */
  avaliacao: string | null
  travou: string[]
  pontosFracos: string[]
  bibliografia: string
  pedido: string
  /** Caminhos completos do material (PDFs e fotos) na pasta da tarefa. */
  materiais: string[]
}

export function pedidoAula(d: DadosAula): string {
  const linhas = [
    'Você é o professor particular de um aluno de graduação (PUC Minas). Prepare o material da sessão de estudo de hoje: ele vai estudar sozinho com este material, na ordem, e resolver os exercícios no papel. Depois ele vai te mandar as respostas e as dúvidas.',
    '',
    `Matéria: ${d.materia}`,
    `Tema da sessão: ${d.tema}`
  ]
  if (d.tarefa) linhas.push(`Tarefa do plano: ${d.tarefa}`)
  if (d.minutos) linhas.push(`Tempo da sessão: ${d.minutos} minutos`)
  if (d.avaliacao) linhas.push(`Próxima avaliação: ${d.avaliacao}`)
  if (d.bibliografia.trim()) linhas.push(`Bibliografia da matéria: ${d.bibliografia.trim().replace(/\n+/g, '; ')}`)
  if (d.travou.length > 0) linhas.push('', 'Onde o aluno travou nas últimas sessões desta matéria:', ...d.travou.map((t) => `- ${t}`))
  if (d.pontosFracos.length > 0) linhas.push('', 'Pontos fracos nos últimos simulados:', ...d.pontosFracos.map((t) => `- ${t}`))
  if (d.pedido.trim()) linhas.push('', `Pedido do aluno: ${d.pedido.trim()}`)
  linhas.push('')
  if (d.materiais.length > 0)
    linhas.push(
      'Material do professor da disciplina, tirado do Canvas ou do PC do aluno (leia com a ferramenta Read; num PDF grande, leia só as páginas do tema):',
      ...d.materiais.map((m) => `- "${m}"`),
      'Baseie a explicação nesse material: a mesma notação, os mesmos nomes e o mesmo nível. Se ele tiver exercícios (nos slides ou numa lista), use esses primeiro, porque são os que mais parecem com a prova, e diga de onde vieram em "origem" (ex.: "slide 23 de g_desempenho_ES.pdf"). Se algum arquivo não for do tema, ignore e diga isso em "avisos".'
    )
  else linhas.push('Não há material do professor desta vez. Use o conteúdo padrão da disciplina no nível de graduação e diga isso em "avisos", numa frase.')
  linhas.push(
    'Se a tarefa citar exercícios de um livro (ex.: "3.9 (1, 3, 5)"), você não tem o livro: crie exercícios parecidos, no mesmo nível, com "origem" do tipo "parecido com o 3.9 do livro".',
    '',
    'Como montar:',
    '- "titulo": o tema em poucas palavras (ex.: "Desempenho e Lei de Amdahl").',
    '- "objetivo": uma frase com o que ele vai saber fazer no fim da sessão.',
    '- "roteiro": de 3 a 6 passos da ordem de estudo, com o tempo de cada um, cabendo na sessão (ex.: "Parte 1, desempenho da CPU (20 min)", "Exercícios 1 a 4 (30 min)", "Corrigir com o gabarito (10 min)").',
    '- "secoes": de 2 a 6 partes, do básico ao que mais cai. Em cada uma, "texto" explica como um bom professor explica para quem está vendo pela primeira vez: a ideia primeiro (com uma analogia quando ajudar), depois o detalhe e o que costuma cair em prova. "formulas" traz as fórmulas e regras para decorar, uma por item (lista vazia se não houver). "exemplo" é um exemplo resolvido passo a passo, com as contas (null se a parte for só teoria).',
    '- "armadilhas": até 6 erros comuns em prova e como evitar cada um.',
    '- "exercicios": de 5 a 10, do mais fácil ao mais difícil, cobrindo todas as partes. Cada um com "nivel", "dica" (um empurrão que não entrega a resposta), "resolucao" passo a passo e "resposta" (só o resultado final). Resolva cada exercício você mesmo e confira a conta antes de responder. O aluno só vê a dica e a resolução quando pedir.',
    '- "fontes": os nomes dos arquivos que você usou de verdade (só o nome, sem a pasta).',
    '- "avisos": o que o aluno precisa saber sobre o material (vazio se não houver nada).',
    `- ${ESCRITA}`
  )
  return linhas.join('\n')
}

export const FORMATO_PROFESSOR = objeto({
  resposta: str,
  exercicio: ouNulo(int),
  situacao: ouNulo({ type: 'string', enum: ['acertei', 'parcial', 'errei'] })
})

export type DadosProfessor = {
  materia: string
  tema: string
  /** A aula em JSON (com as resoluções). */
  aula: string
  materiais: string[]
  /** Últimas mensagens, já no formato "Aluno: ..." ou "Professor: ...". */
  conversa: string[]
  texto: string
  fotos: string[]
  exercicio: number | null
}

export function pedidoProfessor(d: DadosProfessor): string {
  const linhas = [
    `Você é o professor particular de um aluno de graduação (PUC Minas), no meio de uma sessão de estudo de ${d.materia} sobre "${d.tema}".`,
    'A aula que você preparou para ele, em JSON (ele só vê a dica e a resolução de cada exercício quando pede):',
    d.aula
  ]
  if (d.materiais.length > 0)
    linhas.push('', 'Material do professor da disciplina (leia com a ferramenta Read só se precisar conferir algo):', ...d.materiais.map((m) => `- "${m}"`))
  if (d.conversa.length > 0) linhas.push('', 'A conversa até agora:', ...d.conversa)
  linhas.push('', `Agora o aluno escreveu: ${d.texto.trim() || '(sem texto, só as fotos)'}`)
  if (d.exercicio !== null) linhas.push(`Ele disse que é sobre o exercício ${d.exercicio}.`)
  if (d.fotos.length > 0) linhas.push('Ele mandou fotos da resolução no papel. Leia todas com a ferramenta Read:', ...d.fotos.map((f) => `- "${f}"`))
  linhas.push(
    '',
    'Responda como um bom professor, em "resposta":',
    '- Se for a resolução de um exercício: resolva de novo antes de olhar a dele, diga se está certo, aponte exatamente o passo em que errou e por quê, e mostre o caminho certo. Preencha "exercicio" com o número e "situacao" com acertei, parcial ou errei. Se a mensagem não for a resolução de um exercício, os dois ficam null.',
    '- Se for dúvida: explique de outro jeito, mais simples e com um exemplo pequeno, sem repetir o texto da aula.',
    '- Se ele pedir mais exercícios, um resumo ou outro exemplo, faça na própria resposta (com a resposta final de cada exercício novo no fim, separada).',
    '- Direto ao ponto: no máximo uns 12 parágrafos curtos. Se a foto estiver ilegível, diga o que não deu para ler.',
    `- ${ESCRITA}`
  )
  return linhas.join('\n')
}

export const FORMATO_EXERCICIOS = objeto({ exercicios: { type: 'array', items: EXERCICIO } })

export type DadosMaisExercicios = { materia: string; tema: string; aula: string; materiais: string[]; errados: string[]; pedido: string }

export function pedidoMaisExercicios(d: DadosMaisExercicios): string {
  const linhas = [
    `Você é o professor particular de um aluno de graduação (PUC Minas), numa sessão de estudo de ${d.materia} sobre "${d.tema}". A aula que você preparou, em JSON:`,
    d.aula
  ]
  if (d.materiais.length > 0) linhas.push('', 'Material do professor da disciplina (leia com a ferramenta Read se precisar):', ...d.materiais.map((m) => `- "${m}"`))
  if (d.errados.length > 0) linhas.push('', 'Exercícios em que ele errou ou acertou só em parte:', ...d.errados.map((e) => `- ${e}`))
  if (d.pedido.trim()) linhas.push('', `Pedido do aluno: ${d.pedido.trim()}`)
  linhas.push(
    '',
    'Crie de 3 a 6 exercícios novos, diferentes dos que já estão na aula, focando no que ele errou (ou, se não errou nada, um pouco mais difíceis), do mais fácil ao mais difícil.',
    'Cada um com "origem" (de onde veio, ou "novo"), "nivel", "dica" (sem entregar a resposta), "resolucao" passo a passo e "resposta" (só o resultado final). Resolva cada um você mesmo e confira a conta.',
    `- ${ESCRITA}`
  )
  return linhas.join('\n')
}
