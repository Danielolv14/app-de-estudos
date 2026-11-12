// Fotos tiradas pela câmera (a webcam ou o celular pelo iVCam) na tela Aula. Chegam da tela como imagem em base64
// e viram um arquivo numa pasta de passagem, para seguir o mesmo caminho das fotos escolhidas no PC: ao mandar,
// o professor copia a foto para a pasta da aula. O que sobra aqui é apagado depois de um dia.
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const MAX_BYTES = 15 * 1024 * 1024
const UM_DIA = 24 * 60 * 60 * 1000
const EXTENSAO: Record<string, string> = { jpeg: 'jpg', png: 'png', webp: 'webp' }

export function salvarFotoDaCamera(pasta: string, imagem: string, agora: number): string {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(imagem)
  if (!m) throw new Error('A foto da câmera veio num formato que o app não entende.')
  const bytes = Buffer.from(m[2], 'base64')
  if (bytes.length < 100 || bytes.length > MAX_BYTES) throw new Error('A foto da câmera veio vazia ou grande demais.')
  mkdirSync(pasta, { recursive: true })
  apagarAntigas(pasta, agora)
  const ext = EXTENSAO[m[1]]
  let nome = `camera-${agora}.${ext}`
  for (let i = 2; existsSync(join(pasta, nome)); i++) nome = `camera-${agora}-${i}.${ext}`
  writeFileSync(join(pasta, nome), bytes)
  return join(pasta, nome)
}

function apagarAntigas(pasta: string, agora: number): void {
  for (const nome of readdirSync(pasta)) {
    const arquivo = join(pasta, nome)
    try {
      if (statSync(arquivo).mtimeMs < agora - UM_DIA) rmSync(arquivo, { force: true })
    } catch {
      // Em uso ou já apagada: fica para a próxima.
    }
  }
}
