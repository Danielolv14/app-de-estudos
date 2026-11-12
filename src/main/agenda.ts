// Bloqueio agendado: liga sozinho nos dias e horários marcados em Ajustes, mesmo sem o timer, e só acaba antes do
// fim quando a meta do dia é batida. Quem bloqueia de verdade é o mesmo ControleBloqueio da sessão: esta classe só
// decide quando ligar e desligar, e convive com a sessão (se as duas valem, o bloqueio fica até as duas acabarem).
import type { SituacaoAgendada } from '@shared/tipos'
import { dataLocal, estudadoNoDia, metaDoDia, situacaoAgendada } from '@shared/regras'
import type { Repositorio } from './repositorio'

/** Por que o bloqueio agendado parou: a meta foi batida, o horário acabou, ou nenhum (o app abriu e limpou o que sobrou). */
export type MotivoFim = 'meta' | 'horario' | null

export type GanchosAgenda = {
  agora: () => number
  /** Liga o bloqueio, com o reinício do navegador do começo da sessão. */
  ligar: (s: SituacaoAgendada) => void
  desligar: (motivo: MotivoFim) => void
  mudou: () => void
}

export class AgendaBloqueio {
  /** O horário agendado está valendo (com ou sem sessão em andamento). */
  ligado = false

  constructor(
    private readonly repo: Repositorio,
    private readonly g: GanchosAgenda
  ) {}

  situacao(): SituacaoAgendada {
    const agora = this.g.agora()
    const hoje = dataLocal(agora)
    return situacaoAgendada({
      agora,
      horarios: this.repo.config().bloqueioAgendado,
      metaMin: metaDoDia(hoje, this.repo.tarefas(), this.repo.metasDia()),
      estudadoMs: estudadoNoDia(hoje, this.repo.sessoes(), this.repo.sessaoAtiva(), agora)
    })
  }

  /**
   * Chamado a cada poucos segundos e quando os Ajustes mudam. Com a sessão em andamento, ela já bloqueia: aqui só
   * se anota se o horário vale (e, quando a sessão termina, `seguraDepoisDaSessao` decide). `abrindo`: o app
   * acabou de abrir, então, fora do horário, tira o bloqueio que tiver sobrado de antes.
   */
  conferir(abrindo = false): void {
    const s = this.situacao()
    if (s.ligado === this.ligado && !abrindo) return
    const estava = this.ligado
    this.ligado = s.ligado
    if (!this.repo.sessaoAtiva()) {
      if (s.ligado) this.g.ligar(s)
      else if (estava) this.g.desligar(s.noHorario ? 'meta' : 'horario')
      else if (abrindo) this.g.desligar(null)
    }
    this.g.mudou()
  }

  /** A sessão terminou: devolve verdadeiro quando o horário agendado ainda vale (aí o bloqueio continua). */
  seguraDepoisDaSessao(): boolean {
    this.ligado = this.situacao().ligado
    return this.ligado
  }
}
