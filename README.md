# CRM Flexível

CRM modular com múltiplas empresas, negociações B2B, funis, subprocessos, equipes, automações nativas e central de operações configurável.

## Vercel

A adaptação para Vercel usa API Node.js, banco Turso/libSQL e login próprio com sessão assinada. Consulte [o guia de instalação](docs/VERCEL.md). O banco e as credenciais da hospedagem anterior não são migrados automaticamente.

## Desenvolvimento

Requer Node.js 24 ou superior, incluindo `node:sqlite` para os testes e a prévia local. O motor usa as APIs nativas do Node; o adaptador Vercel utiliza @libsql/client. Execute npm install antes dos comandos abaixo.

```sh
npm run build
npm test
npm run dev
```

Abra `http://localhost:4173`. O servidor de desenvolvimento usa SQLite **em memória**, recriado a cada reinício; não é um ambiente de produção.

## Estrutura

- `web/`: interface, regras compartilhadas, Lista/Kanban e construtor visual.
- `worker/`: API Worker ESM, autorização e adaptadores de integração.
- `drizzle/`: migrações do banco D1; aplicar em ordem.
- `scripts/`: compilação e ambiente local.
- `tests/`: validação funcional e de isolamento.
- `assets/import-models/`: modelos Excel sem dados reais.

O build gera `dist/server/index.mjs` e os metadados de hospedagem. O arquivo `.openai/hosting.json` deste repositório não contém o identificador do ambiente publicado; registre um ambiente próprio antes de publicar por Sites. A hospedagem de produção precisa fornecer a binding D1 `DB` e uma identidade autenticada confiável.

## Recursos

- Funis por empresa, Lista/Kanban, detalhes das negociações e resultados de venda/perda.
- Subprocessos com encaminhamento e retorno ao funil original.
- Equipes e distribuição comercial, tarefas, cadências e automações nativas.
- Auditoria, identidade visual por empresa/tema e importação/exportação Excel de contatos e empresas.
- Central de operações: modelos de processos, campos e relacionamentos, aprovações, indicadores, filiais, documentos TXT e recorrências.
- Perfis master, administrador e analista, com prévias somente leitura para o master.

## Configuração e limites atuais

**Autorização:** configure `CRM_MASTER_USER_ID` com o identificador autenticado do proprietário, fornecido pela hospedagem. Sem essa configuração, o sistema permanece em modo de configuração e concede o contexto master à sessão. Não exponha esse modo a usuários não confiáveis. Cabeçalhos de identidade devem ser fornecidos exclusivamente pelo gateway autenticado; não aceite cabeçalhos arbitrários da Internet.

**Integrações:** WhatsApp, ERP externo, bancos e emissão fiscal exigem provedores, rotas e credenciais próprios. Credenciais devem ficar no servidor. O adaptador de WhatsApp oficial está preparado, mas não há conexão ativa, espelhamento via QR Code ou suporte operacional completo a múltiplos números.

**Agendamento:** existe processamento nativo por requisição/tick e handler `scheduled`. Configure e verifique um agendador de produção antes de depender de execução com a interface fechada. Recorrências criam registros e tarefas, sem realizar cobrança bancária.

**Construtor:** sugestões por modelos e palavras-chave; não há IA generativa conectada. A gestão de contas/estoque é operacional básica e não substitui um ERP fiscal/contábil completo.

Este repositório contém código, modelos e dados fictícios dos testes. Não inclui base de clientes, banco de produção, tokens ou histórico de conversas. A publicação do código no GitHub não transfere o banco nem hospeda a API em GitHub Pages.
