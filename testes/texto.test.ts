import { describe, expect, it } from 'vitest'
import { blocosDeTexto, normalizarTextoIa, trechos } from '@shared/texto'
import { validarRespostaProfessor } from '@shared/respostas-ia'

describe('texto da IA arrumado', () => {
  it('"\\n" escrito como texto vira quebra de linha de verdade', () => {
    expect(normalizarTextoIa('Certo.\\n\\nAgora o 2:\\n1. Derive')).toBe('Certo.\n\nAgora o 2:\n1. Derive')
    expect(validarRespostaProfessor({ resposta: 'Quase.\\nFaltou o y′.', exercicio: null, situacao: null }, [1]).resposta).toBe('Quase.\nFaltou o y′.')
  })

  it('divide em parágrafos, passos numerados (com a conta embaixo) e listas', () => {
    const t = [
      'Você acertou a ideia, mas errou o sinal.',
      '',
      '1. Derive os dois lados:',
      "   2x + 2y·y' = 0",
      '',
      '2. Isole o y′:',
      "   y' = -x/y",
      '',
      'Armadilhas:',
      '- esquecer o y′',
      '- trocar o sinal',
      '',
      '**Resposta: -3/4**'
    ].join('\n')
    expect(blocosDeTexto(t)).toEqual([
      { tipo: 'paragrafo', linhas: ['Você acertou a ideia, mas errou o sinal.'] },
      {
        tipo: 'passos',
        itens: [
          { numero: 1, linhas: ['Derive os dois lados:', "2x + 2y·y' = 0"] },
          { numero: 2, linhas: ['Isole o y′:', "y' = -x/y"] }
        ]
      },
      { tipo: 'paragrafo', linhas: ['Armadilhas:'] },
      { tipo: 'lista', itens: [['esquecer o y′'], ['trocar o sinal']] },
      { tipo: 'paragrafo', linhas: ['**Resposta: -3/4**'] }
    ])
  })

  it('expoente, índice, negrito e código', () => {
    expect(trechos('e^(cos 2x) e x^2 + x^-1')).toEqual([
      { tipo: 'texto', texto: 'e' },
      { tipo: 'sup', filhos: [{ tipo: 'texto', texto: 'cos 2x' }] },
      { tipo: 'texto', texto: ' e x' },
      { tipo: 'sup', filhos: [{ tipo: 'texto', texto: '2' }] },
      { tipo: 'texto', texto: ' + x' },
      { tipo: 'sup', filhos: [{ tipo: 'texto', texto: '-1' }] }
    ])
    // Expoente dentro de expoente e parênteses dentro de parênteses.
    expect(trechos('e^(x^2 (1+x))')).toEqual([
      { tipo: 'texto', texto: 'e' },
      {
        tipo: 'sup',
        filhos: [
          { tipo: 'texto', texto: 'x' },
          { tipo: 'sup', filhos: [{ tipo: 'texto', texto: '2' }] },
          { tipo: 'texto', texto: ' (1+x)' }
        ]
      }
    ])
    expect(trechos('**F_m = 0,4** e `CPI`')).toEqual([
      {
        tipo: 'negrito',
        filhos: [
          { tipo: 'texto', texto: 'F' },
          { tipo: 'sub', filhos: [{ tipo: 'texto', texto: 'm' }] },
          { tipo: 'texto', texto: ' = 0,4' }
        ]
      },
      { tipo: 'texto', texto: ' e ' },
      { tipo: 'codigo', texto: 'CPI' }
    ])
  })

  it('não estraga nome de arquivo, ^ solto nem asterisco sem par', () => {
    expect(trechos('slide 23 de g_desempenho_ES.pdf')).toEqual([{ tipo: 'texto', texto: 'slide 23 de g_desempenho_ES.pdf' }])
    expect(trechos('2 ^ 3 e 5 * 4')).toEqual([{ tipo: 'texto', texto: '2 ^ 3 e 5 * 4' }])
    expect(trechos('**sem fim')).toEqual([{ tipo: 'texto', texto: '**sem fim' }])
  })
})
