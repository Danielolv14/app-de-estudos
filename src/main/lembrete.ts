// Lembrete da hora de estudar: notificação do Windows no horário do dia, repetida até o timer começar.
import { Notification } from 'electron'
import { dataLocal, deveLembrar } from '@shared/regras'
import type { EstadoLembrete } from '@shared/tipos'
import type { Repositorio } from './repositorio'

export class Lembretes {
  aberto = false

  constructor(
    private readonly repo: Repositorio,
    private readonly icone: string,
    private readonly aoClicar: () => void,
    private readonly mudou: () => void,
    /** Desligado nos testes, para não aparecer notificação de verdade no Windows. */
    private readonly notificar = true
  ) {}

  private estado(agora: number): EstadoLembrete {
    const hoje = dataLocal(agora)
    const e = this.repo.estadoLembrete()
    return e && e.data === hoje ? e : { data: hoje, ultimoAviso: null, adiadoAte: null, dispensado: false }
  }

  /** Chamado a cada 30 s. */
  conferir(agora = Date.now()): void {
    const hoje = dataLocal(agora)
    const tarefasPendentesHoje = this.repo.tarefas().filter((t) => t.data === hoje && !t.feita).length
    const sessaoHoje = !!this.repo.sessaoAtiva() || this.repo.sessoes().some((s) => s.dia === hoje)
    if (sessaoHoje && this.aberto) {
      this.aberto = false
      this.mudou()
    }
    const config = this.repo.config()
    const estado = this.estado(agora)
    if (!deveLembrar({ agora, lembretes: config.lembretes, insistirMin: config.insistirMin, estado, tarefasPendentesHoje, sessaoHoje }))
      return

    this.repo.salvarEstadoLembrete({ ...estado, ultimoAviso: agora })
    const tarefa = this.repo.tarefas().find((t) => t.data === hoje && !t.feita)
    const materia = this.repo.materias().find((m) => m.id === tarefa?.materiaId)
    if (this.notificar) {
      const n = new Notification({
        title: 'Hora de estudar',
        body: tarefa ? `${materia ? materia.nome + ': ' : ''}${tarefa.titulo}` : 'Abra o app e comece o timer.',
        icon: this.icone
      })
      n.on('click', this.aoClicar)
      n.show()
    }
    this.aberto = true
    this.mudou()
  }

  adiar(minutos: number, agora = Date.now()): void {
    this.repo.salvarEstadoLembrete({ ...this.estado(agora), adiadoAte: agora + minutos * 60_000 })
    this.fechar()
  }

  dispensarHoje(agora = Date.now()): void {
    this.repo.salvarEstadoLembrete({ ...this.estado(agora), dispensado: true })
    this.fechar()
  }

  fechar(): void {
    this.aberto = false
    this.mudou()
  }
}
