// Encerrar a sessão. Com a meta batida é só confirmar; antes dela, a trava pede a frase digitada.
// Nos dois casos dá para deixar um check-in de uma linha (o que fez e onde travou).
import { useEffect, useState, type FormEvent } from 'react'
import { fraseConfere, formatarDuracao } from '@shared/regras'
import type { Tarefa } from '@shared/tipos'
import type { SituacaoTrava } from '../../../preload/api'
import { Led, Modal } from './Basicos'
import { IconeCadeado } from './Icones'

export function Encerrar({ tarefa, aoFechar }: { tarefa: Tarefa | undefined; aoFechar: () => void }) {
  const [trava, setTrava] = useState<SituacaoTrava | null>(null)
  const [frase, setFrase] = useState('')
  const [feita, setFeita] = useState(false)
  const [feito, setFeito] = useState('')
  const [travou, setTravou] = useState('')
  const [erro, setErro] = useState('')

  useEffect(() => {
    void window.api.trava().then((t) => {
      setTrava(t)
      setFeita(t.livre)
    })
  }, [])

  if (!trava) return null
  const confere = trava.livre || fraseConfere(frase, trava.frase)

  async function encerrar() {
    if (!confere) return
    const r = await window.api.encerrar({ frase, marcarFeita: feita, feito, travou })
    if (r.ok) aoFechar()
    else setErro('A frase não confere. Digite exatamente o texto acima (acentos e maiúsculas tanto faz).')
  }

  const checkin = (focar: boolean) => (
    <div className="form checkin">
      <label>
        O que você fez (opcional)
        <input
          className="campo"
          autoFocus={focar}
          value={feito}
          onChange={(e) => setFeito(e.target.value)}
          maxLength={300}
          placeholder="Ex.: 3.9, exercícios 1 a 13"
        />
      </label>
      <label>
        Onde travou (opcional)
        <input
          className="campo"
          value={travou}
          onChange={(e) => setTravou(e.target.value)}
          maxLength={300}
          placeholder="Ex.: montar a equação do exercício 13"
        />
      </label>
    </div>
  )

  const marcar = tarefa && (
    <label className="opcao" style={{ margin: '14px 0 4px' }}>
      <input type="checkbox" className="marcar" checked={feita} onChange={(e) => setFeita(e.target.checked)} />
      Terminei a tarefa “{tarefa.titulo}”
    </label>
  )

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    void encerrar()
  }

  if (trava.livre) {
    return (
      <Modal titulo="Encerrar a sessão" aoFechar={aoFechar}>
        <form onSubmit={enviar}>
          <p className="modal__texto">
            {trava.metaMin > 0
              ? `Meta de hoje batida: ${formatarDuracao(trava.estudadoMs)} de ${formatarDuracao(trava.metaMin * 60_000)}. O Instagram e o WhatsApp voltam a funcionar.`
              : `Hoje não tinha meta. Você estudou ${formatarDuracao(trava.estudadoMs)}. O Instagram e o WhatsApp voltam a funcionar.`}
          </p>
          {checkin(true)}
          {marcar}
          <div className="modal__botoes">
            <button type="button" className="tecla tecla--pequena" onClick={aoFechar}>
              Continuar estudando
            </button>
            <button type="submit" className="tecla tecla--pequena tecla--ambar">
              Encerrar a sessão
            </button>
          </div>
        </form>
      </Modal>
    )
  }

  return (
    <Modal aoFechar={aoFechar}>
      <form onSubmit={enviar}>
        <div className="cabecalho-trava">
          <Led aceso cor="vermelho" />
          <h2>Trava ligada</h2>
        </div>
        <p className="modal__texto">
          Faltam {formatarDuracao(trava.faltamMin * 60_000)} para a meta de hoje ({formatarDuracao(trava.estudadoMs)} de{' '}
          {formatarDuracao(trava.metaMin * 60_000)}). Para encerrar agora, digite a frase:
        </p>
        <p className="frase-alvo">{trava.frase}</p>
        <textarea
          className="campo-area"
          autoFocus
          value={frase}
          onChange={(e) => {
            setFrase(e.target.value)
            setErro('')
          }}
          onPaste={(e) => e.preventDefault()}
          onDrop={(e) => e.preventDefault()}
          placeholder="Digite a frase aqui (colar não funciona)"
          aria-label="Frase para encerrar antes da meta"
        />
        {erro && <p style={{ color: 'var(--vermelho)', margin: '8px 0 0' }}>{erro}</p>}
        {checkin(false)}
        {marcar}
        <div className="modal__botoes">
          <button type="submit" className="tecla tecla--pequena" disabled={!confere}>
            <IconeCadeado tamanho={15} />
            Encerrar antes da meta
          </button>
          <button type="button" className="tecla tecla--pequena tecla--ambar" onClick={aoFechar}>
            Voltar a estudar
          </button>
        </div>
      </form>
    </Modal>
  )
}
