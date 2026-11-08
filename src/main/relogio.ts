// Relógio do app. Em uso normal é o Date.now(); nas capturas de tela de teste dá para
// adiantar o relógio (--agora=2026-11-10T14:30) para mostrar um dia com tarefas.
let deslocamento = 0

export function definirAgora(iso: string): void {
  const alvo = new Date(iso).getTime()
  if (!Number.isNaN(alvo)) deslocamento = alvo - Date.now()
}

export const agora = (): number => Date.now() + deslocamento
