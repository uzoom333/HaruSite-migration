# API Haru: frete (Melhor Envio)

NestJS + SQLite. Independente do site: o `package.json` da raiz não a conhece.

```bash
cd apps/api
npm install
cp .env.example .env            # preencher
npm run db:migrate
npm run package:set -- escova <peso_g> <largura_cm> <altura_cm> <comprimento_cm>
npm test
npm run dev
```

No site, `NEXT_PUBLIC_API_URL=http://127.0.0.1:3001` no build ou no `npm run dev`
liga a cotação real. Sem a variável, o site usa a estimativa por zona.

## Conectar a conta

`POST /api/melhor-envio/connect` devolve a URL de autorização. Abra no navegador;
o Melhor Envio volta para `/api/melhor-envio/callback`. Os tokens ficam no SQLite
e são renovados sozinhos enquanto houver uso.

## Rotas

| Método | Rota | Acesso |
| --- | --- | --- |
| POST | `/api/shipping/quote` | público, 30/min por IP |
| POST | `/api/melhor-envio/connect` | administrativo |
| POST | `/api/melhor-envio/webhook` | assinatura HMAC |
| POST | `/api/shipments` | administrativo: põe no carrinho |
| POST | `/api/shipments/:ref/buy` | administrativo: **gasta saldo** |
| POST | `/api/shipments/:ref/generate`, `/print`, `/sync` | administrativo |
| GET | `/api/shipments/:ref` | administrativo |

Todo POST exige `X-Haru-Request: 1` (menos o webhook); os administrativos, também
`Authorization: Bearer $ADMIN_KEY`. Status `unknown` ou `buying` parado significa
resposta perdida: use `/sync` ou confira no painel antes de repetir.
