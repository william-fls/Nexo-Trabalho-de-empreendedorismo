/* ================================================================
   Nexo — camada de persistência (MVP: localStorage)
   ----------------------------------------------------------------
   Para migrar para backend real (Supabase / Firebase / PostgreSQL /
   API própria), reimplemente os métodos de `NexoStore` mantendo a
   mesma assinatura. Mapeamento direto coleção -> tabela:
     users -> users | services -> services | requests -> requests
     proposals -> proposals | schedules -> schedules | reviews -> reviews
     convs -> conversations | msgs -> messages | notifs -> notifications
     favs -> favorites | session -> auth session (Supabase Auth, etc.)
   Nenhum código de tela acessa localStorage diretamente.
   ================================================================ */
(function (global) {
  "use strict";

  var KEY = "nexo_db_v1";

  function uid(p) {
    return (p || "id") + "_" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  }
  function isoPlus(days, hour) {
    var d = new Date();
    d.setDate(d.getDate() + days);
    if (hour) { var h = hour.split(":"); d.setHours(+h[0], +(h[1] || 0), 0, 0); }
    return d.toISOString();
  }
  function dayPlus(days) {
    var d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  /* ---------------- Vitrine da loja (prestadores) ----------------
     Campos editáveis pelo dono em #/app/perfil e exibidos no perfil
     público (#/perfil/:id). Todos opcionais; preços 0 = "a combinar". */
  var CAPAS = ["g0", "g1", "g2", "g3", "g4", "g5"];
  function storeDefaults(u, i) {
    if (!u || u.tipo === "empresa" || u.tipo === "cliente") return u;
    if (u.capaFoto == null) u.capaFoto = null;
    if (u.logoFoto == null) u.logoFoto = null;
    if (u.disponibilidade == null) u.disponibilidade = "semana";
    if (u.capa == null) u.capa = CAPAS[(i || 0) % CAPAS.length];
    if (u.horario == null) u.horario = "Seg–Sáb · 08h–18h";
    if (u.raio == null) u.raio = 15;
    if (u.precoBase == null) u.precoBase = 0;
    if (u.whatsapp == null) u.whatsapp = u.telefone || "";
    if (u.instagram == null) u.instagram = "";
    if (u.facebook == null) u.facebook = "";
    if (u.portfolio == null) u.portfolio = [];
    return u;
  }
  /* Migração: v1 -> defaults da vitrine; v2/v3/v4 -> products + campos de loja;
     v5 -> cat/menuCats; v6 -> sacola (cart) + pedidos (orders);
     v7 -> cidade fictícia Vila Aurora + importa lojas demo que faltam;
     v8 -> disponibilidade padrão; v9 -> sacola multi-loja;
     v10 -> restaura categorias do seed em produtos sem cat;
     v11 -> restaura também sobre "Geral" e re-deriva o menu;
     v12 -> conta demo de pessoa física (cliente);
     v13 -> pedido dirigido (request.prestId; null = legado aberto);
     v14 -> fotos do dono (user.capaFoto/logoFoto, product.foto; null = gradiente);
     v15 -> fotos demo Unsplash onde o dono não subiu nada. Nunca apaga dados locais. */
  function migrate(db) {
    db.users.forEach(function (u, i) { if (u.tipo !== "empresa" && u.tipo !== "cliente") storeDefaults(u, i); });
    if (!db.products) db.products = [];
    if (!db.cart) db.cart = { items: [] };
    if (!db.orders) db.orders = [];
    if (!db.cart.items) db.cart.items = [];
    db.cart.items.forEach(function (it) {
      if (!it.lojaId) {
        var p = db.products.filter(function (x) { return x.id === it.prodId; })[0];
        it.lojaId = p ? p.lojaId : (db.cart.lojaId || null);
      }
    });
    if (db.cart && ("lojaId" in db.cart)) delete db.cart.lojaId;
    var sh = seedShops("demo1234");
    var seedCat = {};
    sh.products.forEach(function (sp) { seedCat[sp.id] = sp.cat; });
    sh.users.forEach(function (su) {
      var exists = db.users.some(function (x) { return x.id === su.id; });
      if (!exists) db.users.push(JSON.parse(JSON.stringify(su)));
    });
    sh.products.forEach(function (sp) {
      var exists = db.products.some(function (x) { return x.id === sp.id; });
      if (!exists) db.products.push(JSON.parse(JSON.stringify(sp)));
    });
    db.products.forEach(function (p) { if (!p.cat || p.cat === "Geral") p.cat = seedCat[p.id] || "Geral"; if (p.foto == null) p.foto = null; });
    db.users.forEach(function (u) {
      var onlyGeral = u.tipo === "loja" && u.menuCats && u.menuCats.length === 1 && u.menuCats[0] === "Geral";
      var hadCats = u.tipo === "loja" && u.menuCats && u.menuCats.length && !onlyGeral;
      shopDefaults(u);
      if (u.tipo === "loja" && !hadCats) {
        var cats = [];
        db.products.forEach(function (p) {
          if (p.lojaId === u.id && p.cat && cats.indexOf(p.cat) < 0) cats.push(p.cat);
        });
        if (cats.length) u.menuCats = cats;
      }
    });
    sh.users.forEach(function (su) {
      var exists = db.users.some(function (x) { return x.id === su.id; });
      if (!exists) db.users.push(JSON.parse(JSON.stringify(su)));
    });
    sh.products.forEach(function (sp) {
      var exists = db.products.some(function (x) { return x.id === sp.id; });
      if (!exists) db.products.push(JSON.parse(JSON.stringify(sp)));
    });
    renameCity(db);
    /* Conta demo de pessoa física (cliente) em bases antigas. */
    var cli = seedCliente("demo1234");
    if (!db.users.some(function (x) { return x.id === cli.id; })) db.users.push(JSON.parse(JSON.stringify(cli)));
    /* Pedido dirigido em bases antigas (null = legado aberto). */
    db.requests.forEach(function (r) { if (!("prestId" in r)) r.prestId = null; });
    /* Fotos demo onde o dono ainda não subiu nada (nunca sobrescreve). */
    applySeedPhotos(db, true);
    db.v = 15;
    return db;
  }
  /* Campos exclusivos do mini-site da loja (tipo "loja"). */
  function shopDefaults(u) {
    if (!u || u.tipo !== "loja") return u;
    if (u.capaFoto == null) u.capaFoto = null;
    if (u.logoFoto == null) u.logoFoto = null;
    if (u.endereco == null) u.endereco = "";
    if (u.categoriaLoja == null) u.categoriaLoja = "Outros";
    if (u.menuCats == null) u.menuCats = ["Geral"];
    return u;
  }
  /* Renomeia a cidade real para a fictícia em bases antigas. */
  function renameCity(db) {
    var reps = [["Torres / RS", "Vila Aurora"], ["Torres/RS", "Vila Aurora"], ["Capão da Canoa / RS", "Porto Alto"], ["Arroio do Sal / RS", "Vale Verde"], ["Hidro Torres", "Hidro Aurora"], ["Veste Litoral", "Veste Aurora"], ["no litoral norte", "na região"], ["beira-mar", "central"], ["@limpaforte.torres", "@limpaforte.aurora"], ["@carlos.tech.torres", "@carlos.tech.aurora"], ["@veste.litoral", "@veste.aurora"], ["vestelitoral", "vesteaurora"]];
    ["users", "requests", "notifs"].forEach(function (col) {
      (db[col] || []).forEach(function (it) {
        ["nome", "cidade", "local", "descricao", "texto", "endereco", "instagram", "facebook"].forEach(function (k) {
          if (typeof it[k] === "string") {
            var v = it[k];
            reps.forEach(function (r) { v = v.split(r[0]).join(r[1]); });
            it[k] = v;
          }
        });
      });
    });
    return db;
  }
  /* Conta demo de pessoa física (compra nas lojas + solicita serviços).
     Usada pelo seed e pela migração para importar em bases antigas. */
  function seedCliente(PASS) {
    return { id: "u_cli_maria", tipo: "cliente", nome: "Maria Silva", email: "cliente@demo.com", senha: PASS, doc: "987.654.321-00", cidade: "Vila Aurora", telefone: "(51) 99900-1122", descricao: "Cliente da Nexo — compras nas lojas e contratação de serviços.", cor: "#0F766E", verificado: false, jobs: 0, dist: 1.5 };
  }
  /* Fotos demo (Unsplash, uso livre). Todas as URLs foram verificadas
     (HTTP 200 + imagem); se alguma falhar no futuro, o render cai no
     gradiente via onerror. `onlyNull` nunca sobrescreve upload do dono. */
  function photoU(id) { return "https://images.unsplash.com/photo-" + id + "?auto=format&fit=crop&w=1200&q=70"; }
  function photoS(id) { return "https://images.unsplash.com/photo-" + id + "?auto=format&fit=crop&w=500&q=70"; }
  function photoMap() {
    return {
      users: {
        "u_loja_veste": { capa: photoU("1441986300917-64674bd600d8"), logo: photoS("1445205170230-053b83016050") },
        "u_loja_pet": { capa: photoU("1450778869180-41d0601e046e"), logo: photoS("1587300003388-59208cc962cb") },
        "u_loja_essencia": { capa: photoU("1596462502278-27bfdc403348"), logo: photoS("1571781926291-c477ebfd024b") },
        "u_pre_eletrosul": { capa: photoU("1621905251189-08b45d6a269e"), logo: photoS("1621905252507-b35492cc74b4") },
        "u_pre_limpa": { capa: photoU("1581578731548-c64695cc6952"), logo: photoS("1584820927498-cfe5211fd8bf") },
        "u_pre_vetor": { capa: photoU("1486406146926-c627a92ad1ab"), logo: photoS("1557324232-b8917d3c3dcb") },
        "u_pre_techsul": { capa: photoU("1504328345606-18bbc8c9d7d1"), logo: photoS("1581094794329-c8112a89af12") },
        "u_pre_climasul": { capa: photoU("1614633833026-0820552978b6"), logo: photoS("1615875605825-5eb9bb5d52ac") },
        "u_aut_carlos": { capa: photoU("1558494949-ef010cbdcc31"), logo: photoS("1518770660439-4636190af475") },
        "u_aut_joao": { capa: photoU("1563013544-824ae1b704d3"), logo: photoS("1550751827-4bd374c3f58b") },
        "u_aut_marina": { capa: photoU("1615874959474-d609969a20ed"), logo: photoS("1615873968403-89e068629265") },
        "u_aut_hidro": { capa: photoU("1607472586893-edb57bdc0e39"), logo: photoS("1585704032915-c3400ca199e7") },
        "u_aut_ana": { capa: photoU("1562259949-e8e7689d7828"), logo: photoS("1589939705384-5185137a7f0f") },
        "u_aut_rafael": { capa: photoU("1616486338812-3dadae4b4ace"), logo: photoS("1504148455328-c376907d081c") },
        "u_aut_ju": { capa: photoU("1471341971476-ae15ff5dd4ea"), logo: photoS("1516035069371-29a1b244cc32") },
        "u_aut_marcos": { capa: photoU("1541888946425-d81bb19240f5"), logo: photoS("1504307651254-35680f356dfd") },
        "u_aut_fernanda": { capa: photoU("1416879595882-3373a0480b5b"), logo: photoS("1466692476868-aef1dfb1e735") },
        "u_aut_lucas": { capa: photoU("1558402529-d2638a7023e9"), logo: photoS("1513828583688-c52646db42da") }
      },
      products: {
        "pd1": photoS("1595777457583-95e059d581b8"), "pd2": photoS("1521572163474-6864f9cf17ab"),
        "pd3": photoS("1542272604-787c3835535d"), "pd4": photoS("1591047139829-d91aecb6caea"),
        "pd5": photoS("1594633312681-425c7b97ccd1"), "pd6": photoS("1519238263530-99bdd11df2ea"),
        "pd7": photoS("1517849845537-4d257902454a"), "pd8": photoS("1548199973-03cce0bbc87b"),
        "pd9": photoS("1516734212186-a967f81ad0d7"), "pd10": photoS("1589924691995-400dc9ecc119"),
        "pd11": photoS("1530281700549-e82e7bf110d6"), "pd12": photoS("1608571423902-eed4a5ad8108"),
        "pd13": photoS("1584308666744-24d5c474f2ae"), "pd14": photoS("1544787219-7f47ccb76574"),
        "pd15": photoS("1600857544200-b2f666a9a2ec")
      }
    };
  }
  function applySeedPhotos(db, onlyNull) {
    var m = photoMap();
    db.users.forEach(function (u) {
      var f = m.users[u.id]; if (!f) return;
      if (f.capa && (!onlyNull || u.capaFoto == null)) u.capaFoto = f.capa;
      if (f.logo && (!onlyNull || u.logoFoto == null)) u.logoFoto = f.logo;
    });
    db.products.forEach(function (p) {
      var f = m.products[p.id]; if (!f) return;
      if (!onlyNull || p.foto == null) p.foto = f;
    });
    return db;
  }
  /* Lojas demo completas (vitrine + catálogo). Usado pelo seed e pela
     migração para importar lojas que faltam em bases antigas. */
  function seedShops(PASS) {
    var users = [
      { id: "u_loja_veste", tipo: "loja", nome: "Veste Aurora", email: "loja@demo.com", senha: PASS, doc: "12.345.678/0001-99", cidade: "Vila Aurora", telefone: "(51) 99933-4455", descricao: "Peças a pronta entrega, provador e novidades toda semana.", cor: "#DB2777", verificado: true, jobs: 64, dist: 0.8, capa: "g4", disponibilidade: "hoje", horario: "Seg–Sáb · 09h–19h", raio: 5, precoBase: 0, whatsapp: "(51) 99933-4455", instagram: "@veste.aurora", facebook: "vesteaurora", portfolio: ["Vitrine nova — Centro", "Coleção verão 2026"], endereco: "Av. Barão do Rio Branco, 412 — Centro", categoriaLoja: "Moda", menuCats: ["Vestidos e saias", "Básicos", "Jeans", "Casacos", "Infantil"] },
      { id: "u_loja_pet", tipo: "loja", nome: "Casa & Cia Pet", email: "pet@demo.com", senha: PASS, doc: "23.456.789/0001-88", cidade: "Vila Aurora", telefone: "(51) 99944-5566", descricao: "Banho, tosa e rações no Centro. Buscamos e entregamos na região central.", cor: "#4D7C0F", verificado: true, jobs: 41, dist: 1.2, capa: "g2", disponibilidade: "hoje", horario: "Seg–Sáb · 08h–18h", raio: 8, precoBase: 0, whatsapp: "(51) 99944-5566", instagram: "@casaeciapet", facebook: "casaeciapet", portfolio: ["Banho & tosa — 200+ clientes/mês"], endereco: "Rua Coberta, 88 — Centro", categoriaLoja: "Casa", menuCats: ["Banho", "Tosa", "Rações e petiscos"] },
      { id: "u_loja_essencia", tipo: "loja", nome: "Essência & Cuidado", email: "essencia@demo.com", senha: PASS, doc: "34.567.890/0001-77", cidade: "Vila Aurora", telefone: "(51) 99955-6677", descricao: "Manipulação, óleos essenciais e chás. Atendimento com farmacêutica.", cor: "#A21CAF", verificado: true, jobs: 58, dist: 2.3, capa: "g5", disponibilidade: "semana", horario: "Seg–Sex · 08h30–18h30 · Sáb 08h–12h", raio: 10, precoBase: 0, whatsapp: "(51) 99955-6677", instagram: "@essencia.cuidado", facebook: "essenciaecuidado", portfolio: ["Linha calmante — Hotel Atlântico"], endereco: "Av. Paraguassú, 1205 — Centro", categoriaLoja: "Saúde", menuCats: ["Óleos essenciais", "Manipulados", "Chás e sabonetes"] }
    ];
    var products = [
      { id: "pd1", lojaId: "u_loja_veste", nome: "Vestido verão estampado", preco: 129, desc: "Viscose, P ao GG.", cat: "Vestidos e saias" },
      { id: "pd2", lojaId: "u_loja_veste", nome: "Camiseta básica", preco: 49, desc: "Algodão, várias cores.", cat: "Básicos" },
      { id: "pd3", lojaId: "u_loja_veste", nome: "Calça jeans", preco: 159, desc: "Cintura alta, 34 ao 46.", cat: "Jeans" },
      { id: "pd4", lojaId: "u_loja_veste", nome: "Jaqueta corta-vento", preco: 199, desc: "Impermeável, unissex.", cat: "Casacos" },
      { id: "pd5", lojaId: "u_loja_veste", nome: "Saia midi", preco: 99, desc: "Tecido plano, M e G.", cat: "Vestidos e saias" },
      { id: "pd6", lojaId: "u_loja_veste", nome: "Conjunto infantil", preco: 89, desc: "2 peças, 2 a 8 anos.", cat: "Infantil" },
      { id: "pd7", lojaId: "u_loja_pet", nome: "Banho porte P", preco: 60, desc: "Shampoo neutro + secagem.", cat: "Banho" },
      { id: "pd8", lojaId: "u_loja_pet", nome: "Banho porte M/G", preco: 80, desc: "Shampoo neutro + secagem.", cat: "Banho" },
      { id: "pd9", lojaId: "u_loja_pet", nome: "Tosa higiênica", preco: 45, desc: "Com agendamento.", cat: "Tosa" },
      { id: "pd10", lojaId: "u_loja_pet", nome: "Ração premium 10kg", preco: 120, desc: "Frango e arroz.", cat: "Rações e petiscos" },
      { id: "pd11", lojaId: "u_loja_pet", nome: "Petisco natural", preco: 25, desc: "Pacote 500g.", cat: "Rações e petiscos" },
      { id: "pd12", lojaId: "u_loja_essencia", nome: "Óleo essencial lavanda", preco: 55, desc: "10ml, 100% puro.", cat: "Óleos essenciais" },
      { id: "pd13", lojaId: "u_loja_essencia", nome: "Manipulado sob receita", preco: 90, desc: "Prazo de 48h.", cat: "Manipulados" },
      { id: "pd14", lojaId: "u_loja_essencia", nome: "Chá calmante", preco: 30, desc: "30 sachês.", cat: "Chás e sabonetes" },
      { id: "pd15", lojaId: "u_loja_essencia", nome: "Sabonete artesanal", preco: 20, desc: "Aveia e mel.", cat: "Chás e sabonetes" }
    ];
    return { users: users, products: products };
  }

  /* ---------------- SEED ---------------- */
  function seed() {
    var PASS = "demo1234"; // senha das 3 contas demo
    var users = [
      /* --- empresas contratantes (5) --- */
      { id: "u_emp_prisma", tipo: "empresa", nome: "Lojas Prisma", email: "empresa@demo.com", senha: PASS, doc: "12.345.678/0001-90", cidade: "Vila Aurora", telefone: "(51) 99911-2200", descricao: "Rede varejista com 3 lojas na região. Demandas recorrentes de manutenção, climatização e segurança.", cor: "#1D4ED8", verificado: true },
      { id: "u_emp_atlantico", tipo: "empresa", nome: "Hotel Atlântico", email: "atlantico@mail.com", senha: PASS, doc: "23.456.789/0001-01", cidade: "Vila Aurora", telefone: "(51) 99811-3322", descricao: "Hotel central com 80 quartos, restaurante e área de eventos.", cor: "#0E7490", verificado: true },
      { id: "u_emp_pao", tipo: "empresa", nome: "Padaria Pão & Cia", email: "paoecia@mail.com", senha: PASS, doc: "34.567.890/0001-12", cidade: "Vila Aurora", telefone: "(51) 99722-4411", descricao: "Padaria artesanal no Centro, fornos industriais e salão.", cor: "#B45309", verificado: true },
      { id: "u_emp_vitta", tipo: "empresa", nome: "Clínica Vitta", email: "vitta@mail.com", senha: PASS, doc: "45.678.901/0001-23", cidade: "Vila Aurora", telefone: "(51) 99633-5511", descricao: "Clínica multidisciplinar com 12 consultórios.", cor: "#0E9F6E", verificado: true },
      { id: "u_emp_market", tipo: "empresa", nome: "Market Sul", email: "marketsul@mail.com", senha: PASS, doc: "56.789.012/0001-34", cidade: "Vila Aurora", telefone: "(51) 99544-6611", descricao: "Supermercado de bairro com câmaras frias e estacionamento.", cor: "#6D28D9", verificado: true },
      /* --- pessoa física (1) --- */
      seedCliente(PASS),
      /* --- empresas prestadoras (5) --- */
      { id: "u_pre_eletrosul", tipo: "prestadora", nome: "Eletro Sul Comercial", email: "eletrosul@demo.com", senha: PASS, doc: "67.890.123/0001-45", cidade: "Porto Alto", telefone: "(51) 3664-1000", descricao: "Elétrica predial e comercial com equipe NR-10/NR-35 e emissão de ART.", especialidades: ["Elétrica", "Manutenção"], disponibilidade: "Seg–Sáb", cor: "#6D28D9", verificado: true },
      { id: "u_pre_limpa", tipo: "prestadora", nome: "Limpa Forte", email: "limpaforte@mail.com", senha: PASS, doc: "78.901.234/0001-56", cidade: "Vila Aurora", telefone: "(51) 3664-2000", descricao: "Equipe de 8 profissionais para limpeza comercial recorrente e pós-obra.", especialidades: ["Limpeza"], disponibilidade: "Seg–Dom", cor: "#BE123C", verificado: true },
      { id: "u_pre_vetor", tipo: "prestadora", nome: "Vetor Segurança", email: "vetor@mail.com", senha: PASS, doc: "89.012.345/0001-67", cidade: "Vila Aurora", telefone: "(51) 3664-3000", descricao: "Projetos de CFTV, alarmes e controle de acesso para comércio.", especialidades: ["Segurança", "Redes"], disponibilidade: "Seg–Sáb", cor: "#1D4ED8", verificado: true },
      { id: "u_pre_techsul", tipo: "prestadora", nome: "TechSul Facilities", email: "techsul@mail.com", senha: PASS, doc: "90.123.456/0001-78", cidade: "Vila Aurora", telefone: "(51) 3664-4000", descricao: "Manutenção predial preventiva com SLA 24h e contratos mensais.", especialidades: ["Manutenção", "Hidráulica"], disponibilidade: "24h", cor: "#0F172A", verificado: true },
      { id: "u_pre_climasul", tipo: "prestadora", nome: "ClimaSul PMOC", email: "climasul@mail.com", senha: PASS, doc: "01.234.567/0001-89", cidade: "Vila Aurora", telefone: "(51) 3664-5000", descricao: "Climatização corporativa com PMOC e relatórios para auditoria.", especialidades: ["Climatização"], disponibilidade: "Seg–Sáb", cor: "#0284C7", verificado: true },
      /* --- profissionais autônomos (10) --- */
      { id: "u_aut_carlos", tipo: "autonomo", nome: "Carlos Tecnologia", email: "carlos@demo.com", senha: PASS, doc: "123.456.789-00", cidade: "Vila Aurora", telefone: "(51) 99922-1122", descricao: "Suporte para lojas e escritórios: redes, backups e manutenção de PCs. SLA de 4h.", especialidades: ["Redes", "Suporte", "Backups"], experiencia: "11 anos · MEI · NF-e", disponibilidade: "hoje", cor: "#1D4ED8", verificado: true },
      { id: "u_aut_joao", tipo: "autonomo", nome: "João Segurança", email: "joao@mail.com", senha: PASS, doc: "234.567.890-11", cidade: "Vila Aurora", telefone: "(51) 99833-2233", descricao: "Instalador de CFTV e alarmes para comércio. Garantia de 12 meses e app configurado.", especialidades: ["CFTV", "Alarmes", "Controle de acesso"], experiencia: "9 anos · MEI · NF-e", disponibilidade: "semana", cor: "#0F766E", verificado: true },
      { id: "u_aut_marina", tipo: "autonomo", nome: "Marina Clima", email: "marina@mail.com", senha: PASS, doc: "345.678.901-22", cidade: "Vila Aurora", telefone: "(51) 99744-3344", descricao: "Instalação e higienização de splits com garantia de serviço.", especialidades: ["Split", "PMOC", "Higienização"], experiencia: "7 anos · Autônoma · NF-e", disponibilidade: "hoje", cor: "#0E7490", verificado: true },
      { id: "u_aut_hidro", tipo: "autonomo", nome: "Hidro Aurora", email: "hidro@mail.com", senha: PASS, doc: "456.789.012-33", cidade: "Vila Aurora", telefone: "(51) 99655-4455", descricao: "Caça-vazamentos sem quebra-quebra, pressurizadores e reparos rápidos.", especialidades: ["Vazamentos", "Pressurizadores"], experiencia: "12 anos · Autônomo", disponibilidade: "semana", cor: "#0284C7", verificado: true },
      { id: "u_aut_ana", tipo: "autonomo", nome: "Ana Costa Pinturas", email: "ana@mail.com", senha: PASS, doc: "567.890.123-44", cidade: "Vila Aurora", telefone: "(51) 99566-5566", descricao: "Pintura comercial e residencial, fachadas e efeitos decorativos.", especialidades: ["Pintura", "Fachadas"], experiencia: "8 anos · MEI", disponibilidade: "semana", cor: "#BE123C", verificado: true },
      { id: "u_aut_rafael", tipo: "autonomo", nome: "Rafael Marcenaria", email: "rafael@mail.com", senha: PASS, doc: "678.901.234-55", cidade: "Vila Aurora", telefone: "(51) 99477-6677", descricao: "Móveis sob medida, balcões para loja e montagem com garantia.", especialidades: ["Planejados", "Balcões"], experiencia: "10 anos · Autônomo", disponibilidade: "semana", cor: "#92400E", verificado: true },
      { id: "u_aut_ju", tipo: "autonomo", nome: "Juliana Foto & Eventos", email: "juliana@mail.com", senha: PASS, doc: "789.012.345-66", cidade: "Vila Aurora", telefone: "(51) 99388-7788", descricao: "Comunicação visual e cobertura fotográfica para empresas e eventos.", especialidades: ["Fachadas", "Foto corporativa"], experiencia: "6 anos · MEI", disponibilidade: "agenda", cor: "#6D28D9", verificado: true },
      { id: "u_aut_marcos", tipo: "autonomo", nome: "Marcos Vinícius Obras", email: "marcos@mail.com", senha: PASS, doc: "890.123.456-77", cidade: "Vale Verde", telefone: "(51) 99299-8899", descricao: "Pedreiro e reformista: pisos, reboco e impermeabilização.", especialidades: ["Alvenaria", "Pisos"], experiencia: "13 anos · Autônomo", disponibilidade: "semana", cor: "#334155", verificado: false },
      { id: "u_aut_fernanda", tipo: "autonomo", nome: "Fernanda Jardins", email: "fernanda@mail.com", senha: PASS, doc: "901.234.567-88", cidade: "Vila Aurora", telefone: "(51) 99111-9900", descricao: "Jardinagem condominial e paisagismo para áreas comerciais.", especialidades: ["Paisagismo", "Poda"], experiencia: "5 anos · MEI", disponibilidade: "semana", cor: "#0E9F6E", verificado: true },
      { id: "u_aut_lucas", tipo: "autonomo", nome: "Lucas Mendes Elétrica", email: "lucas@mail.com", senha: PASS, doc: "012.345.678-99", cidade: "Vila Aurora", telefone: "(51) 99022-1100", descricao: "Eletricista autônomo NR-10 para comércios: quadros, luminárias e revisões.", especialidades: ["Quadros", "Iluminação"], experiencia: "6 anos · Autônomo", disponibilidade: "hoje", cor: "#B45309", verificado: true }
    ];
    var _sh = seedShops(PASS);
    users = users.concat(_sh.users);

    /* --- base de serviços realizados + distância (demo) --- */
    var EXTRA = {
      u_aut_carlos: { jobs: 342, dist: 2.1 }, u_aut_joao: { jobs: 418, dist: 3.4 },
      u_aut_marina: { jobs: 377, dist: 1.8 }, u_aut_hidro: { jobs: 264, dist: 5.5 },
      u_aut_ana: { jobs: 190, dist: 3.0 }, u_aut_rafael: { jobs: 150, dist: 4.4 },
      u_aut_ju: { jobs: 140, dist: 2.6 }, u_aut_marcos: { jobs: 220, dist: 12.5 },
      u_aut_fernanda: { jobs: 120, dist: 6.1 }, u_aut_lucas: { jobs: 175, dist: 3.8 },
      u_pre_eletrosul: { jobs: 530, dist: 8.2 }, u_pre_limpa: { jobs: 812, dist: 4.0 },
      u_pre_vetor: { jobs: 340, dist: 4.2 }, u_pre_techsul: { jobs: 510, dist: 5.0 },
      u_pre_climasul: { jobs: 290, dist: 6.6 }
    };
    users.forEach(function (u) { var e = EXTRA[u.id]; if (e) { u.jobs = e.jobs; u.dist = e.dist; } });

    /* --- vitrine das lojas: dados demo de contato, redes e portfólio --- */
    var STORE = {
      u_pre_eletrosul: { capa: "g3", horario: "Seg–Sáb · 07h–19h", raio: 30, precoBase: 180, whatsapp: "(51) 99664-1000", instagram: "@eletrosul.rs", facebook: "eletrosulrs", portfolio: ["Quadro comercial 36 disjuntores — Lojas Prisma", "Retrofit LED Loja Centro — 120 pontos"] },
      u_pre_limpa: { capa: "g4", horario: "Seg–Dom · 06h–22h", raio: 20, precoBase: 90, whatsapp: "(51) 99664-2000", instagram: "@limpaforte.aurora", facebook: "limpaforte", portfolio: ["Limpeza recorrente — Clínica Vitta", "Pós-obra — Hotel Atlântico"] },
      u_pre_vetor: { capa: "g0", horario: "Seg–Sáb · 08h–18h", raio: 25, precoBase: 800, whatsapp: "(51) 99664-3000", instagram: "@vetor.seguranca", facebook: "vetorseguranca", portfolio: ["CFTV 16 câmeras — Market Sul", "Controle de acesso — Clínica Vitta"] },
      u_pre_techsul: { capa: "g5", horario: "24h · plantão", raio: 40, precoBase: 990, whatsapp: "(51) 99664-4000", instagram: "@techsul.facilities", facebook: "", portfolio: ["Preventiva mensal — Hotel Atlântico", "Hidráulica — Pão & Cia"] },
      u_pre_climasul: { capa: "g1", horario: "Seg–Sáb · 08h–18h", raio: 25, precoBase: 150, whatsapp: "(51) 99664-5000", instagram: "@climasul.pmoc", facebook: "climasulpmoc", portfolio: ["PMOC trimestral — Hotel Atlântico"] },
      u_aut_carlos: { capa: "g0", horario: "Seg–Sáb · 08h–20h", raio: 15, precoBase: 120, whatsapp: "(51) 99922-1122", instagram: "@carlos.tech.aurora", facebook: "carlostech", portfolio: ["Rede + Wi-Fi — Lojas Prisma", "Upgrade 8 PCs — Clínica Vitta"] },
      u_aut_joao: { capa: "g2", horario: "Seg–Sáb · 08h–18h", raio: 20, precoBase: 800, whatsapp: "(51) 99833-2233", instagram: "@joao.seguranca", facebook: "", portfolio: ["Kit 8 câmeras — Pão & Cia"] },
      u_aut_marina: { capa: "g1", horario: "Seg–Sáb · 08h–18h", raio: 15, precoBase: 150, whatsapp: "(51) 99744-3344", instagram: "@marina.clima", facebook: "marinaclima", portfolio: ["6 splits — Hotel Atlântico"] },
      u_aut_hidro: { capa: "g1", horario: "Seg–Sáb · 07h–19h", raio: 20, precoBase: 180, whatsapp: "(51) 99655-4455", instagram: "", facebook: "", portfolio: [] },
      u_aut_ana: { capa: "g4", horario: "Seg–Sáb · 08h–18h", raio: 20, precoBase: 35, whatsapp: "(51) 99566-5566", instagram: "@ana.pinturas", facebook: "", portfolio: ["Fachada 220m² — Market Sul"] },
      u_aut_rafael: { capa: "g3", horario: "Seg–Sex · 08h–18h", raio: 25, precoBase: 90, whatsapp: "(51) 99477-6677", instagram: "@rafael.marcenaria", facebook: "rafaelmarcenaria", portfolio: ["Balcões — Lojas Prisma"] },
      u_aut_ju: { capa: "g2", horario: "Sob agenda", raio: 30, precoBase: 650, whatsapp: "(51) 99388-7788", instagram: "@juliana.foto.eventos", facebook: "", portfolio: ["Fachada + foto corporativa — Pão & Cia"] },
      u_aut_marcos: { capa: "g5", horario: "Seg–Sáb · 07h–17h", raio: 25, precoBase: 60, whatsapp: "(51) 99299-8899", instagram: "", facebook: "", portfolio: [] },
      u_aut_fernanda: { capa: "g2", horario: "Seg–Sáb · 08h–17h", raio: 15, precoBase: 150, whatsapp: "(51) 99111-9900", instagram: "@fernanda.jardins", facebook: "fernandajardins", portfolio: ["Paisagismo — Hotel Atlântico"] },
      u_aut_lucas: { capa: "g3", horario: "Seg–Sáb · 08h–20h", raio: 15, precoBase: 450, whatsapp: "(51) 99022-1100", instagram: "@lucas.eletrica", facebook: "", portfolio: [] }
    };
    users.forEach(function (u, i) { storeDefaults(u, i); shopDefaults(u); var s = STORE[u.id]; if (s) { for (var k in s) { if (Object.prototype.hasOwnProperty.call(s, k)) u[k] = s[k]; } } });

    /* --- catálogo: 15 serviços --- */
    var services = [
      { id: "s1", titulo: "Manutenção de ar-condicionado", cat: "climatizacao", preco: 150, precoLabel: "A partir de R$ 150", dist: 6, disp: "hoje", cor: "c1", desc: "Limpeza, recarga de gás e revisão completa split e janela.", prestadores: ["u_aut_marina", "u_pre_climasul"] },
      { id: "s2", titulo: "Instalação de câmeras", cat: "seguranca", preco: 800, precoLabel: "A partir de R$ 800", dist: 4, disp: "semana", cor: "c0", desc: "Kit 8 câmeras Full HD + DVR, app e garantia de 12 meses.", prestadores: ["u_aut_joao", "u_pre_vetor", "u_aut_carlos"] },
      { id: "s3", titulo: "Manutenção de computadores", cat: "tecnologia", preco: 120, precoLabel: "A partir de R$ 120", dist: 3, disp: "hoje", cor: "c3", desc: "Formatação, SSD, backup e suporte para pequenas redes.", prestadores: ["u_aut_carlos"] },
      { id: "s4", titulo: "Instalação elétrica comercial", cat: "eletrica", preco: 450, precoLabel: "A partir de R$ 450", dist: 8, disp: "semana", cor: "c4", desc: "Quadro, disjuntores, luminárias e laudo ART.", prestadores: ["u_pre_eletrosul", "u_aut_lucas"] },
      { id: "s5", titulo: "Limpeza comercial recorrente", cat: "limpeza", preco: 90, precoLabel: "R$ 90 / visita", dist: 5, disp: "semana", cor: "c2", desc: "Equipe uniformizada, produtos inclusos e checklist.", prestadores: ["u_pre_limpa"] },
      { id: "s6", titulo: "Manutenção hidráulica", cat: "hidraulica", preco: 180, precoLabel: "A partir de R$ 180", dist: 7, disp: "semana", cor: "c4", desc: "Vazamentos, caixas, torneiras e pressurizadores.", prestadores: ["u_aut_hidro", "u_pre_techsul"] },
      { id: "s7", titulo: "Redes e infraestrutura", cat: "tecnologia", preco: 1200, precoLabel: "A partir de R$ 1.200", dist: 10, disp: "agenda", cor: "c3", desc: "Cabeamento, Wi-Fi corporativo e firewall.", prestadores: ["u_aut_carlos", "u_pre_vetor"] },
      { id: "s8", titulo: "Fachada e comunicação visual", cat: "visual", preco: 650, precoLabel: "A partir de R$ 650", dist: 12, disp: "agenda", cor: "c5", desc: "Letras caixa, adesivação e totens com instalação.", prestadores: ["u_aut_ju", "u_aut_ana"] },
      { id: "s9", titulo: "Preventiva predial mensal", cat: "manutencao", preco: 990, precoLabel: "R$ 990 / mês", dist: 9, disp: "agenda", cor: "c0", desc: "Checklist mensal, pequenos reparos e SLA 24h.", prestadores: ["u_pre_techsul"] },
      { id: "s10", titulo: "Dedetização comercial", cat: "limpeza", preco: 200, precoLabel: "A partir de R$ 200", dist: 6, disp: "semana", cor: "c2", desc: "Controle de pragas com certificado para vigilância sanitária.", prestadores: ["u_pre_limpa"] },
      { id: "s11", titulo: "Pintura comercial e fachadas", cat: "manutencao", preco: 35, precoLabel: "A partir de R$ 35/m²", dist: 5, disp: "semana", cor: "c5", desc: "Pintura interna, externa e revitalização de fachadas.", prestadores: ["u_aut_ana"] },
      { id: "s12", titulo: "Montagem de móveis e balcões", cat: "manutencao", preco: 90, precoLabel: "A partir de R$ 90", dist: 4, disp: "hoje", cor: "c4", desc: "Montagem e desmontagem com garantia para lojas e escritórios.", prestadores: ["u_aut_rafael"] },
      { id: "s13", titulo: "Jardinagem condominial", cat: "limpeza", preco: 150, precoLabel: "A partir de R$ 150", dist: 7, disp: "semana", cor: "c2", desc: "Poda, plantio e manutenção mensal de áreas verdes.", prestadores: ["u_aut_fernanda"] },
      { id: "s14", titulo: "Segurança para eventos", cat: "seguranca", preco: 150, precoLabel: "R$ 150 / agente-turno", dist: 6, disp: "agenda", cor: "c0", desc: "Equipe uniformizada com rádio para eventos corporativos.", prestadores: ["u_pre_vetor"] },
      { id: "s15", titulo: "Impermeabilização de lajes", cat: "manutencao", preco: 60, precoLabel: "A partir de R$ 60/m²", dist: 11, disp: "agenda", cor: "c1", desc: "Lajes, terraços e reservatórios com garantia de 5 anos.", prestadores: ["u_aut_marcos", "u_pre_techsul"] }
    ];

    /* --- catálogo das lojas demo (mini-sites) --- */
    var products = _sh.products;
    products.forEach(function (p) { if (p.foto == null) p.foto = null; });

    /* --- solicitações: 10 (cobrindo todo o fluxo de status) --- */
    var requests = [
      { id: "r1", empresaId: "u_emp_pao", servicoId: "s2", titulo: "Instalar 8 câmeras na loja", cat: "seguranca", desc: "Loja de 180m², 2 pavimentos. Preciso de DVR + acesso pelo celular.", local: "Vila Aurora · Loja Centro", cidade: "Vila Aurora", prazo: "até 20/09", dataDesejada: dayPlus(6), hora: "09:00", qtd: 8, orcamento: 0, status: "recebendo_propostas", criadoEm: isoPlus(-1) },
      { id: "r2", empresaId: "u_emp_atlantico", servicoId: "s1", titulo: "Revisão de 6 splits do hotel", cat: "climatizacao", desc: "Higienização + recarga se necessário, com relatório PMOC.", local: "Vila Aurora · Hotel Atlântico", cidade: "Vila Aurora", prazo: "até 25/09", dataDesejada: dayPlus(4), hora: "09:00", qtd: 6, orcamento: 1500, status: "agendado", criadoEm: isoPlus(-3) },
      { id: "r3", empresaId: "u_emp_pao", servicoId: "s4", titulo: "Troca de quadro elétrico da padaria", cat: "eletrica", desc: "Quadro antigo, disjuntores desarmando. Com ART.", local: "Vila Aurora · Pão & Cia", cidade: "Vila Aurora", prazo: "até 30/09", dataDesejada: dayPlus(-1), hora: "08:00", qtd: 1, orcamento: 3000, status: "em_andamento", criadoEm: isoPlus(-6) },
      { id: "r4", empresaId: "u_emp_prisma", servicoId: "s2", titulo: "CFTV da filial Praia", cat: "seguranca", desc: "12 câmeras IP + NVR com rede dedicada para a filial da praia.", local: "Vila Aurora · Filial Praia", cidade: "Vila Aurora", prazo: "até 28/09", dataDesejada: dayPlus(9), hora: "08:00", qtd: 12, orcamento: 0, status: "recebendo_propostas", criadoEm: isoPlus(-1) },
      { id: "r5", empresaId: "u_emp_vitta", servicoId: "s5", titulo: "Limpeza recorrente da clínica", cat: "limpeza", desc: "Limpeza 3x/semana dos consultórios e recepção, produtos inclusos.", local: "Vila Aurora · Clínica Vitta", cidade: "Vila Aurora", prazo: "início imediato", dataDesejada: dayPlus(2), hora: "07:00", qtd: 12, orcamento: 1100, status: "recebendo_propostas", criadoEm: isoPlus(-2) },
      { id: "r6", empresaId: "u_emp_market", servicoId: "s6", titulo: "Vazamento na câmara fria", cat: "hidraulica", desc: "Vazamento no dreno da câmara fria, urgente — perda de mercadoria.", local: "Vila Aurora · Market Sul", cidade: "Vila Aurora", prazo: "urgente", dataDesejada: dayPlus(1), hora: "10:00", qtd: 1, orcamento: 400, status: "recebendo_propostas", criadoEm: isoPlus(0) },
      { id: "r7", empresaId: "u_emp_prisma", servicoId: "s4", titulo: "Revisão elétrica Loja Centro", cat: "eletrica", desc: "Revisão geral do quadro + troca de 30 luminárias por LED.", local: "Vila Aurora · Loja Centro", cidade: "Vila Aurora", prazo: "outubro", dataDesejada: dayPlus(14), hora: "08:00", qtd: 1, orcamento: 4500, status: "solicitado", criadoEm: isoPlus(0) },
      { id: "r8", empresaId: "u_emp_atlantico", servicoId: "s10", titulo: "Dedetização semestral", cat: "limpeza", desc: "Dedetização de cozinha, despensa e áreas comuns com certificado.", local: "Vila Aurora · Hotel Atlântico", cidade: "Vila Aurora", prazo: "concluído", dataDesejada: dayPlus(-12), hora: "08:00", qtd: 1, orcamento: 600, status: "concluido", criadoEm: isoPlus(-16) },
      { id: "r9", empresaId: "u_emp_vitta", servicoId: "s3", titulo: "Upgrade de 8 computadores", cat: "tecnologia", desc: "Troca por SSD + memória em 8 máquinas da recepção.", local: "Vila Aurora · Clínica Vitta", cidade: "Vila Aurora", prazo: "concluído", dataDesejada: dayPlus(-20), hora: "09:00", qtd: 8, orcamento: 2400, status: "avaliado", criadoEm: isoPlus(-25) },
      { id: "r10", empresaId: "u_emp_market", servicoId: "s11", titulo: "Pintura da fachada", cat: "manutencao", desc: "Fachada de 220m² com revitalização da marquise.", local: "Vila Aurora · Market Sul", cidade: "Vila Aurora", prazo: "outubro", dataDesejada: dayPlus(12), hora: "07:30", qtd: 220, orcamento: 8000, status: "proposta_aceita", criadoEm: isoPlus(-2) }
    ];

    /* Pedidos legados: abertos (sem empresa dirigida). */
    requests.forEach(function (r) { r.prestId = null; });

    /* --- propostas: 20 --- */
    var proposals = [
      { id: "pp1", reqId: "r1", prestId: "u_aut_joao", valor: 800, dataDisp: dayPlus(3), prazo: "1 dia", msg: "Kit 8 câmeras Full HD, DVR 16 canais, instalação em 1 dia + garantia 12 meses.", garantia: "12 meses", status: "pendente", criadoEm: isoPlus(-1) },
      { id: "pp2", reqId: "r1", prestId: "u_pre_vetor", valor: 950, dataDisp: dayPlus(4), prazo: "1 dia", msg: "Equipamentos com 2 anos de garantia, homologação e suporte remoto incluso.", garantia: "24 meses", status: "pendente", criadoEm: isoPlus(-1) },
      { id: "pp3", reqId: "r1", prestId: "u_aut_carlos", valor: 1120, dataDisp: dayPlus(5), prazo: "2 dias", msg: "Câmeras IP + NVR + rede dedicada. Ideal para expansão futura.", garantia: "12 meses", status: "pendente", criadoEm: isoPlus(0) },
      { id: "pp4", reqId: "r4", prestId: "u_aut_carlos", valor: 1350, dataDisp: dayPlus(8), prazo: "2 dias", msg: "12 câmeras IP + NVR 16 canais + rede dedicada com switch PoE.", garantia: "12 meses", status: "pendente", criadoEm: isoPlus(-1) },
      { id: "pp5", reqId: "r4", prestId: "u_pre_vetor", valor: 1480, dataDisp: dayPlus(7), prazo: "2 dias", msg: "Projeto com câmeras antivandalismo + monitoramento pelo app.", garantia: "24 meses", status: "pendente", criadoEm: isoPlus(0) },
      { id: "pp6", reqId: "r5", prestId: "u_pre_limpa", valor: 1050, dataDisp: dayPlus(2), prazo: "mensal", msg: "Equipe de 3 pessoas, 3x/semana, produtos hospitalares inclusos.", garantia: "revisão 7 dias", status: "pendente", criadoEm: isoPlus(-1) },
      { id: "pp7", reqId: "r6", prestId: "u_aut_hidro", valor: 320, dataDisp: dayPlus(1), prazo: "mesmo dia", msg: "Vou hoje à tarde com detector de vazamento. Peças inclusas até R$ 80.", garantia: "90 dias", status: "pendente", criadoEm: isoPlus(0) },
      { id: "pp8", reqId: "r6", prestId: "u_pre_techsul", valor: 450, dataDisp: dayPlus(1), prazo: "mesmo dia", msg: "Técnico + ajudante ainda hoje, com relatório fotográfico.", garantia: "6 meses", status: "pendente", criadoEm: isoPlus(0) },
      { id: "pp9", reqId: "r2", prestId: "u_aut_marina", valor: 890, dataDisp: dayPlus(4), prazo: "1 dia", msg: "Higienização completa dos 6 splits + relatório PMOC.", garantia: "90 dias", status: "aceita", criadoEm: isoPlus(-3) },
      { id: "pp10", reqId: "r2", prestId: "u_pre_climasul", valor: 1150, dataDisp: dayPlus(3), prazo: "1 dia", msg: "Com PMOC assinado por responsável técnico + agenda trimestral.", garantia: "6 meses", status: "recusada", criadoEm: isoPlus(-3) },
      { id: "pp11", reqId: "r3", prestId: "u_pre_eletrosul", valor: 2900, dataDisp: dayPlus(-1), prazo: "2 dias", msg: "Quadro novo 36 disjuntores + DPS + ART inclusa.", garantia: "24 meses", status: "aceita", criadoEm: isoPlus(-6) },
      { id: "pp12", reqId: "r3", prestId: "u_aut_lucas", valor: 2400, dataDisp: dayPlus(0), prazo: "2 dias", msg: "Troca completa com material de primeira linha. ART por parceiro.", garantia: "12 meses", status: "recusada", criadoEm: isoPlus(-5) },
      { id: "pp13", reqId: "r8", prestId: "u_pre_limpa", valor: 550, dataDisp: dayPlus(-12), prazo: "1 dia", msg: "Aplicação + certificado para vigilância sanitária.", garantia: "90 dias", status: "aceita", criadoEm: isoPlus(-16) },
      { id: "pp14", reqId: "r9", prestId: "u_aut_carlos", valor: 2200, dataDisp: dayPlus(-20), prazo: "2 dias", msg: "8x SSD 480GB + 8GB RAM + backup e formatação.", garantia: "12 meses", status: "aceita", criadoEm: isoPlus(-25) },
      { id: "pp15", reqId: "r10", prestId: "u_aut_ana", valor: 7400, dataDisp: dayPlus(12), prazo: "10 dias", msg: "Andaime e preparação inclusos, tinta premium.", garantia: "24 meses", status: "aceita", criadoEm: isoPlus(-2) },
      { id: "pp16", reqId: "r10", prestId: "u_pre_techsul", valor: 8600, dataDisp: dayPlus(11), prazo: "12 dias", msg: "Equipe própria + engenheiro responsável.", garantia: "36 meses", status: "recusada", criadoEm: isoPlus(-1) },
      { id: "pp17", reqId: "r4", prestId: "u_aut_joao", valor: 1290, dataDisp: dayPlus(9), prazo: "2 dias", msg: "Kit IP com NVR + acesso remoto configurado.", garantia: "12 meses", status: "pendente", criadoEm: isoPlus(0) },
      { id: "pp18", reqId: "r5", prestId: "u_aut_fernanda", valor: 980, dataDisp: dayPlus(2), prazo: "mensal", msg: "Limpeza + jardinagem da entrada como cortesia.", garantia: "7 dias", status: "pendente", criadoEm: isoPlus(0) },
      { id: "pp19", reqId: "r1", prestId: "u_pre_techsul", valor: 1100, dataDisp: dayPlus(6), prazo: "2 dias", msg: "Instalação com eletrocalha dedicada + nobreak para o DVR.", garantia: "18 meses", status: "pendente", criadoEm: isoPlus(0) },
      { id: "pp20", reqId: "r6", prestId: "u_aut_lucas", valor: 280, dataDisp: dayPlus(0), prazo: "hoje", msg: "Consigo ir ainda hoje após as 15h.", garantia: "90 dias", status: "pendente", criadoEm: isoPlus(0) }
    ];

    /* --- agendamentos: 6 --- */
    var schedules = [
      { id: "a1", reqId: "r2", propId: "pp9", contratanteId: "u_emp_atlantico", prestId: "u_aut_marina", titulo: "Revisão de 6 splits do hotel", local: "Hotel Atlântico", data: dayPlus(4), hora: "09:00", status: "agendado" },
      { id: "a2", reqId: "r3", propId: "pp11", contratanteId: "u_emp_pao", prestId: "u_pre_eletrosul", titulo: "Troca de quadro elétrico da padaria", local: "Pão & Cia", data: dayPlus(-1), hora: "08:00", status: "em_andamento" },
      { id: "a3", reqId: "r10", propId: "pp15", contratanteId: "u_emp_market", prestId: "u_aut_ana", titulo: "Pintura da fachada", local: "Market Sul", data: dayPlus(12), hora: "07:30", status: "agendado" },
      { id: "a4", reqId: "r8", propId: "pp13", contratanteId: "u_emp_atlantico", prestId: "u_pre_limpa", titulo: "Dedetização semestral", local: "Hotel Atlântico", data: dayPlus(-12), hora: "08:00", status: "concluido" },
      { id: "a5", reqId: "r9", propId: "pp14", contratanteId: "u_emp_vitta", prestId: "u_aut_carlos", titulo: "Upgrade de 8 computadores", local: "Clínica Vitta", data: dayPlus(-20), hora: "09:00", status: "avaliado" },
      { id: "a6", reqId: "r2", propId: "pp9", contratanteId: "u_emp_atlantico", prestId: "u_aut_marina", titulo: "Manutenção preventiva trimestral", local: "Hotel Atlântico", data: dayPlus(-2), hora: "09:00", status: "concluido" }
    ];

    /* --- avaliações --- */
    var reviews = [
      { id: "av1", agId: "a5", reqId: "r9", deId: "u_emp_vitta", paraId: "u_aut_carlos", estrelas: 5, texto: "Máquinas voando, backup impecável. Voltaremos a contratar.", criadoEm: isoPlus(-18) },
      { id: "av2", agId: "a4", reqId: "r8", deId: "u_emp_atlantico", paraId: "u_pre_limpa", estrelas: 5, texto: "Equipe pontual, certificado entregue no mesmo dia.", criadoEm: isoPlus(-11) },
      { id: "av3", agId: "a5", reqId: "r9", deId: "u_emp_vitta", paraId: "u_aut_carlos", estrelas: 4, texto: "Bom serviço, só atrasou 1h na entrega.", criadoEm: isoPlus(-17) },
      { id: "av4", agId: "a6", reqId: "r2", deId: "u_emp_atlantico", paraId: "u_aut_marina", estrelas: 5, texto: "Relatório PMOC impecável. Voltaremos a contratar.", criadoEm: isoPlus(-1) },
      { id: "av5", agId: "a4", reqId: "r8", deId: "u_emp_atlantico", paraId: "u_pre_limpa", estrelas: 4, texto: "Bom padrão de limpeza. Só ajustar o horário de reposição.", criadoEm: isoPlus(-10) },
      { id: "av6", agId: "a2", reqId: "r3", deId: "u_emp_pao", paraId: "u_pre_eletrosul", estrelas: 5, texto: "Resolveram em um dia o que dois orçamentos enrolaram por semanas.", criadoEm: isoPlus(-2) },
      { id: "av7", agId: "a1", reqId: "r2", deId: "u_emp_atlantico", paraId: "u_aut_marina", estrelas: 5, texto: "Orçamento fechado cumprido à risca.", criadoEm: isoPlus(-3) },
      { id: "av8", agId: "a3", reqId: "r10", deId: "u_emp_market", paraId: "u_aut_ana", estrelas: 5, texto: "Amostra de cor aprovada de primeira. Profissional caprichosa.", criadoEm: isoPlus(-1) }
    ];

    /* --- conversas + mensagens --- */
    var convs = [
      { id: "c1", reqId: "r1", parts: ["u_emp_pao", "u_aut_joao"], titulo: "Instalar 8 câmeras · R$ 800", atualizadoEm: isoPlus(0) },
      { id: "c2", reqId: "r2", parts: ["u_emp_atlantico", "u_aut_marina"], titulo: "6 splits · agendado", atualizadoEm: isoPlus(-1) },
      { id: "c3", reqId: "r3", parts: ["u_emp_pao", "u_pre_eletrosul"], titulo: "Quadro elétrico · ART inclusa", atualizadoEm: isoPlus(-1) }
    ];
    var msgs = [
      { id: uid("m"), convId: "c1", deId: "u_emp_pao", texto: "Olá! Consigo instalar dia 17 pela manhã. Posso visitar hoje para medir?", lida: true, criadoEm: isoPlus(-1) },
      { id: uid("m"), convId: "c1", deId: "u_aut_joao", texto: "Olá! Posso sim — passo às 16h na Loja Centro e já levo o projeto.", lida: true, criadoEm: isoPlus(-1) },
      { id: uid("m"), convId: "c1", deId: "u_aut_joao", texto: "Fechado! Levo as opções de câmeras e o DVR para você ver.", lida: false, criadoEm: isoPlus(0) },
      { id: uid("m"), convId: "c2", deId: "u_aut_marina", texto: "Confirmado para o dia agendado às 09h. Levo escada e capa de proteção.", lida: false, criadoEm: isoPlus(-1) },
      { id: uid("m"), convId: "c2", deId: "u_emp_atlantico", texto: "Ótimo, recepção avisada.", lida: true, criadoEm: isoPlus(-1) },
      { id: uid("m"), convId: "c3", deId: "u_pre_eletrosul", texto: "Enviei o laudo preliminar no anexo da proposta.", lida: false, criadoEm: isoPlus(-1) }
    ];

    /* --- notificações --- */
    var notifs = [
      { id: uid("n"), userId: "u_emp_pao", tipo: "proposta", titulo: "Nova proposta", texto: "João Segurança enviou proposta para “Instalar 8 câmeras”.", link: "#/app/solicitacao/r1", lida: false, criadoEm: isoPlus(0) },
      { id: uid("n"), userId: "u_emp_pao", tipo: "mensagem", titulo: "Nova mensagem", texto: "João Segurança: “Fechado! Levo as opções de câmeras…”.", link: "#/app/mensagens", lida: false, criadoEm: isoPlus(0) },
      { id: uid("n"), userId: "u_emp_atlantico", tipo: "agendado", titulo: "Agendamento confirmado", texto: "Manutenção de ar-condicionado com Marina Clima.", link: "#/app/agenda", lida: false, criadoEm: isoPlus(-1) },
      { id: uid("n"), userId: "u_aut_joao", tipo: "oportunidade", titulo: "Nova oportunidade", texto: "CFTV da filial Praia — Vila Aurora, orçamento aberto.", link: "#/app/oportunidades", lida: false, criadoEm: isoPlus(0) },
      { id: uid("n"), userId: "u_aut_carlos", tipo: "avaliacao", titulo: "Avaliação recebida", texto: "Você recebeu 5★ de Clínica Vitta.", link: "#/app/perfil", lida: false, criadoEm: isoPlus(-18) }
    ];

    var favs = [
      { userId: "u_emp_prisma", tipo: "profissional", refId: "u_aut_joao" },
      { userId: "u_emp_prisma", tipo: "servico", refId: "s2" }
    ];

    var out = {
      v: 15, users: users, services: services, requests: requests,
      proposals: proposals, schedules: schedules, reviews: reviews,
      convs: convs, msgs: msgs, notifs: notifs, favs: favs, products: products,
      cart: { items: [] }, orders: [],
      session: null, seededAt: new Date().toISOString()
    };
    return applySeedPhotos(out, false);
  }

  /* Foto do dono: lê o arquivo, comprime via canvas e devolve data-URL JPEG.
     Sem isso o base64 estouraria o localStorage. Rejeita não-imagem e >5MB. */
  function readPhoto(file, maxDim) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type || "")) return reject(new Error("tipo"));
      if (file.size > 5 * 1024 * 1024) return reject(new Error("tamanho"));
      var rd = new FileReader();
      rd.onload = function () {
        var img = new Image();
        img.onload = function () {
          try {
            var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
            var s = Math.min(1, (maxDim || 1200) / Math.max(w, h));
            var cw = Math.max(1, Math.round(w * s)), ch = Math.max(1, Math.round(h * s));
            var cv = document.createElement("canvas");
            cv.width = cw; cv.height = ch;
            cv.getContext("2d").drawImage(img, 0, 0, cw, ch);
            resolve(cv.toDataURL("image/jpeg", 0.82));
          } catch (e) { reject(e); }
        };
        img.onerror = function () { reject(new Error("leitura")); };
        img.src = rd.result;
      };
      rd.onerror = function () { reject(new Error("leitura")); };
      rd.readAsDataURL(file);
    });
  }

  /* ---------------- API ---------------- */
  var NexoStore = {
    load: function () {
      try {
        var raw = localStorage.getItem(KEY);
        if (!raw) { var d = seed(); localStorage.setItem(KEY, JSON.stringify(d)); return d; }
        var db = JSON.parse(raw);
        if (!db || !db.users) { var d2 = seed(); localStorage.setItem(KEY, JSON.stringify(d2)); return d2; }
        if (db.v >= 1 && db.v <= 14) { db = migrate(db); try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (_) {} return db; }
        if (db.v !== 15) { var d3 = seed(); localStorage.setItem(KEY, JSON.stringify(d3)); return d3; }
        if (!db.products) db.products = [];
        if (!db.cart) db.cart = { items: [] };
        if (!db.cart.items) db.cart.items = [];
        if (!db.orders) db.orders = [];
        return db;
      } catch (e) {
        var d3 = seed();
        try { localStorage.setItem(KEY, JSON.stringify(d3)); } catch (_) {}
        return d3;
      }
    },
    save: function (db) { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} },
    reset: function () {
      try { localStorage.removeItem(KEY); } catch (e) {}
      return this.load();
    },
    uid: uid,
    dayPlus: dayPlus,
    readPhoto: readPhoto
  };

  global.NexoStore = NexoStore;
})(window);
