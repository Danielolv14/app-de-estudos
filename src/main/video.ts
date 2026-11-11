// Vídeo de demonstração do app (para divulgação), só com --video=<arquivo>. Roda no modo de teste, com os dados
// de mentira das capturas, e grava a própria janela com o MediaRecorder do Chromium (sem programa de fora).
// O arquivo sai em WebM ou MP4, conforme o Chromium deixar; o ffmpeg converte e põe a capa (README, "Vídeo").
import type { BrowserWindow } from 'electron'
import { createWriteStream } from 'node:fs'

const esperar = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export type AcoesDemo = {
  navegar: (tela: string) => void
  abrirTrava: () => void
}

export async function gravarDemo(w: BrowserWindow, arquivo: string, acoes: AcoesDemo): Promise<string> {
  const wc = w.webContents
  const js = <T = unknown>(codigo: string, gesto = false): Promise<T> => wc.executeJavaScript(codigo, gesto) as Promise<T>

  // Legenda embaixo, no visual do app. Trocar o texto faz um fade curto.
  const legenda = async (texto: string | null): Promise<void> => {
    await js(`(() => {
      let el = document.getElementById('legenda-demo')
      if (!el) {
        el = document.createElement('div')
        el.id = 'legenda-demo'
        Object.assign(el.style, {
          position: 'fixed', left: '50%', bottom: '26px', transform: 'translateX(-50%)', zIndex: 9999,
          whiteSpace: 'nowrap', padding: '12px 24px', borderRadius: '999px', textAlign: 'center',
          background: 'rgba(17, 18, 21, 0.94)', border: '1px solid rgba(255, 178, 63, 0.45)',
          boxShadow: '0 18px 40px -12px rgba(0, 0, 0, 0.8)', color: '#ededef',
          font: '600 21px/1.3 var(--fonte)', letterSpacing: '-0.01em', opacity: '0', transition: 'opacity 220ms ease'
        })
        document.body.appendChild(el)
      }
      el.style.opacity = '0'
      setTimeout(() => { if (${JSON.stringify(texto)} !== null) { el.textContent = ${JSON.stringify(texto)}; el.style.opacity = '1' } }, 230)
    })()`)
    await esperar(260)
  }

  // Rola a área de conteúdo até uma fração da altura, com aceleração suave.
  const rolar = (fracao: number, ms: number): Promise<void> =>
    js(`new Promise((pronto) => {
      const c = document.querySelector('.conteudo')
      if (!c) return pronto()
      const de = c.scrollTop, ate = (c.scrollHeight - c.clientHeight) * ${fracao}, t0 = performance.now()
      const passo = (t) => {
        const x = Math.min(1, (t - t0) / ${ms}), e = x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
        c.scrollTop = de + (ate - de) * e
        x < 1 ? requestAnimationFrame(passo) : pronto()
      }
      requestAnimationFrame(passo)
    })`)

  const digitar = async (texto: string, msPorLetra: number): Promise<void> => {
    for (const letra of texto) {
      wc.sendInputEvent({ type: 'char', keyCode: letra })
      await esperar(msPorLetra)
    }
  }

  const clicar = (codigo: string): Promise<unknown> => js(`(() => { ${codigo} })()`)

  // Troca de tela: a legenda some antes, e a nova só aparece com a tela já pintada.
  const cena = async (tela: string, texto: string): Promise<void> => {
    await legenda(null)
    acoes.navegar(tela)
    await esperar(120)
    await js("document.querySelector('.conteudo')?.scrollTo(0, 0)")
    await esperar(230)
    await legenda(texto)
  }

  // ---- Começa a gravar a própria janela ----
  const tipo = await js<string>(
    `(async () => {
      const tipos = ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm']
      const mime = tipos.find((t) => MediaRecorder.isTypeSupported(t))
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12_000_000 })
      window.__partes = []
      rec.ondataavailable = (e) => { if (e.data.size) window.__partes.push(e.data) }
      rec.start(500)
      window.__rec = rec
      return mime
    })()`,
    true
  )
  await esperar(600)

  // ---- Roteiro ----
  await cena('foco', 'Uma sessão de estudo ligada à tarefa do dia')
  await esperar(3200)
  await legenda('Enquanto ela roda, Instagram, WhatsApp Web e jogos não abrem')
  await esperar(3300)

  await legenda(null)
  acoes.abrirTrava()
  await esperar(450)
  await legenda('Parar antes da meta? Só digitando a frase (colar não funciona)')
  const frase = await js<string>("document.querySelector('.frase-alvo')?.textContent ?? ''")
  await digitar(frase.slice(0, 64), 38)
  await esperar(900)
  await legenda(null)
  await clicar("[...document.querySelectorAll('.modal__botoes button')].find((b) => b.textContent.includes('Voltar a estudar'))?.click()")

  await cena('calendario', 'Ligado ao Canvas da PUC: provas, atividades e notas chegam sozinhas')
  await esperar(1500)
  await rolar(0.1, 2200)
  await esperar(1200)

  await cena('plano', 'A IA replaneja a semana, e nada entra sem eu aprovar')
  await esperar(3800)

  await cena('aula', 'Uma aula montada pela IA a partir dos PDFs da matéria')
  await esperar(1300)
  await rolar(0.45, 3200)
  await clicar(
    "const q = [...document.querySelectorAll('.exercicio')][1]; [...(q?.querySelectorAll('.botao-texto') ?? [])].find((b) => b.textContent === 'Dica')?.click()"
  )
  await esperar(900)
  await legenda('E um professor que corrige a resolução, por texto ou foto')
  await rolar(1, 3000)
  await esperar(1500)

  await legenda(null)
  acoes.navegar('simulado')
  await esperar(450)
  await clicar("[...document.querySelectorAll('.lista-simulados button')].pop()?.click()")
  await esperar(450)
  await legenda('Simulado no estilo da prova, corrigido pela foto da folha')
  await esperar(900)
  await rolar(0.45, 2800)
  await esperar(900)
  await clicar("document.querySelector('.voltar')?.click()")

  await cena('constancia', 'Tudo organizado num lugar só')
  await esperar(3200)
  await legenda(null)
  await esperar(400)

  // ---- Para e salva, uma parte por vez (cada uma tem ~meio segundo) ----
  await js('new Promise((pronto) => { window.__rec.onstop = pronto; window.__rec.stop() })')
  const partes = await js<number>('window.__partes.length')
  const saida = createWriteStream(arquivo)
  for (let i = 0; i < partes; i++) {
    const b64 = await js<string>(`(async () => {
      const b = new Uint8Array(await window.__partes[${i}].arrayBuffer())
      let s = ''
      for (let j = 0; j < b.length; j += 0x8000) s += String.fromCharCode(...b.subarray(j, j + 0x8000))
      return btoa(s)
    })()`)
    saida.write(Buffer.from(b64, 'base64'))
  }
  await new Promise<void>((pronto) => saida.end(pronto))
  return tipo
}
