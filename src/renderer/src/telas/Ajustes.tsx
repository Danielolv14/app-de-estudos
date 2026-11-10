import { useState, type CSSProperties } from 'react'
import type { BlocoSemana, Config, Estado, Materia } from '@shared/tipos'
import { CORES_MATERIA } from '@shared/padroes'
import { formatarDuracao } from '@shared/regras'
import { Led, Modal } from '../componentes/Basicos'
import { IconeFechar, IconeMais } from '../componentes/Icones'
import { SecaoCanvas } from '../componentes/Canvas'

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0]

const linhas = (texto: string) =>
  texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

export function Ajustes({ estado }: { estado: Estado }) {
  const { config, bloqueio } = estado
  const materias = estado.materias.filter((m) => !m.arquivada)
  const arquivadas = estado.materias.filter((m) => m.arquivada)
  const salvar = (parcial: Partial<Config>) => void window.api.salvarConfig({ ...config, ...parcial })
  const [instalando, setInstalando] = useState(false)
  const [mensagem, setMensagem] = useState('')

  const [dominios, setDominios] = useState(config.dominios.join('\n'))
  const [processos, setProcessos] = useState(config.processos.join('\n'))
  const [pastas, setPastas] = useState(config.pastasBloqueadas.join('\n'))
  const listasMudaram =
    dominios !== config.dominios.join('\n') || processos !== config.processos.join('\n') || pastas !== config.pastasBloqueadas.join('\n')

  async function instalar(remover = false) {
    setInstalando(true)
    setMensagem(remover ? 'Confirme a janela de administrador do Windows para remover.' : 'Confirme a janela de administrador do Windows para instalar.')
    const r = remover ? await window.api.desinstalarBloqueio() : await window.api.instalarBloqueio()
    setMensagem(r.mensagem)
    setInstalando(false)
  }

  const situacao = !bloqueio.instalado
    ? { led: false, cor: 'vermelho' as const, titulo: 'Bloqueio de sites não instalado', texto: 'O timer e o fechamento dos apps funcionam, mas o Instagram e o WhatsApp Web continuam abrindo.' }
    : !bloqueio.vivo
      ? { led: true, cor: 'ambar' as const, titulo: 'O serviço não está respondendo', texto: 'Reinicie o PC. Se continuar assim, instale de novo.' }
      : bloqueio.desatualizado
        ? { led: true, cor: 'ambar' as const, titulo: 'O serviço precisa ser atualizado', texto: 'Esta versão também protege o bloqueio no Brave. Clique em Reinstalar e confirme a janela de administrador.' }
        : bloqueio.bloqueado
        ? { led: true, cor: 'vermelho' as const, titulo: 'Bloqueando agora', texto: 'A sessão está em andamento. Os sites voltam quando ela terminar.' }
        : { led: true, cor: 'verde' as const, titulo: 'Pronto para bloquear', texto: 'Os sites são bloqueados quando você começa a estudar.' }

  return (
    <div className="ajustes">
      <div className="titulo-tela">
        <div>
          <h1>Ajustes</h1>
        </div>
      </div>

      <section className="secao">
        <h2>Bloqueio de sites e apps</h2>
        <p>
          Os sites são bloqueados pelo arquivo hosts do Windows, por um serviço que roda como sistema. Ele é instalado uma única vez,
          com um pedido de administrador. Fechar o app não desliga o bloqueio, e ele continua depois de reiniciar o PC.
        </p>
        <div className="estado-bloqueio">
          <Led aceso={situacao.led} cor={situacao.cor} />
          <div>
            <strong>{situacao.titulo}</strong>
            <span>{bloqueio.erro ? `Erro do serviço: ${bloqueio.erro}` : situacao.texto}</span>
          </div>
          {!bloqueio.instalado ? (
            <button className="tecla tecla--pequena tecla--ambar" disabled={instalando} onClick={() => void instalar()}>
              Instalar o bloqueio
            </button>
          ) : (
            <>
              <button className="tecla tecla--pequena" disabled={instalando} onClick={() => void instalar()}>
                Reinstalar
              </button>
              <button className="tecla tecla--pequena" disabled={instalando || !!estado.ativa} onClick={() => void instalar(true)}>
                Remover
              </button>
            </>
          )}
        </div>
        {mensagem && <p className="mudo">{mensagem}</p>}

        <label className="opcao" style={{ margin: '6px 0 18px' }}>
          <input type="checkbox" className="marcar" checked={config.reiniciarNavegador} onChange={(e) => salvar({ reiniciarNavegador: e.target.checked })} />
          Reiniciar o Brave (e o Chrome, se estiver aberto) ao começar a sessão, para derrubar as abas que já estavam abertas
        </label>
        <p className="mudo" style={{ margin: '-8px 0 18px', maxWidth: '68ch' }}>
          Durante o bloqueio, o Brave fica sem a janela privada com Tor e sem o DNS seguro, porque os dois passariam por cima do
          bloqueio. Por isso ele mostra &ldquo;gerenciado pela sua organização&rdquo; até a sessão terminar.
        </p>

        <div className="form">
          <div className="form__linha">
            <label>
              Sites bloqueados (um por linha)
              <textarea className="campo-area campo-area--codigo" rows={7} value={dominios} onChange={(e) => setDominios(e.target.value)} />
            </label>
            <label>
              Apps fechados durante a sessão (nome do processo)
              <textarea className="campo-area campo-area--codigo" rows={7} value={processos} onChange={(e) => setProcessos(e.target.value)} />
            </label>
          </div>
          <label>
            Pastas: qualquer programa aberto de dentro delas também é fechado (pega os jogos)
            <textarea className="campo-area campo-area--codigo" rows={3} value={pastas} onChange={(e) => setPastas(e.target.value)} />
          </label>
          <div className="form__botoes">
            <button
              className="tecla tecla--pequena tecla--ambar"
              disabled={!listasMudaram}
              onClick={() => salvar({ dominios: linhas(dominios).map((d) => d.toLowerCase()), processos: linhas(processos), pastasBloqueadas: linhas(pastas) })}
            >
              Salvar as listas
            </button>
          </div>
        </div>
      </section>

      <SecaoIa estado={estado} salvar={salvar} />

      <SecaoCanvas estado={estado} />

      <section className="secao">
        <h2>Lembrete da hora de estudar</h2>
        <p>
          No horário, aparece uma notificação com a tarefa do dia. Ela se repete até o timer começar, a não ser que você adie ou dispense.
          Só avisa em dia que tem tarefa pendente.
        </p>
        <div className="grade-lembretes">
          {ORDEM_DIAS.map((i) => {
            const l = config.lembretes[i]
            const mudar = (parcial: Partial<typeof l>) =>
              salvar({ lembretes: config.lembretes.map((x, j) => (j === i ? { ...x, ...parcial } : x)) })
            return (
              <div key={i} className={`lembrete-dia ${l.ativo ? '' : 'lembrete-dia--desligado'}`}>
                <label>
                  <input type="checkbox" className="marcar" checked={l.ativo} onChange={(e) => mudar({ ativo: e.target.checked })} />
                  {DIAS[i]}
                </label>
                <input
                  className="campo campo-hora"
                  type="time"
                  value={l.hora}
                  disabled={!l.ativo}
                  onChange={(e) => e.target.value && mudar({ hora: e.target.value })}
                  aria-label={`Horário do lembrete de ${DIAS[i]}`}
                />
              </div>
            )
          })}
        </div>
        <div className="linha-campo">
          <label htmlFor="insistir">Repetir a cada</label>
          <select id="insistir" className="seletor" style={{ width: 140 }} value={config.insistirMin} onChange={(e) => salvar({ insistirMin: Number(e.target.value) })}>
            {[5, 10, 15, 20, 30].map((m) => (
              <option key={m} value={m}>
                {m} minutos
              </option>
            ))}
          </select>
        </div>
      </section>

      <SemanaPadrao estado={estado} salvar={salvar} />

      <section className="secao">
        <h2>
          Matérias <span className="titulo-apagado">de {estado.semestre}</span>
        </h2>
        {materias.map((m) => (
          <LinhaMateria key={m.id} materia={m} />
        ))}
        <button
          className="tecla tecla--pequena"
          style={{ marginTop: 8 }}
          onClick={() => void window.api.salvarMateria({ nome: 'Nova matéria', cor: CORES_MATERIA[materias.length % CORES_MATERIA.length] })}
        >
          <IconeMais tamanho={15} />
          Adicionar matéria
        </button>
      </section>

      <Semestre estado={estado} arquivadas={arquivadas} />

      <section className="secao">
        <h2>Resumo no Obsidian</h2>
        <p>O app reescreve esta nota sempre que algo muda: plano, provas e horas por matéria. Assim o Claude Code enxerga tudo nas conversas.</p>
        <div className="linha-campo">
          <input className="campo" readOnly value={config.caminhoResumoVault || 'Desligado'} aria-label="Arquivo do resumo" />
          <button className="tecla tecla--pequena" onClick={() => void window.api.escolherVault()}>
            Escolher arquivo
          </button>
          {config.caminhoResumoVault && (
            <button className="tecla tecla--pequena" onClick={() => salvar({ caminhoResumoVault: '' })}>
              Desligar
            </button>
          )}
        </div>
      </section>

      <section className="secao">
        <h2>Geral</h2>
        <label className="opcao" style={{ marginBottom: 12 }}>
          <input type="checkbox" className="marcar" checked={config.iniciarComWindows} onChange={(e) => salvar({ iniciarComWindows: e.target.checked })} />
          Abrir junto com o Windows, escondido na bandeja (é o que faz o lembrete funcionar)
        </label>
        <label className="opcao">
          <input type="checkbox" className="marcar" checked={config.miniTimer} onChange={(e) => salvar({ miniTimer: e.target.checked })} />
          Mostrar o mini-timer flutuante durante a sessão, quando a janela do app não estiver na frente
        </label>
      </section>
    </div>
  )
}

function LinhaMateria({ materia }: { materia: Materia }) {
  const [nome, setNome] = useState(materia.nome)
  const salvar = (parcial: Partial<Materia>) => void window.api.salvarMateria({ ...materia, nome: nome.trim() || materia.nome, ...parcial })
  return (
    <div className="linha-campo">
      <input
        className="campo"
        style={{ maxWidth: 260 }}
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        onBlur={() => nome.trim() !== materia.nome && salvar({})}
        aria-label="Nome da matéria"
      />
      <div className="cores">
        {CORES_MATERIA.map((c) => (
          <button
            key={c}
            className={`cor ${c === materia.cor ? 'cor--escolhida' : ''}`}
            style={{ '--cor': c } as CSSProperties}
            onClick={() => salvar({ cor: c })}
            aria-label={`Cor ${c}`}
          />
        ))}
      </div>
      <button className="botao-texto" onClick={() => void window.api.arquivarMateria(materia.id, true)} title="Some das listas, mas o histórico fica">
        Arquivar
      </button>
      <button className="botao-texto" onClick={() => void window.api.removerMateria(materia.id)}>
        Apagar
      </button>
    </div>
  )
}

// ---------- IA ----------

function SecaoIa({ estado, salvar }: { estado: Estado; salvar: (p: Partial<Config>) => void }) {
  const { ia, config } = estado
  const testando = ia.trabalho?.tipo === 'teste'
  const teste = ia.ultimo?.tipo === 'teste' ? ia.ultimo : null
  const naoLogado = !!teste && !teste.ok && teste.mensagem.includes('auth login')
  const [led, cor, titulo, texto] = !ia.claude
    ? [false, 'vermelho', 'Claude Code não encontrado', 'Instale o Claude Code ou escolha o claude.exe à mão.']
    : teste && !teste.ok
      ? [true, 'ambar', 'O Claude Code não respondeu', teste.mensagem]
      : teste?.ok
        ? [true, 'verde', 'Funcionando', teste.mensagem]
        : [true, 'verde', 'Claude Code encontrado', ia.claude]
  return (
    <section className="secao">
      <h2>IA, pelo Claude Code</h2>
      <p>
        O simulado, a correção por foto, a leitura do plano de ensino e o replanejamento usam o Claude Code deste PC, com a sua assinatura. Ele roda em
        modo restrito: só lê os arquivos que o app manda, sem os seus hooks, sem MCP e sem rodar comandos.
      </p>
      <div className="estado-bloqueio">
        <Led aceso={led as boolean} cor={cor as 'verde'} />
        <div>
          <strong>{titulo}</strong>
          <span className="quebra">{texto}</span>
        </div>
        <button className="tecla tecla--pequena" disabled={!ia.claude || !!ia.trabalho} onClick={() => void window.api.testarIa()}>
          {testando ? 'Testando...' : 'Testar'}
        </button>
        <button className="tecla tecla--pequena" onClick={() => void window.api.escolherClaude()}>
          Escolher o claude.exe
        </button>
      </div>
      {naoLogado && (
        <p className="mudo" style={{ maxWidth: '68ch' }}>
          O Claude Code do app desktop tem login próprio. O de linha de comando precisa entrar uma vez: abra o terminal, rode{' '}
          <code>claude auth login</code>, entre com a sua conta no navegador e clique em Testar de novo.
        </p>
      )}
      <div className="linha-campo">
        <label htmlFor="modelo-ia">Modelo</label>
        <select id="modelo-ia" className="seletor" style={{ width: 360 }} value={config.modeloIa} onChange={(e) => salvar({ modeloIa: e.target.value as Config['modeloIa'] })}>
          <option value="opus">Opus: o mais capaz para conferir conta e ler letra à mão</option>
          <option value="sonnet">Sonnet: mais rápido e gasta menos do limite</option>
        </select>
      </div>
      <p className="mudo">
        Neste mês: {ia.usosMes} {ia.usosMes === 1 ? 'uso' : 'usos'}
        {ia.tokensMes > 0 ? `, uns ${Math.round(ia.tokensMes / 1000)} mil tokens` : ''}. Conta no mesmo limite que você usa no Claude.
      </p>
    </section>
  )
}

// ---------- Semana padrão ----------

const HORAS = [30, 60, 90, 120, 150, 180, 240, 300]

function SemanaPadrao({ estado, salvar }: { estado: Estado; salvar: (p: Partial<Config>) => void }) {
  const materias = estado.materias.filter((m) => !m.arquivada)
  const blocos = estado.config.semanaPadrao.filter((b) => materias.some((m) => m.id === b.materiaId))
  const trocar = (novos: BlocoSemana[]) => salvar({ semanaPadrao: novos })
  return (
    <section className="secao">
      <h2>Semana padrão</h2>
      <p>
        Que matéria entra em cada dia, e por quanto tempo. A IA monta e replaneja o plano dentro dela. O horário de começar é o do lembrete acima.
      </p>
      <div className="grade-lembretes">
        {ORDEM_DIAS.map((dia) => {
          const doDia = blocos.filter((b) => b.dia === dia)
          const total = doDia.reduce((a, b) => a + b.minutos, 0)
          return (
            <div key={dia} className={`lembrete-dia semana-dia ${doDia.length === 0 ? 'lembrete-dia--desligado' : ''}`}>
              <span className="semana-dia__nome">
                {DIAS[dia]}
                <span className="mudo">{total > 0 ? formatarDuracao(total * 60_000) : 'folga'}</span>
              </span>
              {doDia.map((b) => {
                const i = blocos.indexOf(b)
                const mudar = (p: Partial<BlocoSemana>) => trocar(blocos.map((x, j) => (j === i ? { ...x, ...p } : x)))
                return (
                  <div key={i} className="semana-dia__bloco">
                    <select className="seletor seletor--mini" value={b.materiaId} onChange={(e) => mudar({ materiaId: Number(e.target.value) })} aria-label="Matéria">
                      {materias.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nome}
                        </option>
                      ))}
                    </select>
                    <div className="semana-dia__linha">
                      <select className="seletor seletor--mini" value={b.minutos} onChange={(e) => mudar({ minutos: Number(e.target.value) })} aria-label="Tempo">
                        {[...new Set([...HORAS, b.minutos])]
                          .sort((x, y) => x - y)
                          .map((m) => (
                            <option key={m} value={m}>
                              {formatarDuracao(m * 60_000)}
                            </option>
                          ))}
                      </select>
                      <button className="botao-texto" onClick={() => trocar(blocos.filter((_, j) => j !== i))} aria-label="Tirar">
                        <IconeFechar tamanho={14} />
                      </button>
                    </div>
                  </div>
                )
              })}
              {materias.length > 0 && (
                <button className="botao-texto semana-dia__mais" onClick={() => trocar([...blocos, { dia, materiaId: materias[0].id, minutos: 120 }])}>
                  <IconeMais tamanho={13} /> Matéria
                </button>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ---------- Semestre ----------

/** 2026/2 vira 2027/1; 2027/1 vira 2027/2. */
function proximoSemestre(atual: string): string {
  const m = /^(\d{4})\/(1|2)$/.exec(atual.trim())
  if (!m) return atual
  return m[2] === '1' ? `${m[1]}/2` : `${Number(m[1]) + 1}/1`
}

function Semestre({ estado, arquivadas }: { estado: Estado; arquivadas: Materia[] }) {
  const [virando, setVirando] = useState(false)
  return (
    <section className="secao">
      <h2>Semestre</h2>
      <p>
        No fim do semestre, arquive as matérias de agora: elas somem das listas, mas as horas, as notas e o histórico ficam. Depois cadastre as novas
        (ou importe o plano de ensino no Calendário).
      </p>
      <div className="linha-campo">
        <span>
          Semestre atual: <strong>{estado.semestre}</strong>
        </span>
        <button className="tecla tecla--pequena" disabled={!!estado.ativa} onClick={() => setVirando(true)}>
          Começar o {proximoSemestre(estado.semestre)}
        </button>
      </div>
      {arquivadas.length > 0 && (
        <>
          <h3 className="mudo" style={{ fontSize: 13, fontWeight: 500, margin: '16px 0 6px' }}>
            Matérias arquivadas
          </h3>
          {arquivadas.map((m) => (
            <div key={m.id} className="linha-campo" style={{ margin: '4px 0' }}>
              <span className="ponto" style={{ '--cor-materia': m.cor } as CSSProperties} />
              <span>{m.nome}</span>
              <span className="mudo">{m.semestre}</span>
              <button className="botao-texto" onClick={() => void window.api.arquivarMateria(m.id, false)}>
                Reativar
              </button>
            </div>
          ))}
        </>
      )}
      {virando && <VirarSemestre estado={estado} novoPadrao={proximoSemestre(estado.semestre)} aoFechar={() => setVirando(false)} />}
    </section>
  )
}

function VirarSemestre({ estado, novoPadrao, aoFechar }: { estado: Estado; novoPadrao: string; aoFechar: () => void }) {
  const [novo, setNovo] = useState(novoPadrao)
  const [apagar, setApagar] = useState(true)
  const ativas = estado.materias.filter((m) => !m.arquivada)
  const pendentes = estado.tarefas.filter((t) => !t.feita && ativas.some((m) => m.id === t.materiaId)).length
  return (
    <Modal titulo={`Começar o semestre ${novo || novoPadrao}`} aoFechar={aoFechar}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          void window.api.virarSemestre(novo, apagar).then(aoFechar)
        }}
      >
        <p className="modal__texto">
          {ativas.length === 0
            ? 'Não há matérias para arquivar.'
            : `Estas matérias vão para as arquivadas: ${ativas.map((m) => m.nome).join(', ')}. Horas, notas e sessões ficam no histórico.`}
        </p>
        <label>
          Nome do novo semestre
          <input className="campo" value={novo} onChange={(e) => setNovo(e.target.value)} />
        </label>
        {pendentes > 0 && (
          <label className="opcao">
            <input type="checkbox" className="marcar" checked={apagar} onChange={(e) => setApagar(e.target.checked)} />
            Tirar do plano as {pendentes} {pendentes === 1 ? 'tarefa não feita' : 'tarefas não feitas'} dessas matérias
          </label>
        )}
        <div className="form__botoes">
          <button type="button" className="tecla tecla--pequena" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" className="tecla tecla--pequena tecla--ambar" disabled={!novo.trim()}>
            Arquivar e começar
          </button>
        </div>
      </form>
    </Modal>
  )
}
