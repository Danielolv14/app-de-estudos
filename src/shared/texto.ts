// Texto que a IA escreve (aula, resolução, resposta do professor) com uma estrutura leve, para a tela mostrar
// arrumado: parágrafos, passos numerados, listas, **negrito**, expoente (x^2, e^(2x)) e índice (x_1).
// Sem rede e sem React: só divide o texto em pedaços, para dar para testar.

/**
 * Conserta o que a IA às vezes devolve: a quebra de linha escrita como as letras "\n" em vez de uma quebra
 * de verdade (o prompt antigo pedia "use \n para quebrar linha", e ela obedecia ao pé da letra).
 */
export function normalizarTextoIa(texto: string): string {
  return texto
    .replace(/\\r\\n|\\n|\r\n/g, '\n')
    .replace(/\\t/g, '  ')
    .replace(/\\"/g, '"')
}

export type Trecho =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'negrito' | 'sup' | 'sub'; filhos: Trecho[] }
  | { tipo: 'codigo'; texto: string }

const LETRA = /[A-Za-zÀ-ÿα-ωΑ-Ω]/
const PALAVRA = /[\wÀ-ÿα-ωΑ-Ω]/

/** O que vem dentro de ( ) ou { }, contando os parênteses de dentro. */
function fechado(s: string, i: number): { conteudo: string; fim: number } | null {
  const abre = s[i]
  const fecha = abre === '(' ? ')' : abre === '{' ? '}' : null
  if (!fecha) return null
  let nivel = 0
  for (let j = i; j < s.length; j++) {
    if (s[j] === abre) nivel++
    else if (s[j] === fecha && --nivel === 0) return j > i + 1 ? { conteudo: s.slice(i + 1, j), fim: j + 1 } : null
  }
  return null
}

/** Expoente depois do ^: (2x), {n+1}, -1, 10, 2,5 ou uma letra só (e^x). */
function expoente(s: string, i: number): { conteudo: string; fim: number } | null {
  const g = fechado(s, i)
  if (g) return g
  const m = s.slice(i).match(/^-?(?:\d+(?:[.,]\d+)?|[A-Za-zα-ω])/)
  return m ? { conteudo: m[0], fim: i + m[0].length } : null
}

/** Índice depois do _: {máx}, um número ou uma letra só (x_1, a_n). "g_desempenho" não é índice. */
function indice(s: string, i: number): { conteudo: string; fim: number } | null {
  if (s[i] === '{') return fechado(s, i)
  const m = s.slice(i).match(/^(?:\d+|[A-Za-z])/)
  if (!m || PALAVRA.test(s[i + m[0].length] ?? '')) return null
  return { conteudo: m[0], fim: i + m[0].length }
}

/** Uma linha em pedaços: texto, **negrito**, `código`, expoente e índice (um dentro do outro também). */
export function trechos(linha: string): Trecho[] {
  const saida: Trecho[] = []
  let solto = ''
  const soltar = () => {
    if (solto) saida.push({ tipo: 'texto', texto: solto })
    solto = ''
  }
  let i = 0
  while (i < linha.length) {
    const c = linha[i]
    if (c === '*' && linha[i + 1] === '*') {
      const fim = linha.indexOf('**', i + 2)
      if (fim > i + 2) {
        soltar()
        saida.push({ tipo: 'negrito', filhos: trechos(linha.slice(i + 2, fim)) })
        i = fim + 2
        continue
      }
    }
    if (c === '`') {
      const fim = linha.indexOf('`', i + 1)
      if (fim > i + 1) {
        soltar()
        saida.push({ tipo: 'codigo', texto: linha.slice(i + 1, fim) })
        i = fim + 1
        continue
      }
    }
    if (c === '^' && i > 0 && linha[i - 1] !== ' ') {
      const g = expoente(linha, i + 1)
      if (g) {
        soltar()
        saida.push({ tipo: 'sup', filhos: trechos(g.conteudo) })
        i = g.fim
        continue
      }
    }
    // Só depois de uma letra sozinha: "x_1" e "F_m" viram índice; "g_desempenho_ES.pdf" fica como está.
    if (c === '_' && i > 0 && LETRA.test(linha[i - 1]) && !PALAVRA.test(linha[i - 2] ?? '')) {
      const g = indice(linha, i + 1)
      if (g) {
        soltar()
        saida.push({ tipo: 'sub', filhos: trechos(g.conteudo) })
        i = g.fim
        continue
      }
    }
    solto += c
    i++
  }
  soltar()
  return saida
}

export type Bloco =
  | { tipo: 'paragrafo'; linhas: string[] }
  | { tipo: 'passos'; itens: { numero: number; linhas: string[] }[] }
  | { tipo: 'lista'; itens: string[][] }
  | { tipo: 'titulo'; texto: string }

/**
 * Divide o texto em blocos. Linha em branco separa parágrafos; "1." ou "2)" abre um passo; "- " ou "• " um item.
 * A linha logo abaixo de um passo (sem linha em branco no meio) continua o passo, como a conta do passo.
 */
export function blocosDeTexto(texto: string): Bloco[] {
  const blocos: Bloco[] = []
  let atual: Bloco | null = null
  let aposVazio = false
  const fechar = () => {
    if (atual) blocos.push(atual)
    atual = null
  }
  for (const bruta of normalizarTextoIa(texto).split('\n')) {
    const linha = bruta.trim()
    if (!linha) {
      aposVazio = true
      continue
    }
    const titulo = linha.match(/^#{1,4}\s+(.+)$/)
    const passo = linha.match(/^(\d{1,2})[.)]\s+(.+)$/)
    const item = linha.match(/^[-•*–]\s+(.+)$/)
    const a = atual as Bloco | null
    if (titulo) {
      fechar()
      blocos.push({ tipo: 'titulo', texto: titulo[1].replace(/\*\*/g, '') })
    } else if (passo) {
      // Passos separados por linha em branco continuam a mesma lista.
      if (a?.tipo === 'passos') a.itens.push({ numero: Number(passo[1]), linhas: [passo[2]] })
      else {
        fechar()
        atual = { tipo: 'passos', itens: [{ numero: Number(passo[1]), linhas: [passo[2]] }] }
      }
    } else if (item) {
      if (a?.tipo === 'lista') a.itens.push([item[1]])
      else {
        fechar()
        atual = { tipo: 'lista', itens: [[item[1]]] }
      }
    } else if (!aposVazio && a?.tipo === 'passos') a.itens[a.itens.length - 1].linhas.push(linha)
    else if (!aposVazio && a?.tipo === 'lista') a.itens[a.itens.length - 1].push(linha)
    else if (!aposVazio && a?.tipo === 'paragrafo') a.linhas.push(linha)
    else {
      fechar()
      atual = { tipo: 'paragrafo', linhas: [linha] }
    }
    aposVazio = false
  }
  fechar()
  return blocos
}
