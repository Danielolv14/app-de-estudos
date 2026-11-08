import { useState, type CSSProperties } from 'react'
import type { Config, Estado, Materia } from '@shared/tipos'
import { CORES_MATERIA } from '@shared/padroes'
import { Led } from '../componentes/Basicos'
import { IconeMais } from '../componentes/Icones'

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0]

const linhas = (texto: string) =>
  texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

export function Ajustes({ estado }: { estado: Estado }) {
  const { config, bloqueio, materias } = estado
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
          <input type="checkbox" className="marcar" checked={config.reiniciarChrome} onChange={(e) => salvar({ reiniciarChrome: e.target.checked })} />
          Reiniciar o Chrome ao começar a sessão, para derrubar as abas que já estavam abertas
        </label>

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

      <section className="secao">
        <h2>Matérias</h2>
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
      <button className="botao-texto" onClick={() => void window.api.removerMateria(materia.id)}>
        Apagar
      </button>
    </div>
  )
}
