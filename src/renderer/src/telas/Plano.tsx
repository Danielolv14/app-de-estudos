import { useState } from 'react'
import type { Estado, Tarefa } from '@shared/tipos'
import { diaMes, diaMesExtenso, formatarDuracao, inicioDaSemana, metaDoDia, nomeDiaSemana, somarDias } from '@shared/regras'
import { estiloMateria, nomeDe } from '../componentes/Basicos'
import { estaAtrasada, MoverAtrasada } from '../componentes/Atrasada'
import { FormTarefa } from '../componentes/Formularios'
import { BotaoReplanejar, PropostaPlano } from '../componentes/Planejamento'
import { IconeEditar, IconeMais } from '../componentes/Icones'

export function Plano({ estado }: { estado: Estado }) {
  const { tarefas, eventos, materias, hoje } = estado
  const [editando, setEditando] = useState<{ tarefa?: Tarefa; data: string } | null>(null)
  const [verPassado, setVerPassado] = useState(false)
  const [metaEditando, setMetaEditando] = useState<{ data: string; valor: string } | null>(null)

  const semanaAtual = inicioDaSemana(hoje)
  const atrasadas = tarefas.filter((t) => !t.feita && t.data < semanaAtual)
  const visiveis = tarefas.filter((t) => verPassado || t.data >= semanaAtual)

  // Agrupa por semana e por dia.
  const semanas = new Map<string, Map<string, Tarefa[]>>()
  for (const t of visiveis) {
    const s = inicioDaSemana(t.data)
    if (!semanas.has(s)) semanas.set(s, new Map())
    const dias = semanas.get(s)!
    if (!dias.has(t.data)) dias.set(t.data, [])
    dias.get(t.data)!.push(t)
  }

  async function salvarMeta() {
    if (!metaEditando) return
    const v = metaEditando.valor.trim().replace(',', '.')
    if (v === '') await window.api.definirMeta(metaEditando.data, null)
    else if (!Number.isNaN(Number(v))) await window.api.definirMeta(metaEditando.data, Math.round(Number(v) * 60))
    setMetaEditando(null)
  }

  const linhaTarefa = (t: Tarefa, comData = false) => (
    <li key={t.id} className={`tarefa ${t.feita ? 'tarefa--feita' : ''}`} style={estiloMateria(materias, t.materiaId)}>
      <input
        type="checkbox"
        className="marcar"
        checked={t.feita}
        onChange={(e) => void window.api.marcarTarefa(t.id, e.target.checked)}
        aria-label={`Marcar "${t.titulo}" como feita`}
      />
      <span className="tarefa__titulo">{t.titulo}</span>
      <span className="tarefa__lado">
        <span className="tarefa__acoes">
          <button className="botao-texto" onClick={() => setEditando({ tarefa: t, data: t.data })} aria-label="Editar tarefa">
            <IconeEditar />
          </button>
        </span>
        {formatarDuracao(t.minutos * 60_000)}
      </span>
      <span className="tarefa__detalhe">
        {nomeDe(materias, t.materiaId)}
        {comData ? `, ${nomeDiaSemana(t.data, true)} ${diaMes(t.data)}` : ''}
        {t.detalhe ? `. ${t.detalhe}` : ''}
      </span>
      {estaAtrasada(t, hoje) && <MoverAtrasada tarefa={t} tarefas={tarefas} hoje={hoje} />}
    </li>
  )

  const checkinsDoDia = (data: string) =>
    estado.sessoes.filter((s) => s.dia === data && s.fim !== null && (s.checkinFeito || s.checkinTravou))

  return (
    <div>
      <div className="titulo-tela">
        <div>
          <h1>Plano</h1>
          <p>A soma das horas previstas de cada dia vira a meta do dia, que a trava usa para liberar os sites.</p>
        </div>
        <div className="titulo-tela__botoes">
          <BotaoReplanejar estado={estado} />
          <button className="tecla tecla--ambar" onClick={() => setEditando({ data: hoje })}>
            <IconeMais />
            Nova tarefa
          </button>
        </div>
      </div>

      {estado.propostaPlano && <PropostaPlano key={estado.propostaPlano.criadaEm} estado={estado} />}

      {atrasadas.length > 0 && (
        <div className="painel" style={{ marginBottom: 28 }}>
          <h2>Atrasadas de semanas anteriores</h2>
          <p className="mudo" style={{ marginTop: -6 }}>
            Passe cada uma para outro dia, ou peça para a IA replanejar tudo de uma vez.
          </p>
          <ul className="tarefas">{atrasadas.map((t) => linhaTarefa(t, true))}</ul>
        </div>
      )}

      {[...semanas.entries()].map(([inicio, dias]) => {
        const total = [...dias.values()].flat().reduce((a, t) => a + t.minutos, 0)
        const fim = somarDias(inicio, 6)
        return (
          <section className="semana" key={inicio}>
            <h3 className="semana__titulo">
              {inicio === semanaAtual ? 'Esta semana' : `Semana de ${diaMesExtenso(inicio)} a ${diaMesExtenso(fim)}`}
              <span className="mudo">{formatarDuracao(total * 60_000)} previstas</span>
            </h3>
            {[...dias.entries()].map(([data, lista]) => {
              const meta = metaDoDia(data, tarefas, estado.metasDia)
              const ajustada = estado.metasDia[data] !== undefined
              const doDia = eventos.filter((e) => e.data === data)
              return (
                <div className={`dia ${data === hoje ? 'dia--hoje' : ''}`} key={data}>
                  <div>
                    <div className="dia__nome">
                      {nomeDiaSemana(data, true)} <span className="titulo-apagado">{diaMes(data)}</span>
                    </div>
                    <div className="dia__meta">
                      {metaEditando?.data === data ? (
                        <input
                          className="campo-meta"
                          autoFocus
                          value={metaEditando.valor}
                          onChange={(e) => setMetaEditando({ data, valor: e.target.value })}
                          onBlur={() => void salvarMeta()}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void salvarMeta()
                            if (e.key === 'Escape') setMetaEditando(null)
                          }}
                          placeholder="horas"
                          aria-label="Meta do dia em horas (vazio volta para a soma das tarefas)"
                        />
                      ) : (
                        <>
                          Meta{' '}
                          <button onClick={() => setMetaEditando({ data, valor: ajustada ? String(meta / 60) : '' })}>
                            {formatarDuracao(meta * 60_000)}
                          </button>
                          {ajustada ? ' (ajustada)' : ''}
                        </>
                      )}
                    </div>
                  </div>
                  <div>
                    {doDia.length > 0 && (
                      <div className="dia__eventos">
                        {doDia.map((e) => (
                          <span
                            key={e.id}
                            className={`selo ${e.entregue ? 'selo--entregue' : e.tipo !== 'aula' && e.tipo !== 'outro' ? 'selo--prova' : ''}`}
                            style={estiloMateria(materias, e.materiaId)}
                          >
                            <span className="ponto" />
                            {e.titulo}
                            {e.entregue && ' · entregue'}
                          </span>
                        ))}
                      </div>
                    )}
                    <ul className="tarefas">{lista.map((t) => linhaTarefa(t))}</ul>
                    {checkinsDoDia(data).length > 0 && (
                      <ul className="checkins" aria-label="Check-ins das sessões do dia">
                        {checkinsDoDia(data).map((s) => (
                          <li key={s.id}>
                            {s.checkinFeito && (
                              <>
                                <strong>Feito:</strong> {s.checkinFeito}{' '}
                              </>
                            )}
                            {s.checkinTravou && (
                              <>
                                <strong>Travou em:</strong> {s.checkinTravou}
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )
            })}
          </section>
        )
      })}

      {semanas.size === 0 && (
        <div className="vazio">
          <strong>Nenhuma tarefa daqui para a frente.</strong>
          Crie a primeira com o botão Nova tarefa.
        </div>
      )}

      <button className="botao-texto" onClick={() => setVerPassado(!verPassado)}>
        {verPassado ? 'Esconder as semanas passadas' : 'Mostrar as semanas passadas'}
      </button>

      {editando && <FormTarefa materias={materias} tarefa={editando.tarefa} dataInicial={editando.data} aoFechar={() => setEditando(null)} />}
    </div>
  )
}
