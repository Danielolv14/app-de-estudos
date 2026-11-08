import { useEffect, useState } from 'react'
import type { Estado, Tarefa } from '@shared/tipos'
import {
  diaMes,
  estudadoNoDia,
  estudoMs,
  formatarDuracao,
  formatarRelogio,
  metaDoDia,
  nomeDiaSemana,
  pausaMs
} from '@shared/regras'
import { Digitos, Led, estiloMateria, nomeDe } from '../componentes/Basicos'
import { Brilho, FundoGrade } from '../componentes/Decoracao'
import { Encerrar } from '../componentes/Encerrar'
import { MoverAtrasada } from '../componentes/Atrasada'
import { IconeParar, IconePausa, IconeTocar } from '../componentes/Icones'
import { useAgora } from '../usarEstado'

const SEGMENTOS = 30

const hora = (ms: number) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

export function Foco({ estado, abrirTrava }: { estado: Estado; abrirTrava: number }) {
  const agora = useAgora(estado)
  const { ativa, materias, tarefas, hoje } = estado
  const deHoje = tarefas.filter((t) => t.data === hoje)
  const atrasadas = tarefas.filter((t) => !t.feita && t.data < hoje)
  const [escolhida, setEscolhida] = useState<number | null>(null)
  const [encerrando, setEncerrando] = useState(false)

  useEffect(() => {
    if (abrirTrava > 0 && estado.ativa) setEncerrando(true)
  }, [abrirTrava])

  // Tarefa mostrada: a da sessão, ou a escolhida, ou a primeira pendente de hoje.
  const idAtual = ativa ? ativa.tarefaId : (escolhida ?? deHoje.find((t) => !t.feita)?.id ?? null)
  const tarefa = tarefas.find((t) => t.id === idAtual)
  const materiaId = ativa ? ativa.materiaId : (tarefa?.materiaId ?? null)

  const meta = metaDoDia(hoje, tarefas, estado.metasDia)
  const estudado = estudadoNoDia(hoje, estado.sessoes, ativa, agora)
  const fracao = meta > 0 ? Math.min(1, estudado / (meta * 60_000)) : 0
  const acesos = Math.floor(fracao * SEGMENTOS)
  const batida = meta > 0 && estudado >= meta * 60_000

  const statusVisor = ativa ? ativa.status : 'parado'
  const tempo = ativa ? estudoMs(ativa, agora) : 0

  async function escolher(t: Tarefa) {
    if (ativa) await window.api.trocarTarefa(t.id)
    else setEscolhida(t.id)
  }

  const listaTarefas = (lista: Tarefa[], comData = false) => (
    <ul className="tarefas">
      {lista.map((t) => (
        <li
          key={t.id}
          className={`tarefa tarefa--selecionavel ${t.id === idAtual ? 'tarefa--escolhida' : ''} ${t.feita ? 'tarefa--feita' : ''}`}
          style={estiloMateria(materias, t.materiaId)}
          onClick={() => void escolher(t)}
        >
          <input
            type="checkbox"
            className="marcar"
            checked={t.feita}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => void window.api.marcarTarefa(t.id, e.target.checked)}
            aria-label={`Marcar "${t.titulo}" como feita`}
          />
          <span className="tarefa__titulo">{t.titulo}</span>
          <span className="tarefa__lado">{formatarDuracao(t.minutos * 60_000)}</span>
          <span className="tarefa__detalhe">
            {nomeDe(materias, t.materiaId)}
            {comData ? `, ${nomeDiaSemana(t.data, true)} ${diaMes(t.data)}` : ''}
          </span>
          {comData && !t.feita && <MoverAtrasada tarefa={t} tarefas={tarefas} hoje={hoje} />}
        </li>
      ))}
    </ul>
  )

  return (
    <div className="foco">
      <section>
        <div className="aparelho" style={estiloMateria(materias, materiaId)}>
          <FundoGrade />
          <div className="aparelho__topo">
            {tarefa || ativa ? (
              <>
                <span className="aparelho__materia">
                  <span className="ponto" />
                  {nomeDe(materias, materiaId)}
                </span>
                <span className="aparelho__tarefa">{tarefa?.titulo ?? 'Estudo livre'}</span>
              </>
            ) : (
              <span className="aparelho__tarefa">Escolha uma tarefa ao lado ou comece um estudo livre.</span>
            )}
          </div>

          <div className="visor">
            <Brilho />
            <div className="visor__legenda">
              <span className={ativa?.status === 'estudando' ? 'ligado' : ''}>
                <Led aceso={ativa?.status === 'estudando'} /> Estudando
              </span>
              <span className={ativa?.status === 'pausado' ? 'ligado' : ''}>
                <Led aceso={ativa?.status === 'pausado'} cor="ambar" /> Pausado
              </span>
              <span className={estado.bloqueio.bloqueado ? 'ligado' : ''}>
                <Led aceso={estado.bloqueio.bloqueado} cor="vermelho" /> Sites bloqueados
              </span>
            </div>

            <Digitos texto={formatarRelogio(tempo)} estado={statusVisor} classe="digitos" />

            <div className={`barra-meta ${batida ? 'barra-meta--batida' : ''}`} aria-hidden>
              {Array.from({ length: SEGMENTOS }, (_, i) => (
                <i key={i} className={i < acesos ? 'aceso' : ''} />
              ))}
            </div>
            <div className="visor__rodape">
              <span>
                {meta > 0
                  ? `Hoje: ${formatarDuracao(estudado)} de ${formatarDuracao(meta * 60_000)}`
                  : `Hoje: ${formatarDuracao(estudado)}, sem meta`}
              </span>
              <span>{batida ? 'Meta batida' : meta > 0 ? `Faltam ${formatarDuracao(meta * 60_000 - estudado)}` : ''}</span>
            </div>
          </div>

          <div className="aparelho__teclas">
            {!ativa && (
              <button className="tecla tecla--grande tecla--ambar" onClick={() => void window.api.iniciar(idAtual)}>
                <IconeTocar />
                {tarefa ? 'Começar a estudar' : 'Começar estudo livre'}
              </button>
            )}
            {ativa?.status === 'estudando' && (
              <button className="tecla tecla--grande" onClick={() => void window.api.pausar()}>
                <IconePausa />
                Pausar
              </button>
            )}
            {ativa?.status === 'pausado' && (
              <button className="tecla tecla--grande tecla--ambar" onClick={() => void window.api.retomar()}>
                <IconeTocar />
                Continuar
              </button>
            )}
            {ativa && (
              <button className="tecla tecla--grande" onClick={() => setEncerrando(true)}>
                <IconeParar tamanho={16} />
                Encerrar
              </button>
            )}
          </div>

          <p className="aparelho__info">
            {ativa
              ? `Começou às ${hora(ativa.inicio)}. Pausas: ${formatarDuracao(pausaMs(ativa, agora))}. Na pausa o bloqueio continua.`
              : estado.bloqueio.vivo
                ? 'Ao começar, o Instagram e o WhatsApp Web são bloqueados e o Chrome é reiniciado.'
                : 'O bloqueio de sites ainda não está instalado. Instale em Ajustes; o timer funciona sem ele.'}
          </p>
        </div>
      </section>

      <aside>
        <div className="painel">
          <h2>
            Hoje, <span className="titulo-apagado">{nomeDiaSemana(hoje)} {diaMes(hoje)}</span>
          </h2>
          {deHoje.length > 0 ? (
            listaTarefas(deHoje)
          ) : (
            <div className="vazio">
              <strong>Sem tarefas para hoje.</strong>
              {proximaTarefa(tarefas, hoje)}
            </div>
          )}
        </div>
        {atrasadas.length > 0 && (
          <div className="painel">
            <h2>Atrasadas</h2>
            {listaTarefas(atrasadas, true)}
          </div>
        )}
      </aside>

      {encerrando && <Encerrar tarefa={ativa?.tarefaId ? tarefas.find((t) => t.id === ativa.tarefaId) : undefined} aoFechar={() => setEncerrando(false)} />}
    </div>
  )
}

function proximaTarefa(tarefas: Tarefa[], hoje: string): string {
  const prox = tarefas.find((t) => t.data > hoje && !t.feita)
  if (!prox) return 'Nada planejado pela frente. Crie tarefas na tela Plano.'
  return `A próxima é ${nomeDiaSemana(prox.data)}, ${diaMes(prox.data)}: ${prox.titulo}.`
}
