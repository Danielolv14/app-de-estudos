import { useState } from 'react'
import type { Estado, Evento } from '@shared/tipos'
import { dataLocal, diaMes, diasAte, formatarDuracao, metaDoDia, nomeDiaSemana, paraData, proximasAvaliacoes, textoContagem } from '@shared/regras'
import { formatarNota, metaDe, metasAutomaticas } from '@shared/notas'
import { estiloMateria, nomeDe } from '../componentes/Basicos'
import { FormEvento } from '../componentes/Formularios'
import { ImportarPlano, RevisaoPlano } from '../componentes/Planejamento'
import { RevisaoDoCanvas } from '../componentes/Canvas'
import { IconeMais, IconeSeta } from '../componentes/Icones'

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const SEMANA = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom']

export function Calendario({ estado }: { estado: Estado }) {
  const { eventos, materias, hoje, tarefas } = estado
  const [mes, setMes] = useState(() => {
    const d = paraData(hoje)
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [editando, setEditando] = useState<{ evento?: Evento; data: string } | null>(null)
  const [importando, setImportando] = useState(false)

  // Grade de 6 semanas começando na segunda-feira.
  const primeiro = new Date(mes)
  primeiro.setDate(1 - ((mes.getDay() + 6) % 7))
  const dias = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(primeiro)
    d.setDate(primeiro.getDate() + i)
    return dataLocal(d)
  })

  const mudarMes = (n: number) => setMes(new Date(mes.getFullYear(), mes.getMonth() + n, 1))
  const proximas = proximasAvaliacoes(eventos, hoje)
  const automaticas = metasAutomaticas(eventos, materias)

  return (
    <div>
      <div className="titulo-tela">
        <div>
          <h1>Calendário</h1>
          <p>Provas, atividades e aulas. Clique num dia para adicionar.</p>
        </div>
        <div className="titulo-tela__botoes">
          {estado.canvas.conectado && (
            <button className="tecla" disabled={estado.canvas.sincronizando} onClick={() => void window.api.sincronizarCanvas()}>
              {estado.canvas.sincronizando ? 'Buscando no Canvas...' : 'Atualizar do Canvas'}
            </button>
          )}
          <button className="tecla" onClick={() => setImportando(true)} disabled={!!estado.ia.trabalho || !estado.ia.claude}>
            {estado.ia.trabalho?.tipo === 'ler-plano' ? 'Lendo o plano...' : 'Importar plano de ensino'}
          </button>
          <button className="tecla tecla--ambar" onClick={() => setEditando({ data: hoje })}>
            <IconeMais />
            Adicionar ao calendário
          </button>
        </div>
      </div>

      {estado.revisaoCanvas && <RevisaoDoCanvas key={estado.revisaoCanvas.criadaEm} estado={estado} />}
      {estado.leituraPlano && <RevisaoPlano key={estado.leituraPlano.lidaEm} estado={estado} />}
      {importando && <ImportarPlano estado={estado} aoFechar={() => setImportando(false)} />}

      <div className="calendario">
        <section>
          <div className="mes__cabecalho">
            <button className="tecla tecla--pequena tecla--icone" onClick={() => mudarMes(-1)} aria-label="Mês anterior">
              <IconeSeta esquerda tamanho={16} />
            </button>
            <button className="tecla tecla--pequena tecla--icone" onClick={() => mudarMes(1)} aria-label="Próximo mês">
              <IconeSeta tamanho={16} />
            </button>
            <h2>
              {MESES[mes.getMonth()]} <span className="titulo-apagado">de {mes.getFullYear()}</span>
            </h2>
          </div>
          <div className="grade">
            {SEMANA.map((s) => (
              <div key={s} className="grade__semana">
                {s}
              </div>
            ))}
            {dias.map((d) => {
              const fora = paraData(d).getMonth() !== mes.getMonth()
              const doDia = eventos.filter((e) => e.data === d)
              const previsto = metaDoDia(d, tarefas, estado.metasDia)
              return (
                <div
                  key={d}
                  role="button"
                  tabIndex={0}
                  className={`celula ${fora ? 'celula--fora' : ''} ${d === hoje ? 'celula--hoje' : ''}`}
                  onClick={() => setEditando({ data: d })}
                  onKeyDown={(e) => e.key === 'Enter' && setEditando({ data: d })}
                  aria-label={`${nomeDiaSemana(d)} ${diaMes(d)}`}
                >
                  <span className="celula__num">{Number(d.slice(8))}</span>
                  {doDia.map((e) => (
                    <button
                      key={e.id}
                      className={`celula__evento ${e.entregue ? 'celula__evento--entregue' : ''}`}
                      style={estiloMateria(materias, e.materiaId)}
                      title={e.entregue ? `${e.titulo} (já entregue no Canvas)` : e.titulo}
                      onClick={(ev) => {
                        ev.stopPropagation()
                        setEditando({ evento: e, data: d })
                      }}
                    >
                      {e.titulo}
                    </button>
                  ))}
                  {previsto > 0 && <span className="celula__plano">{formatarDuracao(previsto * 60_000)} de estudo</span>}
                </div>
              )
            })}
          </div>
        </section>

        <aside className="painel">
          <h2>Próximas avaliações</h2>
          {proximas.length === 0 ? (
            <div className="vazio">Nenhuma avaliação marcada.</div>
          ) : (
            <ul className="lista-provas">
              {proximas.map((e) => {
                const dias = diasAte(hoje, e.data)
                const meta = metaDe(e, automaticas)
                return (
                  <li key={e.id} style={estiloMateria(materias, e.materiaId)}>
                    <div className="contador" aria-label={textoContagem(hoje, e.data)}>
                      <div style={{ textAlign: 'center' }}>
                        {String(dias).padStart(2, '0')}
                        <small>{dias === 1 ? 'dia' : 'dias'}</small>
                      </div>
                    </div>
                    <div>
                      <div className="lista-provas__titulo">{e.titulo}</div>
                      <div className="lista-provas__extra">
                        {nomeDiaSemana(e.data)}, {diaMes(e.data)}. {nomeDe(materias, e.materiaId)}
                        {e.pontos !== null ? `, vale ${formatarNota(e.pontos)}` : ''}
                        {meta && meta.valor > 0 ? `, meta ${formatarNota(meta.valor)}` : ''}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </aside>
      </div>

      {editando && (
        <FormEvento
          materias={materias}
          evento={editando.evento}
          dataInicial={editando.data}
          doCanvas={!!editando.evento && estado.canvas.eventosDoCanvas.includes(editando.evento.id)}
          aoFechar={() => setEditando(null)}
        />
      )}
    </div>
  )
}
