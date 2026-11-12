// Ditado por voz na tela Aula. Usa o ditado do próprio Windows (Win+H), que escreve no campo que está com o foco:
// é grátis, entende português e põe a pontuação sozinho. O Windows dita no idioma do teclado ativo, então antes
// o app passa a janela dele para um teclado em português (se houver um instalado).
// Um PowerShell fica aberto em segundo plano depois do primeiro uso: compilar o C# leva uns 2 s, e o clique
// seguinte não espera de novo. Ele fecha sozinho quando o app fecha (a entrada dele acaba).
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { POWERSHELL } from './powershell'

/** `sem-portugues`: o Windows não tem teclado em português, e o ditado sairia em inglês. */
export type ResultadoDitado = 'ok' | 'sem-portugues' | 'erro'

const PORTUGUES = 0x0416
const AMERICANO = 0x0409

/**
 * Teclado em português para o ditado, entre os instalados (HKL: idioma na parte de baixo, layout na de cima).
 * Prefere o português com as teclas do americano, que não muda nada na hora de digitar.
 */
export function tecladoPortugues(teclados: bigint[]): bigint | null {
  const pt = teclados.filter((h) => (h & 0xffffn) === BigInt(PORTUGUES))
  return pt.find((h) => ((h >> 16n) & 0xffffn) === BigInt(AMERICANO)) ?? pt[0] ?? null
}

/** Número da janela (HWND) que o Electron entrega como bytes. */
export function numeroDaJanela(bytes: Buffer): string {
  return bytes.length >= 8 ? bytes.readBigUInt64LE(0).toString() : String(bytes.readUInt32LE(0))
}

const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Threading;
public static class DitadoApp {
  [DllImport("user32.dll")] static extern int GetKeyboardLayoutList(int n, IntPtr[] lista);
  [DllImport("user32.dll")] static extern IntPtr GetKeyboardLayout(uint thread);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr janela, IntPtr processo);
  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr janela, uint msg, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] static extern void keybd_event(byte tecla, byte scan, uint flags, UIntPtr extra);
  public static string Teclados() {
    int n = GetKeyboardLayoutList(0, null);
    IntPtr[] lista = new IntPtr[n];
    GetKeyboardLayoutList(n, lista);
    string[] s = new string[n];
    for (int i = 0; i < n; i++) s[i] = ((ulong)lista[i].ToInt64()).ToString();
    return string.Join(",", s);
  }
  public static string Ditar(long janela, long teclado) {
    IntPtr j = new IntPtr(janela);
    if (teclado != 0) {
      IntPtr atual = GetKeyboardLayout(GetWindowThreadProcessId(j, IntPtr.Zero));
      if (atual.ToInt64() != teclado) {
        // WM_INPUTLANGCHANGEREQUEST: o mesmo pedido que o Win+Espaço faz.
        PostMessage(j, 0x0050, IntPtr.Zero, new IntPtr(teclado));
        Thread.Sleep(250);
      }
    }
    // Win+H abre o ditado do Windows no campo com o foco.
    keybd_event(0x5B, 0, 0, UIntPtr.Zero);
    keybd_event(0x48, 0, 0, UIntPtr.Zero);
    keybd_event(0x48, 0, 2, UIntPtr.Zero);
    keybd_event(0x5B, 0, 2, UIntPtr.Zero);
    return "ok";
  }
}
'@
[Console]::Out.WriteLine('pronto')
while ($true) {
  $linha = [Console]::In.ReadLine()
  if ($null -eq $linha) { break }
  $p = $linha.Split(' ')
  try {
    if ($p[0] -eq 'teclados') { $r = [DitadoApp]::Teclados() }
    elseif ($p[0] -eq 'ditar') { $r = [DitadoApp]::Ditar([long]$p[1], [long]$p[2]) }
    else { $r = 'erro' }
  } catch { $r = 'erro' }
  [Console]::Out.WriteLine($r)
}
`

const codificar = (script: string): string => Buffer.from(script, 'utf16le').toString('base64')

export class Ditado {
  private filho: ChildProcessWithoutNullStreams | null = null
  private esperando: ((linha: string) => void)[] = []
  private resto = ''

  /** Abre o PowerShell antes do primeiro clique (a tela Aula chama ao abrir a conversa). */
  preparar(): void {
    this.processo()
  }

  /** Troca a janela para o teclado em português e abre o ditado do Windows. */
  async abrir(janela: Buffer): Promise<ResultadoDitado> {
    const lista = await this.pedir('teclados')
    if (lista === 'erro') return 'erro'
    const teclados = lista
      .split(',')
      .filter((x) => /^\d+$/.test(x))
      .map((x) => BigInt(x))
    const pt = tecladoPortugues(teclados)
    if (pt === null) return 'sem-portugues'
    // O HKL vai como número com sinal de 64 bits (o IntPtr do C#).
    return (await this.pedir(`ditar ${numeroDaJanela(janela)} ${BigInt.asIntN(64, pt)}`)) === 'ok' ? 'ok' : 'erro'
  }

  fechar(): void {
    this.filho?.kill()
    this.filho = null
  }

  private processo(): ChildProcessWithoutNullStreams {
    if (this.filho) return this.filho
    const f = spawn(POWERSHELL, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', codificar(SCRIPT)], {
      windowsHide: true
    })
    // O "pronto" do começo não responde a nenhum pedido.
    let comecou = false
    f.stdout.setEncoding('utf8')
    f.stdout.on('data', (d: string) => {
      this.resto += d
      let i: number
      while ((i = this.resto.indexOf('\n')) >= 0) {
        const linha = this.resto.slice(0, i).trim()
        this.resto = this.resto.slice(i + 1)
        if (!linha) continue
        if (!comecou && linha === 'pronto') comecou = true
        else this.esperando.shift()?.(linha)
      }
    })
    f.stderr.resume()
    const acabou = () => {
      if (this.filho !== f) return
      this.filho = null
      this.resto = ''
      for (const r of this.esperando.splice(0)) r('erro')
    }
    f.on('exit', acabou)
    f.on('error', acabou)
    this.filho = f
    return f
  }

  private pedir(comando: string, limiteMs = 15_000): Promise<string> {
    return new Promise((resolve) => {
      const f = this.processo()
      // Sem resposta no tempo: fecha o PowerShell (a fila desalinharia) e o próximo clique abre outro.
      const t = setTimeout(() => f.kill(), limiteMs)
      this.esperando.push((linha) => {
        clearTimeout(t)
        resolve(linha)
      })
      f.stdin.write(`${comando}\n`)
    })
  }
}
