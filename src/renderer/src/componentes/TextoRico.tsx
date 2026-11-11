// Mostra o texto da IA arrumado: parágrafos, passos numerados, listas, negrito, expoente e índice.
// As regras de como dividir ficam em @shared/texto (testadas); aqui é só o desenho.
import { Fragment, type ReactNode } from 'react'
import { blocosDeTexto, normalizarTextoIa, trechos, type Bloco, type Trecho } from '@shared/texto'

function desenhar(ts: Trecho[]): ReactNode {
  return ts.map((t, i) => {
    switch (t.tipo) {
      case 'texto':
        return <Fragment key={i}>{t.texto}</Fragment>
      case 'codigo':
        return <code key={i}>{t.texto}</code>
      case 'negrito':
        return <strong key={i}>{desenhar(t.filhos)}</strong>
      case 'sup':
        return <sup key={i}>{desenhar(t.filhos)}</sup>
      case 'sub':
        return <sub key={i}>{desenhar(t.filhos)}</sub>
    }
  })
}

/** Várias linhas, uma embaixo da outra (a conta de um passo, por exemplo). */
function linhas(ls: string[]): ReactNode {
  return ls.map((l, i) => (
    <Fragment key={i}>
      {i > 0 && <br />}
      {desenhar(trechos(l))}
    </Fragment>
  ))
}

function BlocoTexto({ b }: { b: Bloco }) {
  switch (b.tipo) {
    case 'titulo':
      return <p className="texto-rico__titulo">{desenhar(trechos(b.texto))}</p>
    case 'paragrafo':
      return <p>{linhas(b.linhas)}</p>
    case 'passos':
      return (
        <ol className="texto-rico__passos">
          {b.itens.map((it, i) => (
            <li key={i}>
              <span className="texto-rico__numero" aria-hidden>
                {it.numero}
              </span>
              <div>{linhas(it.linhas)}</div>
            </li>
          ))}
        </ol>
      )
    case 'lista':
      return (
        <ul className="texto-rico__lista">
          {b.itens.map((it, i) => (
            <li key={i}>{linhas(it)}</li>
          ))}
        </ul>
      )
  }
}

/** Texto em blocos (explicação, resolução, resposta do professor). */
export function TextoRico({ texto, className = '' }: { texto: string; className?: string }) {
  return (
    <div className={`texto-rico ${className}`}>
      {blocosDeTexto(texto).map((b, i) => (
        <BlocoTexto key={i} b={b} />
      ))}
    </div>
  )
}

/** Uma frase só (enunciado, fórmula, item de lista): expoente e negrito, mantendo as quebras de linha. */
export function TextoLinha({ texto }: { texto: string }) {
  return <>{linhas(normalizarTextoIa(texto).split('\n'))}</>
}
