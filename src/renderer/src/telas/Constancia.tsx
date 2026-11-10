// Painel de constância: mapa de calor das horas, sequência de dias cumpridos e semana planejada x feita.
import type { Estado } from '@shared/tipos'
import { dias, nivel, semanas, sequencia } from '@shared/constancia'
import { diaMes, formatarDuracao, inicioDaSemana, nomeDiaSemana, somarDias } from '@shared/regras'
import { useAgora } from '../usarEstado'

const SEMANAS_MAPA = 26
const LINHAS = ['seg', '', 'qua', '', 'sex', '', 'dom']

export function Constancia({ estado }: { estado: Estado }) {
  const agora = useAgora(estado)
  const d = { hoje: estado.hoje, agora, tarefas: estado.tarefas, sessoes: estado.sessoes, metasDia: estado.metasDia, ativa: estado.ativa }
  const seq = sequencia(d)
  const inicio = somarDias(inicioDaSemana(estado.hoje), -7 * (SEMANAS_MAPA - 1))
  const mapa = dias(d, inicio, somarDias(inicioDaSemana(estado.hoje), 6))
  const ultimas = semanas(d, 8)
  const estaSemana = ultimas[ultimas.length - 1]
  const maiorSemana = Math.max(60, ...ultimas.map((w) => Math.max(w.planejadoMin, w.feitoMs / 60_000)))

  return (
    <div className="constancia">
      <div className="titulo-tela">
        <div>
          <h1>Constância</h1>
          <p>Horas por dia e quantos dias seguidos você bateu a meta. Dia sem meta, como segunda e fim de semana, não quebra a sequência.</p>
        </div>
      </div>

      <div className="numeros">
        <div className="painel numero">
          <span className="numero__valor">{seq.atual}</span>
          <span className="numero__rotulo">{seq.atual === 1 ? 'dia seguido' : 'dias seguidos'} com a meta cumprida</span>
        </div>
        <div className="painel numero">
          <span className="numero__valor numero__valor--apagado">{seq.recorde}</span>
          <span className="numero__rotulo">recorde</span>
        </div>
        <div className="painel numero">
          <span className="numero__valor numero__valor--apagado">{formatarDuracao(estaSemana.feitoMs)}</span>
          <span className="numero__rotulo">nesta semana, de {formatarDuracao(estaSemana.planejadoMin * 60_000)} planejadas</span>
        </div>
      </div>

      <div className="painel">
        <h2>
          Horas por dia <span className="titulo-apagado">nas últimas {SEMANAS_MAPA} semanas</span>
        </h2>
        <div className="mapa">
          <div className="mapa__linhas" aria-hidden>
            {LINHAS.map((l, i) => (
              <span key={i}>{l}</span>
            ))}
          </div>
          <div className="mapa__grade" role="img" aria-label="Mapa de calor das horas estudadas por dia">
            {mapa.map((x) => {
              const futuro = x.data > estado.hoje
              const n = futuro ? 0 : nivel(x.estudoMs)
              const titulo = `${nomeDiaSemana(x.data, true)} ${diaMes(x.data)}: ${formatarDuracao(x.estudoMs)}${x.metaMin > 0 ? ` de ${formatarDuracao(x.metaMin * 60_000)}` : ', sem meta'}`
              return (
                <i
                  key={x.data}
                  title={futuro ? undefined : titulo}
                  className={`mapa__dia mapa__dia--${n} ${futuro ? 'mapa__dia--futuro' : ''} ${x.cumprido === false && x.data < estado.hoje ? 'mapa__dia--falhou' : ''} ${x.data === estado.hoje ? 'mapa__dia--hoje' : ''}`}
                />
              )
            })}
          </div>
        </div>
        <div className="mapa__legenda">
          <span>Menos</span>
          {[0, 1, 2, 3, 4].map((n) => (
            <i key={n} className={`mapa__dia mapa__dia--${n}`} />
          ))}
          <span>Mais (3 h ou mais)</span>
          <i className="mapa__dia mapa__dia--0 mapa__dia--falhou" style={{ marginLeft: 16 }} />
          <span>Dia com meta que ficou abaixo</span>
        </div>
      </div>

      <div className="painel">
        <h2>
          Planejado x feito <span className="titulo-apagado">por semana</span>
        </h2>
        <ul className="barras">
          {ultimas.map((w) => (
            <li key={w.inicio}>
              <span className="barras__semana">
                {diaMes(w.inicio)} a {diaMes(somarDias(w.inicio, 6))}
              </span>
              <div className="barras__trilho">
                <i className="barras__planejado" style={{ width: `${(w.planejadoMin / maiorSemana) * 100}%` }} />
                <i className="barras__feito" style={{ width: `${(w.feitoMs / 60_000 / maiorSemana) * 100}%` }} />
              </div>
              <span className="barras__valor">
                {formatarDuracao(w.feitoMs)} <span className="mudo">de {formatarDuracao(w.planejadoMin * 60_000)}</span>
              </span>
              <span className="barras__dias mudo">
                {w.diasComMeta > 0 ? `${w.diasCumpridos} de ${w.diasComMeta} dias` : 'sem meta'}
              </span>
            </li>
          ))}
        </ul>
        <div className="mapa__legenda">
          <i className="barras__amostra barras__amostra--planejado" />
          <span>Planejado</span>
          <i className="barras__amostra barras__amostra--feito" style={{ marginLeft: 12 }} />
          <span>Feito</span>
        </div>
      </div>
    </div>
  )
}
