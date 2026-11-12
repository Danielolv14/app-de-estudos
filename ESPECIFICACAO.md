# App de Estudos — especificação

Decidida no grill-me de 2026-11-08. App de desktop para o PC pessoal (Windows) que ajuda a focar nos estudos: plano montado por IA a partir dos PDFs das matérias, calendário de provas, timer que conta o tempo estudado e bloqueio de distrações.

## Decisões

| Tema | Decisão |
|---|---|
| Stack | Electron + React + TypeScript, dados em SQLite local (`%APPDATA%`). Inicia com o Windows, na bandeja. |
| Onde roda | Só no PC pessoal. O estágio é presencial só na segunda, que é folga dos estudos; de terça a sexta é remoto, no PC pessoal. |
| Bloqueio de sites | Arquivo `hosts` do Windows: Instagram e WhatsApp Web apontam para `0.0.0.0`. Vale para qualquer navegador. |
| Permissão de admin | Um serviço do Windows instalado uma vez (único pedido de admin, na instalação). Na prática é uma tarefa agendada que roda como SYSTEM. O app fala com ele por arquivo: escreve `pedido.json` em `C:\ProgramData\AppDeEstudos` e lê a resposta em `status.json`. Fechar o app não desbloqueia, e o estado fica salvo em disco: se o PC reiniciar no meio da sessão, continua bloqueado. |
| Navegador | O Daniel usa o **Brave** (definido em 2026-11-08). Ao iniciar a sessão, o app fecha o Brave normalmente e reabre com `--restore-last-session`. Faz o mesmo com o Chrome, se estiver aberto. As abas voltam, e Instagram e WhatsApp Web não conectam mais. Enquanto bloqueia, o serviço tira do Brave a janela privada com Tor e o DNS seguro, pelas políticas `TorDisabled` e `DnsOverHttpsMode`, porque os dois furariam o hosts. |
| Apps do PC | Durante a sessão, o serviço fecha WhatsApp Desktop, Steam (e os jogos), Epic Games e Riot Client se forem abertos. O Discord fica liberado. A lista é editável. |
| Timer | Conta para cima (nada de Pomodoro). Fica ligado a uma tarefa do plano: as horas vão para a matéria e, ao terminar, a tarefa é marcada como feita. |
| Pausa | Continua bloqueado. O tempo pausado não conta como estudo e aparece no histórico ("2h10 estudando, 15 min de pausa"). |
| Meta do dia | Vem do plano: cada dia tem as tarefas e uma estimativa de horas, que dá para ajustar. Em dia de folga a meta é zero. |
| Trava | Forte: só libera quando a meta do dia for batida. Para sair antes, é preciso digitar uma frase longa, com os dias que faltam para a próxima avaliação **da matéria da sessão** e o nome dela (corrigido em 2026-11-11: antes pegava a de qualquer matéria). |
| IA | **Claude Code do PC** (`claude -p`), com a assinatura do Daniel, sem chave de API (mudou em 2026-11-08: antes era a API da Anthropic). Roda em modo restrito, só lendo os arquivos da pasta da tarefa. Recebe o **PDF do plano de ensino** e devolve as provas, as datas e as aulas para o calendário. O replanejamento encaixa o plano diário na semana padrão. Tudo passa por revisão antes de entrar. |
| Lembrete | Horário fixo por dia da semana (ex.: ter, qua e qui às 14h). Uma notificação mostra a tarefa do dia e se repete a cada 15 min até o timer começar ou o lembrete ser adiado. |
| Obsidian | O app é o dono dos dados e regenera sozinho uma nota de resumo no vault (plano, provas, horas por matéria), para o Claude Code continuar enxergando tudo. |
| Visual | Escuro, com profundidade e sombras de verdade (nada chapado). Timer grande no centro, uma cor por matéria e a contagem regressiva das provas no topo. Mais um mini-timer flutuante, sempre por cima das outras janelas. |

## Features extras escolhidas
- **Simulado pela IA:** cronometrado, no estilo da prova, a partir do conteúdo. A resolução é feita no papel, e a foto da folha é corrigida passo a passo.
- **Calculadora de nota:** com as notas lançadas, mostra quanto falta tirar em cada prova para chegar a 60 de 100.
- **Check-in no fim da sessão:** uma linha com o que foi feito e onde travou, que a IA usa para replanejar.
- **Painel de constância:** mapa de calor das horas por dia, sequência de dias cumpridos e relatório da semana (planejado x feito).
- **Lembrete** e **bloqueio de apps do PC** (descritos acima).

Ficaram de fora: caderno de erros e contador de tentativas.

**Bloqueio agendado (pedido em 2026-11-08, feito em 2026-11-11):** o bloqueio de sites e apps liga sozinho em dias e horários configurados no app, mesmo sem o timer rodando.
- Os dias e horários são editáveis em Ajustes. O padrão é de segunda a sexta, das 13:50 às 18:00 (10 min antes do lembrete das 14h).
- Dentro do horário, só termina antes do fim se a meta do dia for batida, pela mesma regra da trava. Em dia sem meta, não bloqueia.
- Enquanto houver bloqueio (sessão ou agendado), a agenda fica travada em Ajustes e as listas de sites e apps só aceitam acréscimos.
- Sessão encerrada antes da meta dentro do horário: o bloqueio continua até o fim do horário.
- Quem liga é o app (que começa junto com o Windows), não o serviço. Durante o horário, "Sair" da bandeja e "Remover" o bloqueio ficam recusados.

## Entregas
Em 2026-11-08 a ordem mudou para seguir o calendário das provas: o plano do semestre já estava importado, então ler o PDF do plano de ensino só ajuda no começo de 2027/1.

1. **v1, o núcleo (pronta em 2026-11-08):** o app com bandeja e mini-timer; timer, pausa, meta e trava; o serviço de bloqueio (hosts, apps do PC e reinício do Chrome); o calendário com a contagem regressiva; o plano atual de Cálculo e Arquitetura importado da nota "Rotina de estudos"; o lembrete; o resumo no vault.
2. **v1.1 (até 15/11, sem IA):** calculadora de nota, check-in no fim da sessão e botão para mover uma tarefa atrasada para o próximo dia da matéria.
3. **v1.2 (feita em 2026-11-08, adiantada):** a IA pelo Claude Code e o simulado com correção por foto, a tempo dos simulados de 25/11 e 02/12.
4. **v1.3 (feita em 2026-11-08, adiantada):** virada de semestre, semana padrão, a IA lendo o PDF do plano de ensino (com revisão antes de aplicar), o replanejamento (com o antes e depois de cada mudança) e o painel de constância.
5. **v1.4 (feita em 2026-11-08):** conexão com o Canvas da PUC: matérias, atividades, provas e notas com revisão antes de entrar no calendário, e os PDFs dos cursos no plano de ensino e no simulado.

## Decidido por padrão (não perguntado)
- Modelo da IA: Opus (o mais capaz para conferir conta e ler letra à mão). Conta no limite da assinatura do Claude, não em dinheiro. Dá para trocar para o Sonnet em Ajustes.
- Node: o 18 instalado está fora de suporte. Usar o LTS atual via nvm.
- O mini-timer e a bandeja ficam sempre ativos. Fechar a janela só minimiza.

## Limites conhecidos
- Não bloqueia o celular. Para ele, use o Bem-estar digital (Android) ou o Tempo de Uso (iPhone).
- Só o Brave e o Chrome são reiniciados. Outro navegador com a aba já aberta continua conectado até recarregar a página (as conexões novas são bloqueadas em qualquer navegador).
- Uma VPN ou um proxy que resolva os endereços fora do PC passa por cima do hosts.
- Durante a sessão, as listas de sites e apps só aceitam acréscimos (tirar um item furaria o bloqueio). O processo principal garante isso, não só a tela.
- O serviço só libera os sites com um pedido bem formado. Se o `pedido.json` sumir ou vier quebrado, o bloqueio fica como estava. Se o serviço não responder ao encerrar, o app avisa (não finge que liberou), e o pedido fica salvo para quando ele voltar.
- Com a sessão contando, o app pede ao Windows para não dormir sozinho (a tela ainda apaga), porque o Daniel resolve exercício no papel. Se o PC dormir mesmo assim (tampa fechada, suspender), esse tempo não conta e a sessão volta pausada.
- Quem tem admin no PC consegue desfazer o bloqueio. A trava serve contra o impulso, não contra a decisão de parar.
- A nota do simulado é uma estimativa: a IA pode errar conta ou ler mal a letra. A tela diz isso e mostra o que ela considerou certo e errado em cada questão.
- A IA usa o limite da assinatura do Claude. Se ele acabar, o app avisa e a tarefa fica para depois.
- O Claude Code de linha de comando precisa de login próprio (`claude auth login`), separado do app desktop do Claude.
