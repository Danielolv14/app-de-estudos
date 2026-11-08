// Elementos só de enfeite: não têm conteúdo nem estado e ficam escondidos dos leitores de tela.
// O pai precisa de `position: relative` (as classes estão em estilos.css, seção "Decoração").

/** Grade de linhas bem apagada, que some nas bordas. */
export function FundoGrade({ classe = '' }: { classe?: string }) {
  return <div className={`fundo-grade ${classe}`} aria-hidden />
}

/** Brilho radial suave da cor de destaque, atrás de um elemento importante. */
export function Brilho({ classe = '' }: { classe?: string }) {
  return <div className={`brilho ${classe}`} aria-hidden />
}
