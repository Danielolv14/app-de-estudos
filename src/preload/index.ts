// Ponte segura entre as telas e o processo principal: só estas funções ficam visíveis no React.
import { contextBridge, ipcRenderer, webUtils } from 'electron'
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
  abrirPrincipal: chamar('janela:principal') as Api['abrirPrincipal'],
  arquivarMateria: chamar('materia:arquivar') as Api['arquivarMateria'],
  virarSemestre: chamar('semestre:virar') as Api['virarSemestre'],

  testarIa: chamar('ia:testar') as Api['testarIa'],
  cancelarIa: chamar('ia:cancelar') as Api['cancelarIa'],
  limparIa: chamar('ia:limpar') as Api['limparIa'],
  escolherClaude: chamar('ia:escolherClaude') as Api['escolherClaude'],

  escolherModelo: chamar('simulado:escolherModelo') as Api['escolherModelo'],
  gerarSimulado: chamar('simulado:gerar') as Api['gerarSimulado'],
  iniciarSimulado: chamar('simulado:iniciar') as Api['iniciarSimulado'],
  terminarSimulado: chamar('simulado:terminar') as Api['terminarSimulado'],
  removerSimulado: chamar('simulado:remover') as Api['removerSimulado'],
  adicionarFotos: chamar('simulado:adicionarFotos') as Api['adicionarFotos'],
  escolherFotos: chamar('simulado:escolherFotos') as Api['escolherFotos'],
  removerFoto: chamar('simulado:removerFoto') as Api['removerFoto'],
  corrigirSimulado: chamar('simulado:corrigir') as Api['corrigirSimulado'],
  miniatura: chamar('simulado:miniatura') as Api['miniatura'],
  // Desde o Electron 32 o File não traz mais o caminho: só o webUtils sabe.
  caminhoDe: (arquivo: File) => webUtils.getPathForFile(arquivo),

  escolherPdf: chamar('plano:escolherPdf') as Api['escolherPdf'],
  lerPlano: chamar('plano:ler') as Api['lerPlano'],
  aplicarLeitura: chamar('plano:aplicarLeitura') as Api['aplicarLeitura'],
  descartarLeitura: chamar('plano:descartarLeitura') as Api['descartarLeitura'],
  replanejar: chamar('plano:replanejar') as Api['replanejar'],
  aplicarProposta: chamar('plano:aplicarProposta') as Api['aplicarProposta'],
  descartarProposta: chamar('plano:descartarProposta') as Api['descartarProposta'],

  conectarCanvas: chamar('canvas:conectar') as Api['conectarCanvas'],
  desconectarCanvas: chamar('canvas:desconectar') as Api['desconectarCanvas'],
  sincronizarCanvas: chamar('canvas:sincronizar') as Api['sincronizarCanvas'],
  ligarCursoCanvas: chamar('canvas:ligarCurso') as Api['ligarCursoCanvas'],
  aplicarRevisaoCanvas: chamar('canvas:aplicarRevisao') as Api['aplicarRevisaoCanvas'],
  ignorarRevisaoCanvas: chamar('canvas:ignorarRevisao') as Api['ignorarRevisaoCanvas'],
  arquivosCanvas: chamar('canvas:arquivos') as Api['arquivosCanvas'],
  baixarCanvas: chamar('canvas:baixar') as Api['baixarCanvas'],

  aula: chamar('aula:ler') as Api['aula'],
  montarAula: chamar('aula:montar') as Api['montarAula'],
  perguntarAula: chamar('aula:perguntar') as Api['perguntarAula'],
  maisExercicios: chamar('aula:maisExercicios') as Api['maisExercicios'],
  marcarExercicio: chamar('aula:marcar') as Api['marcarExercicio'],
  removerAula: chamar('aula:remover') as Api['removerAula'],
  escolherMaterialAula: chamar('aula:escolherMaterial') as Api['escolherMaterialAula'],
  escolherFotosAula: chamar('aula:escolherFotos') as Api['escolherFotosAula'],
  miniaturaAula: chamar('aula:miniatura') as Api['miniaturaAula'],
  limparConversaAula: chamar('aula:limparConversa') as Api['limparConversaAula'],
  fotoDaCamera: chamar('aula:fotoCamera') as Api['fotoDaCamera'],
  prepararDitado: chamar('aula:prepararDitado') as Api['prepararDitado'],
  ditar: chamar('aula:ditar') as Api['ditar'],
  abrirIdiomasDoWindows: chamar('aula:abrirIdiomas') as Api['abrirIdiomasDoWindows'],
  salvarAulaNoVault: chamar('aula:salvarNoVault') as Api['salvarAulaNoVault']
}

contextBridge.exposeInMainWorld('api', api)
