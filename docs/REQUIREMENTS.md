# Haru — requisitos e impacto na migração

Documento de trabalho elaborado em 2026-09-09. Não significa que as funcionalidades abaixo já estejam implementadas.

## Fonte e interpretação

Fonte local: `Levantamento de requisitos para e-commerce.csv.zip`, em Downloads, contendo um CSV com uma resposta registrada em 09/09/2026 às 10:28:44 GMT-3.
Formulário: https://forms.gle/CMNAukhBmChhb7Kn9.

Este documento registra as respostas, sem publicar o arquivo bruto. As respostas definem intenções de produto; regras incompletas permanecem explicitamente em aberto. A menção à Nuvemshop faz parte das perguntas do formulário e não confirma seu uso. A arquitetura autorizada continua Next.js + NestJS + TypeScript + Tailwind CSS + daisyUI. O PostgreSQL foi a opção anunciada no início desta migração e foi substituído por SQLite (dialeto do Cloudflare D1) em 14/09/2026; ver `MIGRATION.md`.

## Objetivo

Preservar a identidade visual da v5.5 e transformar o site estático em uma aplicação com catálogo, regras de negócio e persistência confiável, preparada para evoluir para operação comercial. Trabalhar exclusivamente no fork `uzoom333/HaruSite-migration`, branch `migration/stack`.

## Matriz de requisitos

| ID | Resposta / requisito | Impacto e decisão pendente |
| --- | --- | --- |
| RF01 | Uma ou duas variações por produto | Modelar produto e SKU separadamente; falta identificar atributos, preços, códigos e estoque inicial. |
| RF02 | Trocas por defeito de fabricação | Prever solicitação e análise de troca; detalhar processo e política antes de publicar. |
| RF03 | Reembolso após comprovação de defeito | Resposta comercial ainda incompleta; não tratar como política final nem usar para restringir outros direitos aplicáveis. |
| RF04 | Sem avaliações e comentários | Fora do escopo atual. |
| RF05 | Criar e gerenciar cupons | Validação deve acontecer na API, nunca apenas no navegador. |
| RF06 | Primeira compra, influencers e desconto no PIX | Faltam valores, cumulatividade, limites de uso e definição de primeira compra com checkout sem login. |
| RF07 | Promoções por e-mail | Exige provedor, autorização de recebimento e cancelamento de inscrição. |
| RF08 | Higiene pessoal, cuidado pessoal e utensílios de cozinha | Modelar categorias sem inventar produtos para preenchê-las. |
| RF09 | Filtro por preço | Filtrar valores em centavos; combinar com navegação de catálogo. |
| RF10 | Quantidade limitada ao estoque | Substituir o limite fixo de nove da v5.5; validar na API e prever concorrência/reservas. |
| RF11 | Gravação a laser futuramente | Evolução futura, não obrigatória para concluir esta migração. |
| RF12 | Desconto por quantidade indefinido | Não ativar regra de desconto por volume. |
| RF13 | Cupons com validade | Modelar período de validade; confirmar fuso e demais limites. |
| RF14 | Mercado Pago | Integrar primeiro em ambiente de teste; confirmar modalidade e credenciais; pagamentos só confirmados após verificação no servidor. |
| RF15 | Correios | Cotação real depende de acesso à integração, origem, dimensões e peso por SKU. CEP sozinho não fornece preço de frete. |
| RF16 | Referências: GaiaGuy e Heaven in Earth | Referências para evolução visual; a v5.5 permanece a base da migração. |
| RF17 | FAQ | Migrar notas de uso e preparar estrutura para perguntas comerciais. |
| RF18 | Relatórios de vendas, estoque e desempenho de produtos | Exigem pedidos/pagamentos e movimentações reais; definir métricas e período. |
| RF19 | Permissões administrativas não respondidas | Não expor escrita administrativa sem autenticação/autorização; definir perfis. |
| RF20 | Marca registrada no INPI: sim | Informação declarada no formulário, não verificada nesta etapa. |
| RF21 | Notificações de baixo estoque | Faltam limiar, destinatários e canal. |
| RF22 | Cookies e login opcional | Checkout como visitante; resposta não define dados cadastrais ou método de autenticação. |
| RF23 | Exclusão de contas e dados | Prever processo autenticado de exclusão/anonimização; definir retenções antes da operação. |
| RF24 | Meta Ads, Google Ads e TikTok Ads | Não instalar rastreadores automaticamente; definir contas, eventos e preferências de cookies. |
| RF25 | Lançamentos e Mais Vendidos | Lançamentos pode ser atributo editorial; Mais Vendidos deve usar vendas reais e período definido. |
| RF26 | Sem Google Shopping | Fora do escopo atual. |
| RF27 | Lembretes de carrinho abandonado por e-mail | Exige e-mail conhecido, autorização, prazo, frequência e provedor. |
| RF28 | Notas fiscais automáticas, plataforma indefinida | Criar integração somente após escolher fornecedor e dados necessários. |
| RF29 | Estoque sem sistema de referência | Proposta: estoque por SKU e histórico de movimentações; confirmar operação de reposição e ajuste. |

## Fluxo de execução proposto

1. **Inventário e fundação:** documentar a paridade com a v5.5, consolidar workspaces e configurar banco isolado, migrações e testes.
2. **Migração da experiência atual:** páginas React, layout responsivo, temas, português/inglês, imagens originais, navegação, FAQ e sacola.
3. **Catálogo e estoque:** produtos, categorias, variações, filtro por preço, persistência e quantidades validadas no servidor. Produtos sem estoque confirmado não devem parecer disponíveis para venda real.
4. **Compra e administração:** checkout visitante, login opcional, cupons, pedidos, permissões administrativas e relatórios. Confirmar regras pendentes antes de ativar os respectivos comportamentos.
5. **Integrações comerciais:** Mercado Pago, Correios, e-mail e emissão fiscal. Validar em ambientes de teste; nenhuma tela deve simular sucesso de um serviço não conectado.
6. **Homologação:** testes de interface/API/banco, comparação visual, documentação de manutenção e ambiente público próprio para revisão.

Cada entrega deve atualizar a matriz de situação em `MIGRATION.md`: implementado, verificado, pendente ou dependente de configuração externa. A conclusão da migração técnica deve ser distinguida da prontidão para vender em produção.

## Proposta de modelo de dados

A validar durante a implementação, não representa tabelas já criadas:

- Categoria → Produto → Variação/SKU.
- SKU → saldo, movimentações e reservas de estoque.
- Sessão visitante ou cliente → sacola → itens por SKU.
- Pedido → itens com cópia de descrição/preço, endereço, frete, descontos e status.
- Pedido → tentativas de pagamento e eventos do provedor com identificador único.
- Cupom → validade, regras e utilizações.
- Cliente → autenticação opcional, preferências e solicitações de exclusão.
- Administrador → papel/permissões e registro das operações sensíveis.

Valores monetários serão representados em centavos. Preços, descontos, estoque e confirmação de pagamento devem ser determinados pelo servidor. Reservas e atualização de estoque precisam de transações; eventos repetidos de pagamento não podem duplicar pedidos nem baixar estoque novamente.

## Informações que faltam para operação comercial

- SKUs/atributos, preços e estoque inicial; pesos e dimensões; CEP de origem.
- Percentuais/valores de descontos, cumulação, limites e regra de primeira compra.
- Papéis administrativos, método de login e dados obrigatórios do checkout.
- Mercado Pago de teste, acesso aos Correios e provedor de e-mail.
- Emissor fiscal, limiares de estoque e regras de lembretes.
- Fluxos de troca/devolução, retenção de dados e textos comerciais finais.

Credenciais devem ser configuradas fora do Git. Não colocar segredos neste documento nem no CSV versionado.

## Critérios de aceite da migração

- O repositório original permanece intacto.
- As oito páginas principais da v5.5 têm rotas equivalentes, conteúdo e identidade preservados; diferenças são documentadas.
- Idiomas, temas, navegação por teclado e sacola são testados.
- API valida entradas e calcula valores usando os dados do banco.
- Migrações são reproduzíveis em banco vazio e não alteram bancos de outros projetos.
- Recursos dependentes de fornecedores mostram sua situação real, sem pagamentos ou envios fictícios.
- Documentação explica configuração, estrutura, comandos, testes, decisões e limitações.
- Comentários explicam regras de negócio, concorrência e integrações para manutenção humana.

## Estimativa

A estimativa anterior de 4,5–12 horas cobria principalmente migração do site existente. Ela não cobre, de forma confiável, todo o e-commerce descrito nesta resposta. A previsão deve ser refeita por entrega após resolver as regras e dependências externas acima; não há medição final de tokens ou prazo fechado nesta etapa.
