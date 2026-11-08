# App de Estudos — especificação

Decidida no grill-me de 2026-11-08. App de desktop para o PC pessoal (Windows) que ajuda a focar nos estudos: plano montado por IA a partir dos PDFs das matérias, calendário de provas, timer que conta o tempo estudado e bloqueio de distrações.

## Decisões

| Tema | Decisão |
|---|---|
| Stack | Electron + React + TypeScript, dados em SQLite local (`%APPDATA%`). Inicia com o Windows, na bandeja. |
| Onde roda | Só no PC pessoal. O estágio é presencial só na segunda, que é folga dos estudos; de terça a sexta é remoto, no PC pessoal. |
| Bloqueio de sites | Arquivo `hosts` do Windows: Instagram e WhatsApp Web apontam para `0.0.0.0`. Vale para qualquer navegador. |
| Permissão de admin | Um serviço do Windows instalado uma vez (único pedido de admin, na instalação). Na prática é uma tarefa agendada que roda como SYSTEM. O app fala com ele por arquivo: escreve `pedido.json` em `C:\ProgramData\AppDeEstudos` e lê a resposta em `status.json`. Fechar o app não desbloqueia, e o estado fica salvo em disco: se o PC reiniciar no meio da sessão, continua bloqueado. |
| Abas já abertas | Ao iniciar a sessão, se o Chrome estiver aberto, o app fecha o navegador normalmente e reabre com `--restore-last-session`. As abas voltam, e Instagram e WhatsApp Web não conectam mais. |
| Apps do PC | Durante a sessão, o serviço fecha WhatsApp Desktop, Steam (e os jogos), Epic Games e Riot Client se forem abertos. O Discord fica liberado. A lista é editável. |
| Timer | Conta para cima (nada de Pomodoro). Fica ligado a uma tarefa do plano: as horas vão para a matéria e, ao terminar, a tarefa é marcada como feita. |
| Pausa | Continua bloqueado. O tempo pausado não conta como estudo e aparece no histórico ("2h10 estudando, 15 min de pausa"). |
| Meta do dia | Vem do plano: cada dia tem as tarefas e uma estimativa de horas, que dá para ajustar. Em dia de folga a meta é zero. |
| Trava | Forte: só libera quando a meta do dia for batida. Para sair antes, é preciso digitar uma frase longa (ex.: com os dias que faltam para a próxima prova). |
| IA | API da Anthropic (chave guardada com o `safeStorage` do Electron). Recebe o **PDF do plano de ensino** e devolve as provas e datas para o calendário mais um plano diário com tarefas para marcar, encaixado na semana padrão. Se um dia furar, ela replaneja. |
| Lembrete | Horário fixo por dia da semana (ex.: ter, qua e qui às 14h). Uma notificação mostra a tarefa do dia e se repete a cada 15 min até o timer começar ou o lembrete ser adiado. |
| Obsidian | O app é o dono dos dados e regenera sozinho uma nota de resumo no vault (plano, provas, horas por matéria), para o Claude Code continuar enxergando tudo. |
| Visual | Escuro, com profundidade e sombras de verdade (nada chapado). Timer grande no centro, uma cor por matéria e a contagem regressiva das provas no topo. Mais um mini-timer flutuante, sempre por cima das outras janelas. |

## Features extras escolhidas
- **Simulado pela IA:** cronometrado, no estilo da prova, a partir do conteúdo. A resolução é feita no papel, e a foto da folha é corrigida passo a passo.
- **Calculadora de nota:** com as notas lançadas, mostra quanto falta tirar em cada prova para chegar a 60 de 100.
- **Check-in no fim da sessão:** uma linha com o que foi feito e onde travou, que a IA usa para replanejar.
- **Painel de constância:** mapa de calor das horas por dia, sequência de dias cumpridos e relatório da semana (planejado x feito).
- **Lembrete** e **bloqueio de apps do PC** (descritos acima).

Ficaram de fora: caderno de erros, contador de tentativas e bloqueio agendado.

## Entregas
Em 2026-11-08 a ordem mudou para seguir o calendário das provas: o plano do semestre já estava importado, então ler o PDF do plano de ensino só ajuda no começo de 2027/1.

1. **v1, o núcleo (pronta em 2026-11-08):** o app com bandeja e mini-timer; timer, pausa, meta e trava; o serviço de bloqueio (hosts, apps do PC e reinício do Chrome); o calendário com a contagem regressiva; o plano atual de Cálculo e Arquitetura importado da nota "Rotina de estudos"; o lembrete; o resumo no vault.
2. **v1.1 (até 15/11, sem IA):** calculadora de nota, check-in no fim da sessão e botão para mover uma tarefa atrasada para o próximo dia da matéria.
3. **v1.2 (até 22/11):** chave da API e simulado com correção por foto, a tempo dos simulados de 25/11 e 02/12.
4. **v1.3 (depois de 11/12, antes das aulas de 2027/1):** virada de semestre, a IA lendo o PDF (calendário e plano diário), o replanejamento e o painel de constância.

## Decidido por padrão (não perguntado)
- Modelo da IA: Claude Opus 5.5 (o mais capaz para conferir conta e ler letra à mão; cada uso custa centavos). Dá para trocar para o Sonnet 5.5 nas configurações.
- Node: o 18 instalado está fora de suporte. Usar o LTS atual via nvm.
- O mini-timer e a bandeja ficam sempre ativos. Fechar a janela só minimiza.

## Limites conhecidos
- Não bloqueia o celular. Para ele, use o Bem-estar digital (Android) ou o Tempo de Uso (iPhone).
- Só o Chrome é reiniciado. Outro navegador com a aba já aberta continua conectado até recarregar a página (as conexões novas são bloqueadas em qualquer navegador).
- Quem tem admin no PC consegue desfazer o bloqueio. A trava serve contra o impulso, não contra a decisão de parar.
