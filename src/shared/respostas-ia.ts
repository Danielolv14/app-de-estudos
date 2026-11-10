// Confere e arruma o que a IA devolve, antes de o app usar. A IA pode errar conta, pular questão,
// inventar tarefa que não existe ou pôr data no passado: nada disso pode quebrar o app nem estragar o plano.
import type {
  AulaLida,
  AvaliacaoLida,
  Correcao,
  CorrecaoQuestao,
  Materia,
  Mudanca,
  ProvaSimulado,
  Questao,
  SituacaoQuestao,
  SugestaoEstudo,
  Tarefa
} from './tipos'

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {})
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const texto = (v: unknown, max = 4000): string => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const numero = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const umaCasa = (n: number) => Math.round(n * 10) / 10

/** AAAA-MM-DD de um dia que existe. */
export function dataValida(v: unknown): string | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const [a, m, d] = v.split('-').map(Number)
  const dt = new Date(a, m - 1, d)
  return dt.getFullYear() === a && dt.getMonth() === m - 1 && dt.getDate() === d ? v : null
}

export class RespostaInvalida extends Error {}

// ---------- Simulado ----------

/** Confere a prova gerada. Se os pontos não somarem o total pedido, reparte de novo na mesma proporção. */
export function validarProva(dados: unknown, total: number): ProvaSimulado {
  const d = obj(dados)
  const questoes: Questao[] = lista(d.questoes)
    .map(obj)
    .filter((q) => texto(q.enunciado) !== '')
    .slice(0, 15)
    .map((q, i) => ({
      numero: i + 1,
      enunciado: texto(q.enunciado),
      pontos: Math.max(0, numero(q.pontos) ?? 0),
      conteudo: texto(q.conteudo, 200),
      resolucao: texto(q.resolucao, 8000),
      resposta: texto(q.resposta, 1000)
    }))
  if (questoes.length === 0) throw new RespostaInvalida('A IA não devolveu nenhuma questão. Tente de novo.')

  const soma = questoes.reduce((a, q) => a + q.pontos, 0)
  if (Math.abs(soma - total) > 0.01) {
    // Sem pontos (ou zerados): divide igual. Senão, mantém a proporção, com 1 casa, e a última fecha a conta.
    const pesos = soma > 0 ? questoes.map((q) => q.pontos / soma) : questoes.map(() => 1 / questoes.length)
    let usado = 0
    questoes.forEach((q, i) => {
      q.pontos = i === questoes.length - 1 ? umaCasa(total - usado) : umaCasa(total * pesos[i])
      usado += q.pontos
    })
  }
  return { titulo: texto(d.titulo, 200) || 'Simulado', instrucoes: texto(d.instrucoes, 1000), questoes }
}

const SITUACOES: SituacaoQuestao[] = ['certa', 'parcial', 'errada', 'em-branco']

/** Confere a correção: uma nota por questão, entre 0 e o valor dela. A soma é feita aqui, não pela IA. */
export function validarCorrecao(dados: unknown, prova: ProvaSimulado, agora: number): Correcao {
  const d = obj(dados)
  const daIa = lista(d.questoes).map(obj)
  const questoes: CorrecaoQuestao[] = prova.questoes.map((q) => {
    const c = daIa.find((x) => numero(x.numero) === q.numero)
    if (!c) return { numero: q.numero, nota: 0, situacao: 'em-branco', acertos: '', erros: 'A IA não corrigiu esta questão.' }
    const nota = umaCasa(Math.min(q.pontos, Math.max(0, numero(c.nota) ?? 0)))
    const informada = SITUACOES.find((s) => s === c.situacao)
    const situacao: SituacaoQuestao =
      informada ?? (nota >= q.pontos ? 'certa' : nota > 0 ? 'parcial' : 'errada')
    return { numero: q.numero, nota, situacao, acertos: texto(c.acertos, 1500), erros: texto(c.erros, 1500) }
  })
  const sugestoes: SugestaoEstudo[] = lista(d.sugestoes)
    .map(obj)
    .filter((s) => texto(s.titulo) !== '')
    .slice(0, 3)
    .map((s) => ({
      titulo: texto(s.titulo, 160),
      detalhe: texto(s.detalhe, 600),
      minutos: Math.min(180, Math.max(15, Math.round((numero(s.minutos) ?? 60) / 5) * 5))
    }))
  return {
    questoes,
    nota: umaCasa(questoes.reduce((a, q) => a + q.nota, 0)),
    total: umaCasa(prova.questoes.reduce((a, q) => a + q.pontos, 0)),
    resumo: texto(d.resumo, 1500),
    pontosFracos: lista(d.pontosFracos).map((p) => texto(p, 200)).filter(Boolean).slice(0, 5),
    sugestoes,
    avisos: texto(d.avisos, 1000),
    corrigidaEm: agora
  }
}

// ---------- Plano de ensino ----------

export type LeituraValidada = {
  materia: string
  avaliacoes: AvaliacaoLida[]
  aulas: AulaLida[]
  bibliografia: string[]
  observacoes: string
}

export function validarLeitura(dados: unknown): LeituraValidada {
  const d = obj(dados)
  const tipos = ['prova', 'atividade', 'reavaliacao'] as const
  const avaliacoes: AvaliacaoLida[] = lista(d.avaliacoes)
    .map(obj)
    .filter((a) => texto(a.titulo) !== '')
    .slice(0, 30)
    .map((a) => {
      const pontos = numero(a.pontos)
      return {
        incluir: true,
        titulo: texto(a.titulo, 160),
        tipo: tipos.find((t) => t === a.tipo) ?? 'prova',
        data: dataValida(a.data),
        pontos: pontos !== null && pontos > 0 ? umaCasa(pontos) : null,
        conteudo: texto(a.conteudo, 600)
      }
    })
  const aulas: AulaLida[] = lista(d.aulas)
    .map(obj)
    .filter((a) => texto(a.conteudo) !== '')
    .slice(0, 80)
    .map((a) => {
      const data = dataValida(a.data)
      return { incluir: data !== null, data, conteudo: texto(a.conteudo, 300) }
    })
  if (avaliacoes.length === 0 && aulas.length === 0)
    throw new RespostaInvalida('A IA não achou avaliações nem aulas nesse PDF. Confira se é o plano de ensino da matéria.')
  return {
    materia: texto(d.materia, 80) || 'Nova matéria',
    avaliacoes,
    aulas,
    bibliografia: lista(d.bibliografia).map((b) => texto(b, 300)).filter(Boolean).slice(0, 12),
    observacoes: texto(d.observacoes, 1000)
  }
}

// ---------- Replanejamento ----------

/**
 * Transforma a lista de mudanças da IA em mudanças que dá para aplicar. Fica de fora (e conta como descartada):
 * tarefa que não existe ou já foi feita, data inválida ou no passado, matéria arquivada ou que não existe,
 * tempo fora de 10 min a 10 h, e mais de uma mudança na mesma tarefa.
 */
export function validarMudancas(
  dados: unknown,
  p: { tarefas: Tarefa[]; materias: Materia[]; hoje: string }
): { resumo: string; mudancas: Mudanca[]; descartadas: number } {
  const d = obj(dados)
  const pendentes = new Map(p.tarefas.filter((t) => !t.feita).map((t) => [t.id, t]))
  const ativas = new Set(p.materias.filter((m) => !m.arquivada).map((m) => m.id))
  const usadas = new Set<number>()
  const minutosOk = (v: unknown): number | null => {
    const n = numero(v)
    return n !== null && n >= 10 && n <= 600 ? Math.round(n / 5) * 5 : null
  }
  const dataFutura = (v: unknown): string | null => {
    const dt = dataValida(v)
    return dt && dt >= p.hoje ? dt : null
  }
  const tarefaOk = (v: unknown): number | null => {
    const id = numero(v)
    if (id === null || !pendentes.has(id) || usadas.has(id)) return null
    return id
  }

  const brutas = lista(d.mudancas).map(obj)
  const mudancas: Mudanca[] = []
  for (const m of brutas.slice(0, 80)) {
    const motivo = texto(m.motivo, 300)
    const id = mudancas.length + 1
    if (m.tipo === 'mover') {
      const tarefaId = tarefaOk(m.tarefaId)
      const data = dataFutura(m.data)
      if (tarefaId === null || !data || pendentes.get(tarefaId)!.data === data) continue
      usadas.add(tarefaId)
      mudancas.push({ id, motivo, tipo: 'mover', tarefaId, data })
    } else if (m.tipo === 'ajustar') {
      const tarefaId = tarefaOk(m.tarefaId)
      if (tarefaId === null) continue
      const t = pendentes.get(tarefaId)!
      const minutos = minutosOk(m.minutos)
      const titulo = texto(m.titulo, 160) || null
      const detalhe = texto(m.detalhe, 600) || null
      const muda = (minutos !== null && minutos !== t.minutos) || (titulo !== null && titulo !== t.titulo) || (detalhe !== null && detalhe !== t.detalhe)
      if (!muda) continue
      usadas.add(tarefaId)
      mudancas.push({ id, motivo, tipo: 'ajustar', tarefaId, minutos, titulo, detalhe })
    } else if (m.tipo === 'criar') {
      const data = dataFutura(m.data)
      const titulo = texto(m.titulo, 160)
      const minutos = minutosOk(m.minutos)
      const materiaId = numero(m.materiaId)
      if (!data || !titulo || minutos === null) continue
      if (materiaId !== null && !ativas.has(materiaId)) continue
      mudancas.push({ id, motivo, tipo: 'criar', data, materiaId, titulo, detalhe: texto(m.detalhe, 600), minutos })
    } else if (m.tipo === 'remover') {
      const tarefaId = tarefaOk(m.tarefaId)
      if (tarefaId === null) continue
      usadas.add(tarefaId)
      mudancas.push({ id, motivo, tipo: 'remover', tarefaId })
    }
  }
  return { resumo: texto(d.resumo, 1500), mudancas, descartadas: brutas.length - mudancas.length }
}
