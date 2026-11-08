import { useEffect, useState } from 'react'
import type { Estado } from '@shared/tipos'
import { diasAte, proximasAvaliacoes, textoContagem } from '@shared/regras'
import { estiloMateria, Led, nomeDe } from './componentes/Basicos'
import { IconeAjustes, IconeCalendario, IconeFechar, IconeFoco, IconeNotas, IconePlano } from './componentes/Icones'
import { useEstado } from './usarEstado'
import { Foco } from './telas/Foco'
import { Plano } from './telas/Plano'
import { Calendario } from './telas/Calendario'
import { Notas } from './telas/Notas'
import { Ajustes } from './telas/Ajustes'

type Tela = 'foco' | 'plano' | 'calendario' | 'notas' | 'ajustes'

const TELAS: { id: Tela; nome: string; Icone: typeof IconeFoco }[] = [
  { id: 'foco', nome: 'Foco', Icone: IconeFoco },
  { id: 'plano', nome: 'Plano', Icone: IconePlano },
  { id: 'calendario', nome: 'Calendário', Icone: IconeCalendario },
  { id: 'notas', nome: 'Notas', Icone: IconeNotas },
  { id: 'ajustes', nome: 'Ajustes', Icone: IconeAjustes }
]

export function App() {
  const estado = useEstado()
  const [tela, setTela] = useState<Tela>('foco')
  const [abrirTrava, setAbrirTrava] = useState(0)

  useEffect(() => window.api.aoNavegar((t) => setTela(t as Tela)), [])
  useEffect(() => window.api.aoAbrirTrava(() => setAbrirTrava((n) => n + 1)), [])

  if (!estado) return null

  return (
    <div className="app">
      <BarraTitulo estado={estado} />

      <nav className="lateral" aria-label="Telas">
        {TELAS.map(({ id, nome, Icone }) => (
          <button key={id} className={`nav ${tela === id ? 'nav--ativa' : ''}`} onClick={() => setTela(id)} aria-current={tela === id}>
            <Icone />
            {nome}
          </button>
        ))}
        <StatusBloqueio estado={estado} irParaAjustes={() => setTela('ajustes')} />
      </nav>

      <main className="conteudo">
        {estado.lembreteAberto && !estado.ativa && <Lembrete estado={estado} />}
        {tela === 'foco' && <Foco estado={estado} abrirTrava={abrirTrava} />}
        {tela === 'plano' && <Plano estado={estado} />}
        {tela === 'calendario' && <Calendario estado={estado} />}
        {tela === 'notas' && <Notas estado={estado} />}
        {tela === 'ajustes' && <Ajustes estado={estado} />}
      </main>

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

/** Barra de cima: as próximas avaliações com a contagem regressiva. */
function BarraTitulo({ estado }: { estado: Estado }) {
  const proximas = proximasAvaliacoes(estado.eventos, estado.hoje).slice(0, 3)
  return (
    <header className="barra-titulo">
      <span className="barra-titulo__nome">App de Estudos</span>
      <div className="provas">
        {proximas.map((e) => (
          <span
            key={e.id}
            className={`prova-chip ${diasAte(estado.hoje, e.data) <= 7 ? 'prova-chip--perto' : ''}`}
            style={estiloMateria(estado.materias, e.materiaId)}
            title={`${e.titulo}, ${nomeDe(estado.materias, e.materiaId)}`}
          >
            <span className="ponto" />
            {e.titulo}
            <span className="prova-chip__dias">{textoContagem(estado.hoje, e.data)}</span>
          </span>
        ))}
      </div>
    </header>
  )
}

function StatusBloqueio({ estado, irParaAjustes }: { estado: Estado; irParaAjustes: () => void }) {
  const b = estado.bloqueio
  const [titulo, texto, cor, aceso] = !b.instalado
    ? ['Bloqueio não instalado', 'Instale em Ajustes.', 'vermelho', false]
    : !b.vivo
      ? ['Bloqueio sem resposta', 'Reinicie o PC.', 'ambar', true]
      : b.bloqueado
        ? ['Sites bloqueados', 'Até a sessão terminar.', 'vermelho', true]
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
