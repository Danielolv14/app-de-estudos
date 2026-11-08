// Ponte segura entre as telas e o processo principal: só estas funções ficam visíveis no React.
import { contextBridge, ipcRenderer } from 'electron'
import type { Api } from './api'

const chamar =
  (canal: string) =>
  (...args: unknown[]) =>
    ipcRenderer.invoke(canal, ...args)

const api: Api = {
  estado: chamar('estado') as Api['estado'],
  aoMudar: (fn) => {
    const ouvinte = (_e: unknown, e: Parameters<typeof fn>[0]) => fn(e)
    ipcRenderer.on('estado', ouvinte)
    return () => ipcRenderer.removeListener('estado', ouvinte)
  },
  aoNavegar: (fn) => {
    const ouvinte = (_e: unknown, tela: string) => fn(tela)
    ipcRenderer.on('navegar', ouvinte)
    return () => ipcRenderer.removeListener('navegar', ouvinte)
  },
  aoAbrirTrava: (fn) => {
    const ouvinte = () => fn()
    ipcRenderer.on('abrir-trava', ouvinte)
    return () => ipcRenderer.removeListener('abrir-trava', ouvinte)
  },
  iniciar: chamar('sessao:iniciar') as Api['iniciar'],
  pausar: chamar('sessao:pausar') as Api['pausar'],
  retomar: chamar('sessao:retomar') as Api['retomar'],
  trocarTarefa: chamar('sessao:trocarTarefa') as Api['trocarTarefa'],
  trava: chamar('sessao:trava') as Api['trava'],
  encerrar: chamar('sessao:encerrar') as Api['encerrar'],
  salvarTarefa: chamar('tarefa:salvar') as Api['salvarTarefa'],
  marcarTarefa: chamar('tarefa:marcar') as Api['marcarTarefa'],
  moverTarefa: chamar('tarefa:mover') as Api['moverTarefa'],
  removerTarefa: chamar('tarefa:remover') as Api['removerTarefa'],
  salvarEvento: chamar('evento:salvar') as Api['salvarEvento'],
  removerEvento: chamar('evento:remover') as Api['removerEvento'],
  salvarMateria: chamar('materia:salvar') as Api['salvarMateria'],
  removerMateria: chamar('materia:remover') as Api['removerMateria'],
  definirMeta: chamar('meta:definir') as Api['definirMeta'],
  salvarConfig: chamar('config:salvar') as Api['salvarConfig'],
  adiarLembrete: chamar('lembrete:adiar') as Api['adiarLembrete'],
  dispensarLembrete: chamar('lembrete:dispensar') as Api['dispensarLembrete'],
  fecharLembrete: chamar('lembrete:fechar') as Api['fecharLembrete'],
  removerAviso: chamar('aviso:remover') as Api['removerAviso'],
  instalarBloqueio: chamar('bloqueio:instalar') as Api['instalarBloqueio'],
  desinstalarBloqueio: chamar('bloqueio:desinstalar') as Api['desinstalarBloqueio'],
  escolherVault: chamar('vault:escolher') as Api['escolherVault'],
  abrirPrincipal: chamar('janela:principal') as Api['abrirPrincipal']
}

contextBridge.exposeInMainWorld('api', api)
