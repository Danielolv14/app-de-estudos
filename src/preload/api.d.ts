import type { Config, Estado, Evento, Materia, PedidoEncerrar, ResultadoEncerrar, SessaoAtiva, Tarefa } from '../shared/tipos'

export type SituacaoTrava = { livre: boolean; metaMin: number; estudadoMs: number; faltamMin: number; frase: string }
export type Resultado = { ok: boolean; mensagem: string }

export type Api = {
  estado(): Promise<Estado>
  aoMudar(fn: (e: Estado) => void): () => void
  aoNavegar(fn: (tela: string) => void): () => void
  aoAbrirTrava(fn: () => void): () => void
  iniciar(tarefaId: number | null): Promise<SessaoAtiva>
  pausar(): Promise<void>
  retomar(): Promise<void>
  trocarTarefa(tarefaId: number | null): Promise<void>
  trava(): Promise<SituacaoTrava>
  encerrar(p: PedidoEncerrar): Promise<ResultadoEncerrar>
  salvarTarefa(t: Omit<Tarefa, 'id' | 'feita' | 'ordem'> & { id?: number }): Promise<number>
  marcarTarefa(id: number, feita: boolean): Promise<void>
  moverTarefa(id: number, data: string): Promise<void>
  removerTarefa(id: number): Promise<void>
  salvarEvento(e: Omit<Evento, 'id'> & { id?: number }): Promise<number>
  removerEvento(id: number): Promise<void>
  salvarMateria(m: Omit<Materia, 'id'> & { id?: number }): Promise<number>
  removerMateria(id: number): Promise<void>
  definirMeta(data: string, minutos: number | null): Promise<void>
  salvarConfig(c: Config): Promise<void>
  adiarLembrete(minutos: number): Promise<void>
  dispensarLembrete(): Promise<void>
  fecharLembrete(): Promise<void>
  removerAviso(id: number): Promise<void>
  instalarBloqueio(): Promise<Resultado>
  desinstalarBloqueio(): Promise<Resultado>
  escolherVault(): Promise<string | null>
  abrirPrincipal(): Promise<void>
}

declare global {
  interface Window {
    api: Api
  }
}
