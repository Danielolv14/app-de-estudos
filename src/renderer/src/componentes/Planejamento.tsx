// Replanejamento e plano de ensino: a IA sugere, e nada muda no app sem o Daniel aprovar aqui.
import { useState, type CSSProperties } from 'react'
import type { AulaLida, AvaliacaoLida, Estado, LeituraPlano, Mudanca, Tarefa } from '@shared/tipos'
import { diaMes, formatarDuracao, nomeDiaSemana } from '@shared/regras'
import { estiloMateria, Led, Modal, nomeDe } from './Basicos'
import { PdfsDoCanvas } from './Canvas'

const dia = (data: string) => `${nomeDiaSemana(data, true)} ${diaMes(data)}`
const tempo = (min: number) => formatarDuracao(min * 60_000)

// ---------- Botão de replanejar ----------

export function BotaoReplanejar({ estado, pequeno = false }: { estado: Estado; pequeno?: boolean }) {
  const pendentes = estado.tarefas.filter((t) => !t.feita && t.data >= estado.hoje).length
  const rotulo = pendentes < 3 ? 'Montar o plano com a IA' : 'Replanejar com a IA'
  const ocupado = !!estado.ia.trabalho
  return (
    <button
      className={`tecla ${pequeno ? 'tecla--pequena' : ''}`}
      disabled={ocupado || !estado.ia.claude || !!estado.propostaPlano}
      title={!estado.ia.claude ? 'Precisa do Claude Code (veja em Ajustes)' : undefined}
      onClick={() => void window.api.replanejar()}
    >
      {estado.ia.trabalho?.tipo === 'replanejar' ? 'Replanejando...' : rotulo}
    </button>
  )
}

// ---------- Proposta de mudanças ----------

function descrever(m: Mudanca, tarefas: Tarefa[], estado: Estado): { titulo: string; antes?: string; depois?: string } {
  if (m.tipo === 'criar')
    return { titulo: `Nova: ${m.titulo}`, depois: `${dia(m.data)}, ${nomeDe(estado.materias, m.materiaId)}, ${tempo(m.minutos)}` }
  const t = tarefas.find((x) => x.id === m.tarefaId)
  if (!t) return { titulo: 'Tarefa que não existe mais (vai ser pulada)' }
  if (m.tipo === 'mover') return { titulo: t.titulo, antes: dia(t.data), depois: dia(m.data) }
  if (m.tipo === 'remover') return { titulo: `Tirar: ${t.titulo}`, antes: `${dia(t.data)}, ${tempo(t.minutos)}` }
  const partes: string[] = []
  const antes: string[] = []
  if (m.minutos !== null && m.minutos !== t.minutos) {
    antes.push(tempo(t.minutos))
    partes.push(tempo(m.minutos))
  }
  if (m.titulo !== null && m.titulo !== t.titulo) {
    antes.push(`“${t.titulo}”`)
    partes.push(`“${m.titulo}”`)
  }
  if (m.detalhe !== null && m.detalhe !== t.detalhe) partes.push('novo jeito de fazer')
  return { titulo: t.titulo, antes: antes.join(', ') || undefined, depois: partes.join(', ') }
}

const NOME_TIPO: Record<Mudanca['tipo'], string> = { mover: 'Mover', ajustar: 'Ajustar', criar: 'Criar', remover: 'Tirar' }

export function PropostaPlano({ estado }: { estado: Estado }) {
  const p = estado.propostaPlano!
  const [marcadas, setMarcadas] = useState<Set<number>>(() => new Set(p.mudancas.map((m) => m.id)))
  const alternar = (id: number) => {
    const n = new Set(marcadas)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    setMarcadas(n)
  }
  // Ordena por dia, para ler como um plano.
  const dataDe = (m: Mudanca) => (m.tipo === 'criar' || m.tipo === 'mover' ? m.data : (estado.tarefas.find((t) => t.id === m.tarefaId)?.data ?? ''))
  const ordem = [...p.mudancas].sort((a, b) => dataDe(a).localeCompare(dataDe(b)) || a.id - b.id)

  return (
    <div className="painel proposta">
      <h2>
        Proposta da IA <span className="titulo-apagado">esperando a sua aprovação</span>
      </h2>
      {p.resumo && <p className="modal__texto">{p.resumo}</p>}
      {p.mudancas.length === 0 ? (
        <p className="mudo">Nenhuma mudança: a IA achou o plano bom como está.</p>
      ) : (
        <ul className="mudancas">
          {ordem.map((m) => {
            const d = descrever(m, estado.tarefas, estado)
            const materiaId = m.tipo === 'criar' ? m.materiaId : (estado.tarefas.find((t) => t.id === m.tarefaId)?.materiaId ?? null)
            return (
              <li key={m.id} className={marcadas.has(m.id) ? '' : 'mudanca--desmarcada'} style={estiloMateria(estado.materias, materiaId)}>
                <input type="checkbox" className="marcar" checked={marcadas.has(m.id)} onChange={() => alternar(m.id)} aria-label={`Aplicar: ${d.titulo}`} />
                <span className={`selo-mudanca selo-mudanca--${m.tipo}`}>{NOME_TIPO[m.tipo]}</span>
                <div>
                  <strong>{d.titulo}</strong>
                  {(d.antes || d.depois) && (
                    <span className="mudanca__antes-depois">
                      {d.antes && <s>{d.antes}</s>}
                      {d.antes && d.depois && ' → '}
                      {d.depois}
                    </span>
                  )}
                  {m.motivo && <span className="mudo">{m.motivo}</span>}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {p.descartadas > 0 && (
        <p className="form__dica">
          {p.descartadas} {p.descartadas === 1 ? 'sugestão ficou' : 'sugestões ficaram'} de fora por não fazer sentido (tarefa que não existe ou dia que já
          passou).
        </p>
      )}
      <div className="form__botoes">
        <button className="tecla tecla--pequena" onClick={() => void window.api.descartarProposta()}>
          Descartar
        </button>
        {p.mudancas.length > 0 && (
          <button className="tecla tecla--pequena tecla--ambar" disabled={marcadas.size === 0} onClick={() => void window.api.aplicarProposta([...marcadas])}>
            Aplicar {marcadas.size === p.mudancas.length ? 'tudo' : `as ${marcadas.size} marcadas`}
          </button>
        )}
      </div>
    </div>
  )
}

// ---------- Importar o plano de ensino ----------

export function ImportarPlano({ estado, aoFechar }: { estado: Estado; aoFechar: () => void }) {
  const ativas = estado.materias.filter((m) => !m.arquivada)
  const [arquivo, setArquivo] = useState<string | null>(null)
  const [materiaId, setMateriaId] = useState<number | null>(null)
  const [doCanvas, setDoCanvas] = useState(false)

  // A leitura leva minutos: a janela fecha e o resultado chega como aviso (e a revisão aparece no Calendário).
  function ler() {
    if (!arquivo) return
    void window.api.lerPlano(arquivo, materiaId)
    aoFechar()
  }

  return (
    <Modal titulo="Importar o plano de ensino" aoFechar={aoFechar}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          ler()
        }}
      >
        <p className="modal__texto">
          A IA lê o PDF e separa as avaliações (data e pontos), as aulas com o assunto e a bibliografia. Você revisa tudo antes de entrar no calendário.
        </p>
        <label>
          Matéria
          <select className="seletor" value={materiaId ?? ''} onChange={(e) => setMateriaId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Matéria nova (a IA lê o nome no PDF)</option>
            {ativas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </select>
        </label>
        <div className="linha-campo" style={{ margin: 0 }}>
          <button type="button" className="tecla tecla--pequena" onClick={() => void window.api.escolherPdf().then((a) => a && setArquivo(a))}>
            {arquivo ? 'Trocar o PDF' : 'Escolher o PDF'}
          </button>
          {estado.canvas.conectado && !doCanvas && (
            <button type="button" className="tecla tecla--pequena" onClick={() => setDoCanvas(true)}>
              Pegar do Canvas
            </button>
          )}
          {arquivo && <span className="mudo quebra">{arquivo.split(/[\\/]/).pop()}</span>}
        </div>
        {doCanvas && (
          <PdfsDoCanvas
            estado={estado}
            materiaId={materiaId}
            max={1}
            primeiro={/plano|ementa/i}
            aoFechar={() => setDoCanvas(false)}
            aoEscolher={([pdf]) => {
              setArquivo(pdf.caminho)
              setDoCanvas(false)
              // O curso já ligado a uma matéria escolhe a matéria também.
              const ligada = estado.canvas.cursos.find((c) => c.id === pdf.cursoId)?.materiaId
              if (materiaId === null && ligada) setMateriaId(ligada)
            }}
          />
        )}
        <div className="form__botoes">
          <button type="button" className="tecla tecla--pequena" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" className="tecla tecla--pequena tecla--ambar" disabled={!arquivo || !!estado.ia.trabalho || !estado.ia.claude}>
            Ler com a IA
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ---------- Revisar o plano de ensino lido ----------

const TIPOS_AVALIACAO: { valor: AvaliacaoLida['tipo']; nome: string }[] = [
  { valor: 'prova', nome: 'Prova' },
  { valor: 'atividade', nome: 'Atividade' },
  { valor: 'reavaliacao', nome: 'Reavaliação' }
]

export function RevisaoPlano({ estado }: { estado: Estado }) {
  const [l, setL] = useState<LeituraPlano>(estado.leituraPlano!)
  const existente = estado.materias.find((m) => m.id === l.materiaId)
  const mudarAvaliacao = (i: number, p: Partial<AvaliacaoLida>) => setL({ ...l, avaliacoes: l.avaliacoes.map((a, j) => (j === i ? { ...a, ...p } : a)) })
  const mudarAula = (i: number, p: Partial<AulaLida>) => setL({ ...l, aulas: l.aulas.map((a, j) => (j === i ? { ...a, ...p } : a)) })
  const comData = l.aulas.filter((a) => a.data)
  const todasAulas = comData.every((a) => a.incluir)
  const nAval = l.avaliacoes.filter((a) => a.incluir).length
  const nAulas = l.aulas.filter((a) => a.incluir && a.data).length

  return (
    <div className="painel revisao" style={existente ? estiloMateria(estado.materias, existente.id) : ({ '--cor-materia': 'var(--destaque)' } as CSSProperties)}>
      <h2>
        Plano de ensino lido <span className="titulo-apagado">{l.arquivo}</span>
      </h2>
      <p className="mudo" style={{ marginTop: -6 }}>
        Confira e corrija antes de aplicar. Só entra no calendário o que estiver marcado.
      </p>

      <div className="form" style={{ marginBottom: 18 }}>
        <label>
          Matéria
          {existente ? (
            <input className="campo" value={existente.nome} disabled />
          ) : (
            <input className="campo" value={l.materia} onChange={(e) => setL({ ...l, materia: e.target.value })} />
          )}
        </label>
      </div>

      <h3 className="revisao__titulo">Avaliações</h3>
      {l.avaliacoes.length === 0 ? (
        <p className="mudo">A IA não achou avaliações.</p>
      ) : (
        <div className="revisao__tabela">
          <div className="revisao__linha revisao__linha--cabecalho">
            <span />
            <span>Nome</span>
            <span>Tipo</span>
            <span>Dia</span>
            <span>Vale</span>
            <span>O que cai</span>
          </div>
          {l.avaliacoes.map((a, i) => (
            <div key={i} className={`revisao__linha ${a.incluir ? '' : 'revisao__linha--fora'}`}>
              <input type="checkbox" className="marcar" checked={a.incluir} onChange={(e) => mudarAvaliacao(i, { incluir: e.target.checked })} aria-label="Incluir" />
              <input className="campo" value={a.titulo} onChange={(e) => mudarAvaliacao(i, { titulo: e.target.value })} aria-label="Nome" />
              <select className="seletor" value={a.tipo} onChange={(e) => mudarAvaliacao(i, { tipo: e.target.value as AvaliacaoLida['tipo'] })} aria-label="Tipo">
                {TIPOS_AVALIACAO.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.nome}
                  </option>
                ))}
              </select>
              <input className="campo" type="date" value={a.data ?? ''} onChange={(e) => mudarAvaliacao(i, { data: e.target.value || null })} aria-label="Dia" />
              <input
                className="campo"
                inputMode="decimal"
                value={a.pontos === null ? '' : String(a.pontos).replace('.', ',')}
                onChange={(e) => {
                  const v = e.target.value.trim().replace(',', '.')
                  mudarAvaliacao(i, { pontos: v === '' || Number.isNaN(Number(v)) ? null : Number(v) })
                }}
                aria-label="Pontos"
              />
              <input className="campo" value={a.conteudo} onChange={(e) => mudarAvaliacao(i, { conteudo: e.target.value })} aria-label="O que cai" />
            </div>
          ))}
        </div>
      )}

      <h3 className="revisao__titulo">
        Aulas <span className="mudo">({nAulas} de {comData.length} com dia)</span>
        {comData.length > 0 && (
          <button className="botao-texto" onClick={() => setL({ ...l, aulas: l.aulas.map((a) => ({ ...a, incluir: !!a.data && !todasAulas })) })}>
            {todasAulas ? 'Desmarcar todas' : 'Marcar todas'}
          </button>
        )}
      </h3>
      <ul className="revisao__aulas">
        {l.aulas.map((a, i) => (
          <li key={i} className={a.incluir && a.data ? '' : 'revisao__linha--fora'}>
            <input
              type="checkbox"
              className="marcar"
              checked={a.incluir && !!a.data}
              disabled={!a.data}
              onChange={(e) => mudarAula(i, { incluir: e.target.checked })}
              aria-label="Incluir aula"
            />
            <span className="revisao__dia">{a.data ? dia(a.data) : 'sem dia'}</span>
            <span>{a.conteudo}</span>
          </li>
        ))}
      </ul>

      {l.bibliografia.length > 0 && (
        <>
          <h3 className="revisao__titulo">Bibliografia básica</h3>
          <ul className="revisao__biblio">
            {l.bibliografia.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </>
      )}
      {l.observacoes && (
        <div className="estado-bloqueio" style={{ marginTop: 14 }}>
          <Led aceso cor="ambar" />
          <div>
            <strong>Regras de nota</strong>
            <span>{l.observacoes}</span>
          </div>
        </div>
      )}

      <div className="form__botoes">
        <button className="tecla tecla--pequena" onClick={() => void window.api.descartarLeitura()}>
          Descartar
        </button>
        <button className="tecla tecla--pequena tecla--ambar" disabled={nAval + nAulas === 0} onClick={() => void window.api.aplicarLeitura(l)}>
          Pôr no calendário ({nAval} {nAval === 1 ? 'avaliação' : 'avaliações'} e {nAulas} {nAulas === 1 ? 'aula' : 'aulas'})
        </button>
      </div>
    </div>
  )
}
