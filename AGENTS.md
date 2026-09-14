# Haru — ambiente de migração

## Escopo
- Trabalhar exclusivamente no site, backend e banco de dados do Haru.
- Este ambiente pertence ao fork `uzoom333/HaruSite-migration`.
- O repositório `Aeromorto/HaruSite` é somente referência: não fazer push, merge, deploy ou alterações administrativas nele.
- Desenvolver a migração na branch `migration/stack`; publicar alterações somente no fork.
- Não reutilizar credenciais ou recursos de produção para o ambiente de migração.

## Continuidade
- Ler `docs/MIGRATION.md` e `docs/REQUIREMENTS.md` antes de começar o trabalho.
- Atualizar esse documento com decisões confirmadas, validações, pendências e próximo passo ao concluir cada etapa.
- Não registrar segredos ou dados pessoais na documentação.
- Separar fatos confirmados de propostas; a stack escolhida é Next.js, NestJS, TypeScript, Tailwind CSS e daisyUI, com SQLite (dialeto do Cloudflare D1) adotado desde 14/09/2026, em substituição ao PostgreSQL.

## Validação
- Usar Node.js 22.13+ ou 24. Instalação: `npm ci --ignore-scripts`; banco: `npm run db:migrate` (o SQLite é um arquivo, não há serviço a subir).
- Não usar transação interativa no código da aplicação: o D1 não a oferece. A regra vai no `WHERE` da própria escrita e o resultado se confere em `changes`.
- Validar com `npm run typecheck`, `npm test`, `npm run build` e `npm run test:e2e` conforme a alteração. Os testes usam apenas `TEST_DATABASE_FILE` terminado em `_test.db`.
- O aplicativo novo está em `apps/`; HTML/CSS/JS na raiz e em `v5.5/` são referências legadas.
- Ler `docs/API.md` para persistência e HTTP; não reexecutar o conversor de HTML sobre edições humanas.
- Executar as verificações pertinentes ao alterar código; atualizar os comandos documentados quando a stack mudar.
