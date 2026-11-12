// Câmera ao vivo para fotografar a resolução no papel e mandar ao professor sem sair do app.
// Serve a webcam ou o celular como câmera (iVCam): a última escolhida fica lembrada neste PC.
// Fluxo: tira a foto, confere e manda; "Outra página" junta mais folhas na mesma mensagem.
import { useEffect, useRef, useState } from 'react'
import { IconeEnviar, IconeFechar, IconeFoto, IconeMais } from './Icones'

const CHAVE = 'aula:camera'
const lembrada = (): string | null => {
  try {
    return localStorage.getItem(CHAVE)
  } catch {
    return null
  }
}
const lembrar = (id: string) => {
  try {
    localStorage.setItem(CHAVE, id)
  } catch {
    // Sem como guardar: na próxima vez abre a câmera padrão.
  }
}

function mensagemDeErro(e: unknown): string {
  const nome = (e as DOMException | undefined)?.name
  if (nome === 'NotAllowedError' || nome === 'SecurityError')
    return 'O Windows não deixou o app usar a câmera. Libere em Configurações > Privacidade e segurança > Câmera, na opção "Permitir que aplicativos da área de trabalho acessem a câmera".'
  if (nome === 'NotFoundError' || nome === 'OverconstrainedError')
    return 'Nenhuma câmera encontrada. Conecte a webcam, ou abra o iVCam no celular e no PC.'
  if (nome === 'NotReadableError' || nome === 'AbortError')
    return 'A câmera está sendo usada por outro programa (Meet, Discord, OBS). Feche o outro e tente de novo.'
  return `Não consegui abrir a câmera: ${(e as Error | undefined)?.message ?? String(e)}`
}

type Props = {
  /** Quantas fotos ainda cabem na mensagem. */
  vagas: number
  /** Falso quando a IA está ocupada: dá para juntar à mensagem, mas não mandar agora. */
  podeMandar: boolean
  /** Junta as fotos à mensagem, para escrever algo antes de mandar. */
  aoJuntar: (caminhos: string[]) => void
  /** Manda direto ao professor, com o que já estiver escrito. */
  aoMandar: (caminhos: string[]) => void
  fechar: () => void
}

export function Camera({ vagas, podeMandar, aoJuntar, aoMandar, fechar }: Props) {
  const video = useRef<HTMLVideoElement>(null)
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [escolhida, setEscolhida] = useState<string | null>(lembrada)
  const [ativa, setAtiva] = useState('')
  const [abrindo, setAbrindo] = useState(true)
  const [erro, setErro] = useState('')
  /** Páginas já aprovadas (imagem em base64), quando ele tira mais de uma. */
  const [paginas, setPaginas] = useState<string[]>([])
  /** Foto recém-tirada, para conferir antes de usar. */
  const [conferir, setConferir] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  // Liga a câmera escolhida, e troca quando ele escolhe outra. Ao fechar, desliga (a luz da webcam apaga).
  useEffect(() => {
    let vivo = true
    let fluxo: MediaStream | null = null
    setAbrindo(true)
    setErro('')
    const pedir = (id: string | null) =>
      navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { ...(id ? { deviceId: { exact: id } } : {}), width: { ideal: 1920 }, height: { ideal: 1080 } }
      })
    pedir(escolhida)
      // A câmera lembrada pode ter sumido (o iVCam fechado, a webcam desligada): tenta a padrão.
      .catch((e: unknown) => {
        if (escolhida) return pedir(null)
        throw e
      })
      .then(async (f) => {
        if (!vivo) {
          f.getTracks().forEach((t) => t.stop())
          return
        }
        fluxo = f
        setAtiva(f.getVideoTracks()[0]?.getSettings().deviceId ?? '')
        if (video.current) {
          video.current.srcObject = f
          await video.current.play().catch(() => undefined)
        }
        // Os nomes das câmeras só aparecem depois que uma foi liberada.
        const lista = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput')
        if (vivo) {
          setCameras(lista)
          setAbrindo(false)
        }
      })
      .catch((e: unknown) => {
        if (!vivo) return
        setErro(mensagemDeErro(e))
        setAbrindo(false)
      })
    return () => {
      vivo = false
      fluxo?.getTracks().forEach((t) => t.stop())
    }
  }, [escolhida])

  function tirar() {
    const v = video.current
    if (!v || !v.videoWidth || abrindo) return
    const tela = document.createElement('canvas')
    tela.width = v.videoWidth
    tela.height = v.videoHeight
    tela.getContext('2d')?.drawImage(v, 0, 0)
    setConferir(tela.toDataURL('image/jpeg', 0.9))
  }

  async function usar(lista: string[], mandar: boolean) {
    if (lista.length === 0 || salvando) return
    setSalvando(true)
    setErro('')
    const caminhos: string[] = []
    for (const imagem of lista) {
      const r = await window.api.fotoDaCamera(imagem)
      if (!r.ok) {
        setErro(r.mensagem)
        setSalvando(false)
        return
      }
      caminhos.push(r.caminho)
    }
    if (mandar) aoMandar(caminhos)
    else aoJuntar(caminhos)
  }

  const todas = conferir ? [...paginas, conferir] : paginas
  const cabeMais = todas.length < vagas
  const podeTirar = !abrindo && !erro && !conferir && paginas.length < vagas

  // Espaço ou Enter tiram a foto; com a foto na tela, Enter manda. Esc fecha.
  const teclas = useRef({ tirar, usar, todas, podeTirar, podeMandar, fechar })
  teclas.current = { tirar, usar, todas, podeTirar, podeMandar, fechar }
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      const t = teclas.current
      if (e.key === 'Escape') t.fechar()
      else if ((e.key === ' ' || e.key === 'Enter') && t.podeTirar && (e.target as HTMLElement).tagName !== 'SELECT') {
        e.preventDefault()
        t.tirar()
      } else if (e.key === 'Enter' && !t.podeTirar && t.todas.length > 0 && t.podeMandar && (e.target as HTMLElement).tagName !== 'BUTTON') {
        e.preventDefault()
        void t.usar(t.todas, true)
      }
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [])

  return (
    <div className="fundo-modal" onMouseDown={(e) => e.target === e.currentTarget && fechar()}>
      <div className="modal camera" role="dialog" aria-label="Tirar foto da resolução">
        <div className="camera__topo">
          <h2>{conferir ? 'Ficou legível?' : 'Foto da resolução'}</h2>
          {cameras.length > 1 && (
            <select
              className="seletor seletor--mini"
              value={ativa}
              aria-label="Câmera"
              onChange={(e) => {
                lembrar(e.target.value)
                setConferir(null)
                setEscolhida(e.target.value)
              }}
            >
              {cameras.map((c, i) => (
                <option key={c.deviceId} value={c.deviceId}>
                  {c.label || `Câmera ${i + 1}`}
                </option>
              ))}
            </select>
          )}
          <button className="botao-texto camera__fechar" onClick={fechar} aria-label="Fechar a câmera">
            <IconeFechar />
          </button>
        </div>

        <div className="camera__visor">
          <video ref={video} muted playsInline className={conferir ? 'escondido' : ''} />
          {conferir && <img src={conferir} alt="Foto tirada" />}
          {abrindo && !erro && <span className="camera__aviso mudo">Abrindo a câmera...</span>}
          {erro && <p className="camera__aviso erro-ia">{erro}</p>}
        </div>

        <div className="camera__rodape">
          {paginas.length > 0 && (
            <div className="camera__paginas" aria-label="Páginas já tiradas">
              {paginas.map((p, i) => (
                <img key={i} src={p} alt={`Página ${i + 1}`} />
              ))}
            </div>
          )}
          <span className="mudo camera__dica">
            {conferir
              ? 'Confira se dá para ler a conta. Enter manda.'
              : paginas.length > 0
                ? `${paginas.length} ${paginas.length === 1 ? 'página tirada' : 'páginas tiradas'}. Tire a próxima ou mande.`
                : 'Enquadre a folha com boa luz. Espaço tira a foto.'}
          </span>
          <span className="compositor__espaco" />
          {conferir ? (
            <>
              <button className="tecla tecla--pequena" onClick={() => setConferir(null)} disabled={salvando}>
                Tirar de novo
              </button>
              {cabeMais && (
                <button
                  className="tecla tecla--pequena"
                  disabled={salvando}
                  onClick={() => {
                    setPaginas([...paginas, conferir])
                    setConferir(null)
                  }}
                >
                  <IconeMais tamanho={15} />
                  Outra página
                </button>
              )}
              <button className="tecla tecla--pequena" onClick={() => void usar(todas, false)} disabled={salvando} title="Junta à mensagem para você escrever algo antes de mandar">
                Juntar à mensagem
              </button>
              <button className="tecla tecla--pequena tecla--ambar" onClick={() => void usar(todas, true)} disabled={salvando || !podeMandar}>
                <IconeEnviar />
                Mandar ao professor
              </button>
            </>
          ) : (
            <>
              {paginas.length > 0 && (
                <button className="tecla tecla--pequena" onClick={() => void usar(paginas, true)} disabled={salvando || !podeMandar}>
                  Mandar {paginas.length === 1 ? 'a página' : `as ${paginas.length}`}
                </button>
              )}
              <button className="tecla tecla--pequena tecla--ambar" onClick={tirar} disabled={!podeTirar}>
                <IconeFoto />
                Tirar foto
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
