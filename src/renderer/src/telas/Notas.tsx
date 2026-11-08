// Calculadora de nota: quanto falta para chegar a 60 em cada matéria.
import { useState } from 'react'
import type { Estado, Evento, Materia } from '@shared/tipos'
import { diaMes } from '@shared/regras'
import { formatarNota, NOTA_MINIMA, notasDaMateria, type NotasDaMateria } from '@shared/notas'
import { estiloMateria, Led } from '../componentes/Basicos'
import { Brilho } from '../componentes/Decoracao'
import { FormEvento } from '../componentes/Formularios'
import { IconeMais } from '../componentes/Icones'

const lerNumero = (s: string): number | null | undefined => {
  const v = s.trim().replace(',', '.')
  if (v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

export function Notas({ estado }: { estado: Estado }) {
  const [editando, setEditando] = useState<{ evento?: Evento; materiaId: number | null } | null>(null)
  return (
    <div className="notas">
      <div className="titulo-tela">
        <div>
          <h1>Notas</h1>
          <p>Quanto falta para chegar a {NOTA_MINIMA} em cada matéria. Lance a nota depois de cada prova e as metas se ajustam sozinhas.</p>
        </div>
        <button className="tecla tecla--ambar" onClick={() => setEditando({ materiaId: estado.materias[0]?.id ?? null })}>
          <IconeMais />
          Adicionar avaliação
        </button>
      </div>

      {estado.materias.map((m) => (
        <PainelMateria key={m.id} materia={m} estado={estado} editar={(evento) => setEditando({ evento, materiaId: m.id })} />
      ))}

      {estado.materias.length === 0 && (
        <div className="vazio">
          <strong>Nenhuma matéria cadastrada.</strong>
          Crie as matérias em Ajustes.
        </div>
      )}

      {editando && (
        <FormEvento
          materias={estado.materias}
          evento={editando.evento}
          dataInicial={estado.hoje}
          materiaInicial={editando.materiaId}
          tipoInicial="prova"
          aoFechar={() => setEditando(null)}
        />
      )}
    </div>
  )
}

function PainelMateria({ materia, estado, editar }: { materia: Materia; estado: Estado; editar: (e: Evento) => void }) {
  const n = notasDaMateria(estado.eventos, materia.id)
  return (
    <section className="painel boletim" style={estiloMateria(estado.materias, materia.id)}>
      <div className="boletim__topo">
        <div>
          <h2 className="boletim__nome">
            <span className="ponto" />
            {materia.nome}
          </h2>
          <p className="boletim__frase">{frase(n)}</p>
        </div>
        <Mostrador n={n} />
      </div>

      {n.total > 0 && <Regua n={n} />}

      {n.avaliacoes.length > 0 && (
        <div className="boletim__tabela" role="table" aria-label={`Avaliações de ${materia.nome}`}>
          <div className="boletim__linha boletim__linha--cabecalho" role="row">
            <span role="columnheader">Avaliação</span>
            <span role="columnheader">Data</span>
            <span role="columnheader">Vale</span>
            <span role="columnheader">Nota</span>
            <span role="columnheader">Meta</span>
          </div>
          {n.avaliacoes.map((e) => (
            <LinhaAvaliacao key={e.id} e={e} n={n} editar={() => editar(e)} />
          ))}
        </div>
      )}

      {n.trocada && n.reavaliacao && (
        <p className="boletim__nota-rodape">
          A conta supõe que a reavaliação entra no lugar da {n.trocada.titulo} ({formatarNota(n.trocada.nota ?? 0)} de{' '}
          {formatarNota(n.trocada.pontos ?? 0)}), a menor nota de prova. Confirme a regra com o professor.
        </p>
      )}
    </section>
  )
}

function frase(n: NotasDaMateria): string {
  const chega = formatarNota(n.obtido + n.previsto)
  switch (n.situacao) {
    case 'sem-avaliacoes':
      return 'Nenhuma avaliação com pontos ainda. Adicione as provas e quanto cada uma vale.'
    case 'garantido':
      return `Já passou: ${formatarNota(n.obtido)} de ${formatarNota(n.total)}.`
    case 'folga':
      return `Com as metas que você fixou, chega a ${chega}. As outras avaliações não precisam de nota mínima.`
    case 'abaixo':
      return `Com as metas que você fixou, fica em ${chega}. Aumente alguma meta ou deixe vazia para o app calcular.`
    case 'impossivel':
      return `Mesmo com a nota máxima no que falta, fica em ${formatarNota(n.obtido + n.previsto + n.emJogo)}.`
    case 'possivel':
      return `Precisa de ${formatarNota(n.faltam)} pontos dos ${formatarNota(n.emJogo)} que ainda estão em jogo.`
  }
}

/** O visor da matéria: a porcentagem que precisa tirar em cada avaliação que falta. */
function Mostrador({ n }: { n: NotasDaMateria }) {
  if (n.situacao === 'garantido' || n.situacao === 'folga') {
    return (
      <div className="mostrador mostrador--ok">
        <Led aceso cor="verde" />
        {n.situacao === 'garantido' ? 'Aprovado' : 'Chega a 60'}
      </div>
    )
  }
  if (n.situacao !== 'possivel' && n.situacao !== 'impossivel') return null
  const pct = n.situacao === 'possivel' && n.fracao !== null ? Math.ceil(n.fracao * 100 - 1e-6) : null
  return (
    <div className={`mostrador ${pct !== null && pct > 75 ? 'mostrador--alto' : ''}`} aria-label={pct !== null ? `${pct}% de cada avaliação que falta` : 'Não dá mais para chegar a 60'}>
      <div className="mostrador__visor">
        <Brilho />
        <span className="mostrador__digitos" aria-hidden>
          <span className="mostrador__fantasma">888</span>
          <span className="mostrador__aceso">{pct !== null ? String(pct).padStart(3, '!') : '!--'}</span>
        </span>
        <span className="mostrador__pct" aria-hidden>
          %
        </span>
      </div>
      <small>de cada uma que falta</small>
    </div>
  )
}

/** Régua de 0 a 100: o que já tem, o que conta das metas fixas, o que falta até 60. */
function Regua({ n }: { n: NotasDaMateria }) {
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / n.total) * 100))}%`
  const falta = Math.max(0, NOTA_MINIMA - n.obtido - n.previsto)
  return (
    <div className="regua" aria-hidden>
      <div className="regua__trilho">
        <span className="regua__obtido" style={{ width: pct(n.obtido) }} />
        <span className="regua__previsto" style={{ left: pct(n.obtido), width: pct(n.previsto) }} />
        <span className="regua__falta" style={{ left: pct(n.obtido + n.previsto), width: pct(falta) }} />
        <span className="regua__marca" style={{ left: pct(NOTA_MINIMA) }} />
      </div>
      <div className="regua__escala">
        <span style={{ left: 0 }}>0</span>
        <span style={{ left: pct(NOTA_MINIMA) }}>{NOTA_MINIMA}</span>
        <span style={{ left: '100%' }}>{formatarNota(n.total)}</span>
      </div>
      <div className="regua__legenda">
        <span>
          <i className="regua__amostra regua__amostra--obtido" />
          Tem {formatarNota(n.obtido)}
        </span>
        {n.previsto > 0 && (
          <span>
            <i className="regua__amostra regua__amostra--previsto" />
            Metas fixas {formatarNota(n.previsto)}
          </span>
        )}
        {falta > 0 && (
          <span>
            <i className="regua__amostra regua__amostra--falta" />
            Falta {formatarNota(falta)}
          </span>
        )}
      </div>
    </div>
  )
}

function LinhaAvaliacao({ e, n, editar }: { e: Evento; n: NotasDaMateria; editar: () => void }) {
  const [nota, setNota] = useState<string | null>(null)
  const [meta, setMeta] = useState<string | null>(null)
  const trocada = n.trocada?.id === e.id
  const auto = n.metas.get(e.id)
  const vale = e.tipo === 'reavaliacao' && e.pontos === null ? n.trocada?.pontos ?? null : e.pontos

  async function salvarNota() {
    if (nota === null) return
    const v = lerNumero(nota)
    setNota(null)
    if (v === undefined || v === e.nota) return
    await window.api.salvarEvento({ ...e, nota: v })
  }

  async function salvarMeta() {
    if (meta === null) return
    const v = lerNumero(meta)
    setMeta(null)
    if (v === undefined || v === e.meta) return
    await window.api.salvarEvento({ ...e, meta: v })
  }

  let celulaMeta
  if (meta !== null) {
    celulaMeta = (
      <input
        className="campo-meta"
        autoFocus
        inputMode="decimal"
        value={meta}
        onChange={(ev) => setMeta(ev.target.value)}
        onBlur={() => void salvarMeta()}
        onKeyDown={(ev) => {
          if (ev.key === 'Enter') void salvarMeta()
          if (ev.key === 'Escape') setMeta(null)
        }}
        placeholder="auto"
        aria-label={`Meta de ${e.titulo} (vazio: o app calcula)`}
      />
    )
  } else if (e.nota !== null) {
    celulaMeta = trocada ? <span className="mudo">trocada pela reavaliação</span> : <span className="mudo">lançada</span>
  } else if (e.meta !== null) {
    celulaMeta = (
      <>
        <button className="valor-editavel" onClick={() => setMeta(formatarNota(e.meta!))}>
          {formatarNota(e.meta)}
        </button>
        <span className="mudo">sua meta</span>
      </>
    )
  } else if (auto !== undefined) {
    celulaMeta = (
      <>
        <button className="valor-editavel valor-editavel--auto" onClick={() => setMeta('')}>
          {auto === 0 ? '0' : formatarNota(auto)}
        </button>
        <span className="mudo">{auto === 0 ? 'não precisa' : n.situacao === 'impossivel' ? 'nota máxima' : 'calculada'}</span>
      </>
    )
  } else {
    celulaMeta = (
      <>
        <button className="valor-editavel" onClick={() => setMeta('')} aria-label={`Fixar meta de ${e.titulo}`}>
          –
        </button>
        <span className="mudo">fora da conta</span>
      </>
    )
  }

  return (
    <div className={`boletim__linha ${trocada ? 'boletim__linha--trocada' : ''}`} role="row">
      <span role="cell">
        <button className="boletim__titulo" onClick={editar}>
          {e.titulo}
        </button>
      </span>
      <span role="cell" className={e.data ? '' : 'mudo'}>
        {e.data ? diaMes(e.data) : 'a definir'}
      </span>
      <span role="cell">{vale !== null ? formatarNota(vale) : '–'}</span>
      <span role="cell">
        <input
          className="campo-meta campo-nota"
          inputMode="decimal"
          value={nota ?? (e.nota !== null ? formatarNota(e.nota) : '')}
          onFocus={() => setNota(e.nota !== null ? formatarNota(e.nota) : '')}
          onChange={(ev) => setNota(ev.target.value)}
          onBlur={() => void salvarNota()}
          onKeyDown={(ev) => {
            if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur()
            if (ev.key === 'Escape') setNota(null)
          }}
          placeholder="–"
          aria-label={`Nota que tirou em ${e.titulo}`}
        />
      </span>
      <span role="cell" className="boletim__meta">
        {celulaMeta}
      </span>
    </div>
  )
}
