// Tipos compartilhados entre o processo principal (Electron) e as telas (React).

export type Materia = {
  id: number
  nome: string
  cor: string
  /** Matéria de um semestre que já acabou: some das listas, mas o histórico continua. */
  arquivada: boolean
  /** Semestre em que a matéria foi cursada (ex.: 2026/2). */
  semestre: string
  /** Livros básicos, um por linha (vem do plano de ensino). */
  bibliografia: string
}

export type Tarefa = {
  id: number
  materiaId: number | null
  /** Dia da tarefa, no formato AAAA-MM-DD (horário local). */
  data: string
  titulo: string
  detalhe: string
  /** Estimativa de tempo; a soma das tarefas do dia vira a meta do dia. */
  minutos: number
  feita: boolean
  ordem: number
}

export type TipoEvento = 'prova' | 'atividade' | 'reavaliacao' | 'aula' | 'outro'

export type Evento = {
  id: number
  materiaId: number | null
  /** AAAA-MM-DD, ou nulo quando a data ainda não saiu (ex.: reavaliação a confirmar, ADA). */
  data: string | null
  titulo: string
  tipo: TipoEvento
  /** Quanto a avaliação vale (ex.: 25). */
  pontos: number | null
  /** Meta fixada à mão. Vazia, o app calcula quanto precisa tirar (calculadora de nota). */
  meta: number | null
  /** Nota que tirou, depois da prova. */
  nota: number | null
  /** O que cai na avaliação, ou o assunto da aula (usado pelo simulado e pelo replanejamento). */
  conteudo: string
}

export type Sessao = {
  id: number
  tarefaId: number | null
  materiaId: number | null
  /** Dia em que a sessão começou (AAAA-MM-DD). As horas contam para esse dia. */
  dia: string
  inicio: number
  fim: number | null
  estudoSeg: number
  pausaSeg: number
  /** Encerrada com a frase da trava, antes de bater a meta. */
  antesDaMeta: boolean
  /** Check-in do fim da sessão: o que foi feito e onde travou (os dois podem ficar vazios). */
  checkinFeito: string
  checkinTravou: string
}

export type StatusTimer = 'estudando' | 'pausado'

/** Sessão em andamento. Os tempos são guardados como "acumulado até o marco" mais o trecho desde o marco. */
export type SessaoAtiva = {
  sessaoId: number
  tarefaId: number | null
  materiaId: number | null
  dia: string
  status: StatusTimer
  inicio: number
  /** Tempo de estudo acumulado até `marco`. */
  estudoMs: number
  /** Tempo de pausa acumulado até `marco`. */
  pausaMs: number
  /** Momento da última troca de estado (início, pausa ou retomada). */
  marco: number
  /** Último sinal de vida salvo em disco; usado para recuperar a sessão se o PC desligar. */
  batimento: number
}

export type Lembrete = {
  ativo: boolean
  /** Horário no formato HH:MM. */
  hora: string
}

export type Config = {
  dominios: string[]
  processos: string[]
  pastasBloqueadas: string[]
  /** Reiniciar o Brave e o Chrome (os que estiverem abertos) no começo da sessão. Antes da v1.2 se chamava `reiniciarChrome`. */
  reiniciarNavegador: boolean
  /** Um lembrete por dia da semana, de domingo (0) a sábado (6). */
  lembretes: Lembrete[]
  /** Minutos entre um lembrete e o próximo, até o timer começar. */
  insistirMin: number
  caminhoResumoVault: string
  miniTimer: boolean
  iniciarComWindows: boolean
  /** Modelo que o Claude Code usa nas tarefas de IA ("opus" ou "sonnet": sempre a versão mais nova). */
  modeloIa: ModeloIa
  /** Caminho do claude.exe escolhido à mão. Vazio: o app procura sozinho. */
  caminhoClaude: string
  /** Que matéria entra em cada dia da semana, e por quanto tempo. A IA monta e replaneja o plano dentro dela. */
  semanaPadrao: BlocoSemana[]
  /** Endereço do Canvas da faculdade (a API responde nele). O token fica fora da configuração, criptografado. */
  canvasUrl: string
}

export type ModeloIa = 'opus' | 'sonnet'

export type BlocoSemana = {
  /** 0 = domingo ... 6 = sábado. */
  dia: number
  materiaId: number
  minutos: number
}

export type StatusBloqueio = {
  /** O serviço de bloqueio foi instalado (existe a pasta de dados). */
  instalado: boolean
  /** O serviço respondeu nos últimos segundos. */
  vivo: boolean
  /** O hosts está com o bloqueio aplicado agora. */
  bloqueado: boolean
  /** O serviço instalado é de uma versão mais velha do script: precisa reinstalar. */
  desatualizado: boolean
  erro: string | null
}

export type EstadoLembrete = {
  data: string
  ultimoAviso: number | null
  adiadoAte: number | null
  dispensado: boolean
}

export type Estado = {
  hoje: string
  agora: number
  materias: Materia[]
  tarefas: Tarefa[]
  eventos: Evento[]
  sessoes: Sessao[]
  metasDia: Record<string, number>
  ativa: SessaoAtiva | null
  config: Config
  bloqueio: StatusBloqueio
  /** Lembrete aberto na tela (a hora de estudar chegou e o timer não começou). */
  lembreteAberto: boolean
  /** Mensagens curtas para mostrar na tela (ex.: "Fechei a Steam"). */
  avisos: { id: number; texto: string }[]
  simulados: Simulado[]
  ia: EstadoIa
  /** Semestre atual (ex.: 2026/2). */
  semestre: string
  /** Plano de ensino lido pela IA, esperando a revisão. */
  leituraPlano: LeituraPlano | null
  /** Mudanças no plano sugeridas pela IA, esperando a aprovação. */
  propostaPlano: PropostaPlano | null
  canvas: EstadoCanvas
  /** Novidades do Canvas (matérias e avaliações novas), esperando a revisão. */
  revisaoCanvas: RevisaoCanvas | null
}

// ---------- Canvas (o ambiente virtual da faculdade) ----------

export type EstadoCanvas = {
  url: string
  /** Tem token guardado. */
  conectado: boolean
  /** Nome da conta no Canvas, da última conexão. */
  usuario: string | null
  sincronizando: boolean
  ultimaSync: number | null
  erro: string | null
  /** Cursos da última sincronização e a matéria ligada a cada um (nulo: ainda não ligado; 0: ignorado). */
  cursos: { id: number; nome: string; materiaId: number | null }[]
  /** Eventos do calendário que vieram do Canvas (o app atualiza a data, os pontos e a nota sozinho). */
  eventosDoCanvas: number[]
}

export type CursoCanvas = { id: number; nome: string; codigo: string }

export type TipoItemCanvas = 'prova' | 'atividade' | 'reavaliacao' | 'aula' | 'outro'

/** Uma atividade (assignment) ou um evento do calendário do Canvas, já no formato do app. */
export type ItemCanvas = {
  /** "tarefa:123" (atividade) ou "evento:456" (evento do calendário). */
  chave: string
  cursoId: number
  titulo: string
  tipo: TipoItemCanvas
  data: string | null
  pontos: number | null
  /** Nota lançada (só quando o professor publicou). */
  nota: number | null
  conteudo: string
}

export type CursoNaRevisao = CursoCanvas & {
  /** Matéria do app que recebe o curso, ou criar uma nova, ou ignorar o curso. */
  destino: number | 'nova' | 'ignorar'
  /** Nome da matéria nova. */
  nomeMateria: string
}

export type ItemNaRevisao = ItemCanvas & {
  incluir: boolean
  /** Avaliação que já estava no app e é a mesma do Canvas (para não duplicar). */
  juntarCom: number | null
}

export type RevisaoCanvas = { criadaEm: number; cursos: CursoNaRevisao[]; itens: ItemNaRevisao[] }

export type ArquivoCanvas = { id: number; cursoId: number; nome: string; tamanho: number; modulo: string }

// ---------- IA (pelo Claude Code do PC) ----------

export type TipoTrabalhoIa = 'teste' | 'gerar-simulado' | 'corrigir-simulado' | 'ler-plano' | 'replanejar'

export type TrabalhoIa = {
  tipo: TipoTrabalhoIa
  /** O que aparece na tela enquanto a IA trabalha. */
  descricao: string
  desde: number
  /** Simulado em correção, quando for o caso. */
  simuladoId: number | null
}

export type EstadoIa = {
  /** Caminho do claude.exe encontrado, ou nulo. */
  claude: string | null
  trabalho: TrabalhoIa | null
  /** Resultado da última tarefa de IA (some da tela quando outra começa). */
  ultimo: { tipo: TipoTrabalhoIa; ok: boolean; mensagem: string; quando: number } | null
  usosMes: number
  tokensMes: number
}

export type Questao = {
  numero: number
  /** Texto da questão. Matemática em texto simples com Unicode (x², √x, f'(x)). */
  enunciado: string
  pontos: number
  conteudo: string
  /** Resolução feita pela IA. A tela só mostra depois que a prova termina. */
  resolucao: string
  resposta: string
}

export type ProvaSimulado = {
  titulo: string
  instrucoes: string
  questoes: Questao[]
}

export type SituacaoQuestao = 'certa' | 'parcial' | 'errada' | 'em-branco'

export type CorrecaoQuestao = {
  numero: number
  nota: number
  situacao: SituacaoQuestao
  acertos: string
  erros: string
}

export type SugestaoEstudo = { titulo: string; detalhe: string; minutos: number }

export type Correcao = {
  questoes: CorrecaoQuestao[]
  /** Soma das notas das questões (estimativa: a IA pode errar). */
  nota: number
  total: number
  resumo: string
  pontosFracos: string[]
  sugestoes: SugestaoEstudo[]
  /** Observações da IA (ex.: foto ilegível, resolução de referência corrigida). */
  avisos: string
  corrigidaEm: number
}

export type Simulado = {
  id: number
  materiaId: number | null
  /** Avaliação que o simulado imita. */
  eventoId: number | null
  conteudos: string
  duracaoMin: number
  criadoEm: number
  prova: ProvaSimulado
  iniciadoEm: number | null
  terminadoEm: number | null
  /** Sessão de estudo em que a prova foi feita. */
  sessaoId: number | null
  /** Nomes das fotos da resolução, na pasta do simulado. */
  fotos: string[]
  correcao: Correcao | null
}

export type PedidoSimulado = {
  materiaId: number | null
  eventoId: number | null
  conteudos: string
  duracaoMin: number
  /** Arquivo de prova antiga (PDF ou foto) para a IA imitar o estilo. */
  modelo: string | null
  /** Material de aula (PDFs baixados do Canvas: slides, listas) para a IA seguir o conteúdo e a notação. */
  materiais?: string[]
  observacoes: string
}

// ---------- Plano de ensino e replanejamento ----------

export type AvaliacaoLida = {
  incluir: boolean
  titulo: string
  tipo: 'prova' | 'atividade' | 'reavaliacao'
  data: string | null
  pontos: number | null
  conteudo: string
}

export type AulaLida = { incluir: boolean; data: string | null; conteudo: string }

export type LeituraPlano = {
  arquivo: string
  /** Matéria que já existia e vai receber o plano, ou nulo para criar uma nova. */
  materiaId: number | null
  materia: string
  avaliacoes: AvaliacaoLida[]
  aulas: AulaLida[]
  bibliografia: string[]
  observacoes: string
  lidaEm: number
}

export type Mudanca = { id: number; motivo: string } & (
  | { tipo: 'mover'; tarefaId: number; data: string }
  | { tipo: 'ajustar'; tarefaId: number; minutos: number | null; titulo: string | null; detalhe: string | null }
  | { tipo: 'criar'; data: string; materiaId: number | null; titulo: string; detalhe: string; minutos: number }
  | { tipo: 'remover'; tarefaId: number }
)

export type PropostaPlano = {
  criadaEm: number
  resumo: string
  mudancas: Mudanca[]
  /** Quantas mudanças da IA foram descartadas por não fazerem sentido (tarefa que não existe, data no passado). */
  descartadas: number
}

export type ResultadoEncerrar = { ok: true } | { ok: false; motivo: 'frase' | 'sem-sessao' }

export type PedidoEncerrar = {
  frase?: string
  marcarFeita: boolean
  /** Check-in: o que foi feito na sessão. */
  feito?: string
  /** Check-in: onde travou. */
  travou?: string
}
