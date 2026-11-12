import { useEffect, useState } from 'react'
import type { Estado } from '@shared/tipos'
import { diaMes, diasAte, estudoMs, formatarRelogio, nomeDiaSemana, proximasAvaliacoes, textoContagem } from '@shared/regras'
import { formatarNota } from '@shared/notas'
import { siglaDe, tituloSemMateria } from '@shared/sigla'
import { estiloMateria, Led, nomeDe } from './componentes/Basicos'
import {
  IconeAjustes,
  IconeAula,
  IconeCalendario,
  IconeConstancia,
  IconeFechar,
  IconeFoco,
  IconeNotas,
  IconePlano,
  IconeSimulado
} from './componentes/Icones'
import { useAgora, useEstado } from './usarEstado'
import { Foco } from './telas/Foco'
import { Plano } from './telas/Plano'
import { Calendario } from './telas/Calendario'
import { Notas } from './telas/Notas'
import { Ajustes } from './telas/Ajustes'
import { Simulado } from './telas/Simulado'
import { Constancia } from './telas/Constancia'
import { Aula, type AlvoAula } from './telas/Aula'

type Tela = 'foco' | 'aula' | 'plano' | 'calendario' | 'notas' | 'simulado' | 'constancia' | 'ajustes'

const TELAS: { id: Tela; nome: string; Icone: typeof IconeFoco }[] = [
  { id: 'foco', nome: 'Foco', Icone: IconeFoco },
  { id: 'aula', nome: 'Aula', Icone: IconeAula },
  { id: 'plano', nome: 'Plano', Icone: IconePlano },
  { id: 'calendario', nome: 'Calendário', Icone: IconeCalendario },
  { id: 'notas', nome: 'Notas', Icone: IconeNotas },
  { id: 'simulado', nome: 'Simulado', Icone: IconeSimulado },
  { id: 'constancia', nome: 'Constância', Icone: IconeConstancia },
  { id: 'ajustes', nome: 'Ajustes', Icone: IconeAjustes }
]

export function App() {
  const estado = useEstado()
  const [tela, setTela] = useState<Tela>('foco')
  const [abrirTrava, setAbrirTrava] = useState(0)
  const [alvoAula, setAlvoAula] = useState<AlvoAula | null>(null)

  useEffect(() => window.api.aoNavegar((t) => setTela(t as Tela)), [])
  useEffect(() => window.api.aoAbrirTrava(() => setAbrirTrava((n) => n + 1)), [])

  // Ctrl+1 a Ctrl+8 trocam de tela, na ordem do menu.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return
      const n = Number(e.key)
      if (n >= 1 && n <= TELAS.length) {
        e.preventDefault()
        setTela(TELAS[n - 1].id)
      }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [])

  if (!estado) return null

  const abrirAula = (tarefaId: number | null) => {
    setAlvoAula({ tarefaId, vez: Date.now() })
    setTela('aula')
  }

  return (
    <div className="app">
      <BarraTitulo estado={estado} irParaCalendario={() => setTela('calendario')} />

      <nav className="lateral" aria-label="Telas">
        {TELAS.map(({ id, nome, Icone }, i) => (
          <button
            key={id}
            className={`nav ${tela === id ? 'nav--ativa' : ''}`}
            onClick={() => setTela(id)}
            aria-current={tela === id}
            title={`${nome} (Ctrl+${i + 1})`}
          >
            <Icone />
            {nome}
          </button>
        ))}
        <div className="lateral__baixo">
          {estado.ativa && tela !== 'foco' && <SessaoNaLateral estado={estado} voltar={() => setTela('foco')} />}
          <StatusBloqueio estado={estado} irParaAjustes={() => setTela('ajustes')} />
        </div>
      </nav>

      <main className="conteudo">
        {estado.lembreteAberto && !estado.ativa && <Lembrete estado={estado} />}
        {tela === 'foco' && <Foco estado={estado} abrirTrava={abrirTrava} abrirAula={abrirAula} />}
        {tela === 'aula' && <Aula estado={estado} alvo={alvoAula} />}
        {tela === 'plano' && <Plano estado={estado} />}
        {tela === 'calendario' && <Calendario estado={estado} />}
        {tela === 'notas' && <Notas estado={estado} />}
        {tela === 'simulado' && <Simulado estado={estado} />}
        {tela === 'constancia' && <Constancia estado={estado} />}
        {tela === 'ajustes' && <Ajustes estado={estado} />}
      </main>

      {estado.ia.trabalho && <TrabalhoIa estado={estado} />}

      <div className="avisos" aria-live="polite">
        {estado.avisos.map((a) => (
          <div key={a.id} className="aviso">
            <span>{a.texto}</span>
            <button className="botao-texto" onClick={() => void window.api.removerAviso(a.id)} aria-label="Fechar aviso">
              <IconeFechar />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Barra de cima: as próximas avaliações com a sigla da matéria e a contagem regressiva.
 * O nome da matéria sai do título ("Prova 3 de Cálculo" vira "CAL Prova 3"), porque a sigla já diz qual é.
 */
function BarraTitulo({ estado, irParaCalendario }: { estado: Estado; irParaCalendario: () => void }) {
  const proximas = proximasAvaliacoes(estado.eventos, estado.hoje).slice(0, 6)
  return (
    <header className="barra-titulo">
      <span className="barra-titulo__nome">App de Estudos</span>
      <div className="provas">
        {proximas.map((e) => {
          const materia = estado.materias.find((m) => m.id === e.materiaId)
          const titulo = materia ? tituloSemMateria(e.titulo, materia.nome) : e.titulo
          const quando = textoContagem(estado.hoje, e.data)
          return (
            <button
              key={e.id}
              className={`prova-chip ${diasAte(estado.hoje, e.data) <= 7 ? 'prova-chip--perto' : ''}`}
              style={estiloMateria(estado.materias, e.materiaId)}
              title={[
                `${nomeDe(estado.materias, e.materiaId)}: ${e.titulo}`,
                `${nomeDiaSemana(e.data)}, ${diaMes(e.data)} (${quando})`,
                e.pontos ? `vale ${formatarNota(e.pontos)}` : ''
              ]
                .filter(Boolean)
                .join('\n')}
              onClick={irParaCalendario}
            >
              <span className="ponto" />
              {materia && <span className="prova-chip__sigla">{siglaDe(materia)}</span>}
              <span className="prova-chip__titulo">{titulo}</span>
              <span className="prova-chip__dias">{quando}</span>
            </button>
          )
        })}
      </div>
    </header>
  )
}

/** Fora da tela Foco, a sessão continua à vista: o tempo, a matéria e um clique para voltar. */
function SessaoNaLateral({ estado, voltar }: { estado: Estado; voltar: () => void }) {
  const agora = useAgora(estado)
  const a = estado.ativa!
  const materia = estado.materias.find((m) => m.id === a.materiaId)
  return (
    <button className="sessao-lateral" onClick={voltar} style={estiloMateria(estado.materias, a.materiaId)} title="Voltar para o timer">
      <span className="sessao-lateral__estado">
        <Led aceso cor={a.status === 'estudando' ? 'verde' : 'ambar'} />
        {a.status === 'estudando' ? 'Estudando' : 'Pausado'}
      </span>
      <span className={`sessao-lateral__tempo ${a.status === 'pausado' ? 'sessao-lateral__tempo--pausado' : ''}`}>{formatarRelogio(estudoMs(a, agora))}</span>
      <span className="sessao-lateral__materia">
        <span className="ponto" />
        {materia ? materia.nome : 'Estudo livre'}
      </span>
    </button>
  )
}

/** Enquanto a IA trabalha (leva minutos), um aviso fixo com o tempo e o botão de cancelar. */
function TrabalhoIa({ estado }: { estado: Estado }) {
  const agora = useAgora(estado)
  const t = estado.ia.trabalho!
  const seg = Math.max(0, Math.floor((agora - t.desde) / 1000))
  return (
    <div className="trabalho-ia" role="status">
      <Led aceso cor="ambar" />
      <span>{t.descricao}</span>
      <span className="trabalho-ia__tempo">
        {Math.floor(seg / 60)}:{String(seg % 60).padStart(2, '0')}
      </span>
      <button className="botao-texto" onClick={() => void window.api.cancelarIa()}>
        Cancelar
      </button>
    </div>
  )
}

function StatusBloqueio({ estado, irParaAjustes }: { estado: Estado; irParaAjustes: () => void }) {
  const b = estado.bloqueio
  const [titulo, texto, cor, aceso] = !b.instalado
    ? ['Bloqueio não instalado', 'Instale em Ajustes.', 'vermelho', false]
    : !b.vivo
      ? ['Bloqueio sem resposta', 'Reinicie o PC.', 'ambar', true]
      : b.bloqueado
        ? ['Sites bloqueados', estado.ativa || !estado.agendado.ligado ? 'Até a sessão terminar.' : `Até as ${estado.agendado.fim} ou a meta.`, 'vermelho', true]
        : b.desatualizado
          ? ['Atualize o bloqueio', 'Clique em Reinstalar em Ajustes.', 'ambar', true]
          : estado.agendado.inicio && new Date(estado.agora).toTimeString().slice(0, 5) < estado.agendado.inicio
            ? ['Bloqueio pronto', `Liga às ${estado.agendado.inicio} ou com o timer.`, 'verde', true]
            : ['Bloqueio pronto', 'Liga quando o timer começar.', 'verde', true]
  return (
    <button className="lateral__rodape" style={{ border: 0, textAlign: 'left', cursor: 'pointer' }} onClick={irParaAjustes}>
      <strong>
        <Led aceso={aceso as boolean} cor={cor as 'verde'} />
        {titulo}
      </strong>
      {texto}
    </button>
  )
}

function Lembrete({ estado }: { estado: Estado }) {
  const tarefa = estado.tarefas.find((t) => t.data === estado.hoje && !t.feita)
  return (
    <div className="lembrete" role="alert">
      <Led aceso cor="ambar" />
      <div>
        <strong>Hora de estudar</strong>
        <span>{tarefa ? `${nomeDe(estado.materias, tarefa.materiaId)}: ${tarefa.titulo}` : 'Comece o timer.'}</span>
      </div>
      <button className="tecla tecla--pequena tecla--ambar" onClick={() => void window.api.iniciar(tarefa?.id ?? null)}>
        Começar agora
      </button>
      <button className="tecla tecla--pequena" onClick={() => void window.api.adiarLembrete(30)}>
        Adiar 30 min
      </button>
      <button className="botao-texto" onClick={() => void window.api.dispensarLembrete()}>
        Hoje não
      </button>
    </div>
  )
}
