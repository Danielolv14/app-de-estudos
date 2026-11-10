import { useState } from 'react'
import type { Evento, Materia, Tarefa, TipoEvento } from '@shared/tipos'
import { Modal } from './Basicos'

const numeroOuNulo = (s: string): number | null => (s.trim() === '' ? null : Number(s.replace(',', '.')))

/** Matérias que aparecem no seletor: as ativas, mais a do item, se ela já foi arquivada. */
const doSeletor = (materias: Materia[], atual: number | null | undefined) => materias.filter((m) => !m.arquivada || m.id === atual)

export function FormTarefa(p: {
  materias: Materia[]
  tarefa?: Tarefa
  dataInicial: string
  aoFechar: () => void
}) {
  const t = p.tarefa
  const materias = doSeletor(p.materias, t?.materiaId)
  const [data, setData] = useState(t?.data ?? p.dataInicial)
  const [materiaId, setMateriaId] = useState<number | null>(t ? t.materiaId : (materias[0]?.id ?? null))
  const [titulo, setTitulo] = useState(t?.titulo ?? '')
  const [detalhe, setDetalhe] = useState(t?.detalhe ?? '')
  const [horas, setHoras] = useState(String(Math.floor((t?.minutos ?? 120) / 60)))
  const [minutos, setMinutos] = useState(String((t?.minutos ?? 120) % 60))

  const total = (Number(horas) || 0) * 60 + (Number(minutos) || 0)
  const valido = titulo.trim() !== '' && /^\d{4}-\d{2}-\d{2}$/.test(data) && total > 0

  async function salvar() {
    if (!valido) return
    await window.api.salvarTarefa({ id: t?.id, data, materiaId, titulo: titulo.trim(), detalhe: detalhe.trim(), minutos: total })
    p.aoFechar()
  }

  async function remover() {
    if (!t) return
    await window.api.removerTarefa(t.id)
    p.aoFechar()
  }

  return (
    <Modal titulo={t ? 'Editar tarefa' : 'Nova tarefa'} aoFechar={p.aoFechar}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          void salvar()
        }}
      >
        <label>
          O que estudar
          <input className="campo" autoFocus value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: 3.9 taxas relacionadas (1, 3, 5, 7)" />
        </label>
        <div className="form__linha">
          <label>
            Dia
            <input className="campo" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </label>
          <label>
            Matéria
            <select className="seletor" value={materiaId ?? ''} onChange={(e) => setMateriaId(e.target.value ? Number(e.target.value) : null)}>
              {materias.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
              <option value="">Sem matéria</option>
            </select>
          </label>
        </div>
        <div className="form__linha">
          <label>
            Horas previstas
            <input className="campo" type="number" min={0} max={12} value={horas} onChange={(e) => setHoras(e.target.value)} />
          </label>
          <label>
            Minutos
            <input className="campo" type="number" min={0} max={59} step={5} value={minutos} onChange={(e) => setMinutos(e.target.value)} />
          </label>
        </div>
        <label>
          Como fazer (opcional)
          <textarea className="campo-area" value={detalhe} onChange={(e) => setDetalhe(e.target.value)} />
        </label>
        <div className="form__botoes">
          {t && (
            <button type="button" className="tecla tecla--pequena esquerda" onClick={() => void remover()}>
              Apagar tarefa
            </button>
          )}
          <button type="button" className="tecla tecla--pequena" onClick={p.aoFechar}>
            Cancelar
          </button>
          <button type="submit" className="tecla tecla--pequena tecla--ambar" disabled={!valido}>
            {t ? 'Salvar tarefa' : 'Criar tarefa'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

const TIPOS: { valor: TipoEvento; nome: string }[] = [
  { valor: 'prova', nome: 'Prova' },
  { valor: 'atividade', nome: 'Atividade avaliativa' },
  { valor: 'reavaliacao', nome: 'Reavaliação' },
  { valor: 'aula', nome: 'Aula' },
  { valor: 'outro', nome: 'Outro' }
]

export function FormEvento(p: {
  materias: Materia[]
  evento?: Evento
  dataInicial: string
  materiaInicial?: number | null
  tipoInicial?: TipoEvento
  /** A avaliação está ligada ao Canvas: a data, o valor e a nota vêm de lá. */
  doCanvas?: boolean
  aoFechar: () => void
}) {
  const ev = p.evento
  const materias = doSeletor(p.materias, ev?.materiaId)
  const texto = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n).replace('.', ','))
  const [data, setData] = useState(ev?.data ?? p.dataInicial)
  const [semData, setSemData] = useState(ev ? ev.data === null : false)
  const [titulo, setTitulo] = useState(ev?.titulo ?? '')
  const [tipo, setTipo] = useState<TipoEvento>(ev?.tipo ?? p.tipoInicial ?? 'prova')
  const [materiaId, setMateriaId] = useState<number | null>(
    ev ? ev.materiaId : p.materiaInicial !== undefined ? p.materiaInicial : (materias[0]?.id ?? null)
  )
  const [conteudo, setConteudo] = useState(ev?.conteudo ?? '')
  const [pontos, setPontos] = useState(texto(ev?.pontos))
  const [meta, setMeta] = useState(texto(ev?.meta))
  const [nota, setNota] = useState(texto(ev?.nota))
  const avaliacao = tipo === 'prova' || tipo === 'atividade' || tipo === 'reavaliacao'
  const comData = !(avaliacao && semData)
  const valido = titulo.trim() !== '' && (!comData || /^\d{4}-\d{2}-\d{2}$/.test(data))

  async function salvar() {
    if (!valido) return
    await window.api.salvarEvento({
      id: ev?.id,
      data: comData ? data : null,
      titulo: titulo.trim(),
      tipo,
      materiaId,
      pontos: avaliacao ? numeroOuNulo(pontos) : null,
      meta: avaliacao ? numeroOuNulo(meta) : null,
      nota: avaliacao ? numeroOuNulo(nota) : null,
      conteudo: tipo === 'outro' ? '' : conteudo.trim()
    })
    p.aoFechar()
  }

  async function remover() {
    if (!ev) return
    await window.api.removerEvento(ev.id)
    p.aoFechar()
  }

  return (
    <Modal titulo={ev ? 'Editar no calendário' : 'Novo no calendário'} aoFechar={p.aoFechar}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          void salvar()
        }}
      >
        <label>
          Nome
          <input className="campo" autoFocus value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Prova 3 de Cálculo" />
        </label>
        <div className="form__linha">
          <label>
            Dia
            <input className="campo" type="date" value={comData ? data : ''} disabled={!comData} onChange={(e) => setData(e.target.value)} />
          </label>
          <label>
            Tipo
            <select className="seletor" value={tipo} onChange={(e) => setTipo(e.target.value as TipoEvento)}>
              {TIPOS.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.nome}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Matéria
          <select className="seletor" value={materiaId ?? ''} onChange={(e) => setMateriaId(e.target.value ? Number(e.target.value) : null)}>
            {materias.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
            <option value="">Nenhuma</option>
          </select>
        </label>
        {tipo !== 'outro' && (
          <label>
            {avaliacao ? 'O que cai (o simulado e o replanejamento usam)' : 'Assunto da aula'}
            <textarea
              className="campo-area"
              rows={2}
              value={conteudo}
              onChange={(e) => setConteudo(e.target.value)}
              placeholder={avaliacao ? 'Ex.: 3.9 taxas relacionadas, 4.7 otimização' : 'Ex.: Unid. 5, arquiteturas paralelas'}
            />
          </label>
        )}
        {avaliacao && (
          <label className="opcao">
            <input type="checkbox" className="marcar" checked={semData} onChange={(e) => setSemData(e.target.checked)} />
            A data ainda não saiu
          </label>
        )}
        {avaliacao && (
          <div className="form__linha" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
            <label>
              Vale (pontos)
              <input className="campo" inputMode="decimal" value={pontos} onChange={(e) => setPontos(e.target.value)} />
            </label>
            <label>
              Sua meta
              <input className="campo" inputMode="decimal" value={meta} onChange={(e) => setMeta(e.target.value)} placeholder="O app calcula" />
            </label>
            <label>
              Nota que tirou
              <input className="campo" inputMode="decimal" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Depois da prova" />
            </label>
          </div>
        )}
        {avaliacao && (
          <p className="form__dica">
            Deixe a meta vazia para o app calcular quanto você precisa tirar para chegar a 60. A reavaliação entra no lugar da menor nota
            de prova.
          </p>
        )}
        {p.doCanvas && (
          <p className="form__dica">
            Esta avaliação vem do Canvas: a data, o valor e a nota são atualizados de lá. O nome, a meta e o que cai ficam como você deixar.
          </p>
        )}
        <div className="form__botoes">
          {ev && (
            <button type="button" className="tecla tecla--pequena esquerda" onClick={() => void remover()}>
              Apagar do calendário
            </button>
          )}
          <button type="button" className="tecla tecla--pequena" onClick={p.aoFechar}>
            Cancelar
          </button>
          <button type="submit" className="tecla tecla--pequena tecla--ambar" disabled={!valido}>
            {ev ? 'Salvar' : 'Adicionar ao calendário'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
