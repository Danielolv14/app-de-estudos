// Sigla da matéria (ERS, IHC, CAL...): aparece onde o nome inteiro não cabe, como nos avisos da barra de cima.
// O Daniel pode escrever a dele em Ajustes; vazia, o app monta uma pelo nome.
import type { Materia } from './tipos'

const FRACAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'a', 'o', 'as', 'os', 'para', 'com', 'na', 'no', 'ao'])
const ROMANOS: Record<string, string> = { i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6' }

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * Sigla pelo nome, no jeito da PUC: as iniciais quando o nome tem mais de uma palavra forte
 * ("Engenharia de Requisitos de Software" → "ERS", "Interação Humano-Computador" → "IHC"),
 * e as 3 primeiras letras quando tem uma só ("Cálculo" → "CAL"). O número vai no fim ("Cálculo II" → "CAL2").
 * O que vem depois de ":" ou "(" fica de fora ("Trabalho Interdisciplinar: Desenvolvimento..." → "TI").
 */
export function siglaAutomatica(nome: string): string {
  const base = semAcento(nome.split(/[:(]/)[0] || nome).toLowerCase()
  let numero = ''
  const fortes: string[] = []
  for (const bruta of base.split(/[\s\-–/]+/)) {
    const p = bruta.replace(/[^a-z0-9]/g, '')
    if (!p) continue
    if (/^\d+$/.test(p)) numero = p
    else if (ROMANOS[p] && fortes.length > 0) numero = ROMANOS[p]
    else if (!FRACAS.has(p)) fortes.push(p)
  }
  if (fortes.length === 0) return semAcento(nome).replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || '?'
  const letras = fortes.length === 1 ? fortes[0].slice(0, 3) : fortes.map((p) => p[0]).join('').slice(0, 4)
  return `${letras}${numero}`.toUpperCase()
}

/** A sigla escrita pelo Daniel ou, se estiver vazia, a automática. */
export function siglaDe(m: Pick<Materia, 'nome' | 'sigla'>): string {
  return m.sigla.trim().toUpperCase() || siglaAutomatica(m.nome)
}

/**
 * Título sem o nome da matéria no fim, porque a sigla já diz qual é:
 * "Prova 3 de Cálculo" → "Prova 3"; "Lista 2 - Arquitetura" → "Lista 2".
 */
export function tituloSemMateria(titulo: string, nomeMateria: string): string {
  const t = titulo.trim()
  const nome = semAcento(nomeMateria.trim()).toLowerCase()
  if (!nome || t.length <= nome.length || !semAcento(t).toLowerCase().endsWith(nome)) return titulo
  const antes = t.slice(0, t.length - nome.length)
  // O traço só separa com espaço dos dois lados ("Lista 2 - Cálculo"), senão "Pré-cálculo" perderia o fim.
  const m = antes.match(/^(.*\S)\s+(?:de|da|do)\s+$/i) ?? antes.match(/^(.*\S)\s+[-–|]\s+$/) ?? antes.match(/^(.*\S)\s*[,:]\s+$/)
  return m ? m[1] : titulo
}
