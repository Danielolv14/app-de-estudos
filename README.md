# App de Estudos

App de desktop (Windows) para focar nos estudos: timer que conta o tempo estudado, plano por dia, calendário de provas
e bloqueio de Instagram, WhatsApp Web e jogos enquanto a sessão estiver aberta. Especificação completa em
[ESPECIFICACAO.md](ESPECIFICACAO.md).

## Como funciona

- **Timer:** conta para cima, ligado a uma tarefa do plano. Pausar não desbloqueia nada.
- **Meta do dia:** soma das horas previstas nas tarefas do dia (dá para ajustar na tela Plano).
- **Trava:** antes de bater a meta, encerrar pede uma frase digitada (colar não funciona).
- **Bloqueio de sites:** um serviço do Windows (tarefa agendada que roda como SYSTEM) mantém um bloco no arquivo
  `hosts` enquanto a sessão estiver aberta. O app só escreve um pedido em `C:\ProgramData\AppDeEstudos\pedido.json`;
  o serviço aceita apenas nomes de domínio e sempre aponta para `0.0.0.0`.
- **Abas já abertas:** o hosts não derruba conexões abertas, então o app reinicia o Chrome no começo da sessão.
- **Apps do PC:** durante a sessão, um PowerShell em segundo plano fecha WhatsApp Desktop, Steam, Epic, Riot e
  qualquer programa aberto de dentro das pastas de jogos.
- **Resumo no Obsidian:** o app reescreve `02-Areas/Painel de estudos (app).md` no vault a cada mudança.

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

Cobrem as regras (timer, meta, trava, lembrete), o banco, a sessão, o resumo do vault, o serviço de bloqueio
(rodando o `.ps1` de verdade contra um `hosts` falso) e o vigia de apps (com `ping` no lugar de um app real).

Capturas de tela sem tocar no bloqueio nem nos seus dados:

```bash
npm run build && npx electron . --dados=%TEMP%\estudos-teste --captura=%TEMP%\capturas --agora=2026-11-10T15:12 --captura-sessao
```

## Gerar o instalador

```bash
npm run instalador
```

Sai em `dist/App-de-Estudos-<versão>-instalador.exe`. Depois de instalar, abra **Ajustes > Instalar o bloqueio**
(o Windows pede permissão de administrador uma vez).

## Estrutura

| Pasta | O quê |
|---|---|
| `src/shared` | Tipos e regras puras (timer, meta, trava, lembrete, resumo do vault) |
| `src/main` | Processo principal do Electron: banco (sql.js), sessão, bloqueio, lembrete, janelas e bandeja |
| `src/preload` | Ponte segura entre as telas e o processo principal |
| `src/renderer` | Telas em React: Foco, Plano, Calendário, Ajustes e o mini-timer |
| `servico` | Scripts PowerShell do serviço de bloqueio (instalar, rodar, desinstalar) |
| `testes` | Testes com Vitest |
