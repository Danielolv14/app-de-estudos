import { useState } from 'react'
import type { Evento, Materia, Tarefa, TipoEvento } from '@shared/tipos'
import { Modal } from './Basicos'

const numeroOuNulo = (s: string): number | null => (s.trim() === '' ? null : Number(s.replace(',', '.')))

export function FormTarefa(p: {
  materias: Materia[]
  tarefa?: Tarefa
  dataInicial: string
  aoFechar: () => void
}) {
  const t = p.tarefa
  const [data, setData] = useState(t?.data ?? p.dataInicial)
  const [materiaId, setMateriaId] = useState<number | null>(t?.materiaId ?? p.materias[0]?.id ?? null)
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
              {p.materias.map((m) => (
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

export function FormEvento(p: { materias: Materia[]; evento?: Evento; dataInicial: string; aoFechar: () => void }) {
  const ev = p.evento
  const [data, setData] = useState(ev?.data ?? p.dataInicial)
  const [titulo, setTitulo] = useState(ev?.titulo ?? '')
  const [tipo, setTipo] = useState<TipoEvento>(ev?.tipo ?? 'prova')
  const [materiaId, setMateriaId] = useState<number | null>(ev ? ev.materiaId : (p.materias[0]?.id ?? null))
  const [pontos, setPontos] = useState(ev?.pontos?.toString() ?? '')
  const [meta, setMeta] = useState(ev?.meta?.toString() ?? '')
  const [nota, setNota] = useState(ev?.nota?.toString() ?? '')
  const avaliacao = tipo === 'prova' || tipo === 'atividade' || tipo === 'reavaliacao'
  const valido = titulo.trim() !== '' && /^\d{4}-\d{2}-\d{2}$/.test(data)

  async function salvar() {
    if (!valido) return
    await window.api.salvarEvento({
      id: ev?.id,
      data,
      titulo: titulo.trim(),
      tipo,
      materiaId,
      pontos: avaliacao ? numeroOuNulo(pontos) : null,
      meta: avaliacao ? numeroOuNulo(meta) : null,
      nota: avaliacao ? numeroOuNulo(nota) : null
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
            <input className="campo" type="date" value={data} onChange={(e) => setData(e.target.value)} />
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
            {p.materias.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
            <option value="">Nenhuma</option>
          </select>
        </label>
        {avaliacao && (
          <div className="form__linha" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
            <label>
              Vale (pontos)
              <input className="campo" inputMode="decimal" value={pontos} onChange={(e) => setPontos(e.target.value)} />
            </label>
            <label>
              Sua meta
              <input className="campo" inputMode="decimal" value={meta} onChange={(e) => setMeta(e.target.value)} />
            </label>
            <label>
              Nota que tirou
              <input className="campo" inputMode="decimal" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Depois da prova" />
            </label>
          </div>
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
