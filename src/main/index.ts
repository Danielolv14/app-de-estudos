// Processo principal do App de Estudos: janelas, bandeja, mini-timer e ligação entre as partes.
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  powerMonitor,
  powerSaveBlocker,
  safeStorage,
  screen,
  Tray
} from 'electron'
import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, extname, join } from 'node:path'
import type {
  Config,
  Estado,
  LeituraPlano,
  PedidoAula,
  PedidoEncerrar,
  PedidoSimulado,
  PerguntaAula,
  RevisaoCanvas,
  SituacaoExercicio,
  StatusBloqueio
} from '@shared/tipos'
import { dataLocal, estudoMs, formatarDuracao, listasSoCrescem } from '@shared/regras'
import { gerarResumo } from '@shared/resumo'
import { aulaEmMarkdown, nomeArquivoAula } from '@shared/aula'
import { siglaDe } from '@shared/sigla'
import { Banco } from './banco'
import { Repositorio, type NovaMateria, type NovaTarefa, type NovoEvento } from './repositorio'
import { Assistente, FOTOS_ACEITAS, MAX_MATERIAIS_AULA, MODELOS_ACEITOS } from './assistente'
import { aplicarLeitura, aplicarProposta } from './planejamento'
import { prepararDados } from './seed'
import { ARQUIVOS_FALSOS_CANVAS, dadosFalsosDeAula, dadosFalsosDeCanvas, dadosFalsosDeIa } from './captura'
import { revisaoCanvas, SincroniaCanvas } from './sincronia-canvas'
import { GerenciadorSessao } from './sessao'
import { ControleBloqueio, desinstalarServico, instalarServico, nomeAmigavel, statusBloqueio } from './bloqueio'
import { Lembretes } from './lembrete'
import { agora, definirAgora } from './relogio'

// ---------- Opções de linha de comando (para testes) ----------
const arg = (nome: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3)
const tem = (nome: string): boolean => process.argv.includes(`--${nome}`)

const pastaCaptura = arg('captura')
const modoTeste = !!pastaCaptura || tem('sem-bloqueio')
if (arg('dados')) app.setPath('userData', arg('dados')!)
if (arg('agora')) definirAgora(arg('agora')!)

// Campos de data e hora em português (dd/mm/aaaa e 24 horas).
app.commandLine.appendSwitch('lang', 'pt-BR')
app.setAppUserModelId('com.danielolv.appdeestudos')
if (!app.requestSingleInstanceLock()) app.quit()

const recurso = (...p: string[]) =>
  app.isPackaged ? join(process.resourcesPath, ...p) : join(app.getAppPath(), 'resources', ...p)
const pastaScripts = () => (app.isPackaged ? join(process.resourcesPath, 'servico') : join(app.getAppPath(), 'servico'))

let repo: Repositorio
let sessao: GerenciadorSessao
let lembretes: Lembretes
let assistente: Assistente
let canvas: SincroniaCanvas
let bloqueio: ControleBloqueio
let principal: BrowserWindow | null = null
let mini: BrowserWindow | null = null
let bandeja: Tray | null = null
let saindo = false
let avisos: { id: number; texto: string }[] = []
let proximoAviso = 1
let metaAvisada: string | null = null
let ultimoStatus = ''
let ultimoDia = ''
let ultimoAvisoIa = 0
/** Pedido ao Windows para não dormir sozinho enquanto a sessão está contando (a tela ainda pode apagar). */
let semDormir: number | null = null
/** Aviso fixo de "os sites podem continuar bloqueados", quando o serviço não confirmou a liberação. */
let liberacaoPendente: number | null = null

const STATUS_TESTE: StatusBloqueio = { instalado: true, vivo: true, bloqueado: true, erro: null, desatualizado: false }

// ---------- Estado enviado às telas ----------
function estado(): Estado {
  const t = agora()
  return {
    hoje: dataLocal(t),
    agora: t,
    materias: repo.materias(),
    tarefas: repo.tarefas(),
    eventos: repo.eventos(),
    sessoes: repo.sessoes(),
    metasDia: repo.metasDia(),
    ativa: repo.sessaoAtiva(),
    config: repo.config(),
    bloqueio: modoTeste ? { ...STATUS_TESTE, bloqueado: !!repo.sessaoAtiva() } : statusBloqueio(),
    lembreteAberto: lembretes.aberto,
    avisos,
    simulados: repo.simulados(),
    ia: assistente.estado(),
    semestre: repo.semestre(),
    leituraPlano: repo.leituraPlano(),
    propostaPlano: repo.propostaPlano(),
    canvas: canvas.estado(),
    revisaoCanvas: revisaoCanvas(repo),
    aulas: repo.aulas()
  }
}

let agendado: ReturnType<typeof setTimeout> | null = null
function mudou(): void {
  if (agendado) return
  agendado = setTimeout(() => {
    agendado = null
    const e = estado()
    for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('estado', e)
    atualizarBandeja()
    atualizarMini()
    escreverResumoDepois()
    ajustarSono()
  }, 30)
}

/**
 * Com a sessão contando, o PC não dorme sozinho: o Daniel resolve exercício no papel e a suspensão por inatividade
 * cortaria esse tempo. Se ele mesmo mandar dormir (ou fechar a tampa), o Windows dorme e esse tempo não conta.
 */
function ajustarSono(): void {
  const contando = repo.sessaoAtiva()?.status === 'estudando'
  if (contando && semDormir === null) semDormir = powerSaveBlocker.start('prevent-app-suspension')
  else if (!contando && semDormir !== null) {
    powerSaveBlocker.stop(semDormir)
    semDormir = null
  }
}

/** `fixo`: fica até o Daniel fechar (ou o app tirar), em vez de sumir sozinho. Devolve o id do aviso. */
function avisar(texto: string, notificar = false, fixo = false): number {
  const id = proximoAviso++
  avisos = [...avisos.slice(-3), { id, texto }]
  if (!fixo)
    setTimeout(() => {
      avisos = avisos.filter((a) => a.id !== id)
      mudou()
    }, 9000)
  if (notificar && !(principal?.isVisible() && principal.isFocused())) {
    new Notification({ title: 'App de Estudos', body: texto, icon: recurso('icone.png') }).show()
  }
  mudou()
  return id
}

function tirarAviso(id: number): void {
  avisos = avisos.filter((a) => a.id !== id)
  mudou()
}

/** O PC dormiu no meio da sessão: avisa que esse tempo não contou. */
function avisarParada(ms: number | null): void {
  if (ms === null) return
  avisar(
    `O PC ficou ${ms < 60_000 ? 'alguns segundos' : formatarDuracao(ms)} dormindo, e esse tempo não contou. A sessão está pausada: clique em Retomar quando voltar a estudar.`,
    true
  )
}

// ---------- Resumo no vault ----------
let resumoTimer: ReturnType<typeof setTimeout> | null = null
function escreverResumoDepois(): void {
  if (modoTeste) return
  if (resumoTimer) clearTimeout(resumoTimer)
  resumoTimer = setTimeout(escreverResumo, 3000)
}

function escreverResumo(): void {
  const caminho = repo.config().caminhoResumoVault
  if (!caminho || !existsSync(dirname(caminho))) return
  try {
    const t = agora()
    writeFileSync(
      caminho,
      gerarResumo({
        hoje: dataLocal(t),
        agora: t,
        materias: repo.materias(),
        tarefas: repo.tarefas(),
        eventos: repo.eventos(),
        sessoes: repo.sessoes(),
        metasDia: repo.metasDia(),
        ativa: repo.sessaoAtiva(),
        simulados: repo.simulados()
      }),
      'utf8'
    )
  } catch {
    // Vault fora do lugar ou arquivo aberto: tenta de novo na próxima mudança.
  }
}

// ---------- Janelas ----------
const PRELOAD = join(__dirname, '../preload/index.js')

function carregar(w: BrowserWindow, pagina: 'index' | 'mini'): void {
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) w.loadURL(`${process.env.ELECTRON_RENDERER_URL}/${pagina}.html`)
  else w.loadFile(join(__dirname, `../renderer/${pagina}.html`))
}

function criarPrincipal(mostrar: boolean): void {
  principal = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 680,
    show: false,
    backgroundColor: '#0b0c0e', // = --fundo do estilos.css
    title: 'App de Estudos',
    icon: recurso('icone.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0b0c0e', symbolColor: '#a0a1a8', height: 40 }, // = --fundo e --texto-2
    webPreferences: { preload: PRELOAD, sandbox: true, contextIsolation: true }
  })
  principal.setMenu(null)
  carregar(principal, 'index')
  principal.once('ready-to-show', () => {
    if (mostrar) principal?.show()
  })
  // Fechar no X só esconde: o app continua na bandeja (e o timer, contando).
  principal.on('close', (e) => {
    if (!saindo) {
      e.preventDefault()
      principal?.hide()
    }
  })
  // Desligar ou reiniciar o Windows não pode ficar preso no "fechar só esconde".
  // A sessão fica salva e volta pausada no próximo boot.
  principal.on('query-session-end', () => {
    saindo = true
    repo.banco.salvarAgora()
  })
  for (const ev of ['focus', 'blur', 'show', 'hide', 'minimize', 'restore'] as const) principal.on(ev as 'focus', atualizarMini)
}

function mostrarPrincipal(): void {
  if (!principal) return
  if (principal.isMinimized()) principal.restore()
  principal.show()
  principal.focus()
}

function criarMini(): void {
  const area = screen.getPrimaryDisplay().workArea
  const pos = repo.lerKv<{ x: number; y: number }>('mini_pos')
  mini = new BrowserWindow({
    width: 420,
    height: 92,
    x: pos?.x ?? area.x + area.width - 440,
    y: pos?.y ?? area.y + area.height - 112,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: true,
    show: false,
    hasShadow: false,
    webPreferences: { preload: PRELOAD, sandbox: true, contextIsolation: true }
  })
  mini.setAlwaysOnTop(true, 'floating')
  carregar(mini, 'mini')
  mini.on('moved', () => {
    if (!mini) return
    const [x, y] = mini.getPosition()
    repo.gravarKv('mini_pos', { x, y })
  })
}

/** O mini-timer aparece durante a sessão sempre que a janela principal não está na frente. */
function atualizarMini(): void {
  if (!mini || mini.isDestroyed()) return
  const principalNaFrente = !!principal && principal.isVisible() && !principal.isMinimized() && principal.isFocused()
  const deveMostrar = !!repo.sessaoAtiva() && repo.config().miniTimer && !principalNaFrente
  if (deveMostrar && !mini.isVisible()) mini.showInactive()
  else if (!deveMostrar && mini.isVisible()) mini.hide()
}

// ---------- Bandeja ----------
function atualizarBandeja(): void {
  if (!bandeja) return
  const a = repo.sessaoAtiva()
  const materia = repo.materias().find((m) => m.id === a?.materiaId)
  const resumo = a
    ? `${a.status === 'estudando' ? 'Estudando' : 'Pausado'}: ${formatarDuracao(estudoMs(a, agora()))}${materia ? ` de ${materia.nome}` : ''}`
    : 'Nenhuma sessão agora'
  bandeja.setToolTip(`App de Estudos\n${resumo}`)
  const config = repo.config()
  bandeja.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Abrir o App de Estudos', click: mostrarPrincipal },
      { type: 'separator' },
      { label: resumo, enabled: false },
      ...(a
        ? [
            {
              label: a.status === 'estudando' ? 'Pausar' : 'Continuar',
              click: () => (a.status === 'estudando' ? sessao.pausar() : sessao.retomar())
            }
          ]
        : []),
      {
        label: 'Mini-timer durante a sessão',
        type: 'checkbox' as const,
        checked: config.miniTimer,
        click: () => salvarConfig({ ...repo.config(), miniTimer: !repo.config().miniTimer })
      },
      { type: 'separator' },
      { label: 'Sair', click: sair }
    ])
  )
}

function sair(): void {
  if (repo.sessaoAtiva()) {
    mostrarPrincipal()
    avisar('Encerre a sessão antes de sair do app.')
    return
  }
  saindo = true
  app.quit()
}

// ---------- Configuração ----------
function aplicarInicioComWindows(c: Config): void {
  // Só a versão instalada se cadastra; testes e a pasta dist não.
  if (!app.isPackaged || modoTeste || app.getPath('exe').includes('win-unpacked')) return
  app.setLoginItemSettings({ openAtLogin: c.iniciarComWindows, args: ['--oculto'] })
}

function salvarConfig(c: Config): void {
  if (repo.sessaoAtiva()) c = { ...c, ...listasSoCrescem(repo.config(), c) }
  repo.salvarConfig(c)
  aplicarInicioComWindows(c)
  if (repo.sessaoAtiva() && !modoTeste) void bloqueio.atualizar(c)
  mudou()
}

/** Primeira vez: aponta o resumo para o vault do Obsidian, se ele existir neste PC. */
function configurarPrimeiraVez(): void {
  if (repo.lerKv('config') !== null) return
  const pasta = join(homedir(), 'Documents', 'Obsidian Vault', '02-Areas')
  repo.salvarConfig({
    ...repo.config(),
    caminhoResumoVault: existsSync(pasta) && !modoTeste ? join(pasta, 'Painel de estudos (app).md') : ''
  })
}

// ---------- IPC (pedidos das telas) ----------
function registrarIpc(): void {
  const h = (canal: string, fn: (...a: never[]) => unknown) =>
    ipcMain.handle(canal, async (_e, ...a) => {
      const r = await (fn as (...x: unknown[]) => unknown)(...a)
      mudou()
      return r
    })

  ipcMain.handle('estado', () => estado())
  h('sessao:iniciar', (tarefaId: number | null) => sessao.iniciar(tarefaId))
  h('sessao:pausar', () => sessao.pausar())
  h('sessao:retomar', () => sessao.retomar())
  h('sessao:trocarTarefa', (tarefaId: number | null) => sessao.trocarTarefa(tarefaId))
  h('sessao:trava', () => sessao.situacaoTrava())
  h('sessao:encerrar', (p: PedidoEncerrar) => sessao.encerrar(p))
  h('tarefa:salvar', (t: NovaTarefa) => repo.salvarTarefa(t))
  h('tarefa:marcar', (id: number, feita: boolean) => repo.marcarTarefa(id, feita))
  h('tarefa:mover', (id: number, data: string) => repo.moverTarefa(id, data))
  h('tarefa:remover', (id: number) => repo.removerTarefa(id))
  h('evento:salvar', (e: NovoEvento) => repo.salvarEvento(e))
  h('evento:remover', (id: number) => repo.removerEvento(id))
  h('materia:salvar', (m: NovaMateria) => repo.salvarMateria(m))
  h('materia:arquivar', (id: number, arquivada: boolean) => repo.arquivarMateria(id, arquivada))
  h('semestre:virar', (novo: string, apagarPendentes: boolean) => {
    if (repo.sessaoAtiva()) return { arquivadas: 0, apagadas: 0 }
    const r = repo.virarSemestre(novo.trim() || repo.semestre(), apagarPendentes)
    avisar(`Semestre ${repo.semestre()} começou. ${r.arquivadas} ${r.arquivadas === 1 ? 'matéria arquivada' : 'matérias arquivadas'}.`)
    return r
  })
  h('materia:remover', (id: number) => repo.removerMateria(id))
  h('meta:definir', (data: string, minutos: number | null) => repo.definirMeta(data, minutos))
  h('config:salvar', (c: Config) => salvarConfig(c))
  h('lembrete:adiar', (min: number) => lembretes.adiar(min, agora()))
  h('lembrete:dispensar', () => lembretes.dispensarHoje(agora()))
  h('lembrete:fechar', () => lembretes.fechar())
  h('aviso:remover', (id: number) => {
    avisos = avisos.filter((a) => a.id !== id)
    if (id === liberacaoPendente) liberacaoPendente = null
  })
  h('bloqueio:instalar', async () => {
    const r = await instalarServico(pastaScripts())
    avisar(r.mensagem)
    return r
  })
  h('bloqueio:desinstalar', async () => {
    if (repo.sessaoAtiva()) return { ok: false, mensagem: 'Encerre a sessão antes de remover o bloqueio.' }
    const r = await desinstalarServico(pastaScripts())
    avisar(r.mensagem)
    return r
  })
  h('vault:escolher', async () => {
    const atual = repo.config().caminhoResumoVault
    const r = await dialog.showSaveDialog(principal!, {
      title: 'Onde gravar o resumo no vault',
      defaultPath: atual || join(homedir(), 'Documents', 'Painel de estudos (app).md'),
      filters: [{ name: 'Nota do Obsidian', extensions: ['md'] }]
    })
    if (r.canceled || !r.filePath) return null
    salvarConfig({ ...repo.config(), caminhoResumoVault: r.filePath })
    escreverResumo()
    return r.filePath
  })
  h('janela:principal', () => mostrarPrincipal())

  // ---------- IA (pelo Claude Code) ----------
  h('ia:testar', () => assistente.testar())
  h('ia:cancelar', () => assistente.cancelar())
  h('ia:limpar', () => assistente.limparUltimo())
  h('ia:escolherClaude', async () => {
    const r = await dialog.showOpenDialog(principal!, {
      title: 'Onde está o claude.exe',
      properties: ['openFile'],
      filters: [{ name: 'Claude Code', extensions: ['exe'] }]
    })
    if (r.canceled || !r.filePaths[0]) return null
    salvarConfig({ ...repo.config(), caminhoClaude: r.filePaths[0] })
    return r.filePaths[0]
  })

  // ---------- Simulados ----------
  const escolherArquivos = async (titulo: string, extensoes: string[], varios: boolean): Promise<string[]> => {
    const r = await dialog.showOpenDialog(principal!, {
      title: titulo,
      properties: varios ? ['openFile', 'multiSelections'] : ['openFile'],
      filters: [{ name: 'Arquivos', extensions: extensoes.map((e) => e.slice(1)) }]
    })
    return r.canceled ? [] : r.filePaths
  }
  h('simulado:escolherModelo', async () => (await escolherArquivos('Prova antiga para servir de modelo', MODELOS_ACEITOS, false))[0] ?? null)
  h('simulado:gerar', (p: PedidoSimulado) => assistente.gerarSimulado(p))
  h('simulado:iniciar', (id: number) => {
    const s = repo.simulado(id)
    if (!s || s.iniciadoEm) return
    // A prova conta como sessão de estudo (e o bloqueio liga). Usa a tarefa de hoje da matéria, se tiver.
    let a = repo.sessaoAtiva()
    if (!a) {
      const hoje = dataLocal(agora())
      const deHoje = repo.tarefas().filter((t) => t.data === hoje && !t.feita && t.materiaId === s.materiaId)
      const tarefa = deHoje.find((t) => /simulado/i.test(t.titulo)) ?? deHoje[0]
      a = sessao.iniciar(tarefa?.id ?? null, s.materiaId)
    }
    repo.atualizarSimulado(id, { iniciadoEm: agora(), sessaoId: a.sessaoId })
  })
  h('simulado:terminar', (id: number) => {
    const s = repo.simulado(id)
    if (s?.iniciadoEm && !s.terminadoEm) repo.atualizarSimulado(id, { terminadoEm: agora() })
  })
  h('simulado:remover', (id: number) => {
    if (assistente.estado().trabalho?.simuladoId === id) return
    assistente.removerSimulado(id)
  })
  h('simulado:adicionarFotos', (id: number, arquivos: string[]) => assistente.adicionarFotos(id, arquivos))
  h('simulado:escolherFotos', async (id: number) => {
    const arquivos = await escolherArquivos('Fotos da resolução', FOTOS_ACEITAS, true)
    return arquivos.length > 0 ? assistente.adicionarFotos(id, arquivos) : null
  })
  h('simulado:removerFoto', (id: number, foto: string) => assistente.removerFoto(id, foto))
  h('simulado:corrigir', (id: number) => assistente.corrigirSimulado(id))
  // Miniatura da foto para a tela (a CSP só aceita imagens do próprio app ou data:).
  ipcMain.handle('simulado:miniatura', (_e, id: number, foto: string) => {
    const img = nativeImage.createFromPath(join(assistente.pastaSimulado(id), basename(foto)))
    if (img.isEmpty()) return null
    return img.resize({ width: 320, quality: 'good' }).toDataURL()
  })

  // ---------- Plano de ensino e replanejamento ----------
  h('plano:escolherPdf', async () => (await escolherArquivos('PDF do plano de ensino', ['.pdf'], false))[0] ?? null)
  h('plano:ler', (arquivo: string, materiaId: number | null) => assistente.lerPlanoEnsino(arquivo, materiaId))
  h('plano:aplicarLeitura', (l: LeituraPlano) => {
    const r = aplicarLeitura(repo, l)
    avisar(`Plano de ensino aplicado: ${r.avaliacoes} avaliações e ${r.aulas} aulas no calendário.`)
    return r
  })
  h('plano:descartarLeitura', () => repo.salvarLeituraPlano(null))
  h('plano:replanejar', () => assistente.replanejar())
  h('plano:aplicarProposta', (ids: number[]) => {
    const n = aplicarProposta(repo, ids)
    avisar(n === 0 ? 'Nenhuma mudança aplicada.' : `${n} ${n === 1 ? 'mudança aplicada' : 'mudanças aplicadas'} no plano.`)
    return n
  })
  h('plano:descartarProposta', () => repo.salvarPropostaPlano(null))

  // ---------- Canvas ----------
  h('canvas:conectar', (url: string, token: string) => canvas.conectar(url, token))
  h('canvas:desconectar', () => canvas.desconectar())
  h('canvas:sincronizar', () => canvas.sincronizar(true))
  h('canvas:ligarCurso', (cursoId: number, destino: number | null) => canvas.ligarCurso(cursoId, destino))
  h('canvas:aplicarRevisao', (r: RevisaoCanvas) => canvas.aplicarRevisao(r))
  h('canvas:ignorarRevisao', () => canvas.ignorarRevisao())
  ipcMain.handle('canvas:arquivos', (_e, cursoId: number) => canvas.arquivos(cursoId))
  ipcMain.handle('canvas:baixar', (_e, arquivoId: number) => canvas.baixar(arquivoId))

  // ---------- Aula da IA (o professor da sessão) ----------
  ipcMain.handle('aula:ler', (_e, id: number) => repo.aula(id) ?? null)
  h('aula:montar', (p: PedidoAula) =>
    assistente.montarAula(p, async (ids) => {
      // PDF que não baixa (o professor tirou, a internet caiu) fica de fora; a aula sai com o resto.
      const caminhos: string[] = []
      let falhou = 0
      for (const id of ids) {
        const r = await canvas.baixar(id)
        if (r.ok) caminhos.push(r.caminho)
        else falhou++
      }
      if (falhou > 0) avisar(`Não consegui baixar ${falhou} ${falhou === 1 ? 'PDF' : 'PDFs'} do Canvas. A aula vai sem ${falhou === 1 ? 'ele' : 'eles'}.`)
      return caminhos
    })
  )
  h('aula:perguntar', (p: PerguntaAula) => assistente.perguntar(p))
  h('aula:maisExercicios', (id: number, pedido: string) => assistente.maisExercicios(id, pedido))
  h('aula:marcar', (id: number, numero: number, situacao: SituacaoExercicio | null) => assistente.marcarExercicio(id, numero, situacao))
  h('aula:remover', (id: number) => assistente.removerAula(id))
  h('aula:escolherMaterial', () => escolherArquivos('Material da aula (PDF ou foto)', MODELOS_ACEITOS, true).then((a) => a.slice(0, MAX_MATERIAIS_AULA)))
  h('aula:escolherFotos', () => escolherArquivos('Fotos da resolução', FOTOS_ACEITAS, true))
  ipcMain.handle('aula:miniatura', (_e, id: number, foto: string) => {
    const img = nativeImage.createFromPath(join(assistente.pastaAula(id), basename(foto)))
    return img.isEmpty() ? null : img.resize({ width: 320, quality: 'good' }).toDataURL()
  })
  h('aula:salvarNoVault', async (id: number) => {
    const a = repo.aula(id)
    if (!a) return { ok: false, mensagem: 'Aula não encontrada.' }
    const materia = repo.materias().find((m) => m.id === a.materiaId)
    const nome = nomeArquivoAula(materia ? siglaDe(materia) : 'Estudo', a.conteudo.titulo)
    // Fica ao lado do resumo do vault, numa pasta só das aulas. Sem resumo ligado, pergunta onde salvar.
    const resumo = repo.config().caminhoResumoVault
    let destino: string
    if (resumo && existsSync(dirname(resumo))) destino = join(dirname(resumo), 'Aulas do app', nome)
    else {
      const r = await dialog.showSaveDialog(principal!, {
        title: 'Onde salvar a aula',
        defaultPath: join(homedir(), 'Documents', nome),
        filters: [{ name: 'Nota do Obsidian', extensions: ['md'] }]
      })
      if (r.canceled || !r.filePath) return { ok: false, mensagem: '' }
      destino = r.filePath
    }
    try {
      mkdirSync(dirname(destino), { recursive: true })
      writeFileSync(destino, aulaEmMarkdown(a, materia?.nome ?? 'Estudo livre'), 'utf8')
    } catch (e) {
      return { ok: false, mensagem: `Não consegui salvar: ${(e as Error).message}` }
    }
    const curto = resumo && destino.startsWith(dirname(resumo)) ? `Aulas do app\\${nome}` : destino
    avisar(`Aula salva no Obsidian: ${curto}`)
    return { ok: true, mensagem: destino }
  })
}

/** Foto grande demais para a IA (o limite é 5 MB por imagem): diminui para 2000 px e grava em JPG. */
function copiarImagem(de: string, para: string): string {
  if (statSync(de).size <= 4.5 * 1024 * 1024) {
    copyFileSync(de, para)
    return para
  }
  const img = nativeImage.createFromPath(de)
  if (img.isEmpty()) {
    copyFileSync(de, para)
    return para
  }
  const { width, height } = img.getSize()
  const menor =
    width >= height
      ? img.resize({ width: Math.min(2000, width), quality: 'good' })
      : img.resize({ height: Math.min(2000, height), quality: 'good' })
  const destino = join(dirname(para), `${basename(para, extname(para))}.jpg`)
  writeFileSync(destino, menor.toJPEG(85))
  return destino
}

// ---------- Rotinas periódicas ----------
function iniciarRotinas(): void {
  setInterval(() => avisarParada(sessao.batimento()), 30_000)
  // O PC dormindo não conta como estudo (o batimento acima pega o caso em que o aviso do Windows não chega).
  powerMonitor.on('suspend', () => sessao.suspender())
  powerMonitor.on('resume', () => avisarParada(sessao.acordar()))
  setInterval(() => lembretes.conferir(agora()), 30_000)
  setTimeout(() => lembretes.conferir(agora()), 5000)
  setInterval(() => {
    // Status do serviço de bloqueio mudou?
    const status = modoTeste ? STATUS_TESTE : statusBloqueio()
    const s = JSON.stringify(status)
    if (s !== ultimoStatus) {
      ultimoStatus = s
      mudou()
    }
    // O serviço voltou e liberou os sites depois de uma sessão que terminou sem resposta dele.
    if (liberacaoPendente !== null && (repo.sessaoAtiva() || (status.vivo && !status.bloqueado))) {
      tirarAviso(liberacaoPendente)
      liberacaoPendente = null
      if (!repo.sessaoAtiva()) avisar('O serviço de bloqueio respondeu e liberou os sites.', true)
    }
    // Virou o dia?
    const hoje = dataLocal(agora())
    if (hoje !== ultimoDia) {
      ultimoDia = hoje
      mudou()
    }
  }, 3000)
  setInterval(() => {
    const a = repo.sessaoAtiva()
    if (a) {
      const t = sessao.situacaoTrava()
      if (t.livre && t.metaMin > 0 && metaAvisada !== a.dia) {
        metaAvisada = a.dia
        avisar('Meta de hoje batida. A sessão pode terminar quando você quiser.', true)
      }
    }
    atualizarBandeja()
  }, 15_000)
  setInterval(escreverResumo, 10 * 60_000)
  // Canvas: uma vez logo depois de abrir e depois a cada 6 horas (só se estiver conectado).
  if (!modoTeste) {
    const sincronizarCanvas = () => {
      if (canvas.estado().conectado) void canvas.sincronizar(false)
    }
    setTimeout(sincronizarCanvas, 20_000)
    setInterval(sincronizarCanvas, 6 * 60 * 60_000)
  }
}

// ---------- Capturas de tela (teste da interface) ----------
async function capturar(pasta: string): Promise<void> {
  mkdirSync(pasta, { recursive: true })
  const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))
  const w = principal!
  // Com a janela atrás de outras, o Windows para de pintar e o print sai com a tela anterior.
  w.webContents.setBackgroundThrottling(false)
  const foto = async (wc: Electron.WebContents) => (await wc.capturePage(undefined, { stayAwake: true })).toPNG()
  w.show()
  await esperar(tem('captura-lembrete') ? 6500 : 1500)
  if (tem('captura-sessao')) {
    const hoje = dataLocal(agora())
    const t = repo.tarefas().find((x) => x.data === hoje && !x.feita)
    sessao.iniciar(t?.id ?? null)
    // Começou há 1h12, com 6 min de pausa.
    const a = repo.sessaoAtiva()!
    repo.salvarSessaoAtiva({ ...a, inicio: a.inicio - 78 * 60_000, estudoMs: 72 * 60_000, pausaMs: 6 * 60_000, marco: agora() })
    mudou()
    await esperar(800)
  }
  if (tem('captura-ia')) {
    dadosFalsosDeIa(repo, agora())
    dadosFalsosDeCanvas(repo)
    dadosFalsosDeAula(repo, agora())
    canvas.guardarArquivos(101, ARQUIVOS_FALSOS_CANVAS)
    mudou()
    await esperar(400)
  }
  const js = (codigo: string) => w.webContents.executeJavaScript(codigo)
  for (const tela of ['foco', 'aula', 'plano', 'calendario', 'notas', 'simulado', 'constancia', 'ajustes']) {
    w.webContents.send('navegar', tela)
    await esperar(900)
    writeFileSync(join(pasta, `${tela}.png`), await foto(w.webContents))
    // O simulado corrigido, aberto, de cima a baixo.
    if (tela === 'simulado' && tem('captura-ia')) {
      await js("[...document.querySelectorAll('.lista-simulados button')].pop()?.click()")
      await esperar(700)
      for (const [i, onde] of ['0', '0.5', '1'].entries()) {
        await js(`(() => { const c = document.querySelector('.conteudo'); c.scrollTop = (c.scrollHeight - c.clientHeight) * ${onde} })()`)
        await esperar(400)
        writeFileSync(join(pasta, `simulado-detalhe-${i + 1}.png`), await foto(w.webContents))
      }
      await js("document.querySelector('.voltar')?.click()")
      await esperar(300)
    }
    // A aula da tarefa de hoje, de cima a baixo; depois a lista e o formulário de uma aula nova.
    if (tela === 'aula' && tem('captura-ia')) {
      for (const [i, onde] of ['0.3', '0.6', '1'].entries()) {
        await js(`(() => { const c = document.querySelector('.conteudo'); c.scrollTop = (c.scrollHeight - c.clientHeight) * ${onde} })()`)
        await esperar(500)
        writeFileSync(join(pasta, `aula-${i + 2}.png`), await foto(w.webContents))
      }
      // Gabarito de um exercício ainda não tentado: o primeiro clique só pergunta.
      await js(
        "(() => { const q = [...document.querySelectorAll('.exercicio')].find((e) => !e.className.includes('questao--')); if (!q) return; [...q.querySelectorAll('.botao-texto')].find((b) => b.textContent === 'Gabarito')?.click(); q.scrollIntoView({ block: 'center' }) })()"
      )
      await esperar(500)
      writeFileSync(join(pasta, 'aula-gabarito.png'), await foto(w.webContents))
      await js("document.querySelector('.voltar')?.click()")
      await esperar(400)
      await js("document.querySelector('.titulo-tela .tecla--ambar')?.click()")
      await esperar(1200)
      writeFileSync(join(pasta, 'aula-nova.png'), await foto(w.webContents))
    }
    if (tela === 'plano' || tela === 'calendario') {
      await js("document.querySelector('.conteudo').scrollTop = 0")
    }
  }
  // Meio (IA e semana padrão) e parte de baixo dos Ajustes.
  await js("(() => { const c = document.querySelector('.conteudo'); c.scrollTop = (c.scrollHeight - c.clientHeight) * 0.5 })()")
  await esperar(400)
  writeFileSync(join(pasta, 'ajustes-2.png'), await foto(w.webContents))
  await js("document.querySelector('.conteudo').scrollTop = 99999")
  await esperar(400)
  writeFileSync(join(pasta, 'ajustes-3.png'), await foto(w.webContents))
  if (tem('captura-trava')) {
    w.webContents.send('navegar', 'foco')
    w.webContents.send('abrir-trava')
    await esperar(900)
    writeFileSync(join(pasta, 'trava.png'), await foto(w.webContents))
  }
  if (mini && repo.sessaoAtiva()) {
    mini.showInactive()
    await esperar(900)
    writeFileSync(join(pasta, 'mini.png'), await foto(mini.webContents))
  }
  saindo = true
  repo.banco.fechar()
  app.exit(0)
}

// ---------- Início ----------
app.on('second-instance', () => mostrarPrincipal())
app.on('window-all-closed', () => {
  /* fica na bandeja */
})
app.on('before-quit', () => {
  saindo = true
  repo?.banco.salvarAgora()
})

app.whenReady().then(async () => {
  const banco = await Banco.abrir(join(app.getPath('userData'), 'estudos.sqlite'), require.resolve('sql.js/dist/sql-wasm.wasm'))
  repo = new Repositorio(banco)
  // Antes dos dados: a atualização de dados também grava a configuração, e aí a primeira vez não seria mais detectada.
  configurarPrimeiraVez()
  prepararDados(repo)

  // Steam e outros abrem vários processos de uma vez: avisa uma vez por app a cada minuto.
  const ultimosFechados = new Map<string, number>()
  bloqueio = new ControleBloqueio((processo) => {
    const nome = nomeAmigavel(processo)
    if (Date.now() - (ultimosFechados.get(nome) ?? 0) < 60_000) return
    ultimosFechados.set(nome, Date.now())
    avisar(`Fechei ${nome}. Esses apps ficam fechados até a sessão terminar.`, true)
  })
  sessao = new GerenciadorSessao(repo, {
    agora,
    ligarBloqueio: (reiniciar) => {
      if (modoTeste) return
      void bloqueio.ligar(repo.config(), reiniciar).then((r) => {
        if (r.sites === 'sem-servico') avisar('O bloqueio de sites não está instalado: instale o serviço em Ajustes.')
        else if (r.sites === 'sem-resposta')
          avisar('O serviço de bloqueio não respondeu, então os sites ainda podem abrir. Ele bloqueia assim que voltar; confira em Ajustes.', true)
        if (r.reiniciados.length > 0)
          avisar(`Reiniciei o ${r.reiniciados.join(' e o ')} para derrubar as abas que já estavam abertas.`)
      })
    },
    desligarBloqueio: () => {
      if (modoTeste) return
      void bloqueio.desligar().then((r) => {
        // Não finge que liberou: o pedido fica salvo e o serviço libera quando voltar.
        if (r !== 'sem-resposta' || repo.sessaoAtiva() || liberacaoPendente !== null) return
        liberacaoPendente = avisar(
          'O serviço de bloqueio não respondeu, então o Instagram e o WhatsApp Web podem continuar bloqueados. O pedido para liberar ficou salvo: eles voltam assim que o serviço responder. Para resolver agora, clique em Reinstalar em Ajustes (ou reinicie o PC).',
          true,
          true
        )
      })
    },
    mudou
  })
  lembretes = new Lembretes(repo, recurso('icone.png'), mostrarPrincipal, mudou, !modoTeste)
  assistente = new Assistente(repo, {
    pastaDados: app.getPath('userData'),
    agora,
    mudou: () => {
      mudou()
      // O fim de uma tarefa de IA também avisa fora do app: ela demora alguns minutos.
      const u = assistente?.estado().ultimo
      if (u && u.quando !== ultimoAvisoIa) {
        ultimoAvisoIa = u.quando
        avisar(u.mensagem, true)
      }
    },
    copiarImagem
  })
  canvas = new SincroniaCanvas(repo, {
    agora,
    mudou,
    avisar,
    // O token fica criptografado com a conta do Windows (DPAPI): outro usuário ou outro PC não abre.
    cifrar: (texto) => {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('O Windows não deixou guardar o token com segurança.')
      return safeStorage.encryptString(texto).toString('base64')
    },
    decifrar: (cifrado) => safeStorage.decryptString(Buffer.from(cifrado, 'base64')),
    pastaArquivos: join(app.getPath('userData'), 'canvas')
  })

  registrarIpc()
  criarPrincipal(!tem('oculto') || !!pastaCaptura)
  criarMini()

  bandeja = new Tray(nativeImage.createFromPath(recurso('bandeja.png')))
  bandeja.on('click', mostrarPrincipal)
  atualizarBandeja()
  aplicarInicioComWindows(repo.config())

  if (sessao.recuperarAoAbrir()) avisar('A sessão anterior voltou pausada. O bloqueio continua ligado.', true)
  else if (!modoTeste) void bloqueio.desligar() // garante que não ficou bloqueio sobrando de antes

  iniciarRotinas()
  escreverResumoDepois()
  if (pastaCaptura) principal!.webContents.once('did-finish-load', () => void capturar(pastaCaptura))
})
