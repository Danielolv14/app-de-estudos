// Tipos compartilhados entre o processo principal (Electron) e as telas (React).

export type Materia = {
  id: number
  nome: string
  cor: string
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
  reiniciarChrome: boolean
  /** Um lembrete por dia da semana, de domingo (0) a sábado (6). */
  lembretes: Lembrete[]
  /** Minutos entre um lembrete e o próximo, até o timer começar. */
  insistirMin: number
  caminhoResumoVault: string
  miniTimer: boolean
  iniciarComWindows: boolean
}

export type StatusBloqueio = {
  /** O serviço de bloqueio foi instalado (existe a pasta de dados). */
  instalado: boolean
  /** O serviço respondeu nos últimos segundos. */
  vivo: boolean
  /** O hosts está com o bloqueio aplicado agora. */
  bloqueado: boolean
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
