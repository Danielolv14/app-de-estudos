import type {
  ArquivoCanvas,
  Aula,
  Config,
  Estado,
  Evento,
  LeituraPlano,
  Materia,
  PedidoAula,
  PedidoEncerrar,
  PedidoSimulado,
  PerguntaAula,
  ResultadoEncerrar,
  RevisaoCanvas,
  SessaoAtiva,
  SituacaoExercicio,
  Tarefa
} from '../shared/tipos'

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
  salvarEvento(e: Omit<Evento, 'id' | 'conteudo'> & { id?: number; conteudo?: string }): Promise<number>
  removerEvento(id: number): Promise<void>
  salvarMateria(m: Pick<Materia, 'nome' | 'cor'> & { id?: number; bibliografia?: string; sigla?: string }): Promise<number>
  removerMateria(id: number): Promise<void>
  arquivarMateria(id: number, arquivada: boolean): Promise<void>
  virarSemestre(novo: string, apagarPendentes: boolean): Promise<{ arquivadas: number; apagadas: number }>
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

  // IA (pelo Claude Code)
  testarIa(): Promise<Resultado>
  cancelarIa(): Promise<void>
  limparIa(): Promise<void>
  escolherClaude(): Promise<string | null>

  // Simulados
  escolherModelo(): Promise<string | null>
  gerarSimulado(p: PedidoSimulado): Promise<Resultado>
  iniciarSimulado(id: number): Promise<void>
  terminarSimulado(id: number): Promise<void>
  removerSimulado(id: number): Promise<void>
  adicionarFotos(id: number, arquivos: string[]): Promise<Resultado>
  escolherFotos(id: number): Promise<Resultado | null>
  removerFoto(id: number, foto: string): Promise<void>
  corrigirSimulado(id: number): Promise<Resultado>
  miniatura(id: number, foto: string): Promise<string | null>
  /** Caminho no disco de um arquivo arrastado para a janela. */
  caminhoDe(arquivo: File): string

  // Plano de ensino e replanejamento
  escolherPdf(): Promise<string | null>
  lerPlano(arquivo: string, materiaId: number | null): Promise<Resultado>
  aplicarLeitura(l: LeituraPlano): Promise<{ materiaId: number; avaliacoes: number; aulas: number }>
  descartarLeitura(): Promise<void>
  replanejar(): Promise<Resultado>
  aplicarProposta(ids: number[]): Promise<number>
  descartarProposta(): Promise<void>

  // Canvas
  /** Testa o token na conta e só guarda (criptografado) se der certo. */
  conectarCanvas(url: string, token: string): Promise<Resultado>
  desconectarCanvas(): Promise<void>
  sincronizarCanvas(): Promise<Resultado>
  /** Matéria do curso (id), ignorar (0) ou esquecer a escolha (nulo). */
  ligarCursoCanvas(cursoId: number, destino: number | null): Promise<void>
  aplicarRevisaoCanvas(r: RevisaoCanvas): Promise<Resultado>
  ignorarRevisaoCanvas(): Promise<void>
  arquivosCanvas(cursoId: number): Promise<{ ok: true; arquivos: ArquivoCanvas[] } | { ok: false; mensagem: string }>
  /** Baixa o PDF e devolve o caminho dele no PC. */
  baixarCanvas(arquivoId: number): Promise<{ ok: true; caminho: string } | { ok: false; mensagem: string }>

  // Aula da IA (o professor da sessão)
  /** A aula inteira (o estado só traz o resumo). */
  aula(id: number): Promise<Aula | null>
  montarAula(p: PedidoAula): Promise<Resultado>
  perguntarAula(p: PerguntaAula): Promise<Resultado>
  maisExercicios(aulaId: number, pedido: string): Promise<Resultado>
  marcarExercicio(aulaId: number, numero: number, situacao: SituacaoExercicio | null): Promise<void>
  removerAula(id: number): Promise<void>
  escolherMaterialAula(): Promise<string[]>
  escolherFotosAula(): Promise<string[]>
  miniaturaAula(aulaId: number, foto: string): Promise<string | null>
  /** Grava a aula em Markdown no vault. `mensagem` vazia: o Daniel cancelou a escolha do arquivo. */
  salvarAulaNoVault(id: number): Promise<Resultado>
}

declare global {
  interface Window {
    api: Api
  }
}
