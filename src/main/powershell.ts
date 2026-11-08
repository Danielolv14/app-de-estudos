import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const POWERSHELL = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')

/** Texto entre aspas simples do PowerShell (aspas simples dobradas por dentro). */
export const aspas = (s: string): string => `'${s.replace(/'/g, "''")}'`

/** O -EncodedCommand evita qualquer problema de aspas e espaços no meio dos caminhos. */
const codificar = (script: string): string => Buffer.from(script, 'utf16le').toString('base64')

export function rodarPowerShell(script: string, timeoutMs = 60_000): Promise<{ codigo: number; saida: string; erro: string }> {
  return new Promise((resolve) => {
    execFile(
      POWERSHELL,
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', codificar(script)],
      { windowsHide: true, timeout: timeoutMs },
      (err, stdout, stderr) => {
        const codigo = err ? (typeof err.code === 'number' ? err.code : 1) : 0
        resolve({ codigo, saida: String(stdout), erro: String(stderr) })
      }
    )
  })
}

/**
 * Roda um script como administrador. O Windows mostra a janela de permissão (UAC);
 * se a pessoa recusar, o código de saída é diferente de zero e `cancelado` vem verdadeiro.
 */
export async function rodarComoAdmin(script: string): Promise<{ ok: boolean; cancelado: boolean; erro: string }> {
  // O processo elevado abre separado, sem como capturar a saída dele: o erro vai para um arquivo temporário.
  const log = join(tmpdir(), `app-de-estudos-admin-${Date.now()}.txt`)
  const interno = `$ErrorActionPreference = 'Stop'\ntry {\n${script}\n} catch { [IO.File]::WriteAllText(${aspas(log)}, $_.Exception.Message); exit 1 }`
  const externo = [
    `try {`,
    `  $p = Start-Process -FilePath ${aspas(POWERSHELL)} -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList '-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',${aspas(codificar(interno))}`,
    `  exit $p.ExitCode`,
    `} catch { [Console]::Error.WriteLine('CANCELADO: ' + $_.Exception.Message); exit 1223 }`
  ].join('\n')
  const r = await rodarPowerShell(externo, 180_000)
  let erro = r.erro.trim()
  if (existsSync(log)) {
    erro = readFileSync(log, 'utf8').trim() || erro
    rmSync(log, { force: true })
  }
  return { ok: r.codigo === 0, cancelado: r.codigo === 1223, erro }
}

export function iniciarPowerShell(script: string): ChildProcess {
  return spawn(POWERSHELL, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', codificar(script)], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'ignore']
  })
}
