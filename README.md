# Nexo — Marketplace B2B de Serviços

Conectamos empresas, lojas e profissionais para encontrar, oferecer e agendar serviços de forma simples.

Projeto front-end puro (sem build, sem framework) com site público + painel funcional. Ideal para MVP, validação e demonstração de produto.

> Dados fictícios para demonstração. Cidade fictícia: Vila Aurora.

## ✨ O que o projeto faz

**Site público (`#/`):**
- Home com busca, portas Lojas/Serviços e lista de destaques
- Explorar (`#/explorar`) — serviços, lojas e profissionais com filtro por tipo, texto, categoria, distância, avaliação e preço
- Perfil público (`#/perfil/:id`) — loja (vitrine, catálogo, info) ou prestador (serviços, info)
- Sacola (`#/carrinho`) com checkout e Nexo Pay (demo)
- Páginas institucionais: Como funciona, Para empresas
- Login e Cadastro com 4 perfis: Empresa, Prestadora, Autônomo e Loja

**Painel logado (`#/app/*`):**
- Dashboard diferente para contratante vs. prestador (KPIs, próximos serviços, gastos, oportunidades)
- Solicitações / Oportunidades com filtro por status
- Detalhe da solicitação com timeline, tabela comparativa de propostas, aceitar/recusar
- Nova solicitação (página + modal) com validação
- Agenda (dia / semana / lista), Mensagens (chat), Favoritos, Notificações, Meu Perfil
- Fluxo completo: `solicitado → recebendo_propostas → proposta_aceita → agendado → em_andamento → concluido → avaliado`

## 🗂️ Estrutura

```
empreendedorismo/
├── index.html      # Todo o HTML (views públicas + app shell + modais)
├── css/
│   └── style.css   # Estilos (responsivo, mobile drawer, dashboard)
├── js/
│   ├── store.js    # Persistência + seed (NexoStore, localStorage)
│   └── app.js      # Roteador hash, site público, painel, auth
└── assets/         # (vazio — imagens/mocks futuros)
```

- `store.js`: única camada que acessa `localStorage` (chave `nexo_db_v1`). Expõe `NexoStore.load/save/reset`.
- `app.js`: não acessa `localStorage` diretamente, só via `NexoStore`.

## 🚀 Como rodar

Não precisa instalar nada. É HTML + CSS + JS vanilla.

**Opção 1 — duplo clique:**
1. Abra `index.html` no navegador.

**Opção 2 — servidor local (recomendado):**
```powershell
# com Python
python -m http.server 8000
# depois abra http://localhost:8000

# ou com Node
npx serve .
```

> O `fetch` de fontes do Google requer internet. O resto funciona offline após primeiro load.

## 🔑 Contas demo

Senha de todas as contas: `demo1234`

| Perfil | E-mail | Uso |
|---|---|---|
| 🏢 Empresa | `empresa@demo.com` | Contratar, publicar pedidos, aceitar propostas |
| 👤 Autônomo | `carlos@demo.com` | Enviar propostas, agenda, chat |
| 🛠 Prestadora | `eletrosul@demo.com` | Mesmo fluxo de prestador, com equipe |
| 🏪 Loja | `loja@demo.com` | Vitrine + catálogo (Veste Aurora), e contrata como empresa |
| 🐾 Pet | `pet@demo.com` | Vitrine + catálogo (Casa & Cia Pet) |
| 💊 Essência | `essencia@demo.com` | Vitrine + catálogo (Essência & Cuidado) |

Ou use na tela de login os botões **Acesso demo**: Empresa / Autônomo / Prestadora / Loja / Pet / Essência.

Seed inclui: 23 usuários, 15 serviços, 15 produtos, 10 solicitações, 20 propostas, 6 agendamentos, 8 avaliações, 3 conversas e notificações.

## 🛒 Sacola e pagamento (demo)

- Botão `+` no catálogo adiciona à sacola (vale misturar lojas; cada loja recebe o seu pedido).
- Pix/cartão passam pelo `window.NexoPay`, que **simula** a aprovação e registra em `db.orders` — nenhum valor é cobrado.
- Cobrança real exige backend (conta em Mercado Pago/Stripe, chave secreta no servidor, webhook e TLS) e pluga no mesmo `NexoPay.checkout(order)`.

## 🧭 Rotas

 Públicas:
- `#/` home · `#/explorar` · `#/perfil/:id` · `#/carrinho` (`#/buscar` e `#/profissionais` redirecionam para `#/explorar`)
- `#/como-funciona` · `#/para-empresas` · `#/login` · `#/cadastro`

 Painel (requer login):
- `#/app/dashboard` · `#/app/solicitacoes` · `#/app/oportunidades`
- `#/app/solicitacao/:id` · `#/app/nova` · `#/app/agenda`
- `#/app/mensagens` · `#/app/favoritos` · `#/app/notificacoes` · `#/app/perfil`

## 💾 Dados e reset

- Tudo fica em `localStorage` (`nexo_db_v1`).
- Para resetar a demo, no console do navegador:
```js
localStorage.removeItem('nexo_db_v1'); location.reload();
```

Para migrar para backend real (Supabase / Firebase / API própria), reimplemente os métodos de `NexoStore` em `js/store.js` mantendo a mesma assinatura:
`users → users | services → services | requests → requests | proposals → proposals | schedules → schedules | reviews → reviews | convs → conversations | msgs → messages | notifs → notifications | favs → favorites`.

## 🛠️ Tecnologias

- HTML5 + CSS3 (custom, responsivo, sem framework CSS)
- JavaScript vanilla (hash router, sem dependências)
- Fonte Inter via Google Fonts
- Persistência: `localStorage`

## 📌 Próximos passos sugeridos

- [ ] Backend real + auth (Supabase Auth)
- [ ] Upload de fotos nos pedidos e perfil
- [ ] Nexo Pay (pagamento retido/liberação)
- [ ] Check-in por QR code no agendamento
- [ ] Exportação NF-e / relatórios financeiro
- [ ] PWA + notificações push

## 📄 Licença

Uso educacional / demonstração. © 2026 Nexo Tecnologia Ltda (fictícia).
