// Foto tirada pela câmera da Aula (vira arquivo para seguir o caminho das fotos do PC) e a escolha do teclado
// em português para o ditado do Windows.
import { existsSync, mkdtempSync, readdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { salvarFotoDaCamera } from '../src/main/camera'
import { numeroDaJanela, tecladoPortugues } from '../src/main/ditado'

const AGORA = new Date(2026, 10, 11, 15, 0).getTime()
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(400, 7)])
const imagem = (tipo = 'jpeg', bytes = jpeg) => `data:image/${tipo};base64,${bytes.toString('base64')}`

describe('foto da câmera', () => {
  it('grava a imagem como arquivo, sem repetir o nome', () => {
    const pasta = join(mkdtempSync(join(tmpdir(), 'camera-')), 'camera')
    const a = salvarFotoDaCamera(pasta, imagem(), AGORA)
    const b = salvarFotoDaCamera(pasta, imagem('png'), AGORA)
    const c = salvarFotoDaCamera(pasta, imagem(), AGORA)
    expect(a).toBe(join(pasta, `camera-${AGORA}.jpg`))
    expect(b).toBe(join(pasta, `camera-${AGORA}.png`))
    expect(c).toBe(join(pasta, `camera-${AGORA}-2.jpg`))
    expect(readFileSync(a).equals(jpeg)).toBe(true)
  })

  it('recusa o que não é imagem, vem vazio ou grande demais', () => {
    const pasta = mkdtempSync(join(tmpdir(), 'camera-'))
    expect(() => salvarFotoDaCamera(pasta, 'data:text/html;base64,PGI+', AGORA)).toThrow(/formato/)
    expect(() => salvarFotoDaCamera(pasta, 'C:/Windows/win.ini', AGORA)).toThrow(/formato/)
    expect(() => salvarFotoDaCamera(pasta, imagem('jpeg', Buffer.alloc(10)), AGORA)).toThrow(/vazia/)
    expect(() => salvarFotoDaCamera(pasta, imagem('jpeg', Buffer.alloc(16 * 1024 * 1024)), AGORA)).toThrow(/grande/)
    expect(readdirSync(pasta)).toEqual([])
  })

  it('apaga as fotos de passagem com mais de um dia', () => {
    const pasta = mkdtempSync(join(tmpdir(), 'camera-'))
    const velha = join(pasta, 'camera-1.jpg')
    const recente = join(pasta, 'camera-2.jpg')
    writeFileSync(velha, 'x')
    writeFileSync(recente, 'x')
    utimesSync(velha, new Date(AGORA - 30 * 3600_000), new Date(AGORA - 30 * 3600_000))
    utimesSync(recente, new Date(AGORA - 3600_000), new Date(AGORA - 3600_000))
    salvarFotoDaCamera(pasta, imagem(), AGORA)
    expect(existsSync(velha)).toBe(false)
    expect(existsSync(recente)).toBe(true)
  })
})

describe('teclado para o ditado', () => {
  const ingles = 0x04090409n
  const ptAmericano = 0x04090416n
  const ptAbnt = 0x04160416n

  it('sem português instalado, não tem como ditar em português', () => {
    expect(tecladoPortugues([ingles])).toBeNull()
    expect(tecladoPortugues([])).toBeNull()
  })

  it('prefere o português com as teclas do americano, que não muda a digitação', () => {
    expect(tecladoPortugues([ingles, ptAbnt])).toBe(ptAbnt)
    expect(tecladoPortugues([ingles, ptAbnt, ptAmericano])).toBe(ptAmericano)
  })

  it('lê o número da janela que o Electron entrega em bytes', () => {
    const b8 = Buffer.alloc(8)
    b8.writeBigUInt64LE(0x1a2b3cn)
    expect(numeroDaJanela(b8)).toBe(String(0x1a2b3c))
    const b4 = Buffer.alloc(4)
    b4.writeUInt32LE(4242)
    expect(numeroDaJanela(b4)).toBe('4242')
  })
})
