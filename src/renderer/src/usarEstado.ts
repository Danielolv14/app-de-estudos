import { useEffect, useRef, useState } from 'react'
import type { Estado } from '@shared/tipos'

/** Estado vindo do processo principal, atualizado sempre que algo muda. */
export function useEstado(): Estado | null {
  const [estado, setEstado] = useState<Estado | null>(null)
  useEffect(() => {
    let vivo = true
    void window.api.estado().then((e) => vivo && setEstado(e))
    const parar = window.api.aoMudar(setEstado)
    return () => {
      vivo = false
      parar()
    }
  }, [])
  return estado
}

/**
 * Relógio da tela, sincronizado com o do processo principal (que pode estar adiantado nos testes).
 * Redesenha a cada meio segundo para o visor não pular segundos.
 */
export function useAgora(estado: Estado | null): number {
  const base = useRef({ principal: 0, local: 0 })
  if (estado && base.current.principal !== estado.agora) base.current = { principal: estado.agora, local: Date.now() }
  const [, setTique] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTique((t) => t + 1), 500)
    return () => clearInterval(id)
  }, [])
  return base.current.principal ? base.current.principal + (Date.now() - base.current.local) : Date.now()
}
