import type { Config } from './tipos'

/** Cores disponíveis para as matérias (contraste conferido sobre o grafite do app). */
export const CORES_MATERIA = ['#7FA8FF', '#5FD3A2', '#F2C14E', '#E98AC8', '#FF8F70', '#A9B6C8']

/** O Canvas da PUC Minas. O endereço canvas.pucminas.br fica atrás de uma checagem anti-robô; a API responde neste. */
export const CANVAS_PADRAO = 'https://pucminas.instructure.com'

export const CONFIG_PADRAO: Config = {
  dominios: [
    'instagram.com',
    'www.instagram.com',
    'i.instagram.com',
    'l.instagram.com',
    'graph.instagram.com',
    'web.whatsapp.com'
  ],
  // Nomes de processo (sem .exe), como aparecem no Gerenciador de Tarefas > Detalhes.
  processos: [
    'WhatsApp',
    'WhatsApp.Root',
    'steam',
    'steamwebhelper',
    'EpicGamesLauncher',
    'EpicWebHelper',
    'RiotClientServices',
    'RiotClientUx',
    'RiotClientUxRender',
    'LeagueClient',
    'LeagueClientUx',
    'LeagueClientUxRender',
    'League of Legends',
    'VALORANT',
    'VALORANT-Win64-Shipping'
  ],
  // Qualquer programa aberto de dentro destas pastas também é fechado (pega os jogos).
  pastasBloqueadas: ['\\steamapps\\common\\', '\\Epic Games\\', '\\Riot Games\\'],
  reiniciarNavegador: true,
  lembretes: [
    { ativo: false, hora: '14:00' },
    { ativo: false, hora: '14:00' },
    { ativo: true, hora: '14:00' },
    { ativo: true, hora: '14:00' },
    { ativo: true, hora: '14:00' },
    { ativo: true, hora: '14:00' },
    { ativo: false, hora: '14:00' }
  ],
  insistirMin: 15,
  caminhoResumoVault: '',
  miniTimer: true,
  iniciarComWindows: true,
  modeloIa: 'opus',
  caminhoClaude: '',
  semanaPadrao: [],
  canvasUrl: CANVAS_PADRAO
}

/** Semestre usado quando o banco ainda não tem um (o plano inicial é de 2026/2). */
export const SEMESTRE_PADRAO = '2026/2'
