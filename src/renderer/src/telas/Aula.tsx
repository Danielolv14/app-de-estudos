// Aula: a IA faz o papel de professor da sessão. A partir do tema e do material que o professor da disciplina pôs
// no Canvas, ela monta o resumo da matéria (a ideia, as fórmulas, exemplos resolvidos e armadilhas) e uma lista de
// exercícios com dica e gabarito escondidos. Depois o Daniel manda as respostas (texto ou foto) e ela corrige.
import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react'
import type { ArquivoCanvas, Aula as TAula, Estado, ExercicioAula, MensagemAula, SituacaoExercicio, Tarefa } from '@shared/tipos'
import { sugerirPdfs } from '@shared/canvas'
import { dataLocal, diaMes, nomeDiaSemana, somarDias } from '@shared/regras'
import { siglaDe } from '@shared/sigla'
import { estiloMateria, Led, nomeDe } from '../componentes/Basicos'
import { IconeDica, IconeEnviar, IconeFechar, IconeFoto, IconeMais, IconeSeta } from '../componentes/Icones'
import { PdfsDoCanvas, type PdfEscolhido } from '../componentes/Canvas'
import { TextoLinha, TextoRico } from '../componentes/TextoRico'
import { useAgora } from '../usarEstado'

/** Pedido vindo do Foco: abrir a aula da tarefa (ou preparar uma). `vez` muda a cada clique. */
export type AlvoAula = { tarefaId: number | null; vez: number }

// Lembrados entre uma visita e outra à tela (o Daniel vai e volta do Foco durante a sessão).
let vezAtendida = 0
let abertaAntes: number | null = null

const MAX_MATERIAIS = 6
const nomeDoArquivo = (caminho: string) => caminho.split(/[\\/]/).pop() ?? caminho
const diaCurto = (momento: number) => {
  const d = dataLocal(momento)
  return `${nomeDiaSemana(d, true)} ${diaMes(d)}`
}

export function Aula({ estado, alvo }: { estado: Estado; alvo: AlvoAula | null }) {
  const [abertaId, setAbertaIdBruto] = useState<number | null>(() => {
    if (alvo && alvo.vez !== vezAtendida) return null
    const daSessao = estado.ativa?.tarefaId ? estado.aulas.find((a) => a.tarefaId === estado.ativa!.tarefaId) : undefined
    return abertaAntes !== null && estado.aulas.some((a) => a.id === abertaAntes) ? abertaAntes : (daSessao?.id ?? null)
  })
  const [nova, setNova] = useState<{ tarefaId: number | null } | null>(null)
  const [esperando, setEsperando] = useState(false)
  const setAbertaId = (id: number | null) => {
    abertaAntes = id
    setAbertaIdBruto(id)
  }

  // Vindo do Foco: abre a aula da tarefa, ou o formulário para preparar uma.
  useEffect(() => {
    if (!alvo || alvo.vez === vezAtendida) return
    vezAtendida = alvo.vez
    const existente = alvo.tarefaId !== null ? estado.aulas.find((a) => a.tarefaId === alvo.tarefaId) : undefined
    if (existente) {
      setAbertaId(existente.id)
      setNova(null)
    } else {
      setAbertaId(null)
      setNova({ tarefaId: alvo.tarefaId })
    }
  }, [alvo?.vez])

  // Quando a IA termina de preparar, abre a aula nova.
  const quantas = useRef(estado.aulas.length)
  useEffect(() => {
    if (esperando && estado.aulas.length > quantas.current) {
      setAbertaId(estado.aulas[0].id)
      setEsperando(false)
      setNova(null)
    }
    quantas.current = estado.aulas.length
  }, [estado.aulas.length, esperando])

  const aberta = estado.aulas.find((a) => a.id === abertaId)
  if (aberta) return <AulaAberta key={aberta.id} estado={estado} id={aberta.id} voltar={() => setAbertaId(null)} />

  const montando = estado.ia.trabalho?.tipo === 'montar-aula'
  const tarefaPadrao = estado.ativa?.tarefaId ?? estado.tarefas.find((t) => t.data === estado.hoje && !t.feita)?.id ?? null
  return (
    <div className="aulas">
      <div className="titulo-tela">
        <div>
          <h1>Aula</h1>
          <p>
            A IA faz o papel de professor: resume a matéria com o material do Canvas, explica com exemplos e passa exercícios. Você resolve no papel,
            manda a resposta (escrita ou em foto) e ela corrige.
          </p>
        </div>
        {!nova && !montando && (
          <button className="tecla tecla--ambar" onClick={() => setNova({ tarefaId: tarefaPadrao })} disabled={!estado.ia.claude}>
            <IconeMais />
            Nova aula
          </button>
        )}
      </div>

      {!estado.ia.claude && (
        <div className="estado-bloqueio">
          <Led aceso={false} cor="vermelho" />
          <div>
            <strong>A aula precisa do Claude Code</strong>
            <span>Não achei o Claude Code neste PC. Veja em Ajustes, na parte da IA.</span>
          </div>
        </div>
      )}

      {(nova || montando) && (
        <NovaAula
          key={nova?.tarefaId ?? 'livre'}
          estado={estado}
          tarefaInicial={nova?.tarefaId ?? tarefaPadrao}
          cancelar={() => setNova(null)}
          aoMontar={() => setEsperando(true)}
        />
      )}

      {estado.aulas.length > 0 ? (
        <div className="painel">
          <h2>Aulas</h2>
          <ul className="lista-simulados">
            {estado.aulas.map((a) => {
              const materia = estado.materias.find((m) => m.id === a.materiaId)
              return (
                <li key={a.id} style={estiloMateria(estado.materias, a.materiaId)}>
                  <button onClick={() => setAbertaId(a.id)}>
                    <span className="ponto" />
                    <span className="lista-simulados__titulo">
                      {materia && <span className="sigla">{siglaDe(materia)}</span>}
                      {a.titulo}
                    </span>
                    <span className="lista-simulados__extra">{diaCurto(a.criadaEm)}</span>
                    <span className="lista-simulados__etapa">
                      {a.exercicios === 0 ? 'sem exercícios' : a.feitos === 0 ? `${a.exercicios} exercícios` : `${a.certos} de ${a.exercicios} certos`}
                    </span>
                    <IconeSeta tamanho={15} />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : (
        !nova &&
        !montando && (
          <div className="vazio">
            <strong>Nenhuma aula ainda.</strong>
            No Foco, escolha a tarefa e clique em Preparar a aula, ou use o botão Nova aula. Leva de 2 a 5 minutos para a IA montar.
          </div>
        )
      )}
    </div>
  )
}

// ---------- Nova aula ----------

/** Tarefas que dá para escolher: as atrasadas, as de hoje e as dos próximos 7 dias. */
function tarefasParaAula(estado: Estado, inicial: number | null): Tarefa[] {
  const limite = somarDias(estado.hoje, 7)
  return estado.tarefas.filter((t) => t.id === inicial || (!t.feita && t.data <= limite))
}

const temaDe = (t: Tarefa | undefined) => (t ? `${t.titulo}${t.detalhe ? `\n${t.detalhe}` : ''}` : '')

function NovaAula({
  estado,
  tarefaInicial,
  cancelar,
  aoMontar
}: {
  estado: Estado
  tarefaInicial: number | null
  cancelar: () => void
  aoMontar: () => void
}) {
  const ativas = estado.materias.filter((m) => !m.arquivada)
  const tarefas = tarefasParaAula(estado, tarefaInicial)
  const inicial = tarefas.find((t) => t.id === tarefaInicial)
  const [tarefaId, setTarefaId] = useState<number | null>(inicial?.id ?? null)
  const [materiaId, setMateriaId] = useState<number | null>(inicial?.materiaId ?? ativas[0]?.id ?? null)
  const [tema, setTema] = useState(temaDe(inicial))
  const [pedido, setPedido] = useState('')
  const [extras, setExtras] = useState<PdfEscolhido[]>([])
  const [listaCompleta, setListaCompleta] = useState(false)
  const [erro, setErro] = useState('')
  const canvas = useMaterialDoCanvas(estado, materiaId, tema)
  const trabalho = estado.ia.trabalho

  function escolherTarefa(id: number | null) {
    setTarefaId(id)
    const t = tarefas.find((x) => x.id === id)
    if (t) {
      setMateriaId(t.materiaId)
      setTema(temaDe(t))
    }
  }

  const total = canvas.marcados.length + extras.length
  async function montar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    const r = await window.api.montarAula({
      tarefaId,
      materiaId,
      tema,
      arquivosCanvas: canvas.marcados,
      arquivosPc: extras.map((x) => x.caminho),
      pedido
    })
    if (r.ok) aoMontar()
    else setErro(r.mensagem)
  }

  if (trabalho?.tipo === 'montar-aula')
    return (
      <div className="painel ia-trabalhando">
        <Led aceso cor="ambar" />
        <div>
          <strong>{trabalho.descricao}</strong>
          <span>
            A IA está lendo o material do professor, escrevendo a explicação e resolvendo os exercícios. Leva de 2 a 5 minutos. Pode começar o timer
            e sair desta tela: quando ficar pronta, aparece um aviso.
          </span>
        </div>
        <button className="tecla tecla--pequena" onClick={() => void window.api.cancelarIa()}>
          Cancelar
        </button>
      </div>
    )

  return (
    <div className="painel" style={{ marginBottom: 14 }}>
      <h2>Nova aula</h2>
      <form className="form" onSubmit={(e) => void montar(e)}>
        <div className="form__linha">
          <label>
            Tarefa do plano
            <select className="seletor" value={tarefaId ?? ''} onChange={(e) => escolherTarefa(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Nenhuma, tema livre</option>
              {tarefas.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.data === estado.hoje ? 'Hoje' : `${nomeDiaSemana(t.data, true)} ${diaMes(t.data)}`}: {t.titulo}
                </option>
              ))}
            </select>
          </label>
          <label>
            Matéria
            <select className="seletor" value={materiaId ?? ''} onChange={(e) => setMateriaId(e.target.value ? Number(e.target.value) : null)}>
              {ativas.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
              <option value="">Sem matéria</option>
            </select>
          </label>
        </div>
        <label>
          Tema da aula
          <textarea
            className="campo-area"
            rows={3}
            value={tema}
            onChange={(e) => setTema(e.target.value)}
            placeholder="Ex.: Lei de Amdahl e desempenho da CPU (unidade 2)"
          />
        </label>

        <div className="material-aula">
          <span className="material-aula__rotulo">Material do professor</span>
          <MaterialDoCanvas estado={estado} materiaId={materiaId} canvas={canvas} vagas={MAX_MATERIAIS - extras.length} />
          {extras.length > 0 && (
            <div className="linha-campo" style={{ margin: 0 }}>
              {extras.map((m) => (
                <span key={m.caminho} className="ficha-arquivo">
                  <span>{m.nome}</span>
                  <button type="button" className="botao-texto" onClick={() => setExtras(extras.filter((x) => x.caminho !== m.caminho))} aria-label={`Tirar ${m.nome}`}>
                    <IconeFechar />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="linha-campo" style={{ margin: 0 }}>
            {estado.canvas.conectado && !listaCompleta && (
              <button type="button" className="tecla tecla--pequena" disabled={total >= MAX_MATERIAIS} onClick={() => setListaCompleta(true)}>
                Escolher outros PDFs do curso
              </button>
            )}
            <button
              type="button"
              className="tecla tecla--pequena"
              disabled={total >= MAX_MATERIAIS}
              onClick={() =>
                void window.api.escolherMaterialAula().then((caminhos) => {
                  const novos = caminhos.filter((c) => !extras.some((x) => x.caminho === c)).map((c) => ({ caminho: c, nome: nomeDoArquivo(c), cursoId: 0 }))
                  setExtras([...extras, ...novos].slice(0, MAX_MATERIAIS - canvas.marcados.length))
                })
              }
            >
              PDF ou foto do PC
            </button>
            <span className="mudo">
              {total} de {MAX_MATERIAIS} arquivos
            </span>
          </div>
          {listaCompleta && (
            <PdfsDoCanvas
              estado={estado}
              materiaId={materiaId}
              max={MAX_MATERIAIS}
              jaEscolhidos={total}
              aoFechar={() => setListaCompleta(false)}
              aoEscolher={(novos) => {
                setExtras([...extras, ...novos.filter((n) => !extras.some((x) => x.caminho === n.caminho))].slice(0, MAX_MATERIAIS - canvas.marcados.length))
                setListaCompleta(false)
              }}
            />
          )}
        </div>

        <label>
          Algum pedido (opcional)
          <input
            className="campo"
            value={pedido}
            onChange={(e) => setPedido(e.target.value)}
            placeholder="Ex.: explique mais devagar a parte de cache; quero mais exercícios de conta"
          />
        </label>
        <p className="form__dica">
          A IA explica o tema na ordem de estudo, com as fórmulas para decorar, exemplos resolvidos e as armadilhas de prova, e passa de 5 a 10
          exercícios (primeiro os dos slides do professor). A dica fica escondida até você pedir, e o gabarito abre depois que você tenta.
        </p>
        {erro && <p className="erro-ia">{erro}</p>}
        <div className="form__botoes">
          <button type="button" className="tecla tecla--pequena" onClick={cancelar}>
            Cancelar
          </button>
          <button type="submit" className="tecla tecla--pequena tecla--ambar" disabled={!!trabalho || !estado.ia.claude || !tema.trim()}>
            Preparar a aula
          </button>
        </div>
      </form>
    </div>
  )
}

type MaterialCanvas = {
  situacao: 'desligado' | 'sem-curso' | 'buscando' | 'erro' | 'pronto'
  erro: string
  lista: ArquivoCanvas[]
  sugeridos: ArquivoCanvas[]
  marcados: number[]
  marcar: (id: number, sim: boolean) => void
}

/**
 * PDFs do Canvas da matéria e os que combinam com o tema (já marcados). Procura de novo quando muda a matéria
 * e, com uma pausa, quando o tema muda.
 */
function useMaterialDoCanvas(estado: Estado, materiaId: number | null, tema: string): MaterialCanvas {
  const cursos = estado.canvas.cursos.filter((c) => c.materiaId !== null && c.materiaId !== 0 && c.materiaId === materiaId).map((c) => c.id)
  const chave = cursos.join(',')
  const [lista, setLista] = useState<ArquivoCanvas[] | null>(null)
  const [erro, setErro] = useState('')
  const [sugeridos, setSugeridos] = useState<ArquivoCanvas[]>([])
  const [marcados, setMarcados] = useState<number[]>([])

  useEffect(() => {
    if (!estado.canvas.conectado || cursos.length === 0) return
    let vivo = true
    setLista(null)
    setErro('')
    void Promise.all(cursos.map((id) => window.api.arquivosCanvas(id))).then((rs) => {
      if (!vivo) return
      const falha = rs.find((r) => !r.ok)
      if (falha && !falha.ok && rs.every((r) => !r.ok)) setErro(falha.mensagem)
      setLista(rs.flatMap((r) => (r.ok ? r.arquivos : [])))
    })
    return () => {
      vivo = false
    }
  }, [chave, estado.canvas.conectado])

  useEffect(() => {
    if (!lista) return
    const t = setTimeout(() => {
      const s = sugerirPdfs(lista, tema, 4)
      setSugeridos(s)
      setMarcados(s.map((a) => a.id))
    }, 500)
    return () => clearTimeout(t)
  }, [lista, tema])

  return {
    situacao: !estado.canvas.conectado ? 'desligado' : cursos.length === 0 ? 'sem-curso' : erro ? 'erro' : lista === null ? 'buscando' : 'pronto',
    erro,
    lista: lista ?? [],
    sugeridos,
    marcados,
    marcar: (id, sim) => setMarcados(sim ? [...marcados, id] : marcados.filter((x) => x !== id))
  }
}

const tamanho = (bytes: number) => (bytes <= 0 ? '' : bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`)

function MaterialDoCanvas({ estado, materiaId, canvas, vagas }: { estado: Estado; materiaId: number | null; canvas: MaterialCanvas; vagas: number }) {
  if (canvas.situacao === 'desligado')
    return <p className="mudo">Conecte o Canvas em Ajustes para a IA usar os slides e as listas do professor. Sem material, ela explica pelo conteúdo padrão da matéria.</p>
  if (canvas.situacao === 'sem-curso')
    return (
      <p className="mudo">
        {materiaId === null ? 'Escolha a matéria para buscar o material.' : `Nenhum curso do Canvas está ligado a ${nomeDe(estado.materias, materiaId)}. Ligue em Ajustes, na parte do Canvas.`}
      </p>
    )
  if (canvas.situacao === 'erro') return <p className="erro-ia">{canvas.erro}</p>
  if (canvas.situacao === 'buscando') return <p className="mudo">Procurando no Canvas os PDFs que combinam com o tema...</p>
  if (canvas.sugeridos.length === 0)
    return (
      <p className="mudo">
        {canvas.lista.length === 0
          ? 'Este curso não tem PDFs que você possa ver no Canvas.'
          : `Nenhum dos ${canvas.lista.length} PDFs do curso tem o nome parecido com o tema. Escolha na lista do curso ou deixe sem.`}
      </p>
    )
  return (
    <ul className="pdfs-canvas__lista material-aula__lista">
      {canvas.sugeridos.map((a) => {
        const marcado = canvas.marcados.includes(a.id)
        return (
          <li key={a.id}>
            <label>
              <input
                type="checkbox"
                className="marcar"
                checked={marcado}
                disabled={!marcado && canvas.marcados.length >= vagas}
                onChange={(e) => canvas.marcar(a.id, e.target.checked)}
              />
              <span className="quebra">{a.nome}</span>
              <span className="mudo">{[a.modulo, tamanho(a.tamanho)].filter(Boolean).join(', ')}</span>
            </label>
          </li>
        )
      })}
    </ul>
  )
}

// ---------- Uma aula ----------

const CLASSE_SITUACAO: Record<SituacaoExercicio, string> = { acertei: 'certa', parcial: 'parcial', errei: 'errada' }
const NOME_SITUACAO: Record<SituacaoExercicio, string> = { acertei: 'Acertei', parcial: 'Em parte', errei: 'Errei' }
const NOME_NIVEL = { facil: 'fácil', medio: 'médio', dificil: 'difícil' }

function AulaAberta({ estado, id, voltar }: { estado: Estado; id: number; voltar: () => void }) {
  const resumo = estado.aulas.find((a) => a.id === id)
  const [aula, setAula] = useState<TAula | null>(null)
  const [responder, setResponder] = useState<{ numero: number; vez: number } | null>(null)
  const [apagar, setApagar] = useState(false)

  useEffect(() => {
    let vivo = true
    void window.api.aula(id).then((a) => vivo && setAula(a))
    return () => {
      vivo = false
    }
  }, [id, resumo?.atualizadaEm])

  useEffect(() => {
    if (!apagar) return
    const t = setTimeout(() => setApagar(false), 4000)
    return () => clearTimeout(t)
  }, [apagar])

  if (!aula) return null
  const c = aula.conteudo
  const materia = estado.materias.find((m) => m.id === aula.materiaId)
  const trabalho = estado.ia.trabalho
  const criandoExercicios = trabalho?.tipo === 'mais-exercicios' && trabalho.aulaId === aula.id
  const feitos = Object.keys(aula.progresso).length
  const certos = Object.values(aula.progresso).filter((s) => s === 'acertei').length

  return (
    <div className="aulas aula" style={estiloMateria(estado.materias, aula.materiaId)}>
      <button className="botao-texto voltar" onClick={voltar}>
        <IconeSeta esquerda tamanho={15} />
        Aulas
      </button>
      <div className="titulo-tela">
        <div>
          <h1>{c.titulo}</h1>
          <p>
            <span className="ponto" /> {materia?.nome ?? 'Estudo livre'}, {diaCurto(aula.criadaEm)}. {aula.tema.split('\n')[0]}
          </p>
        </div>
        <div className="titulo-tela__botoes">
          <button
            className="tecla tecla--pequena"
            onClick={() => {
              if (apagar) void window.api.removerAula(aula.id).then(voltar)
              else setApagar(true)
            }}
            disabled={trabalho?.aulaId === aula.id}
          >
            {apagar ? 'Apagar mesmo?' : 'Apagar'}
          </button>
          <button className="tecla tecla--pequena" onClick={() => void window.api.salvarAulaNoVault(aula.id)} title="Grava a aula como nota do Obsidian, com o gabarito no fim">
            Salvar no Obsidian
          </button>
        </div>
      </div>

      <div className="painel aula-intro">
        {c.objetivo && (
          <p className="aula-intro__objetivo">
            <TextoLinha texto={c.objetivo} />
          </p>
        )}
        {c.roteiro.length > 0 && (
          <>
            <strong className="aula-rotulo">Ordem de estudo</strong>
            <ol className="roteiro">
              {c.roteiro.map((r, i) => (
                <li key={i}>
                  <TextoLinha texto={r} />
                </li>
              ))}
            </ol>
          </>
        )}
        <p className="mudo aula-intro__fontes">
          {c.fontes.length > 0
            ? `Feita a partir de ${c.fontes.join(', ')}.`
            : aula.materiais.length > 0
              ? `Material enviado: ${aula.materiais.join(', ')}.`
              : 'Feita sem material do professor, pelo conteúdo padrão da matéria.'}
          {c.avisos ? ` ${c.avisos}` : ''}
        </p>
      </div>

      {c.secoes.map((s, i) => (
        <section key={i} className="painel aula-parte">
          <h2>
            <span className="aula-parte__numero">Parte {i + 1}</span> {s.titulo}
          </h2>
          <Texto texto={s.texto} />
          {s.formulas.length > 0 && (
            <div className="formulas">
              <strong className="aula-rotulo">Para decorar</strong>
              {s.formulas.map((f, j) => (
                <code key={j}>
                  <TextoLinha texto={f} />
                </code>
              ))}
            </div>
          )}
          {s.exemplo && <Exemplo enunciado={s.exemplo.enunciado} resolucao={s.exemplo.resolucao} />}
        </section>
      ))}

      {c.armadilhas.length > 0 && (
        <div className="painel">
          <h2>Armadilhas de prova</h2>
          <ul className="armadilhas">
            {c.armadilhas.map((a, i) => (
              <li key={i}>
                <TextoLinha texto={a} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="aula-exercicios__topo">
        <h2>
          Exercícios{' '}
          <span className="titulo-apagado">
            {c.exercicios.length === 0 ? '' : feitos === 0 ? `${c.exercicios.length}, faça no papel` : `${feitos} de ${c.exercicios.length} feitos, ${certos} certos`}
          </span>
        </h2>
        <button className="tecla tecla--pequena" disabled={!!trabalho || !estado.ia.claude} onClick={() => void window.api.maisExercicios(aula.id, '')}>
          <IconeMais tamanho={15} />
          Mais exercícios
        </button>
      </div>
      {c.exercicios.length > 0 && (
        <ol className="questoes">
          {c.exercicios.map((e) => (
            <Exercicio
              key={e.numero}
              aulaId={aula.id}
              e={e}
              situacao={aula.progresso[String(e.numero)] ?? null}
              responder={() => setResponder({ numero: e.numero, vez: Date.now() })}
            />
          ))}
        </ol>
      )}
      {criandoExercicios && (
        <div className="ia-trabalhando ia-trabalhando--solto" style={{ margin: '0 0 16px' }}>
          <Led aceso cor="ambar" />
          <div>
            <strong>{trabalho!.descricao}</strong>
            <span>Focando no que você errou. Leva de 1 a 3 minutos.</span>
          </div>
        </div>
      )}

      <Professor estado={estado} aula={aula} responder={responder} />
    </div>
  )
}

/** Texto da IA: parágrafos separados por linha em branco, e as quebras simples mantidas. */
function Texto({ texto }: { texto: string }) {
  return <TextoRico texto={texto} className="aula-texto" />
}

function Exemplo({ enunciado, resolucao }: { enunciado: string; resolucao: string }) {
  const [ver, setVer] = useState(false)
  return (
    <div className="exemplo">
      <strong className="aula-rotulo">Exemplo</strong>
      <p className="exemplo__enunciado">
        <TextoLinha texto={enunciado} />
      </p>
      {resolucao &&
        (ver ? (
          <div className="questao__resolucao">
            <TextoRico texto={resolucao} />
          </div>
        ) : (
          <button className="botao-texto" onClick={() => setVer(true)}>
            Ver a resolução (tente antes)
          </button>
        ))}
    </div>
  )
}

function Exercicio({ aulaId, e, situacao, responder }: { aulaId: number; e: ExercicioAula; situacao: SituacaoExercicio | null; responder: () => void }) {
  const [verDica, setVerDica] = useState(false)
  const [verResolucao, setVerResolucao] = useState(false)
  // O gabarito abre direto depois de uma tentativa (o professor corrigiu ou ele marcou como foi).
  // Antes disso, o primeiro clique só pergunta: ver a conta pronta tira a chance de descobrir sozinho.
  const [confirmar, setConfirmar] = useState(false)
  function gabarito() {
    if (verResolucao) setVerResolucao(false)
    else if (situacao || confirmar) {
      setVerResolucao(true)
      setConfirmar(false)
    } else setConfirmar(true)
  }
  return (
    <li className={`questao exercicio ${situacao ? `questao--${CLASSE_SITUACAO[situacao]}` : ''}`}>
      <div className="questao__topo">
        <strong>Exercício {e.numero}</strong>
        <span className="mudo">{e.origem}</span>
        <span className={`nivel nivel--${e.nivel}`}>{NOME_NIVEL[e.nivel]}</span>
      </div>
      <p className="questao__enunciado">
        <TextoLinha texto={e.enunciado} />
      </p>
      {verDica && e.dica && (
        <div className="exercicio__dica">
          <IconeDica />
          <p>
            <TextoLinha texto={e.dica} />
          </p>
        </div>
      )}
      {confirmar && (
        <p className="exercicio__aviso">
          Tente no papel antes. Se mandar a resposta (ou marcar como foi), o gabarito abre direto. Travou? Peça a dica.
        </p>
      )}
      {verResolucao && (
        <div className="questao__resolucao">
          <strong>Resolução</strong>
          <TextoRico texto={e.resolucao} />
          {e.resposta && (
            <p className="questao__resposta">
              <strong>Resposta:</strong> <TextoLinha texto={e.resposta} />
            </p>
          )}
        </div>
      )}
      <div className="exercicio__acoes">
        {e.dica && (
          <button className="botao-texto" onClick={() => setVerDica(!verDica)}>
            {verDica ? 'Esconder a dica' : 'Dica'}
          </button>
        )}
        <button
          className={`botao-texto ${confirmar ? 'exercicio__confirmar' : ''}`}
          onClick={gabarito}
          title={situacao ? undefined : 'Mande a resposta ou marque como foi, e o gabarito abre direto'}
        >
          {verResolucao ? 'Esconder o gabarito' : confirmar ? 'Já tentei no papel, mostrar' : 'Gabarito'}
        </button>
        <div className="segmentado" role="group" aria-label={`Como foi o exercício ${e.numero}`}>
          {(['acertei', 'parcial', 'errei'] as const).map((s) => (
            <button
              key={s}
              className={`segmentado__opcao ${situacao === s ? `segmentado__opcao--${s}` : ''}`}
              aria-pressed={situacao === s}
              onClick={() => void window.api.marcarExercicio(aulaId, e.numero, situacao === s ? null : s)}
            >
              {NOME_SITUACAO[s]}
            </button>
          ))}
        </div>
        <button className="tecla tecla--pequena" onClick={responder}>
          Mandar a resposta
        </button>
      </div>
    </li>
  )
}

// ---------- Professor (dúvidas e correção) ----------

function Professor({ estado, aula, responder }: { estado: Estado; aula: TAula; responder: { numero: number; vez: number } | null }) {
  const agora = useAgora(estado)
  const [texto, setTexto] = useState('')
  const [fotos, setFotos] = useState<string[]>([])
  const [exercicio, setExercicio] = useState<number | null>(null)
  const [enviando, setEnviando] = useState<{ texto: string; fotos: string[]; exercicio: number | null } | null>(null)
  const [erro, setErro] = useState('')
  const [arrastando, setArrastando] = useState(false)
  const painel = useRef<HTMLDivElement>(null)
  const compositor = useRef<HTMLFormElement>(null)
  const campo = useRef<HTMLTextAreaElement>(null)
  const trabalho = estado.ia.trabalho
  const respondendo = trabalho?.tipo === 'professor' && trabalho.aulaId === aula.id

  // O campo de escrever está na tela? Se não estiver, aparece o atalho no canto.
  const [aVista, setAVista] = useState(true)
  const aVistaRef = useRef(true)
  useEffect(() => {
    const el = compositor.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => {
      aVistaRef.current = e.isIntersecting
      setAVista(e.isIntersecting)
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  // Resposta que chegou enquanto ele estava lendo a aula lá em cima.
  const [lidas, setLidas] = useState(aula.conversa.length)
  useEffect(() => {
    if (aVista) setLidas(aula.conversa.length)
  }, [aVista, aula.conversa.length])
  const novidade = aula.conversa.length > lidas

  const ultimaMensagem = () => painel.current?.querySelector('.conversa > li:last-child')
  function irParaEscrever() {
    compositor.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setTimeout(() => campo.current?.focus({ preventScroll: true }), 400)
  }
  function irAoProfessor() {
    if (novidade) ultimaMensagem()?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    else irParaEscrever()
  }

  // "Mandar a resposta" num exercício: desce até aqui, já com o exercício escolhido.
  useEffect(() => {
    if (!responder) return
    setExercicio(responder.numero)
    irParaEscrever()
  }, [responder?.vez])

  // Mensagem nova (não ao abrir a aula): mostra o começo dela, mas só se ele estiver aqui embaixo.
  // Lendo a aula lá em cima, ele não é puxado: o atalho do canto avisa que chegou resposta.
  const tamanhoAntes = useRef({ conversa: aula.conversa.length, respondendo })
  useEffect(() => {
    const antes = tamanhoAntes.current
    tamanhoAntes.current = { conversa: aula.conversa.length, respondendo }
    if (aVistaRef.current && (aula.conversa.length > antes.conversa || (respondendo && !antes.respondendo)))
      ultimaMensagem()?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [aula.conversa.length, respondendo])

  async function mandar(e?: FormEvent) {
    e?.preventDefault()
    if (respondendo || (!texto.trim() && fotos.length === 0)) return
    setErro('')
    const pedido = { texto, fotos, exercicio }
    setEnviando(pedido)
    const r = await window.api.perguntarAula({ aulaId: aula.id, ...pedido })
    setEnviando(null)
    if (r.ok) {
      setTexto('')
      setFotos([])
      setExercicio(null)
    } else if (r.mensagem !== 'Cancelado.') setErro(r.mensagem)
  }

  function soltar(e: DragEvent) {
    e.preventDefault()
    setArrastando(false)
    const caminhos = [...e.dataTransfer.files].map((f) => window.api.caminhoDe(f)).filter(Boolean)
    setFotos([...fotos, ...caminhos.filter((c) => !fotos.includes(c))].slice(0, 6))
  }

  const segundos = respondendo && trabalho ? Math.max(0, Math.floor((agora - trabalho.desde) / 1000)) : 0
  return (
    <div className="painel professor" ref={painel}>
      <h2>
        Professor <span className="titulo-apagado">tire dúvidas e mande as suas respostas</span>
      </h2>
      {aula.conversa.length === 0 && !enviando && !respondendo && (
        <p className="mudo professor__dica">
          Pergunte o que não entendeu, peça outro exemplo ou mande a resolução de um exercício, escrita ou em foto. O professor corrige, mostra onde
          errou e marca o exercício.
        </p>
      )}
      {(aula.conversa.length > 0 || enviando || respondendo) && (
        <ul className="conversa">
          {aula.conversa.map((m, i) => (
            <Mensagem key={i} aulaId={aula.id} m={m} />
          ))}
          {enviando && <Mensagem aulaId={aula.id} m={{ de: 'aluno', texto: enviando.texto, quando: 0, fotos: [], exercicio: enviando.exercicio }} fotosLocais={enviando.fotos.length} />}
          {respondendo && (
            <li className="msg msg--professor msg--pensando">
              <span className="msg__quem">Professor</span>
              <p>
                <Led aceso cor="ambar" /> Lendo e corrigindo... {Math.floor(segundos / 60)}:{String(segundos % 60).padStart(2, '0')}
              </p>
            </li>
          )}
        </ul>
      )}
      {!aVista && (
        <button className={`ir-professor ${novidade ? 'ir-professor--novo' : ''}`} onClick={irAoProfessor}>
          {respondendo ? (
            <>
              <Led aceso cor="ambar" /> O professor está respondendo
            </>
          ) : novidade ? (
            <>
              <IconeSeta tamanho={15} /> Resposta nova do professor
            </>
          ) : (
            <>
              <IconeEnviar tamanho={15} /> Perguntar ao professor
            </>
          )}
        </button>
      )}
      <form
        ref={compositor}
        className={`compositor ${arrastando ? 'compositor--arrastando' : ''}`}
        onSubmit={(e) => void mandar(e)}
        onDragOver={(e) => {
          e.preventDefault()
          setArrastando(true)
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={soltar}
      >
        <textarea
          ref={campo}
          className="campo-area"
          rows={3}
          value={texto}
          disabled={respondendo}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.ctrlKey) void mandar()
          }}
          placeholder={
            exercicio !== null
              ? `Sua resolução do exercício ${exercicio} (ou só a foto). Ctrl+Enter manda.`
              : 'Ex.: não entendi por que o Fm é 0,4. Me dá outro exemplo? (Ctrl+Enter manda)'
          }
        />
        <div className="compositor__linha">
          <select
            className="seletor seletor--mini"
            value={exercicio ?? ''}
            onChange={(e) => setExercicio(e.target.value ? Number(e.target.value) : null)}
            aria-label="Sobre o quê"
            disabled={respondendo}
          >
            <option value="">Dúvida</option>
            {aula.conteudo.exercicios.map((x) => (
              <option key={x.numero} value={x.numero}>
                Resposta do exercício {x.numero}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="tecla tecla--pequena"
            disabled={respondendo}
            onClick={() => void window.api.escolherFotosAula().then((novas) => setFotos([...fotos, ...novas.filter((n) => !fotos.includes(n))].slice(0, 6)))}
          >
            <IconeFoto />
            Foto
          </button>
          {fotos.map((f) => (
            <span key={f} className="ficha-arquivo">
              <span>{nomeDoArquivo(f)}</span>
              <button type="button" className="botao-texto" onClick={() => setFotos(fotos.filter((x) => x !== f))} aria-label={`Tirar ${nomeDoArquivo(f)}`}>
                <IconeFechar />
              </button>
            </span>
          ))}
          <span className="compositor__espaco" />
          {respondendo ? (
            <button type="button" className="tecla tecla--pequena" onClick={() => void window.api.cancelarIa()}>
              Cancelar
            </button>
          ) : (
            <button type="submit" className="tecla tecla--pequena tecla--ambar" disabled={!!trabalho || !estado.ia.claude || (!texto.trim() && fotos.length === 0)}>
              <IconeEnviar />
              Mandar
            </button>
          )}
        </div>
      </form>
      {erro && <p className="erro-ia">{erro}</p>}
    </div>
  )
}

function Mensagem({ aulaId, m, fotosLocais = 0 }: { aulaId: number; m: MensagemAula; fotosLocais?: number }) {
  const fotos = m.fotos.length + fotosLocais
  return (
    <li className={`msg msg--${m.de}`}>
      <span className="msg__quem">
        {m.de === 'aluno' ? 'Você' : 'Professor'}
        {m.exercicio !== null ? ` · exercício ${m.exercicio}` : ''}
      </span>
      {m.texto && <TextoRico texto={m.texto} className="msg__texto" />}
      {m.fotos.length > 0 && (
        <div className="msg__fotos">
          {m.fotos.map((f) => (
            <Miniatura key={f} aulaId={aulaId} foto={f} />
          ))}
        </div>
      )}
      {fotosLocais > 0 && <p className="mudo">{fotos === 1 ? 'Uma foto da resolução' : `${fotos} fotos da resolução`}</p>}
    </li>
  )
}

function Miniatura({ aulaId, foto }: { aulaId: number; foto: string }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    void window.api.miniaturaAula(aulaId, foto).then((u) => vivo && setSrc(u))
    return () => {
      vivo = false
    }
  }, [aulaId, foto])
  return <figure className="miniatura">{src ? <img src={src} alt={foto} /> : <span className="mudo">{foto}</span>}</figure>
}
