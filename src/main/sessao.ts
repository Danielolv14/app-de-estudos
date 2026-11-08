// Sessão de estudo: começa ligada a uma tarefa, pausa sem desbloquear e só encerra
// livre quando a meta do dia foi batida. Antes disso, precisa da frase da trava.
import type { PedidoEncerrar, ResultadoEncerrar, SessaoAtiva } from '@shared/tipos'
import {
  dataLocal,
  estudadoNoDia,
  estudoMs,
  fraseConfere,
  fraseTrava,
  metaDoDia,
  pausaMs,
  pausar,
  podeEncerrarLivre,
  proximasAvaliacoes,
  recuperar,
  retomar
} from '@shared/regras'
import type { Repositorio } from './repositorio'

export type Ganchos = {
  agora: () => number
  /** `reiniciarChrome` só é verdadeiro no começo de uma sessão nova. */
  ligarBloqueio: (reiniciarChrome: boolean) => void
  desligarBloqueio: () => void
  mudou: () => void
}

export type SituacaoTrava = {
  livre: boolean
  metaMin: number
  estudadoMs: number
  faltamMin: number
  frase: string
}

export class GerenciadorSessao {
  constructor(
    private readonly repo: Repositorio,
    private readonly g: Ganchos
  ) {}

  ativa(): SessaoAtiva | null {
    return this.repo.sessaoAtiva()
  }

  /** Ao abrir o app: se havia sessão (PC reiniciou ou o app caiu), ela volta pausada e o bloqueio continua. */
  recuperarAoAbrir(): boolean {
    const a = this.ativa()
    if (!a) return false
    this.repo.salvarSessaoAtiva(recuperar(a, this.g.agora()))
    this.repo.banco.salvarAgora()
    this.g.ligarBloqueio(false)
    this.g.mudou()
    return true
  }

  iniciar(tarefaId: number | null): SessaoAtiva {
    const atual = this.ativa()
    if (atual) return atual
    const agora = this.g.agora()
    const tarefa = tarefaId ? this.repo.tarefa(tarefaId) : undefined
    const dia = dataLocal(agora)
    const materiaId = tarefa?.materiaId ?? null
    const sessaoId = this.repo.abrirSessao({ tarefaId: tarefa?.id ?? null, materiaId, dia, inicio: agora })
    const nova: SessaoAtiva = {
      sessaoId,
      tarefaId: tarefa?.id ?? null,
      materiaId,
      dia,
      status: 'estudando',
      inicio: agora,
      estudoMs: 0,
      pausaMs: 0,
      marco: agora,
      batimento: agora
    }
    this.repo.salvarSessaoAtiva(nova)
    this.repo.banco.salvarAgora()
    this.g.ligarBloqueio(true)
    this.g.mudou()
    return nova
  }

  /** Troca a tarefa no meio da sessão (o tempo passa a contar para a nova matéria a partir da próxima sessão). */
  trocarTarefa(tarefaId: number | null): void {
    const a = this.ativa()
    if (!a) return
    const tarefa = tarefaId ? this.repo.tarefa(tarefaId) : undefined
    this.repo.salvarSessaoAtiva({ ...a, tarefaId: tarefa?.id ?? null, materiaId: tarefa?.materiaId ?? a.materiaId })
    this.g.mudou()
  }

  pausar(): void {
    const a = this.ativa()
    if (!a || a.status === 'pausado') return
    this.repo.salvarSessaoAtiva(pausar(a, this.g.agora()))
    this.g.mudou()
  }

  retomar(): void {
    const a = this.ativa()
    if (!a || a.status === 'estudando') return
    this.repo.salvarSessaoAtiva(retomar(a, this.g.agora()))
    this.g.mudou()
  }

  /** Salva o sinal de vida (a cada 30 s): se o PC desligar, a sessão é recuperada até aqui. */
  batimento(): void {
    const a = this.ativa()
    if (!a) return
    this.repo.salvarSessaoAtiva({ ...a, batimento: this.g.agora() })
  }

  situacaoTrava(): SituacaoTrava {
    const agora = this.g.agora()
    const a = this.ativa()
    const dia = a?.dia ?? dataLocal(agora)
    const metaMin = metaDoDia(dia, this.repo.tarefas(), this.repo.metasDia())
    const estudado = estudadoNoDia(dia, this.repo.sessoes(), a, agora)
    const faltamMin = Math.max(0, Math.ceil(metaMin - estudado / 60_000))
    const proxima = proximasAvaliacoes(this.repo.eventos(), dataLocal(agora))[0] ?? null
    return {
      livre: podeEncerrarLivre(metaMin, estudado),
      metaMin,
      estudadoMs: estudado,
      faltamMin,
      frase: fraseTrava(dataLocal(agora), faltamMin, proxima)
    }
  }

  encerrar(p: PedidoEncerrar): ResultadoEncerrar {
    const a = this.ativa()
    if (!a) return { ok: false, motivo: 'sem-sessao' }
    const trava = this.situacaoTrava()
    if (!trava.livre && !fraseConfere(p.frase ?? '', trava.frase)) return { ok: false, motivo: 'frase' }

    const agora = this.g.agora()
    const linha = (s?: string) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, 300)
    this.repo.banco.transacao(() => {
      this.repo.fecharSessao(a.sessaoId, {
        fim: agora,
        estudoSeg: Math.round(estudoMs(a, agora) / 1000),
        pausaSeg: Math.round(pausaMs(a, agora) / 1000),
        antesDaMeta: !trava.livre,
        checkinFeito: linha(p.feito),
        checkinTravou: linha(p.travou)
      })
      if (p.marcarFeita && a.tarefaId) this.repo.marcarTarefa(a.tarefaId, true)
      this.repo.salvarSessaoAtiva(null)
    })
    this.repo.banco.salvarAgora()
    this.g.desligarBloqueio()
    this.g.mudou()
    return { ok: true }
  }
}
