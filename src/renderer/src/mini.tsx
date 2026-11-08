// Mini-timer flutuante: fica por cima das outras janelas durante a sessão.
import { createRoot } from 'react-dom/client'
import './fontes'
import './estilos.css'
import { estudoMs, formatarRelogio } from '@shared/regras'
import { Digitos, Led, nomeDe } from './componentes/Basicos'
import { IconeJanela, IconePausa, IconeTocar } from './componentes/Icones'
import { useAgora, useEstado } from './usarEstado'

function Mini() {
  const estado = useEstado()
  const agora = useAgora(estado)
  if (!estado?.ativa) return null
  const a = estado.ativa
  const tarefa = estado.tarefas.find((t) => t.id === a.tarefaId)
  return (
    <div className="mini">
      <Digitos texto={formatarRelogio(estudoMs(a, agora))} estado={a.status} classe="mini__visor" />
      <div className="mini__info">
        <strong>
          <Led aceso cor={a.status === 'estudando' ? 'verde' : 'ambar'} />
          {a.status === 'estudando' ? nomeDe(estado.materias, a.materiaId) : 'Pausado'}
        </strong>
        <span>{tarefa?.titulo ?? 'Estudo livre'}</span>
      </div>
      <button
        className="tecla tecla--pequena tecla--icone"
        onClick={() => void (a.status === 'estudando' ? window.api.pausar() : window.api.retomar())}
        aria-label={a.status === 'estudando' ? 'Pausar' : 'Continuar'}
        title={a.status === 'estudando' ? 'Pausar' : 'Continuar'}
      >
        {a.status === 'estudando' ? <IconePausa tamanho={15} /> : <IconeTocar tamanho={15} />}
      </button>
      <button className="tecla tecla--pequena tecla--icone" onClick={() => void window.api.abrirPrincipal()} aria-label="Abrir o app" title="Abrir o app">
        <IconeJanela tamanho={15} />
      </button>
    </div>
  )
}

createRoot(document.getElementById('raiz')!).render(<Mini />)
