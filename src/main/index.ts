// Processo principal do App de Estudos: janelas, bandeja, mini-timer e ligação entre as partes.
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Notification, screen, Tray } from 'electron'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Config, Estado, StatusBloqueio } from '@shared/tipos'
import { dataLocal, estudoMs, formatarDuracao } from '@shared/regras'
import { gerarResumo } from '@shared/resumo'
import { Banco } from './banco'
import { Repositorio, type NovaTarefa, type NovoEvento } from './repositorio'
import { semear } from './seed'
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

const STATUS_TESTE: StatusBloqueio = { instalado: true, vivo: true, bloqueado: true, erro: null }

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
    avisos
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
  }, 30)
}

function avisar(texto: string, notificar = false): void {
  const id = proximoAviso++
  avisos = [...avisos.slice(-3), { id, texto }]
  setTimeout(() => {
    avisos = avisos.filter((a) => a.id !== id)
    mudou()
  }, 9000)
  if (notificar && !(principal?.isVisible() && principal.isFocused())) {
    new Notification({ title: 'App de Estudos', body: texto, icon: recurso('icone.png') }).show()
  }
  mudou()
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
        ativa: repo.sessaoAtiva()
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
    backgroundColor: '#17191d',
    title: 'App de Estudos',
    icon: recurso('icone.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#17191d', symbolColor: '#bdb7aa', height: 40 },
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
  h('sessao:encerrar', (p: { frase?: string; marcarFeita: boolean }) => sessao.encerrar(p))
  h('tarefa:salvar', (t: NovaTarefa) => repo.salvarTarefa(t))
  h('tarefa:marcar', (id: number, feita: boolean) => repo.marcarTarefa(id, feita))
  h('tarefa:remover', (id: number) => repo.removerTarefa(id))
  h('evento:salvar', (e: NovoEvento) => repo.salvarEvento(e))
  h('evento:remover', (id: number) => repo.removerEvento(id))
  h('materia:salvar', (m: { id?: number; nome: string; cor: string }) => repo.salvarMateria(m))
  h('materia:remover', (id: number) => repo.removerMateria(id))
  h('meta:definir', (data: string, minutos: number | null) => repo.definirMeta(data, minutos))
  h('config:salvar', (c: Config) => salvarConfig(c))
  h('lembrete:adiar', (min: number) => lembretes.adiar(min, agora()))
  h('lembrete:dispensar', () => lembretes.dispensarHoje(agora()))
  h('lembrete:fechar', () => lembretes.fechar())
  h('aviso:remover', (id: number) => {
    avisos = avisos.filter((a) => a.id !== id)
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
}

// ---------- Rotinas periódicas ----------
function iniciarRotinas(): void {
  setInterval(() => sessao.batimento(), 30_000)
  setInterval(() => lembretes.conferir(agora()), 30_000)
  setTimeout(() => lembretes.conferir(agora()), 5000)
  setInterval(() => {
    // Status do serviço de bloqueio mudou?
    const s = JSON.stringify(modoTeste ? STATUS_TESTE : statusBloqueio())
    if (s !== ultimoStatus) {
      ultimoStatus = s
      mudou()
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
}

// ---------- Capturas de tela (teste da interface) ----------
async function capturar(pasta: string): Promise<void> {
  mkdirSync(pasta, { recursive: true })
  const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))
  const w = principal!
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
  for (const tela of ['foco', 'plano', 'calendario', 'ajustes']) {
    w.webContents.send('navegar', tela)
    await esperar(900)
    writeFileSync(join(pasta, `${tela}.png`), (await w.webContents.capturePage()).toPNG())
  }
  // Parte de baixo dos Ajustes.
  await w.webContents.executeJavaScript("document.querySelector('.conteudo').scrollTop = 99999")
  await esperar(400)
  writeFileSync(join(pasta, 'ajustes-2.png'), (await w.webContents.capturePage()).toPNG())
  if (tem('captura-trava')) {
    w.webContents.send('navegar', 'foco')
    w.webContents.send('abrir-trava')
    await esperar(900)
    writeFileSync(join(pasta, 'trava.png'), (await w.webContents.capturePage()).toPNG())
  }
  if (mini && repo.sessaoAtiva()) {
    mini.showInactive()
    await esperar(900)
    writeFileSync(join(pasta, 'mini.png'), (await mini.webContents.capturePage()).toPNG())
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
  semear(repo)
  configurarPrimeiraVez()

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
        if (!r.sites) avisar('O bloqueio de sites não está ligado: instale o serviço em Ajustes.')
        if (r.chromeReiniciado) avisar('Reiniciei o Chrome para derrubar as abas que já estavam abertas.')
      })
    },
    desligarBloqueio: () => {
      if (!modoTeste) void bloqueio.desligar()
    },
    mudou
  })
  lembretes = new Lembretes(repo, recurso('icone.png'), mostrarPrincipal, mudou, !modoTeste)

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
