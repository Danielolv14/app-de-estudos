import { useEffect, type CSSProperties, type ReactNode } from 'react'
import type { Materia } from '@shared/tipos'

export function Led({ aceso, cor = 'verde', titulo }: { aceso: boolean; cor?: 'verde' | 'ambar' | 'vermelho'; titulo?: string }) {
  return <i className={`led led--${cor} ${aceso ? 'led--aceso' : ''}`} title={titulo} aria-hidden={!titulo} />
}

/** Os 7 segmentos: "88:88:88" apagado por baixo e o número aceso por cima. */
export function Digitos({ texto, estado, classe = '' }: { texto: string; estado: 'estudando' | 'pausado' | 'parado'; classe?: string }) {
  const fantasma = texto.replace(/[0-9]/g, '8')
  return (
    <div className={`${classe} digitos--${estado}`} role="timer" aria-label={texto}>
      <span className="digitos__fantasma" aria-hidden>
        {fantasma}
      </span>
      <span className="digitos__aceso" aria-hidden>
        {texto}
      </span>
    </div>
  )
}

export function Modal({ titulo, aoFechar, children }: { titulo?: string; aoFechar: () => void; children: ReactNode }) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar()
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [aoFechar])
  return (
    <div className="fundo-modal" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={titulo}>
        {titulo && <h2>{titulo}</h2>}
        {children}
      </div>
    </div>
  )
}

export const corDe = (materias: Materia[], id: number | null): string | undefined => materias.find((m) => m.id === id)?.cor

export const nomeDe = (materias: Materia[], id: number | null): string => materias.find((m) => m.id === id)?.nome ?? 'Sem matéria'

export const estiloMateria = (materias: Materia[], id: number | null): CSSProperties =>
  ({ '--cor-materia': corDe(materias, id) }) as CSSProperties
