# App de Estudos

App de desktop (Windows) para focar nos estudos: timer que conta o tempo estudado, plano por dia, calendário de provas
e bloqueio de Instagram, WhatsApp Web e jogos enquanto a sessão estiver aberta. Especificação completa em
[ESPECIFICACAO.md](ESPECIFICACAO.md).

## Como funciona

- **Timer:** conta para cima, ligado a uma tarefa do plano. Pausar não desbloqueia nada.
- **Meta do dia:** soma das horas previstas nas tarefas do dia (dá para ajustar na tela Plano).
- **Trava:** antes de bater a meta, encerrar pede uma frase digitada (colar não funciona).
- **Check-in:** ao encerrar, dois campos opcionais (o que fez e onde travou) ficam guardados na sessão, aparecem na
  tela Plano e vão para o resumo do vault.
- **Notas:** a tela Notas mostra quanto falta para chegar a 60 em cada matéria e calcula a meta de cada avaliação
  que falta. Uma meta escrita à mão vale como fixa; a reavaliação entra no lugar da prova de menor nota quando isso
  ajuda.
- **Tarefas atrasadas:** um botão passa a tarefa para hoje ou para o próximo dia que já tem tarefa da mesma matéria.
- **Bloqueio de sites:** um serviço do Windows (tarefa agendada que roda como SYSTEM) mantém um bloco no arquivo
  `hosts` enquanto a sessão estiver aberta. O app só escreve um pedido em `C:\ProgramData\AppDeEstudos\pedido.json`;
  o serviço aceita apenas nomes de domínio e sempre aponta para `0.0.0.0`.
- **Abas já abertas:** o hosts não derruba conexões abertas, então o app reinicia o Brave (e o Chrome, se estiver
  aberto) no começo da sessão, restaurando as abas.
- **Brave:** enquanto bloqueia, o serviço liga duas políticas em `HKLM\SOFTWARE\Policies\BraveSoftware\Brave`. A
  `TorDisabled` tira a janela privada com Tor, e a `DnsOverHttpsMode=off` tira o DNS seguro. As duas furariam o
  hosts. Ao liberar, ele tira as duas (no Chrome, só a do DNS). Por isso o Brave mostra "gerenciado pela sua
  organização" durante a sessão.
- **Atualizar o serviço:** o script do serviço fica em `C:\Program Files\App de Estudos - Bloqueio` e não muda
  quando o app é atualizado. Se o script novo for de outra versão (`$VersaoServico`), a tela Ajustes pede para
  clicar em **Reinstalar**.
- **Apps do PC:** durante a sessão, um PowerShell em segundo plano fecha WhatsApp Desktop, Steam, Epic, Riot e
  qualquer programa aberto de dentro das pastas de jogos.
- **Resumo no Obsidian:** o app reescreve `02-Areas/Painel de estudos (app).md` no vault a cada mudança.
- **Constância:** mapa de calor das horas por dia, sequência de dias com a meta cumprida (dia sem meta não quebra)
  e planejado x feito por semana.
- **Semestre:** em Ajustes, "Começar o próximo" arquiva as matérias de agora (somem das listas, o histórico fica) e
  pode apagar as tarefas pendentes delas. A semana padrão (que matéria entra em cada dia) também fica em Ajustes.

### IA, pelo Claude Code

O simulado, a correção por foto, a leitura do plano de ensino e o replanejamento usam o **Claude Code instalado no
PC** (`claude -p`), com a assinatura do Daniel. Não tem chave de API.

- **Login:** o Claude Code de linha de comando tem login próprio, separado do app desktop. Uma vez só, rode
  `claude auth login` num terminal e depois clique em **Ajustes > Testar**.
- **Modo restrito:** cada chamada usa `--restricted` (ignora os arquivos de configuração do usuário, então os hooks
  não rodam), `--tools Read`, `--strict-mcp-config` e `--json-schema`. A IA só lê os arquivos da pasta da tarefa
  (`%APPDATA%\App de Estudos\ia\...` ou `simulados\<id>`), não roda comando e não edita nada. O pedido vai pela
  entrada padrão, e o app tira do ambiente as variáveis `CLAUDE*` e `ANTHROPIC*` (uma chave de API esquecida faria a
  chamada ser cobrada na API).
- **Uma tarefa por vez**, com tempo limite (de 2 a 12 min) e botão de cancelar. Cada uso fica na tabela `ia_usos`.
- **Nada entra sem revisão:** o simulado e a correção são estimativas da IA. A leitura do PDF aparece no
  Calendário para conferir antes de aplicar, e o replanejamento aparece no Plano com o antes e depois de cada
  mudança, para marcar o que aplicar. Tudo o que a IA devolve passa por `src/shared/respostas-ia.ts`, que descarta o
  que não dá para aplicar (tarefa que não existe, data no passado, nota maior que o valor da questão).
- **Simulado:** a IA monta a prova a partir do conteúdo da avaliação (campo "O que cai" do calendário), com a
  resolução de cada questão escondida até a prova acabar. "Começar" abre uma sessão de estudo com cronômetro. As
  fotos da folha entram arrastando para a tela (JPG, PNG ou WEBP; HEIC não). A nota e os pontos fracos vão para o
  check-in e para o resumo do vault, e as sugestões viram tarefas do plano.

### Canvas da PUC

O app lê o Canvas (`https://pucminas.instructure.com`, pela API REST v1) com um token pessoal que o aluno cria em
**Conta > Configurações > + Novo token de acesso** e cola em **Ajustes > Canvas da PUC**. Só leitura.

- **Token:** criptografado com o `safeStorage` do Electron (DPAPI do Windows) no kv `canvas_token`. Ele só é enviado
  para o endereço do Canvas: links de paginação ou de download de outra origem não levam o cabeçalho. Não aparece em
  tela, log, resumo do vault nem mensagem de erro.
- **Sincronia:** 20 s depois de abrir e a cada 6 horas (ou em "Atualizar do Canvas", no Calendário). Busca os cursos
  ativos, as atividades de cada um (com a nota, quando publicada) e as provas do calendário.
- **Ligações:** kv `canvas_vinculos` (`curso:ID` → matéria, `tarefa:ID` ou `evento:ID` → evento; 0 = ignorado). O que
  já está ligado tem a data, o valor e a nota atualizados sozinhos, com um aviso. O que é novo vai para uma revisão no
  Calendário (kv `revisao_canvas`), onde se escolhe a matéria de cada curso, o que entra e com qual avaliação já
  existente juntar (para não duplicar).
- **PDFs:** "Pegar do Canvas" no plano de ensino e "Material de aula do Canvas" no simulado (até 4 PDFs, que a IA lê
  para seguir a notação do professor). Quando o curso esconde a aba Arquivos, a lista vem dos módulos. Os PDFs ficam
  em `%APPDATA%\App de Estudos\canvas\`.
- Código: `src/main/canvas.ts` (cliente), `src/main/sincronia-canvas.ts` (sincronia e revisão),
  `src/shared/canvas.ts` (comparação, sem rede) e `src/renderer/src/componentes/Canvas.tsx` (telas).

## Rodar

Precisa do Node 24 (`.nvmrc`). Com o nvm-windows: `nvm use 24.14.0`.

```bash
npm install
```

```bash
npm run dev
```

## Testes

```bash
npm test
```

Cobrem as regras (timer, meta, trava, lembrete), a calculadora de nota, o banco (inclusive a atualização de um
banco da v1.0), a sessão, o resumo do vault, o serviço de bloqueio
(rodando o `.ps1` de verdade contra um `hosts` falso) e o vigia de apps (com `ping` no lugar de um app real).
A IA é testada sem chamar o Claude: o executor roda um "claude" falso (um script do Node), e o assistente usa
respostas de mentira. Também cobrem a validação das respostas, o replanejamento e o plano de ensino aplicados, a
virada de semestre e a constância.

Capturas de tela sem tocar no bloqueio nem nos seus dados:

```bash
npm run build && npx electron . --dados=%TEMP%\estudos-teste --captura=%TEMP%\capturas --agora=2026-11-10T15:12 --captura-sessao --captura-ia
```

`--captura-ia` põe dados de mentira (simulado corrigido, proposta de replanejamento, plano de ensino lido e três
semanas de estudo) para conferir as telas da IA.

## Gerar o instalador

```bash
npm run instalador
```

Sai em `dist/App-de-Estudos-<versão>-instalador.exe`. Depois de instalar, abra **Ajustes > Instalar o bloqueio**
(o Windows pede permissão de administrador uma vez).

## Estrutura

| Pasta | O quê |
|---|---|
| `src/shared` | Tipos e regras puras (timer, meta, trava, lembrete, notas, constância, validação das respostas da IA, resumo do vault) |
| `src/main` | Processo principal do Electron: banco (sql.js), sessão, bloqueio, lembrete, IA (`claude.ts`, `assistente.ts`, `prompts.ts`, `planejamento.ts`), janelas e bandeja |
| `src/preload` | Ponte segura entre as telas e o processo principal |
| `src/renderer` | Telas em React: Foco, Plano, Calendário, Notas, Simulado, Constância, Ajustes e o mini-timer |
| `servico` | Scripts PowerShell do serviço de bloqueio (instalar, rodar, desinstalar) |
| `testes` | Testes com Vitest |
