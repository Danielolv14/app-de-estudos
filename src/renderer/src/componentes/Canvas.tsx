// Canvas (o ambiente virtual da PUC): conexão em Ajustes, revisão das novidades no Calendário e
// escolha de PDFs do curso (plano de ensino e material para o simulado).
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { ArquivoCanvas, CursoNaRevisao, Estado, ItemNaRevisao, RevisaoCanvas, TipoItemCanvas } from '@shared/tipos'
import { diaMes } from '@shared/regras'
import { formatarNota } from '@shared/notas'
import { Led, estiloMateria } from './Basicos'
import { IconeFechar } from './Icones'

const NOME_TIPO: Record<TipoItemCanvas, string> = {
  prova: 'Prova',
  atividade: 'Atividade',
  reavaliacao: 'Reavaliação',
  aula: 'Aula',
  outro: 'Evento'
}

function haQuanto(agora: number, quando: number): string {
  const min = Math.round((agora - quando) / 60_000)
  if (min < 1) return 'agora há pouco'
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.round(h / 24)
  return `há ${d} ${d === 1 ? 'dia' : 'dias'}`
}

const tamanho = (bytes: number) =>
  bytes <= 0 ? '' : bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`

// ---------- Ajustes ----------

export function SecaoCanvas({ estado }: { estado: Estado }) {
  const c = estado.canvas
  const ativas = estado.materias.filter((m) => !m.arquivada)
  const [url, setUrl] = useState(c.url)
  const [token, setToken] = useState('')
  const [conectando, setConectando] = useState(false)
  const [mensagem, setMensagem] = useState('')

  async function conectar() {
    setConectando(true)
    setMensagem('')
    const r = await window.api.conectarCanvas(url, token)
    setConectando(false)
    setMensagem(r.ok ? '' : r.mensagem)
    if (r.ok) setToken('')
  }

  const [led, cor, titulo, texto] = !c.conectado
    ? [false, 'vermelho', 'Canvas não conectado', 'As matérias, as atividades e as notas continuam só no Canvas.']
    : c.sincronizando
      ? [true, 'ambar', 'Sincronizando...', 'Buscando os cursos, as atividades e as notas.']
      : c.erro
        ? [true, 'ambar', 'O Canvas não respondeu direito', c.erro]
        : [
            true,
            'verde',
            `Conectado${c.usuario ? ` como ${c.usuario}` : ''}`,
            c.ultimaSync ? `Última sincronia ${haQuanto(estado.agora, c.ultimaSync)}. O app confere de novo a cada 6 horas.` : 'Ainda não sincronizou.'
          ]

  return (
    <section className="secao">
      <h2>Canvas da PUC</h2>
      <p>
        O app busca no Canvas as matérias, as atividades e as provas com data e valor, e as notas que o professor lançar. O que é novo aparece no
        Calendário para você revisar antes de entrar. O que já está ligado ao Canvas (data, valor e nota) é atualizado sozinho.
      </p>
      <div className="estado-bloqueio">
        <Led aceso={led as boolean} cor={cor as 'verde'} />
        <div>
          <strong>{titulo}</strong>
          <span className="quebra">{texto}</span>
        </div>
        {c.conectado && (
          <>
            <button className="tecla tecla--pequena" disabled={c.sincronizando} onClick={() => void window.api.sincronizarCanvas()}>
              Sincronizar agora
            </button>
            <button className="tecla tecla--pequena" disabled={c.sincronizando} onClick={() => void window.api.desconectarCanvas()}>
              Desconectar
            </button>
          </>
        )}
      </div>

      {!c.conectado && (
        <form
          className="form canvas-conectar"
          onSubmit={(e) => {
            e.preventDefault()
            void conectar()
          }}
        >
          <ol className="canvas-passos">
            <li>
              No Canvas, abra <strong>Conta &gt; Configurações</strong> e, em Integrações aprovadas, clique em <strong>+ Novo token de acesso</strong>.
            </li>
            <li>Em Finalidade, escreva "App de Estudos". A validade pode ficar em branco ou no fim do semestre.</li>
            <li>Clique em Gerar token, copie o token inteiro e cole aqui. Ele só aparece uma vez no Canvas.</li>
          </ol>
          <div className="form__linha">
            <label>
              Endereço do Canvas
              <input className="campo" value={url} onChange={(e) => setUrl(e.target.value)} spellCheck={false} />
            </label>
            <label>
              Token de acesso
              <input
                className="campo"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Cole o token aqui"
              />
            </label>
          </div>
          <p className="form__dica">
            O token fica guardado criptografado com a sua conta do Windows e só é enviado para o endereço do Canvas. Não cole o token em conversas nem em
            notas. Para cortar o acesso, exclua o token no Canvas ou clique em Desconectar aqui.
          </p>
          {mensagem && <p className="erro-ia">{mensagem}</p>}
          <div className="form__botoes">
            <button type="submit" className="tecla tecla--pequena tecla--ambar" disabled={conectando || token.trim().length === 0}>
              {conectando ? 'Conectando...' : 'Conectar'}
            </button>
          </div>
        </form>
      )}

      {c.conectado && c.cursos.length > 0 && (
        <>
          <h3 className="revisao__titulo">Cursos deste semestre</h3>
          <ul className="canvas-cursos">
            {c.cursos.map((curso) => (
              <li key={curso.id} style={curso.materiaId ? estiloMateria(estado.materias, curso.materiaId) : undefined}>
                <span className="quebra">{curso.nome}</span>
                <select
                  className="seletor"
                  value={curso.materiaId === null ? '' : String(curso.materiaId)}
                  onChange={(e) => void window.api.ligarCursoCanvas(curso.id, e.target.value === '' ? null : Number(e.target.value))}
                  aria-label={`Matéria do curso ${curso.nome}`}
                >
                  <option value="">Escolher na revisão</option>
                  {ativas.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                    </option>
                  ))}
                  <option value="0">Ignorar este curso</option>
                </select>
              </li>
            ))}
          </ul>
          <p className="form__dica">Trocar a matéria de um curso vale para as próximas novidades. O que já entrou no calendário fica onde está.</p>
        </>
      )}
    </section>
  )
}

// ---------- Revisão das novidades (no Calendário) ----------

export function RevisaoDoCanvas({ estado }: { estado: Estado }) {
  const [r, setR] = useState<RevisaoCanvas>(estado.revisaoCanvas!)
  const ativas = estado.materias.filter((m) => !m.arquivada)
  const doCanvas = new Set(estado.canvas.eventosDoCanvas)

  const destinoDe = (cursoId: number): number | 'nova' | 'ignorar' | null => {
    const novo = r.cursos.find((c) => c.id === cursoId)
    if (novo) return novo.destino
    return estado.canvas.cursos.find((c) => c.id === cursoId)?.materiaId || null
  }
  const nomeCurso = (cursoId: number) =>
    r.cursos.find((c) => c.id === cursoId)?.nome ?? estado.canvas.cursos.find((c) => c.id === cursoId)?.nome ?? `Curso ${cursoId}`

  const mudarCurso = (id: number, p: Partial<CursoNaRevisao>) =>
    setR({
      ...r,
      cursos: r.cursos.map((c) => (c.id === id ? { ...c, ...p } : c)),
      // Trocou a matéria: a junção sugerida era com uma avaliação da matéria antiga.
      itens: p.destino !== undefined ? r.itens.map((i) => (i.cursoId === id ? { ...i, juntarCom: null } : i)) : r.itens
    })
  const mudarItem = (chave: string, p: Partial<ItemNaRevisao>) => setR({ ...r, itens: r.itens.map((i) => (i.chave === chave ? { ...i, ...p } : i)) })

  const grupos = useMemo(() => {
    const ids = [...new Set(r.itens.map((i) => i.cursoId))]
    return ids.map((id) => ({
      cursoId: id,
      itens: r.itens.filter((i) => i.cursoId === id).sort((a, b) => (a.data ?? '9999').localeCompare(b.data ?? '9999') || a.titulo.localeCompare(b.titulo))
    }))
  }, [r.itens])

  const valido = (i: ItemNaRevisao) => {
    const d = destinoDe(i.cursoId)
    return d !== null && d !== 'ignorar'
  }
  const entram = r.itens.filter((i) => i.incluir && valido(i)).length
  const juntadas = new Set(r.itens.filter((i) => i.juntarCom !== null && valido(i)).map((i) => i.juntarCom))
  const novasMaterias = r.cursos.filter((c) => c.destino === 'nova').length

  return (
    <div className="painel revisao" style={{ '--cor-materia': 'var(--destaque)' } as CSSProperties}>
      <h2>
        Novidades do Canvas <span className="titulo-apagado">esperando a sua revisão</span>
      </h2>
      <p className="mudo" style={{ marginTop: -6 }}>
        Só entra no calendário o que estiver marcado. Se a avaliação já existia aqui, escolha "Juntar com" para não duplicar: o nome que você deu fica, e a
        data, o valor e a nota passam a vir do Canvas.
      </p>

      {r.cursos.length > 0 && (
        <>
          <h3 className="revisao__titulo">Cursos novos</h3>
          <ul className="canvas-cursos">
            {r.cursos.map((c) => (
              <li key={c.id} className={c.destino === 'ignorar' ? 'revisao__linha--fora' : ''}>
                <span className="quebra">{c.nome}</span>
                <select
                  className="seletor"
                  value={String(c.destino)}
                  onChange={(e) => {
                    const v = e.target.value
                    mudarCurso(c.id, { destino: v === 'nova' || v === 'ignorar' ? v : Number(v) })
                  }}
                  aria-label={`Destino do curso ${c.nome}`}
                >
                  <option value="nova">Criar a matéria</option>
                  {ativas.map((m) => (
                    <option key={m.id} value={m.id}>
                      Juntar com {m.nome}
                    </option>
                  ))}
                  <option value="ignorar">Ignorar este curso</option>
                </select>
                {c.destino === 'nova' && (
                  <input
                    className="campo"
                    value={c.nomeMateria}
                    onChange={(e) => mudarCurso(c.id, { nomeMateria: e.target.value })}
                    aria-label="Nome da matéria nova"
                    placeholder="Nome da matéria"
                  />
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {grupos.map((g) => {
        const destino = destinoDe(g.cursoId)
        const fora = destino === null || destino === 'ignorar'
        const candidatos =
          typeof destino === 'number'
            ? estado.eventos.filter((e) => e.materiaId === destino && e.tipo !== 'aula' && e.tipo !== 'outro' && !doCanvas.has(e.id))
            : []
        const todas = g.itens.every((i) => i.incluir)
        return (
          <div key={g.cursoId} className={fora ? 'revisao__linha--fora' : ''}>
            <h3 className="revisao__titulo">
              {nomeCurso(g.cursoId)}
              <span className="mudo">
                {fora ? 'curso ignorado' : `${g.itens.filter((i) => i.incluir).length} de ${g.itens.length} marcadas`}
              </span>
              {!fora && (
                <button
                  className="botao-texto"
                  onClick={() => setR({ ...r, itens: r.itens.map((i) => (i.cursoId === g.cursoId ? { ...i, incluir: !todas } : i)) })}
                >
                  {todas ? 'Desmarcar todas' : 'Marcar todas'}
                </button>
              )}
            </h3>
            <ul className="canvas-itens">
              {g.itens.map((i) => (
                <li key={i.chave} className={i.incluir ? '' : 'canvas-itens--desmarcado'}>
                  <input
                    type="checkbox"
                    className="marcar"
                    checked={i.incluir}
                    disabled={fora}
                    onChange={(e) => mudarItem(i.chave, { incluir: e.target.checked })}
                    aria-label={`Incluir ${i.titulo}`}
                  />
                  <span className={`selo-mudanca ${i.tipo === 'prova' || i.tipo === 'reavaliacao' ? 'selo-mudanca--mover' : ''}`}>{NOME_TIPO[i.tipo]}</span>
                  <div className="canvas-itens__texto">
                    <strong className="quebra">{i.titulo}</strong>
                    <span className="mudo">
                      {i.data ? diaMes(i.data) : 'sem data'}
                      {i.pontos !== null ? `, vale ${formatarNota(i.pontos)}` : ''}
                      {i.nota !== null ? `, nota ${formatarNota(i.nota)}` : ''}
                    </span>
                  </div>
                  <select
                    className="seletor"
                    value={i.juntarCom ?? ''}
                    disabled={fora || !i.incluir || candidatos.length === 0}
                    onChange={(e) => mudarItem(i.chave, { juntarCom: e.target.value ? Number(e.target.value) : null })}
                    aria-label={`Juntar ${i.titulo} com uma avaliação que já existe`}
                  >
                    <option value="">{candidatos.length === 0 ? 'Entra como nova' : 'Nova no calendário'}</option>
                    {candidatos.map((e) => (
                      <option key={e.id} value={e.id} disabled={juntadas.has(e.id) && i.juntarCom !== e.id}>
                        Juntar com {e.titulo}
                        {e.data ? ` (${diaMes(e.data)})` : ''}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </div>
        )
      })}

      <div className="form__botoes">
        <button className="tecla tecla--pequena" onClick={() => void window.api.ignorarRevisaoCanvas()} title="Os cursos novos ficam ignorados e estas atividades não voltam">
          Ignorar estas novidades
        </button>
        <button className="tecla tecla--pequena tecla--ambar" onClick={() => void window.api.aplicarRevisaoCanvas(r)}>
          Aplicar
          {entram > 0 ? ` (${entram} no calendário${novasMaterias > 0 ? `, ${novasMaterias} ${novasMaterias === 1 ? 'matéria nova' : 'matérias novas'}` : ''})` : ''}
        </button>
      </div>
    </div>
  )
}

// ---------- PDFs do curso ----------

export type PdfEscolhido = { caminho: string; nome: string; cursoId: number }

/**
 * Lista os PDFs de um curso do Canvas, dentro do formulário. Ao escolher, o app baixa o arquivo e devolve o caminho no PC.
 * `max` = 1: um clique já escolhe (plano de ensino). Mais que 1: marca vários (material do simulado).
 */
export function PdfsDoCanvas(p: {
  estado: Estado
  materiaId: number | null
  max: number
  /** Arquivos com esse nome aparecem primeiro (ex.: /plano/i). */
  primeiro?: RegExp
  jaEscolhidos?: number
  aoEscolher: (escolhidos: PdfEscolhido[]) => void
  aoFechar: () => void
}) {
  const cursos = p.estado.canvas.cursos.filter((c) => c.materiaId !== 0)
  const doCurso = cursos.find((c) => c.materiaId !== null && c.materiaId === p.materiaId)
  const [cursoId, setCursoId] = useState<number | null>(doCurso?.id ?? cursos[0]?.id ?? null)
  const [lista, setLista] = useState<ArquivoCanvas[] | null>(null)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [marcados, setMarcados] = useState<number[]>([])
  const [baixando, setBaixando] = useState(false)
  const vagas = Math.max(0, p.max - (p.jaEscolhidos ?? 0))

  useEffect(() => {
    if (cursoId === null) return
    let vivo = true
    setLista(null)
    setErro('')
    setMarcados([])
    void window.api.arquivosCanvas(cursoId).then((r) => {
      if (!vivo) return
      if (r.ok) setLista(r.arquivos)
      else setErro(r.mensagem)
    })
    return () => {
      vivo = false
    }
  }, [cursoId])

  const visiveis = (lista ?? [])
    .filter((a) => !busca.trim() || `${a.nome} ${a.modulo}`.toLowerCase().includes(busca.trim().toLowerCase()))
    .sort((a, b) => Number(!!p.primeiro?.test(b.nome)) - Number(!!p.primeiro?.test(a.nome)))

  async function baixar(ids: number[]) {
    if (cursoId === null || ids.length === 0) return
    setBaixando(true)
    setErro('')
    const escolhidos: PdfEscolhido[] = []
    for (const id of ids) {
      const r = await window.api.baixarCanvas(id)
      if (!r.ok) {
        setErro(r.mensagem)
        setBaixando(false)
        return
      }
      escolhidos.push({ caminho: r.caminho, nome: lista?.find((a) => a.id === id)?.nome ?? 'arquivo.pdf', cursoId })
    }
    setBaixando(false)
    p.aoEscolher(escolhidos)
  }

  if (cursos.length === 0)
    return (
      <div className="pdfs-canvas">
        <p className="mudo">O Canvas ainda não trouxe nenhum curso. Clique em Sincronizar agora, em Ajustes.</p>
      </div>
    )

  return (
    <div className="pdfs-canvas">
      <div className="pdfs-canvas__topo">
        <select className="seletor" value={cursoId ?? ''} onChange={(e) => setCursoId(Number(e.target.value))} aria-label="Curso do Canvas">
          {cursos.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
        <input className="campo" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Procurar pelo nome" aria-label="Procurar PDF" />
        <button type="button" className="botao-texto" onClick={p.aoFechar} aria-label="Fechar a lista do Canvas">
          <IconeFechar />
        </button>
      </div>
      {erro && <p className="erro-ia">{erro}</p>}
      {lista === null && !erro && <p className="mudo">Buscando os PDFs do curso...</p>}
      {lista !== null && visiveis.length === 0 && <p className="mudo">{lista.length === 0 ? 'Este curso não tem PDFs que você possa ver.' : 'Nenhum PDF com esse nome.'}</p>}
      {visiveis.length > 0 && (
        <ul className="pdfs-canvas__lista">
          {visiveis.map((a) => {
            const marcado = marcados.includes(a.id)
            return (
              <li key={a.id}>
                {p.max === 1 ? (
                  <button type="button" disabled={baixando} onClick={() => void baixar([a.id])}>
                    <span className="quebra">{a.nome}</span>
                    <span className="mudo">{[a.modulo, tamanho(a.tamanho)].filter(Boolean).join(', ')}</span>
                  </button>
                ) : (
                  <label>
                    <input
                      type="checkbox"
                      className="marcar"
                      checked={marcado}
                      disabled={baixando || (!marcado && marcados.length >= vagas)}
                      onChange={() => setMarcados(marcado ? marcados.filter((x) => x !== a.id) : [...marcados, a.id])}
                    />
                    <span className="quebra">{a.nome}</span>
                    <span className="mudo">{[a.modulo, tamanho(a.tamanho)].filter(Boolean).join(', ')}</span>
                  </label>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {p.max > 1 && (
        <div className="form__botoes">
          <span className="mudo">
            {vagas === 0 ? 'Já escolheu o máximo de arquivos.' : `Até ${vagas} ${vagas === 1 ? 'arquivo' : 'arquivos'}.`}
          </span>
          <button type="button" className="tecla tecla--pequena tecla--ambar" disabled={baixando || marcados.length === 0} onClick={() => void baixar(marcados)}>
            {baixando ? 'Baixando...' : `Usar ${marcados.length === 1 ? 'o arquivo' : `os ${marcados.length} arquivos`}`}
          </button>
        </div>
      )}
      {p.max === 1 && baixando && <p className="mudo">Baixando...</p>}
    </div>
  )
}
