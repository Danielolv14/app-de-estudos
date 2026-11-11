// Simulado: a IA monta uma prova no estilo da avaliação, o Daniel resolve no papel e a IA corrige pelas fotos.
import { useEffect, useRef, useState, type DragEvent } from 'react'
import type { Estado, Evento, Simulado as TSimulado, SituacaoQuestao } from '@shared/tipos'
import { dataLocal, diaMes, formatarRelogio, nomeDiaSemana, proximoDiaDaMateria, somarDias } from '@shared/regras'
import { ehAvaliacao, formatarNota } from '@shared/notas'
import { estiloMateria, Led, nomeDe } from '../componentes/Basicos'
import { IconeFechar, IconeFoto, IconeMais, IconeSeta } from '../componentes/Icones'
import { useAgora } from '../usarEstado'
import { PdfsDoCanvas, type PdfEscolhido } from '../componentes/Canvas'

const MINUTO = 60_000

/** Em que pé está o simulado. */
function etapa(s: TSimulado): 'pronto' | 'fazendo' | 'fotos' | 'corrigido' {
  if (s.correcao) return 'corrigido'
  if (s.terminadoEm) return 'fotos'
  if (s.iniciadoEm) return 'fazendo'
  return 'pronto'
}

const NOME_ETAPA = { pronto: 'Pronto para fazer', fazendo: 'Em andamento', fotos: 'Esperando as fotos', corrigido: 'Corrigido' }

export function Simulado({ estado }: { estado: Estado }) {
  const [abertoId, setAbertoId] = useState<number | null>(null)
  const [criando, setCriando] = useState(false)
  const [abrirNovo, setAbrirNovo] = useState(false)
  const emAndamento = estado.simulados.find((s) => etapa(s) === 'fazendo')
  const aberto = estado.simulados.find((s) => s.id === (abertoId ?? emAndamento?.id))

  // Quando a IA termina de montar, abre o simulado novo.
  const quantos = useRef(estado.simulados.length)
  useEffect(() => {
    if (abrirNovo && estado.simulados.length > quantos.current) {
      setAbertoId(estado.simulados[0].id)
      setAbrirNovo(false)
      setCriando(false)
    }
    quantos.current = estado.simulados.length
  }, [estado.simulados.length, abrirNovo])

  if (aberto) return <Detalhe estado={estado} simulado={aberto} voltar={emAndamento?.id === aberto.id ? null : () => setAbertoId(null)} />

  const gerando = estado.ia.trabalho?.tipo === 'gerar-simulado'
  return (
    <div className="simulados">
      <div className="titulo-tela">
        <div>
          <h1>Simulado</h1>
          <p>A IA monta uma prova no estilo da avaliação. Você resolve no papel, com o tempo contando, e ela corrige pelas fotos.</p>
        </div>
        {!criando && (
          <button className="tecla tecla--ambar" onClick={() => setCriando(true)} disabled={!estado.ia.claude}>
            <IconeMais />
            Novo simulado
          </button>
        )}
      </div>

      {!estado.ia.claude && (
        <div className="estado-bloqueio">
          <Led aceso={false} cor="vermelho" />
          <div>
            <strong>O simulado precisa do Claude Code</strong>
            <span>Não achei o Claude Code neste PC. Veja em Ajustes, na parte da IA.</span>
          </div>
        </div>
      )}

      {(criando || gerando) && <NovoSimulado estado={estado} cancelar={() => setCriando(false)} aoGerar={() => setAbrirNovo(true)} />}

      {estado.simulados.length > 0 ? (
        <div className="painel">
          <h2>Feitos e por fazer</h2>
          <ul className="lista-simulados">
            {estado.simulados.map((s) => {
              const e = etapa(s)
              return (
                <li key={s.id} style={estiloMateria(estado.materias, s.materiaId)}>
                  <button onClick={() => setAbertoId(s.id)}>
                    <span className="ponto" />
                    <span className="lista-simulados__titulo">{s.prova.titulo}</span>
                    <span className="lista-simulados__extra">
                      {nomeDe(estado.materias, s.materiaId)}, {diaMes(dataLocal(s.criadoEm))}
                    </span>
                    <span className={`lista-simulados__etapa ${e === 'corrigido' ? 'lista-simulados__etapa--nota' : ''}`}>
                      {e === 'corrigido' ? `${formatarNota(s.correcao!.nota)} de ${formatarNota(s.correcao!.total)}` : NOME_ETAPA[e]}
                    </span>
                    <IconeSeta tamanho={15} />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : (
        !criando && (
          <div className="vazio">
            <strong>Nenhum simulado ainda.</strong>
            Comece um com o botão Novo simulado. Leva de 1 a 4 minutos para a IA montar.
          </div>
        )
      )}
    </div>
  )
}

// ---------- Novo simulado ----------

function avaliacoesDe(eventos: Evento[], materiaId: number | null, hoje: string): Evento[] {
  return eventos
    .filter((e) => e.materiaId === materiaId && ehAvaliacao(e) && e.nota === null && !e.entregue && (e.data === null || e.data >= hoje))
    .sort((a, b) => (a.data ?? '9999').localeCompare(b.data ?? '9999'))
}

function NovoSimulado({ estado, cancelar, aoGerar }: { estado: Estado; cancelar: () => void; aoGerar: () => void }) {
  const ativas = estado.materias.filter((m) => !m.arquivada)
  const [materiaId, setMateriaId] = useState<number | null>(ativas[0]?.id ?? null)
  const avaliacoes = avaliacoesDe(estado.eventos, materiaId, estado.hoje)
  const [eventoId, setEventoId] = useState<number | null>(avaliacoes[0]?.id ?? null)
  const [conteudos, setConteudos] = useState(avaliacoes[0]?.conteudo ?? '')
  const [duracao, setDuracao] = useState('100')
  const [modelo, setModelo] = useState<string | null>(null)
  const [materiais, setMateriais] = useState<PdfEscolhido[]>([])
  const [doCanvas, setDoCanvas] = useState(false)
  const [observacoes, setObservacoes] = useState('')
  const [erro, setErro] = useState('')
  const trabalho = estado.ia.trabalho

  function escolherMateria(id: number | null) {
    setMateriaId(id)
    const primeira = avaliacoesDe(estado.eventos, id, estado.hoje)[0]
    setEventoId(primeira?.id ?? null)
    setConteudos(primeira?.conteudo ?? '')
  }

  function escolherAvaliacao(id: number | null) {
    setEventoId(id)
    const e = estado.eventos.find((x) => x.id === id)
    if (e?.conteudo) setConteudos(e.conteudo)
  }

  async function gerar() {
    setErro('')
    const r = await window.api.gerarSimulado({
      materiaId,
      eventoId,
      conteudos,
      duracaoMin: Math.min(300, Math.max(10, Number(duracao) || 100)),
      modelo,
      materiais: materiais.map((m) => m.caminho),
      observacoes
    })
    if (r.ok) aoGerar()
    else setErro(r.mensagem)
  }

  if (trabalho?.tipo === 'gerar-simulado')
    return (
      <div className="painel ia-trabalhando">
        <Led aceso cor="ambar" />
        <div>
          <strong>{trabalho.descricao}</strong>
          <span>A IA está escrevendo as questões e resolvendo cada uma para a correção. Leva de 1 a 4 minutos, e você pode sair desta tela.</span>
        </div>
        <button className="tecla tecla--pequena" onClick={() => void window.api.cancelarIa()}>
          Cancelar
        </button>
      </div>
    )

  const evento = estado.eventos.find((e) => e.id === eventoId)
  return (
    <div className="painel" style={{ marginBottom: 14 }}>
      <h2>Novo simulado</h2>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          void gerar()
        }}
      >
        <div className="form__linha">
          <label>
            Matéria
            <select className="seletor" value={materiaId ?? ''} onChange={(e) => escolherMateria(e.target.value ? Number(e.target.value) : null)}>
              {ativas.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </select>
          </label>
          <label>
            No estilo de qual avaliação
            <select className="seletor" value={eventoId ?? ''} onChange={(e) => escolherAvaliacao(e.target.value ? Number(e.target.value) : null)}>
              {avaliacoes.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.titulo}
                  {e.data ? `, ${diaMes(e.data)}` : ''}
                </option>
              ))}
              <option value="">Nenhuma, só treino</option>
            </select>
          </label>
        </div>
        <label>
          Conteúdos que podem cair
          <textarea
            className="campo-area"
            rows={3}
            value={conteudos}
            onChange={(e) => setConteudos(e.target.value)}
            placeholder="Ex.: 3.9 taxas relacionadas, 4.7 otimização"
          />
        </label>
        <div className="form__linha">
          <label>
            Duração (minutos)
            <input className="campo" type="number" min={10} max={300} step={5} value={duracao} onChange={(e) => setDuracao(e.target.value)} />
          </label>
          <label>
            Algum pedido (opcional)
            <input className="campo" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Ex.: mais questões de otimização" />
          </label>
        </div>
        <div className="linha-campo" style={{ margin: 0 }}>
          <button type="button" className="tecla tecla--pequena" onClick={() => void window.api.escolherModelo().then((m) => m && setModelo(m))}>
            {modelo ? 'Trocar a prova modelo' : 'Usar uma prova antiga como modelo (opcional)'}
          </button>
          {modelo && (
            <>
              <span className="mudo">{modelo.split(/[\\/]/).pop()}</span>
              <button type="button" className="botao-texto" onClick={() => setModelo(null)} aria-label="Tirar a prova modelo">
                <IconeFechar />
              </button>
            </>
          )}
        </div>
        {estado.canvas.conectado && (
          <div className="linha-campo" style={{ margin: 0 }}>
            {!doCanvas && materiais.length < 4 && (
              <button type="button" className="tecla tecla--pequena" onClick={() => setDoCanvas(true)}>
                Material de aula do Canvas (opcional)
              </button>
            )}
            {materiais.map((m) => (
              <span key={m.caminho} className="ficha-arquivo">
                <span className="quebra">{m.nome}</span>
                <button type="button" className="botao-texto" onClick={() => setMateriais(materiais.filter((x) => x.caminho !== m.caminho))} aria-label={`Tirar ${m.nome}`}>
                  <IconeFechar />
                </button>
              </span>
            ))}
          </div>
        )}
        {doCanvas && (
          <PdfsDoCanvas
            estado={estado}
            materiaId={materiaId}
            max={4}
            jaEscolhidos={materiais.length}
            aoFechar={() => setDoCanvas(false)}
            aoEscolher={(novos) => {
              setMateriais([...materiais, ...novos.filter((n) => !materiais.some((m) => m.caminho === n.caminho))].slice(0, 4))
              setDoCanvas(false)
            }}
          />
        )}
        <p className="form__dica">
          {evento?.pontos ? `O simulado vale ${formatarNota(evento.pontos)} pontos, como a avaliação.` : 'Sem avaliação escolhida, o simulado vale 10 pontos.'} A
          prova antiga (PDF ou foto) ajuda a IA a acertar o estilo e a dificuldade, e o material de aula, a notação do professor.
        </p>
        {erro && <p className="erro-ia">{erro}</p>}
        <div className="form__botoes">
          <button type="button" className="tecla tecla--pequena" onClick={cancelar}>
            Cancelar
          </button>
          <button type="submit" className="tecla tecla--pequena tecla--ambar" disabled={!!trabalho || !estado.ia.claude}>
            Montar com a IA
          </button>
        </div>
      </form>
    </div>
  )
}

// ---------- Um simulado ----------

function Detalhe({ estado, simulado: s, voltar }: { estado: Estado; simulado: TSimulado; voltar: (() => void) | null }) {
  const agora = useAgora(estado)
  const e = etapa(s)
  const evento = estado.eventos.find((x) => x.id === s.eventoId)
  const total = s.prova.questoes.reduce((a, q) => a + q.pontos, 0)
  const [verResolucao, setVerResolucao] = useState(false)

  return (
    <div className="simulados">
      {voltar && (
        <button className="botao-texto voltar" onClick={voltar}>
          <IconeSeta esquerda tamanho={15} />
          Simulados
        </button>
      )}
      <div className="titulo-tela">
        <div>
          <h1>{s.prova.titulo}</h1>
          <p>
            {nomeDe(estado.materias, s.materiaId)}
            {evento ? `, no estilo da ${evento.titulo}` : ''}. {s.prova.questoes.length} {s.prova.questoes.length === 1 ? 'questão' : 'questões'},{' '}
            {formatarNota(total)} pontos, {s.duracaoMin} min.
          </p>
        </div>
        {e === 'pronto' && (
          <div className="titulo-tela__botoes">
            <button className="tecla tecla--pequena" onClick={() => void window.api.removerSimulado(s.id).then(() => voltar?.())}>
              Apagar
            </button>
            <button className="tecla tecla--ambar" onClick={() => void window.api.iniciarSimulado(s.id)}>
              Começar a prova
            </button>
          </div>
        )}
      </div>

      {e === 'pronto' && (
        <div className="painel">
          <h2>Antes de começar</h2>
          <p className="modal__texto">
            As questões aparecem quando você começar. O tempo conta para cima, com a marca dos {s.duracaoMin} min da prova.{' '}
            {estado.ativa ? 'A prova entra na sessão de estudo que já está aberta.' : 'Uma sessão de estudo começa junto, com o bloqueio dos sites.'}
          </p>
          {s.prova.instrucoes && <p className="mudo">{s.prova.instrucoes}</p>}
        </div>
      )}

      {e === 'fazendo' && <Cronometro s={s} agora={agora} />}

      {e !== 'pronto' && (
        <ol className="questoes">
          {s.prova.instrucoes && e === 'fazendo' && <p className="mudo questoes__instrucoes">{s.prova.instrucoes}</p>}
          {s.prova.questoes.map((q) => {
            const c = s.correcao?.questoes.find((x) => x.numero === q.numero)
            return (
              <li key={q.numero} className={`questao ${c ? `questao--${c.situacao}` : ''}`}>
                <div className="questao__topo">
                  <strong>Questão {q.numero}</strong>
                  <span className="mudo">{q.conteudo}</span>
                  <span className="questao__pontos">
                    {c ? `${formatarNota(c.nota)} de ${formatarNota(q.pontos)}` : `${formatarNota(q.pontos)} ${q.pontos === 1 ? 'ponto' : 'pontos'}`}
                  </span>
                </div>
                <p className="questao__enunciado">{q.enunciado}</p>
                {c && <CorrecaoDaQuestao situacao={c.situacao} acertos={c.acertos} erros={c.erros} />}
                {(e === 'fotos' || e === 'corrigido') && verResolucao && (
                  <div className="questao__resolucao">
                    <strong>Resolução da IA</strong>
                    <p>{q.resolucao}</p>
                    {q.resposta && (
                      <p>
                        <strong>Resposta:</strong> {q.resposta}
                      </p>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}

      {e === 'fazendo' && (
        <div className="form__botoes" style={{ justifyContent: 'flex-start' }}>
          <button className="tecla tecla--ambar" onClick={() => void window.api.terminarSimulado(s.id)}>
            Terminei a prova
          </button>
        </div>
      )}

      {(e === 'fotos' || e === 'corrigido') && (
        <button className="botao-texto" onClick={() => setVerResolucao(!verResolucao)} style={{ marginBottom: 20 }}>
          {verResolucao ? 'Esconder a resolução da IA' : 'Ver a resolução da IA'}
        </button>
      )}

      {e === 'corrigido' && <ResultadoCorrecao estado={estado} s={s} />}
      {(e === 'fotos' || e === 'corrigido') && <Fotos estado={estado} s={s} />}
    </div>
  )
}

function Cronometro({ s, agora }: { s: TSimulado; agora: number }) {
  const passou = Math.max(0, agora - (s.iniciadoEm ?? agora))
  const limite = s.duracaoMin * MINUTO
  // A barra vai até 1,5 vez a duração; a marca fica no tempo da prova.
  const escala = limite * 1.5
  const estourou = passou > limite
  return (
    <div className={`cronometro ${estourou ? 'cronometro--estourou' : ''}`}>
      <div className="cronometro__numeros">
        <span className="cronometro__tempo">{formatarRelogio(passou)}</span>
        <span className="mudo">
          {estourou ? `Passou ${Math.ceil((passou - limite) / MINUTO)} min do tempo da prova.` : `Faltam ${Math.ceil((limite - passou) / MINUTO)} min para os ${s.duracaoMin} min da prova.`}
        </span>
      </div>
      <div className="cronometro__trilho" aria-hidden>
        <i style={{ width: `${Math.min(100, (passou / escala) * 100)}%` }} />
        <b style={{ left: `${(limite / escala) * 100}%` }} />
      </div>
    </div>
  )
}

const NOME_SITUACAO: Record<SituacaoQuestao, string> = { certa: 'Certa', parcial: 'Parcial', errada: 'Errada', 'em-branco': 'Em branco' }

function CorrecaoDaQuestao({ situacao, acertos, erros }: { situacao: SituacaoQuestao; acertos: string; erros: string }) {
  return (
    <div className="questao__correcao">
      <span className={`selo-situacao selo-situacao--${situacao}`}>{NOME_SITUACAO[situacao]}</span>
      {acertos && (
        <p>
          <strong>Acertou:</strong> {acertos}
        </p>
      )}
      {erros && (
        <p>
          <strong>Errou:</strong> {erros}
        </p>
      )}
    </div>
  )
}

function ResultadoCorrecao({ estado, s }: { estado: Estado; s: TSimulado }) {
  const c = s.correcao!
  return (
    <>
      <div className="painel resultado">
        <div className="resultado__nota">
          <span className="resultado__numero">{formatarNota(c.nota)}</span>
          <span className="mudo">de {formatarNota(c.total)}, estimado pela IA</span>
        </div>
        <div>
          {c.resumo && <p className="modal__texto">{c.resumo}</p>}
          {c.pontosFracos.length > 0 && (
            <>
              <strong className="resultado__rotulo">Onde mais errou</strong>
              <ul className="resultado__fracos">
                {c.pontosFracos.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </>
          )}
          {c.avisos && <p className="mudo">{c.avisos}</p>}
          <p className="form__dica">A nota é uma estimativa: a IA pode errar conta ou ler mal a letra. Confira as questões marcadas como erradas.</p>
        </div>
      </div>
      {c.sugestoes.length > 0 && <Sugestoes estado={estado} s={s} />}
    </>
  )
}

function Sugestoes({ estado, s }: { estado: Estado; s: TSimulado }) {
  const sugestoes = s.correcao!.sugestoes
  const jaNoPlano = (titulo: string) => estado.tarefas.some((t) => t.titulo === titulo && t.materiaId === s.materiaId)
  const dataPadrao = proximoDiaDaMateria(estado.tarefas, s.materiaId, estado.hoje) ?? somarDias(estado.hoje, 1)
  const [marcadas, setMarcadas] = useState(() => sugestoes.map((x) => !jaNoPlano(x.titulo)))
  const [datas, setDatas] = useState(() => sugestoes.map(() => dataPadrao))
  const pendentes = sugestoes.filter((x, i) => marcadas[i] && !jaNoPlano(x.titulo))

  async function adicionar() {
    for (const [i, x] of sugestoes.entries()) {
      if (!marcadas[i] || jaNoPlano(x.titulo) || !/^\d{4}-\d{2}-\d{2}$/.test(datas[i])) continue
      await window.api.salvarTarefa({ materiaId: s.materiaId, data: datas[i], titulo: x.titulo, detalhe: x.detalhe, minutos: x.minutos })
    }
  }

  return (
    <div className="painel" style={{ marginBottom: 14 }}>
      <h2>Para refazer</h2>
      <p className="mudo" style={{ marginTop: -6 }}>
        A IA sugere estas tarefas. Marque as que quer no plano e escolha o dia.
      </p>
      <ul className="sugestoes">
        {sugestoes.map((x, i) => {
          const noPlano = jaNoPlano(x.titulo)
          return (
            <li key={x.titulo}>
              <input
                type="checkbox"
                className="marcar"
                checked={noPlano || marcadas[i]}
                disabled={noPlano}
                onChange={(e) => setMarcadas(marcadas.map((m, j) => (j === i ? e.target.checked : m)))}
                aria-label={`Pôr no plano: ${x.titulo}`}
              />
              <div>
                <strong>{x.titulo}</strong>
                <span className="mudo">
                  {x.detalhe} ({x.minutos} min)
                </span>
              </div>
              {noPlano ? (
                <span className="mudo">Já está no plano</span>
              ) : (
                <input
                  className="campo campo-data"
                  type="date"
                  value={datas[i]}
                  min={estado.hoje}
                  onChange={(e) => setDatas(datas.map((d, j) => (j === i ? e.target.value : d)))}
                  aria-label="Dia da tarefa"
                />
              )}
            </li>
          )
        })}
      </ul>
      {pendentes.length > 0 && (
        <div className="form__botoes">
          <button className="tecla tecla--pequena tecla--ambar" onClick={() => void adicionar()}>
            Pôr {pendentes.length === 1 ? 'a tarefa' : `as ${pendentes.length} tarefas`} no plano
          </button>
        </div>
      )}
    </div>
  )
}

function Fotos({ estado, s }: { estado: Estado; s: TSimulado }) {
  const [arrastando, setArrastando] = useState(false)
  const [mensagem, setMensagem] = useState<{ ok: boolean; mensagem: string } | null>(null)
  const trabalho = estado.ia.trabalho
  const corrigindo = trabalho?.tipo === 'corrigir-simulado' && trabalho.simuladoId === s.id

  async function soltar(e: DragEvent) {
    e.preventDefault()
    setArrastando(false)
    const caminhos = [...e.dataTransfer.files].map((f) => window.api.caminhoDe(f)).filter(Boolean)
    if (caminhos.length > 0) setMensagem(await window.api.adicionarFotos(s.id, caminhos))
  }

  async function corrigir() {
    setMensagem(null)
    const r = await window.api.corrigirSimulado(s.id)
    if (!r.ok) setMensagem(r)
  }

  return (
    <div className="painel">
      <h2>{s.correcao ? 'Fotos da resolução' : 'Correção pelas fotos'}</h2>
      {!s.correcao && (
        <p className="mudo" style={{ marginTop: -6 }}>
          Tire fotos da folha com boa luz, uma página por foto. O WhatsApp Web está bloqueado: passe as fotos pelo Google Fotos ou Drive no navegador,
          pelo Vincular ao Celular ou pelo cabo.
        </p>
      )}
      <div
        className={`area-fotos ${arrastando ? 'area-fotos--arrastando' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setArrastando(true)
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => void soltar(e)}
      >
        {s.fotos.map((f) => (
          <Miniatura key={f} id={s.id} foto={f} remover={corrigindo ? null : () => void window.api.removerFoto(s.id, f)} />
        ))}
        <button className="area-fotos__mais" onClick={() => void window.api.escolherFotos(s.id).then((r) => r && setMensagem(r))} disabled={corrigindo}>
          <IconeFoto tamanho={20} />
          <span>Arraste as fotos para cá ou clique para escolher</span>
        </button>
      </div>
      {mensagem && <p className={mensagem.ok ? 'mudo' : 'erro-ia'}>{mensagem.mensagem}</p>}
      {corrigindo ? (
        <div className="ia-trabalhando ia-trabalhando--solto">
          <Led aceso cor="ambar" />
          <div>
            <strong>{trabalho!.descricao}</strong>
            <span>A IA lê as fotos, resolve cada questão de novo e corrige passo a passo. Leva de 2 a 5 minutos.</span>
          </div>
          <button className="tecla tecla--pequena" onClick={() => void window.api.cancelarIa()}>
            Cancelar
          </button>
        </div>
      ) : (
        <div className="form__botoes">
          <button
            className={`tecla tecla--pequena ${s.correcao ? '' : 'tecla--ambar'}`}
            disabled={s.fotos.length === 0 || !!trabalho || !estado.ia.claude}
            onClick={() => void corrigir()}
          >
            {s.correcao ? 'Corrigir de novo' : 'Corrigir com a IA'}
          </button>
        </div>
      )}
    </div>
  )
}

function Miniatura({ id, foto, remover }: { id: number; foto: string; remover: (() => void) | null }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    void window.api.miniatura(id, foto).then((u) => vivo && setSrc(u))
    return () => {
      vivo = false
    }
  }, [id, foto])
  return (
    <figure className="miniatura">
      {src ? <img src={src} alt={foto} /> : <span className="mudo">{foto}</span>}
      {remover && (
        <button className="miniatura__tirar" onClick={remover} aria-label={`Tirar ${foto}`}>
          <IconeFechar tamanho={14} />
        </button>
      )}
    </figure>
  )
}

/** Data curta para os títulos (ex.: qua 25/11). */
export const diaCurto = (data: string) => `${nomeDiaSemana(data, true)} ${diaMes(data)}`
