// As tarefas de IA do app: testar a conexão, gerar e corrigir simulados, ler o plano de ensino, replanejar
// e dar aula (montar o material da sessão, responder como professor e criar mais exercícios).
// Uma de cada vez. Cada uma roda numa pasta própria, que é a única que a IA consegue ler.
import { copyFileSync, cpSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import type { Aula, EstadoIa, LeituraPlano, MensagemAula, PedidoAula, PedidoSimulado, PerguntaAula, TipoTrabalhoIa, TrabalhoIa } from '@shared/tipos'
import { dataLocal, diasAte, formatarDuracao, metaDoDia, nomeDiaSemana, somarDias } from '@shared/regras'
import { formatarNota, metaDe, metasAutomaticas, notasDaMateria, NOTA_MINIMA } from '@shared/notas'
import {
  RespostaInvalida,
  validarAula,
  validarCorrecao,
  validarExercicios,
  validarLeitura,
  validarMudancas,
  validarProva,
  validarRespostaProfessor
} from '@shared/respostas-ia'
import { aulaSemGabarito } from '@shared/aula'
import { acharClaude, rodarClaude, type ChamadaClaude, type Esforco, type RespostaClaude } from './claude'
import {
  FORMATO_AULA,
  FORMATO_CORRECAO,
  FORMATO_EXERCICIOS,
  FORMATO_LEITURA,
  FORMATO_MUDANCAS,
  FORMATO_PROFESSOR,
  FORMATO_PROVA,
  FORMATO_TESTE,
  PEDIDO_TESTE,
  pedidoAula,
  pedidoCorrigir,
  pedidoGerar,
  pedidoLer,
  pedidoMaisExercicios,
  pedidoProfessor,
  pedidoReplanejar
} from './prompts'
import type { Repositorio } from './repositorio'

export type Resultado = { ok: boolean; mensagem: string }

export const FOTOS_ACEITAS = ['.jpg', '.jpeg', '.png', '.webp', '.gif']
export const MODELOS_ACEITOS = ['.pdf', ...FOTOS_ACEITAS]
/** Quantos arquivos de material uma aula leva (mais que isso deixa a IA lenta). */
export const MAX_MATERIAIS_AULA = 6

const MINUTO = 60_000
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const LIMITES: Record<TipoTrabalhoIa, { esforco: Esforco; minutos: number }> = {
  teste: { esforco: 'low', minutos: 2 },
  'gerar-simulado': { esforco: 'high', minutos: 10 },
  'corrigir-simulado': { esforco: 'high', minutos: 12 },
  'ler-plano': { esforco: 'medium', minutos: 10 },
  replanejar: { esforco: 'high', minutos: 10 },
  'montar-aula': { esforco: 'high', minutos: 12 },
  professor: { esforco: 'medium', minutos: 6 },
  'mais-exercicios': { esforco: 'medium', minutos: 8 }
}

export type OpcoesAssistente = {
  /** Pasta de dados do app (%APPDATA%\App de Estudos). */
  pastaDados: string
  agora: () => number
  mudou: () => void
  rodar?: (c: ChamadaClaude) => Promise<RespostaClaude>
  acharExe?: (escolhido: string) => string | null
  /** Nos testes: argumentos antes dos do Claude (o script falso). */
  prefixo?: string[]
  /** Copia a foto para a pasta da tarefa e devolve o caminho final. No app, diminui as fotos grandes demais. */
  copiarImagem?: (de: string, para: string) => string
}

/** Trecho de texto para o JSON da situação (a IA não precisa do detalhe inteiro). */
const curto = (s: string, n = 160) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

export class Assistente {
  private trabalho: TrabalhoIa | null = null
  private ultimo: EstadoIa['ultimo'] = null
  private controle: AbortController | null = null

  constructor(
    private readonly repo: Repositorio,
    private readonly o: OpcoesAssistente
  ) {}

  private cacheExe: { chave: string; ate: number; exe: string | null } | null = null

  /** Caminho do claude.exe. Guardado por 30 s: o estado da tela é montado várias vezes por segundo. */
  exe(): string | null {
    const chave = this.repo.config().caminhoClaude
    const agora = Date.now()
    if (this.cacheExe && this.cacheExe.chave === chave && this.cacheExe.ate > agora) return this.cacheExe.exe
    const exe = (this.o.acharExe ?? acharClaude)(chave)
    this.cacheExe = { chave, ate: agora + 30_000, exe }
    return exe
  }

  estado(): EstadoIa {
    const d = new Date(this.o.agora())
    const uso = this.repo.usoIaDesde(new Date(d.getFullYear(), d.getMonth(), 1).getTime())
    return { claude: this.exe(), trabalho: this.trabalho, ultimo: this.ultimo, usosMes: uso.usos, tokensMes: uso.tokens }
  }

  ocupado(): boolean {
    return this.trabalho !== null
  }

  cancelar(): void {
    this.controle?.abort()
  }

  /** Esquece o resultado da última tarefa (o aviso some da tela). */
  limparUltimo(): void {
    this.ultimo = null
  }

  /** Roda uma tarefa de IA: uma por vez, com registro de uso e o resultado guardado para a tela. */
  private async executar(
    tipo: TipoTrabalhoIa,
    descricao: string,
    alvo: { simuladoId?: number; aulaId?: number },
    fn: (chamar: (pasta: string, pedido: string, formato: object) => Promise<unknown>) => Promise<string>
  ): Promise<Resultado> {
    if (this.trabalho) return { ok: false, mensagem: 'A IA já está trabalhando em outra coisa. Espere terminar ou cancele.' }
    const exe = this.exe()
    if (!exe) return this.terminar(tipo, { ok: false, mensagem: 'Não achei o Claude Code neste PC. Instale ou escolha o claude.exe em Ajustes.' })

    this.trabalho = { tipo, descricao, desde: this.o.agora(), simuladoId: alvo.simuladoId ?? null, aulaId: alvo.aulaId ?? null }
    this.ultimo = null
    this.controle = new AbortController()
    this.o.mudou()
    const modelo = this.repo.config().modeloIa
    const chamar = async (pasta: string, pedido: string, formato: object): Promise<unknown> => {
      const r = await (this.o.rodar ?? rodarClaude)({
        exe,
        prefixo: this.o.prefixo,
        pasta,
        pedido,
        formato,
        modelo,
        esforco: LIMITES[tipo].esforco,
        limiteMs: LIMITES[tipo].minutos * MINUTO,
        sinal: this.controle!.signal
      })
      this.repo.registrarUsoIa({
        quando: this.o.agora(),
        tipo,
        modelo,
        segundos: r.segundos,
        tokensEntrada: r.ok ? r.tokensEntrada : 0,
        tokensSaida: r.ok ? r.tokensSaida : 0,
        ok: r.ok,
        erro: r.ok ? '' : r.mensagem
      })
      if (!r.ok) throw new RespostaInvalida(r.mensagem)
      return r.dados
    }
    try {
      const mensagem = await fn(chamar)
      return this.terminar(tipo, { ok: true, mensagem })
    } catch (e) {
      const mensagem = e instanceof RespostaInvalida ? e.message : `Algo deu errado: ${(e as Error).message}`
      return this.terminar(tipo, { ok: false, mensagem })
    } finally {
      this.trabalho = null
      this.controle = null
      this.o.mudou()
    }
  }

  private terminar(tipo: TipoTrabalhoIa, r: Resultado): Resultado {
    this.ultimo = { tipo, ok: r.ok, mensagem: r.mensagem, quando: this.o.agora() }
    this.o.mudou()
    return r
  }

  /** Pasta vazia para uma tarefa nova. */
  private pastaLimpa(nome: string): string {
    const p = join(this.o.pastaDados, 'ia', nome)
    rmSync(p, { recursive: true, force: true })
    mkdirSync(p, { recursive: true })
    return p
  }

  pastaSimulado(id: number): string {
    return join(this.o.pastaDados, 'simulados', String(id))
  }

  private copiar(de: string, pasta: string, nome: string): string {
    const ext = extname(de).toLowerCase()
    const destino = join(pasta, `${nome}${ext}`)
    if (FOTOS_ACEITAS.includes(ext) && this.o.copiarImagem) return this.o.copiarImagem(de, destino)
    copyFileSync(de, destino)
    return destino
  }

  // ---------- Teste ----------

  testar(): Promise<Resultado> {
    return this.executar('teste', 'Testando o Claude Code', {}, async (chamar) => {
      const dados = (await chamar(this.pastaLimpa('teste'), PEDIDO_TESTE, FORMATO_TESTE)) as { ok?: unknown }
      if (dados?.ok !== true) throw new RespostaInvalida('O Claude Code respondeu, mas não do jeito esperado. Tente de novo.')
      const modelo = this.repo.config().modeloIa === 'opus' ? 'Opus' : 'Sonnet'
      return `O Claude Code está funcionando com o ${modelo}.`
    })
  }

  // ---------- Simulado ----------

  gerarSimulado(p: PedidoSimulado): Promise<Resultado> {
    const materia = this.repo.materias().find((m) => m.id === p.materiaId)
    const evento = this.repo.eventos().find((e) => e.id === p.eventoId)
    if (p.modelo && !MODELOS_ACEITOS.includes(extname(p.modelo).toLowerCase()))
      return Promise.resolve({ ok: false, mensagem: 'O modelo de prova precisa ser PDF, JPG ou PNG.' })
    const total = evento?.pontos ?? 10
    return this.executar('gerar-simulado', `Montando o simulado de ${materia?.nome ?? 'estudo livre'}`, {}, async (chamar) => {
      const pasta = this.pastaLimpa('simulado-novo')
      const modelo = p.modelo ? this.copiar(p.modelo, pasta, 'modelo') : null
      const materiais = (p.materiais ?? [])
        .filter((m) => extname(m).toLowerCase() === '.pdf' && existsSync(m))
        .slice(0, 4)
        .map((m, i) => this.copiar(m, pasta, `material-${i + 1}`))
      const hoje = dataLocal(this.o.agora())
      let meta: string | null = null
      if (evento && materia) {
        const m = metaDe(evento, metasAutomaticas(this.repo.eventos(), this.repo.materias()))
        if (m && evento.pontos) meta = `${formatarNota(m.valor)} de ${formatarNota(evento.pontos)}`
      }
      const travou = this.repo
        .sessoes()
        .filter((s) => s.materiaId === p.materiaId && s.checkinTravou && diasAte(hoje, s.dia) >= -30)
        .slice(-8)
        .map((s) => s.checkinTravou)
      const dados = await chamar(
        pasta,
        pedidoGerar({
          materia: materia?.nome ?? 'Estudo livre',
          avaliacao: evento
            ? `${evento.titulo}${evento.data ? `, em ${evento.data}` : ''}${evento.pontos ? `, vale ${formatarNota(evento.pontos)} pontos` : ''}`
            : null,
          conteudos: p.conteudos.trim(),
          duracaoMin: p.duracaoMin,
          total,
          meta,
          travou,
          observacoes: p.observacoes,
          modelo,
          materiais
        }),
        FORMATO_PROVA
      )
      const prova = validarProva(dados, total)
      this.repo.criarSimulado({
        materiaId: p.materiaId,
        eventoId: p.eventoId,
        conteudos: p.conteudos.trim(),
        duracaoMin: p.duracaoMin,
        criadoEm: this.o.agora(),
        prova
      })
      return `Simulado pronto: ${prova.questoes.length} ${prova.questoes.length === 1 ? 'questão' : 'questões'}, ${formatarNota(total)} pontos.`
    })
  }

  /** Guarda as fotos da resolução na pasta do simulado (foto-1.jpg, foto-2.jpg...). */
  adicionarFotos(id: number, arquivos: string[]): Resultado {
    const s = this.repo.simulado(id)
    if (!s) return { ok: false, mensagem: 'Simulado não encontrado.' }
    const recusadas = arquivos.filter((a) => !FOTOS_ACEITAS.includes(extname(a).toLowerCase()))
    const boas = arquivos.filter((a) => FOTOS_ACEITAS.includes(extname(a).toLowerCase()) && existsSync(a))
    const pasta = this.pastaSimulado(id)
    mkdirSync(pasta, { recursive: true })
    const fotos = [...s.fotos]
    for (const a of boas) {
      let n = fotos.length + 1
      while (fotos.some((f) => f.startsWith(`foto-${n}.`))) n++
      fotos.push(basename(this.copiar(a, pasta, `foto-${n}`)))
    }
    this.repo.atualizarSimulado(id, { fotos })
    const heic = recusadas.some((a) => /\.hei[cf]$/i.test(a))
    if (recusadas.length > 0)
      return {
        ok: boas.length > 0,
        mensagem: heic
          ? 'Fotos HEIC (do iPhone) não funcionam. No iPhone, mande como JPG (Ajustes > Câmera > Formatos > Mais compatível).'
          : `Ficaram de fora ${recusadas.length} arquivo(s): só dá para usar JPG, PNG ou WEBP.`
      }
    return { ok: true, mensagem: `${boas.length} ${boas.length === 1 ? 'foto adicionada' : 'fotos adicionadas'}.` }
  }

  removerFoto(id: number, foto: string): void {
    const s = this.repo.simulado(id)
    if (!s) return
    rmSync(join(this.pastaSimulado(id), basename(foto)), { force: true })
    this.repo.atualizarSimulado(id, { fotos: s.fotos.filter((f) => f !== foto) })
  }

  removerSimulado(id: number): void {
    rmSync(this.pastaSimulado(id), { recursive: true, force: true })
    this.repo.removerSimulado(id)
  }

  corrigirSimulado(id: number): Promise<Resultado> {
    const s = this.repo.simulado(id)
    if (!s) return Promise.resolve({ ok: false, mensagem: 'Simulado não encontrado.' })
    if (s.fotos.length === 0) return Promise.resolve({ ok: false, mensagem: 'Adicione as fotos da resolução antes de corrigir.' })
    const materia = this.repo.materias().find((m) => m.id === s.materiaId)?.nome ?? 'estudo livre'
    return this.executar('corrigir-simulado', `Corrigindo o simulado de ${materia}`, { simuladoId: id }, async (chamar) => {
      const pasta = this.pastaSimulado(id)
      const dados = await chamar(
        pasta,
        pedidoCorrigir({ materia, prova: JSON.stringify(s.prova, null, 1), fotos: s.fotos.map((f) => join(pasta, f)) }),
        FORMATO_CORRECAO
      )
      const correcao = validarCorrecao(dados, s.prova, this.o.agora())
      this.repo.atualizarSimulado(id, { correcao })
      return `Correção pronta: ${formatarNota(correcao.nota)} de ${formatarNota(correcao.total)} (estimativa).`
    })
  }

  // ---------- Plano de ensino ----------

  lerPlanoEnsino(arquivo: string, materiaId: number | null): Promise<Resultado> {
    if (extname(arquivo).toLowerCase() !== '.pdf') return Promise.resolve({ ok: false, mensagem: 'Escolha o PDF do plano de ensino.' })
    if (!existsSync(arquivo)) return Promise.resolve({ ok: false, mensagem: 'Não achei esse arquivo.' })
    const materia = this.repo.materias().find((m) => m.id === materiaId) ?? null
    return this.executar('ler-plano', `Lendo o plano de ensino${materia ? ` de ${materia.nome}` : ''}`, {}, async (chamar) => {
      const pasta = this.pastaLimpa('plano-de-ensino')
      const copia = this.copiar(arquivo, pasta, 'plano')
      const dados = await chamar(pasta, pedidoLer({ arquivo: copia, hoje: dataLocal(this.o.agora()), materia: materia?.nome ?? null }), FORMATO_LEITURA)
      const lido = validarLeitura(dados)
      const leitura: LeituraPlano = {
        arquivo: basename(arquivo),
        materiaId: materia?.id ?? null,
        ...lido,
        materia: materia?.nome ?? lido.materia,
        lidaEm: this.o.agora()
      }
      this.repo.salvarLeituraPlano(leitura)
      return `Li o plano de ensino: ${lido.avaliacoes.length} avaliações e ${lido.aulas.length} aulas. Revise no Calendário antes de aplicar.`
    })
  }

  // ---------- Aula da sessão (a IA como professor) ----------

  pastaAula(id: number): string {
    return join(this.o.pastaDados, 'aulas', String(id))
  }

  /** Copia um arquivo de material mantendo o nome (a IA cita o nome em "origem"), sem repetir nome na pasta. */
  private copiarMaterial(de: string, pasta: string, usados: Set<string>): string {
    const ext = extname(de).toLowerCase()
    const base =
      basename(de, extname(de))
        .replace(/[^\p{L}\p{N} ._-]+/gu, '_')
        .trim()
        .slice(0, 70) || 'material'
    let nome = base
    for (let n = 2; usados.has(`${nome}${ext}`.toLowerCase()); n++) nome = `${base} (${n})`
    usados.add(`${nome}${ext}`.toLowerCase())
    return this.copiar(de, pasta, nome)
  }

  /**
   * Monta o material da sessão: a explicação do tema (a partir do material do professor), exemplos, armadilhas e
   * exercícios com dica e resolução. `baixar` traz os PDFs do Canvas e roda dentro do trabalho, para a tela mostrar
   * "preparando a aula" desde o começo.
   */
  montarAula(p: PedidoAula, baixar: (ids: number[]) => Promise<string[]>): Promise<Resultado> {
    const tema = p.tema.trim()
    if (!tema) return Promise.resolve({ ok: false, mensagem: 'Escreva o tema da aula.' })
    if (p.arquivosPc.some((a) => !MODELOS_ACEITOS.includes(extname(a).toLowerCase())))
      return Promise.resolve({ ok: false, mensagem: 'O material precisa ser PDF, JPG ou PNG.' })
    const materia = this.repo.materias().find((m) => m.id === p.materiaId) ?? null
    const tarefa = p.tarefaId !== null ? this.repo.tarefa(p.tarefaId) : undefined
    return this.executar('montar-aula', `Preparando a aula de ${materia?.nome ?? 'estudo livre'}`, {}, async (chamar) => {
      const pasta = this.pastaLimpa('aula-nova')
      const doCanvas = p.arquivosCanvas.length > 0 ? await baixar(p.arquivosCanvas.slice(0, MAX_MATERIAIS_AULA)) : []
      const usados = new Set<string>()
      const materiais = [...doCanvas, ...p.arquivosPc]
        .filter((a, i, todos) => existsSync(a) && todos.indexOf(a) === i)
        .slice(0, MAX_MATERIAIS_AULA)
        .map((a) => this.copiarMaterial(a, pasta, usados))
      const hoje = dataLocal(this.o.agora())
      const dados = await chamar(
        pasta,
        pedidoAula({
          materia: materia?.nome ?? 'Estudo livre',
          tema,
          tarefa: tarefa ? `${tarefa.titulo}${tarefa.detalhe ? `. ${curto(tarefa.detalhe, 400)}` : ''}` : null,
          minutos: tarefa?.minutos ?? null,
          avaliacao: materia ? this.proximaAvaliacao(materia.id, hoje) : null,
          travou: this.travouNaMateria(p.materiaId, hoje),
          pontosFracos: this.repo
            .simulados()
            .filter((s) => s.materiaId === p.materiaId && s.correcao)
            .slice(0, 2)
            .flatMap((s) => s.correcao!.pontosFracos),
          bibliografia: materia?.bibliografia ?? '',
          pedido: p.pedido,
          materiais
        }),
        FORMATO_AULA
      )
      const nomes = materiais.map((m) => basename(m))
      const conteudo = validarAula(dados, nomes)
      const id = this.repo.criarAula({ tarefaId: tarefa?.id ?? null, materiaId: p.materiaId, tema, criadaEm: this.o.agora(), conteudo, materiais: nomes })
      // A pasta vira a da aula: as perguntas ao professor depois leem o mesmo material.
      const destino = this.pastaAula(id)
      rmSync(destino, { recursive: true, force: true })
      mkdirSync(join(this.o.pastaDados, 'aulas'), { recursive: true })
      try {
        renameSync(pasta, destino)
      } catch {
        cpSync(pasta, destino, { recursive: true })
      }
      const n = conteudo.exercicios.length
      return `Aula pronta: ${conteudo.secoes.length} ${conteudo.secoes.length === 1 ? 'parte' : 'partes'} e ${n} ${n === 1 ? 'exercício' : 'exercícios'}.`
    })
  }

  /** "Prova 3 de Cálculo, em 2026-12-03 (quinta), vale 25, meta do aluno 13, o que cai: ...". */
  private proximaAvaliacao(materiaId: number, hoje: string): string | null {
    const eventos = this.repo.eventos()
    const e = eventos
      .filter((x) => x.materiaId === materiaId && x.tipo !== 'aula' && x.tipo !== 'outro' && x.nota === null && x.data !== null && x.data >= hoje)
      .sort((a, b) => a.data!.localeCompare(b.data!))[0]
    if (!e) return null
    const meta = metaDe(e, metasAutomaticas(eventos, this.repo.materias()))
    return [
      `${e.titulo}, em ${e.data} (${nomeDiaSemana(e.data!)})`,
      e.pontos ? `vale ${formatarNota(e.pontos)}` : '',
      meta ? `meta do aluno ${formatarNota(meta.valor)}` : '',
      e.conteudo ? `o que cai: ${curto(e.conteudo, 400)}` : ''
    ]
      .filter(Boolean)
      .join(', ')
  }

  private travouNaMateria(materiaId: number | null, hoje: string): string[] {
    return this.repo
      .sessoes()
      .filter((s) => s.materiaId === materiaId && s.checkinTravou && diasAte(hoje, s.dia) >= -30)
      .slice(-6)
      .map((s) => s.checkinTravou)
  }

  private materiaisDaAula(a: Aula): string[] {
    const pasta = this.pastaAula(a.id)
    return a.materiais.map((m) => join(pasta, m)).filter((m) => existsSync(m))
  }

  /**
   * O aluno manda uma dúvida ou a resolução de um exercício (texto e/ou fotos). O professor responde e, se for a
   * resolução, marca o exercício como certo, parcial ou errado. As duas mensagens só entram juntas, no fim:
   * se a IA falhar, nada fica pela metade (a tela guarda o texto para mandar de novo).
   */
  perguntar(p: PerguntaAula): Promise<Resultado> {
    const a = this.repo.aula(p.aulaId)
    if (!a) return Promise.resolve({ ok: false, mensagem: 'Aula não encontrada.' })
    if (!p.texto.trim() && p.fotos.length === 0) return Promise.resolve({ ok: false, mensagem: 'Escreva a dúvida ou mande a foto da resolução.' })
    const recusadas = p.fotos.filter((f) => !FOTOS_ACEITAS.includes(extname(f).toLowerCase()))
    if (recusadas.length > 0)
      return Promise.resolve({
        ok: false,
        mensagem: recusadas.some((f) => /\.hei[cf]$/i.test(f))
          ? 'Fotos HEIC (do iPhone) não funcionam. No iPhone, mande como JPG (Ajustes > Câmera > Formatos > Mais compatível).'
          : 'As fotos precisam ser JPG, PNG ou WEBP.'
      })
    const materia = this.repo.materias().find((m) => m.id === a.materiaId)?.nome ?? 'estudo livre'
    return this.executar('professor', 'O professor está respondendo', { aulaId: a.id }, async (chamar) => {
      const pasta = this.pastaAula(a.id)
      mkdirSync(pasta, { recursive: true })
      const marca = this.o.agora()
      const fotos = p.fotos.filter((f) => existsSync(f)).map((f, i) => this.copiar(f, pasta, `resposta-${marca}-${i + 1}`))
      const escolhido = a.conteudo.exercicios.find((e) => e.numero === p.exercicio)
      const dados = await chamar(
        pasta,
        pedidoProfessor({
          materia,
          tema: a.tema,
          aula: JSON.stringify(aulaSemGabarito(a.conteudo)),
          materiais: this.materiaisDaAula(a),
          conversa: a.conversa.slice(-10).map((m) => `${m.de === 'aluno' ? 'Aluno' : 'Professor'}: ${curto(m.texto, 1500)}`),
          texto: p.texto,
          fotos,
          exercicio: p.exercicio,
          referencia: escolhido?.resposta || null
        }),
        FORMATO_PROFESSOR
      )
      const r = validarRespostaProfessor(
        dados,
        a.conteudo.exercicios.map((e) => e.numero)
      )
      // Lê de novo: o aluno pode ter marcado um exercício enquanto o professor pensava.
      const atual = this.repo.aula(a.id) ?? a
      const agora = this.o.agora()
      const novas: MensagemAula[] = [
        { de: 'aluno', texto: p.texto.trim(), quando: marca, fotos: fotos.map((f) => basename(f)), exercicio: p.exercicio },
        { de: 'professor', texto: r.resposta, quando: agora, fotos: [], exercicio: r.exercicio }
      ]
      const progresso = r.exercicio !== null && r.situacao ? { ...atual.progresso, [String(r.exercicio)]: r.situacao } : atual.progresso
      this.repo.atualizarAula(a.id, { conversa: [...atual.conversa, ...novas], progresso }, agora)
      if (r.exercicio !== null && r.situacao)
        return `Exercício ${r.exercicio}: ${r.situacao === 'acertei' ? 'certo' : r.situacao === 'parcial' ? 'certo em parte' : 'errado'}. Veja a resposta do professor.`
      return 'O professor respondeu.'
    })
  }

  /**
   * Apaga a conversa com o professor e as fotos mandadas nela, para a conversa não crescer sem fim.
   * As marcas dos exercícios (certo, em parte, errado) ficam.
   */
  limparConversa(aulaId: number): Resultado {
    const a = this.repo.aula(aulaId)
    if (!a) return { ok: false, mensagem: 'Aula não encontrada.' }
    if (this.trabalho?.aulaId === aulaId) return { ok: false, mensagem: 'Espere o professor terminar de responder.' }
    const pasta = this.pastaAula(aulaId)
    // Só as fotos da conversa: o material da aula fica na mesma pasta.
    for (const m of a.conversa)
      for (const f of m.fotos) if (basename(f).startsWith('resposta-')) rmSync(join(pasta, basename(f)), { force: true })
    this.repo.atualizarAula(aulaId, { conversa: [] }, this.o.agora())
    return { ok: true, mensagem: 'Conversa com o professor limpa.' }
  }

  /** Mais exercícios no fim da aula, focando nos que ele errou. */
  maisExercicios(aulaId: number, pedido: string): Promise<Resultado> {
    const a = this.repo.aula(aulaId)
    if (!a) return Promise.resolve({ ok: false, mensagem: 'Aula não encontrada.' })
    const materia = this.repo.materias().find((m) => m.id === a.materiaId)?.nome ?? 'estudo livre'
    return this.executar('mais-exercicios', 'O professor está criando mais exercícios', { aulaId: a.id }, async (chamar) => {
      const pasta = this.pastaAula(a.id)
      mkdirSync(pasta, { recursive: true })
      const errados = Object.entries(a.progresso)
        .filter(([, s]) => s !== 'acertei')
        .map(([n, s]) => {
          const e = a.conteudo.exercicios.find((x) => String(x.numero) === n)
          return e ? `${s === 'errei' ? 'errou' : 'acertou em parte'} o exercício ${e.numero}: ${curto(e.enunciado, 300)}` : ''
        })
        .filter(Boolean)
      const dados = (await chamar(
        pasta,
        pedidoMaisExercicios({ materia, tema: a.tema, aula: JSON.stringify(a.conteudo), materiais: this.materiaisDaAula(a), errados, pedido }),
        FORMATO_EXERCICIOS
      )) as { exercicios?: unknown } | null
      const atual = this.repo.aula(a.id) ?? a
      const inicio = atual.conteudo.exercicios.reduce((m, e) => Math.max(m, e.numero), 0) + 1
      const novos = validarExercicios(dados?.exercicios, inicio, 8)
      if (novos.length === 0) throw new RespostaInvalida('A IA não devolveu exercícios novos. Tente de novo.')
      this.repo.atualizarAula(a.id, { conteudo: { ...atual.conteudo, exercicios: [...atual.conteudo.exercicios, ...novos] } }, this.o.agora())
      return `${novos.length} ${novos.length === 1 ? 'exercício novo' : 'exercícios novos'} no fim da aula.`
    })
  }

  /** Marca (ou desmarca, com nulo) um exercício pelo próprio aluno, sem IA. */
  marcarExercicio(aulaId: number, numero: number, situacao: Aula['progresso'][string] | null): void {
    const a = this.repo.aula(aulaId)
    if (!a || !a.conteudo.exercicios.some((e) => e.numero === numero)) return
    const progresso = { ...a.progresso }
    if (situacao) progresso[String(numero)] = situacao
    else delete progresso[String(numero)]
    this.repo.atualizarAula(aulaId, { progresso }, this.o.agora())
  }

  removerAula(id: number): void {
    if (this.trabalho?.aulaId === id) return
    rmSync(this.pastaAula(id), { recursive: true, force: true })
    this.repo.removerAula(id)
  }

  // ---------- Replanejar ----------

  replanejar(): Promise<Resultado> {
    const hoje = dataLocal(this.o.agora())
    const pendentes = this.repo.tarefas().filter((t) => !t.feita)
    const montar = pendentes.filter((t) => t.data >= hoje).length < 3
    return this.executar('replanejar', montar ? 'Montando o plano' : 'Replanejando', {}, async (chamar) => {
      const dados = await chamar(this.pastaLimpa('replanejar'), pedidoReplanejar(JSON.stringify(this.situacaoPlano(hoje), null, 1), montar), FORMATO_MUDANCAS)
      const v = validarMudancas(dados, { tarefas: this.repo.tarefas(), materias: this.repo.materias(), hoje })
      this.repo.salvarPropostaPlano({ criadaEm: this.o.agora(), ...v })
      if (v.mudancas.length === 0) return 'A IA achou o plano bom como está: nenhuma mudança.'
      return `A IA sugeriu ${v.mudancas.length} ${v.mudancas.length === 1 ? 'mudança' : 'mudanças'}. Revise na tela Plano antes de aplicar.`
    })
  }

  /** Tudo o que a IA precisa saber para replanejar, sem o que não ajuda (tarefas antigas já feitas, por exemplo). */
  situacaoPlano(hoje: string): object {
    const materias = this.repo.materiasAtivas()
    const ids = new Set(materias.map((m) => m.id))
    const eventos = this.repo.eventos()
    const tarefas = this.repo.tarefas()
    const sessoes = this.repo.sessoes().filter((s) => s.fim !== null)
    const config = this.repo.config()
    const nome = (id: number | null) => materias.find((m) => m.id === id)?.nome ?? 'sem matéria'
    const automaticas = metasAutomaticas(eventos, this.repo.materias())
    const limite = somarDias(hoje, 42)

    const situacaoNota = (id: number): string => {
      const n = notasDaMateria(eventos, id)
      if (n.situacao === 'sem-avaliacoes') return 'sem avaliações cadastradas'
      if (n.situacao === 'garantido') return `já passou (tem ${formatarNota(n.obtido)} de ${NOTA_MINIMA})`
      if (n.situacao === 'folga') return `chega a ${NOTA_MINIMA} com as metas`
      if (n.situacao === 'possivel') return `precisa de ${Math.ceil((n.fracao ?? 0) * 100)}% em cada avaliação que falta`
      if (n.situacao === 'abaixo') return `as metas fixadas não chegam a ${NOTA_MINIMA}`
      return `não chega a ${NOTA_MINIMA} nem tirando o máximo`
    }
    const horas = (de: string) =>
      Object.fromEntries(
        materias.map((m) => [
          m.nome,
          formatarDuracao(sessoes.filter((s) => s.materiaId === m.id && s.dia >= de && s.dia <= hoje).reduce((a, s) => a + s.estudoSeg * 1000, 0))
        ])
      )

    return {
      hoje: `${hoje} (${nomeDiaSemana(hoje)})`,
      semanaPadrao: config.semanaPadrao
        .filter((b) => ids.has(b.materiaId))
        .sort((a, b) => ((a.dia + 6) % 7) - ((b.dia + 6) % 7))
        .map((b) => ({ dia: DIAS[b.dia], materiaId: b.materiaId, materia: nome(b.materiaId), horas: b.minutos / 60 })),
      materias: materias.map((m) => ({ id: m.id, nome: m.nome, nota: situacaoNota(m.id) })),
      avaliacoesFuturas: eventos
        .filter((e) => e.materiaId !== null && ids.has(e.materiaId) && e.tipo !== 'aula' && e.tipo !== 'outro' && e.nota === null)
        .filter((e) => e.data === null || e.data >= hoje)
        .map((e) => {
          const meta = metaDe(e, automaticas)
          return {
            data: e.data ?? 'sem data ainda',
            materiaId: e.materiaId,
            titulo: e.titulo,
            vale: e.pontos,
            meta: meta ? formatarNota(meta.valor) : null,
            conteudo: curto(e.conteudo, 300)
          }
        }),
      aulasFuturas: eventos
        .filter((e) => e.tipo === 'aula' && e.data !== null && e.data >= hoje && e.data <= limite && (e.materiaId === null || ids.has(e.materiaId)))
        .map((e) => ({ data: e.data, materiaId: e.materiaId, assunto: curto(e.conteudo || e.titulo) })),
      outrosEventos: eventos
        .filter((e) => e.tipo === 'outro' && e.data !== null && e.data >= hoje && e.data <= limite)
        .map((e) => ({ data: e.data, titulo: e.titulo })),
      tarefasPendentes: tarefas
        .filter((t) => !t.feita && (t.materiaId === null || ids.has(t.materiaId)))
        .map((t) => ({
          id: t.id,
          data: t.data,
          atrasada: t.data < hoje,
          materiaId: t.materiaId,
          titulo: t.titulo,
          detalhe: curto(t.detalhe),
          minutos: t.minutos
        })),
      feitasNasUltimas2Semanas: tarefas
        .filter((t) => t.feita && t.data >= somarDias(hoje, -14) && t.data <= hoje)
        .map((t) => ({ data: t.data, materia: nome(t.materiaId), titulo: t.titulo })),
      metaDeHoje: formatarDuracao(metaDoDia(hoje, tarefas, this.repo.metasDia()) * MINUTO),
      metasAjustadasAMao: Object.fromEntries(Object.entries(this.repo.metasDia()).filter(([d]) => d >= hoje)),
      horasEstudadas: { ultimos7Dias: horas(somarDias(hoje, -6)), ultimos14Dias: horas(somarDias(hoje, -13)) },
      checkins: sessoes
        .filter((s) => s.dia >= somarDias(hoje, -14) && (s.checkinFeito || s.checkinTravou))
        .map((s) => ({ dia: s.dia, materia: nome(s.materiaId), feito: s.checkinFeito, travou: s.checkinTravou })),
      simulados: this.repo
        .simulados()
        .filter((s) => s.correcao)
        .slice(0, 4)
        .map((s) => ({
          dia: dataLocal(s.criadoEm),
          materia: nome(s.materiaId),
          nota: `${formatarNota(s.correcao!.nota)} de ${formatarNota(s.correcao!.total)}`,
          pontosFracos: s.correcao!.pontosFracos
        }))
    }
  }
}
