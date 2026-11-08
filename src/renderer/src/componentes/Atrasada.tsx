// Tarefa atrasada: um clique passa para hoje ou para o próximo dia da mesma matéria.
import type { MouseEvent } from 'react'
import type { Tarefa } from '@shared/tipos'
import { diaMes, nomeDiaSemana, proximoDiaDaMateria } from '@shared/regras'

export const estaAtrasada = (t: Tarefa, hoje: string): boolean => !t.feita && t.data < hoje

export function MoverAtrasada({ tarefa, tarefas, hoje }: { tarefa: Tarefa; tarefas: Tarefa[]; hoje: string }) {
  const proximo = proximoDiaDaMateria(tarefas, tarefa.materiaId, hoje)
  const mover = (data: string) => (e: MouseEvent) => {
    e.stopPropagation()
    void window.api.moverTarefa(tarefa.id, data)
  }
  const nomeProximo = proximo ? `${nomeDiaSemana(proximo, true)} ${diaMes(proximo)}` : ''
  return (
    <span className="mover">
      Passar para
      <button className="mover__botao" onClick={mover(hoje)} aria-label={`Passar "${tarefa.titulo}" para hoje`}>
        hoje
      </button>
      {proximo && (
        <button className="mover__botao" onClick={mover(proximo)} aria-label={`Passar "${tarefa.titulo}" para ${nomeProximo}`}>
          {nomeProximo}
        </button>
      )}
    </span>
  )
}
