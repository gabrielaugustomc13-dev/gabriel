# Publicar o CRM na Vercel

Esta adaptação hospeda o frontend e a API na Vercel. O banco durável é Turso/libSQL, separado das funções: nenhum dado de produção fica em SQLite local, memória ou /tmp. O motor nativo e o isolamento entre master, administrador e analista são preservados.

## 1. Preparar o banco

Crie um banco **novo e vazio** no Turso e obtenha a URL libsql:// e um token com permissão de leitura/escrita. Não use o mesmo banco para testes/previews e produção. As migrações de drizzle/ são aplicadas em uma transação e registradas por checksum na primeira requisição. A aplicação não deve receber um banco com tabelas já criadas manualmente e sem o registro de migrações.

O banco D1 da hospedagem anterior não é transferido pelo GitHub. O ambiente antigo permanece separado e não é modificado por esta adaptação.

## 2. Gerar login e chave de sessão

Em um computador com Node.js 24, dentro do projeto:

    npm install
    npm run auth:user -- --id master --login seu-email
    npm run auth:secret

O primeiro comando pede a senha sem exibi-la e imprime um objeto com id, login e passwordHash. Use uma senha longa e exclusiva. O segundo imprime uma chave aleatória para CRM_SESSION_SECRET. Não envie senhas, tokens ou chaves pelo chat e não faça commit de arquivos .env.

## 3. Importar o repositório na Vercel

Após incorporar a pull request, importe o repositório pelo painel Vercel. Root Directory: raiz do projeto; framework: Other. A configuração versionada seleciona:

- Build Command: npm run build:vercel
- Output Directory: public
- Node.js: 24.x
- Uma função Node para /api/*, com timeout máximo de 60 segundos.

O build não conecta ao banco e não exige segredos de produção.

## 4. Configurar variáveis de ambiente

Cadastre em Vercel > Project > Settings > Environment Variables:

| Variável | Valor |
| --- | --- |
| APP_URL | Origem HTTPS exata do deploy, por exemplo https://seu-crm.vercel.app, sem caminhos |
| TURSO_DATABASE_URL | URL do banco Turso |
| TURSO_AUTH_TOKEN | Token do banco; segredo |
| CRM_MASTER_USER_ID | master, ou o mesmo ID de proprietário que você decidiu manter na migração |
| CRM_MASTER_LOGIN | O login usado para gerar o hash |
| CRM_MASTER_PASSWORD_HASH | O campo passwordHash impresso pelo comando, inteiro |
| CRM_SESSION_SECRET | Chave aleatória gerada; ao trocar, todas as sessões expiram |
| CRM_AUTH_USERS_JSON | [] inicialmente; depois, lista de usuários autorizados com id, login, name e passwordHash |
| CRON_SECRET | Opcional: outra chave aleatória longa, com pelo menos 32 caracteres |

O arquivo .env.example contém somente nomes e valores de exemplo. Cadastre credenciais como variáveis sensíveis. Após ajustar APP_URL e as variáveis, faça Redeploy. Para preview, use APP_URL e banco próprios daquele ambiente.

Sem configuração válida, a API responde 503 e não concede acesso master automaticamente.

## 5. Entrar e liberar os demais usuários

Abra /login.html no endereço Vercel. Entre com o login e senha configurados. O login master acessa todas as empresas do novo banco.

Para cada administrador ou analista, gere um objeto com npm run auth:user usando um ID único e estável e acrescente o objeto à lista CRM_AUTH_USERS_JSON. Redeploy aplica a lista. Esse cadastro autoriza a autenticação, mas não concede acesso aos dados sozinho.

No CRM, use Acessos da empresa para vincular exatamente aquele ID a uma empresa/perfil; analistas também precisam de um usuário comercial. Remover o objeto do ambiente ou alterar seu passwordHash invalida as sessões correspondentes. Revogar o vínculo no CRM bloqueia o acesso aos dados imediatamente.

A sessão dura até oito horas e fica em cookie HttpOnly, Secure, SameSite=Strict. A API deriva a identidade da sessão assinada e descarta cabeçalhos de identidade enviados pelo cliente. Login tem limite de tentativas por IP, mantido no banco. Mudanças exigem Origin correspondente a APP_URL.

## 6. Dados do ambiente anterior

Antes de qualquer transição, exporte os dados JSON de cada empresa e mantenha o CRM anterior como referência. Uma nova instalação inicia em um banco diferente; o deploy não migra dados, membros, auditoria ou histórico WhatsApp automaticamente.

Não troque o endereço usado pela equipe antes de importar e conferir os dados em uma migração específica. O código do construtor e das automações já acompanha esta adaptação; a base real ainda precisa de uma transferência validada.

## 7. Cron e integrações

vercel.json define uma chamada diária às 12:00 UTC (09:00 em São Paulo) para /api/cron. O endpoint só executa com o Bearer CRON_SECRET. Verifique no painel a criação e os resultados do cron; disponibilidade, precisão do horário e limites dependem do plano Vercel. A requisição aguarda o processamento antes de terminar.

O motor atual processa até 100 empresas por rodada. Esta rotina diária é adequada para manutenção diária e recorrências; não garante tarefas com SLA de 15 minutos nem follow-up com precisão de minutos com o CRM fechado. Para isso, será necessário ajustar frequência/particionamento conforme o plano e validar as execuções.

WhatsApp, ERP externo, bancos e emissão fiscal permanecem dependentes de configuração própria. Esta alteração não conecta números nem ativa envio de mensagens. O adaptador Meta existente continua sem webhook público isolado habilitado.

## 8. Validação antes de usar com clientes

    npm run build
    npm test
    npm run build:vercel
    npm run test:vercel

Os testes Vercel usam libSQL local temporário e cobrem migrações, rollback, CAS, sessões, adulteração de identidade, origem, limite de login, perfis, isolamento e cron. Não usam credenciais reais.

No deploy de preview, confira: login, logout, criação de empresa, cadastro de usuário comercial, gravação após recarregar, acesso de administrador à própria empresa, acesso de analista apenas às suas negociações e rejeição de sessão expirada.

A implantação na Vercel depende da importação do projeto e das variáveis acima. Código adaptado não equivale a um deploy já publicado.
