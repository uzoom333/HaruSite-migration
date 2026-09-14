# API Haru — primeira entrega

Prefixo `/api`. No navegador, usar o proxy do Next.js na mesma origem. A API NestJS escuta por padrão somente em `127.0.0.1:3001`.

| Método | Rota | Comportamento |
| --- | --- | --- |
| GET | `/health` | Verifica se o banco SQLite responde. |
| GET | `/products` | Lista produtos ativos e a variação inicial de cada um. |
| GET | `/products/:slug` | Produto por slug; 404 se não existir. |
| GET | `/cart` | Recupera ou cria a sessão anônima; retorna sacola. |
| PUT | `/cart/items` | Define quantidade absoluta de um SKU; zero remove. |
| GET | `/postal/:cep` | Oito dígitos; consulta cidade/UF, não calcula frete. |

## Produto

```json
{
  "id": "p1",
  "slug": "escova",
  "name": "Escova de bambu",
  "image": "/images/product-escova.jpg",
  "priceCents": 4800,
  "sku": "HARU-ESCOVA",
  "stock": null,
  "maxQuantity": 9
}
```

`stock: null` significa saldo ainda não informado. Não é estoque ilimitado. Quando informado, `maxQuantity` usa o menor valor entre saldo e teto operacional 99. Esta entrega ainda não reserva ou debita estoque.

A primeira variação de cada produto representa o produto que existia na v5.5; atributos reais das futuras variações ainda precisam ser definidos. A interface atual apresenta uma variação por produto. Não cadastrar múltiplos SKUs por produto antes de implementar o seletor correspondente.

## Alterar sacola

```http
PUT /api/cart/items
Content-Type: application/json
X-Haru-Request: 1
Cookie: haru_migration_cart=...

{"sku":"HARU-ESCOVA","quantity":2}
```

O frontend estabelece a sessão com `GET /cart` antes de permitir adicionar produtos. O cookie é HttpOnly, SameSite=Lax, válido por 30 dias e restrito ao caminho `/api`. O banco guarda apenas seu hash SHA-256. Use `COOKIE_SECURE=true` com HTTPS em produção.

Campos extras (inclusive preço), valores fracionários, negativos, SKU inválido/inativo e quantidade acima do limite são rejeitados. As mutações exigem JSON e header customizado; se houver Origin, ele deve corresponder a `WEB_ORIGIN`. CORS genérico não é habilitado. Isso não substitui autenticação administrativa futura.

Resposta: `items`, `quantity`, `subtotalCents`, `checkoutAvailable: false`. Cada item inclui os dados do produto, `quantity` e `lineTotalCents` calculados pelo banco. O cliente nunca define preço.

## Falhas

- 400: dados ou quantidade inválidos.
- 403: origem/header/formato de mutação não permitido.
- 404: produto/CEP inexistente ou endpoint não exposto.
- 429: limite de requisições excedido.
- 503: ViaCEP ou conexão entre frontend e API indisponível.
- 500: falha interna, sem detalhes SQL ou credenciais na resposta padrão do NestJS.

O limite atual é 120 requisições/minuto por IP, em memória. Como o Next atua como proxy, clientes podem compartilhar o mesmo IP visto pela API; configurar proxy confiável e armazenamento distribuído antes de escalar. Não confiar em X-Forwarded-For arbitrário.

## Manutenção

As migrações SQL rodam explicitamente com `npm run db:migrate`, em transação e sob advisory lock. A API não modifica o schema ao iniciar. Não editar uma migração já aplicada: criar `002_...sql` e seguintes.

Sessões vencidas deixam de ser aceitas imediatamente; a limpeza física ainda precisa ser agendada no ambiente de hospedagem:

```sql
DELETE FROM carts WHERE expires_at < now();
```

A exclusão remove os itens correspondentes por chave estrangeira. Configurar rotina de limpeza e backups antes de operar publicamente. Não usar a autenticação `trust` do cluster local em produção.
