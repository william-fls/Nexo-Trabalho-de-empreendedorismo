/* ================================================================
   Nexo — motor do MVP (site público + painel funcional, sem build)
   Camada de dados: js/store.js (NexoStore). Nenhum localStorage aqui.
   ================================================================ */
(function () {
"use strict";

/* ---------- base ---------- */
var db = NexoStore.load();
function save() { NexoStore.save(db); }
function $(s, el) { return (el || document).querySelector(s); }
function $all(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
function esc(v) {
  return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function norm(v) {
  return String(v == null ? "" : v).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function BRL(v) {
  if (v === 0 || v === "0") return "Orçamento aberto";
  if (!v && v !== 0) return "A combinar";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function fdate(iso) { if (!iso) return "—"; var p = String(iso).slice(0, 10).split("-"); return p[2] + "/" + p[1]; }
function fdateFull(iso) { if (!iso) return "—"; var p = String(iso).slice(0, 10).split("-"); return p[2] + "/" + p[1] + "/" + p[0]; }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function initials(n) { return String(n || "?").trim().split(/\s+/).map(function (w) { return w[0]; }).slice(0, 2).join("").toUpperCase(); }
function timeAgo(iso) {
  var d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 3600) return "há " + Math.max(1, Math.round(d / 60)) + " min";
  if (d < 86400) return "há " + Math.round(d / 3600) + " h";
  if (d < 86400 * 7) return "há " + Math.round(d / 86400) + " dias";
  return fdateFull(iso);
}

/* ---------- domínio ---------- */
var CATS = [
  { id: "manutencao", name: "Manutenção", icon: "🔧" },
  { id: "climatizacao", name: "Climatização", icon: "❄️" },
  { id: "tecnologia", name: "Tecnologia", icon: "💻" },
  { id: "seguranca", name: "Segurança", icon: "📹" },
  { id: "limpeza", name: "Limpeza", icon: "🧹" },
  { id: "eletrica", name: "Elétrica", icon: "⚡" },
  { id: "hidraulica", name: "Hidráulica", icon: "🚰" },
  { id: "visual", name: "Com. visual", icon: "🎨" }
];
function catOf(id) { for (var i = 0; i < CATS.length; i++) if (CATS[i].id === id) return CATS[i]; return { id: id, name: id, icon: "📦" }; }

var STATUS = ["solicitado", "recebendo_propostas", "proposta_aceita", "agendado", "em_andamento", "concluido", "avaliado"];
var STATUS_LB = { solicitado: "Solicitado", recebendo_propostas: "Recebendo propostas", proposta_aceita: "Proposta aceita", agendado: "Agendado", em_andamento: "Em andamento", concluido: "Concluído", avaliado: "Avaliado" };
var STATUS_CL = { solicitado: "", recebendo_propostas: "warn", proposta_aceita: "info", agendado: "info", em_andamento: "warn", concluido: "ok", avaliado: "ok" };

function me() { return db.users.filter(function (u) { return u.id === db.session; })[0] || null; }
function userById(id) { return db.users.filter(function (u) { return u.id === id; })[0] || null; }
function svcById(id) { return db.services.filter(function (s) { return s.id === id; })[0] || null; }
function reqById(id) { return db.requests.filter(function (r) { return r.id === id; })[0] || null; }
function isProv(u) { return !!u && (u.tipo === "autonomo" || u.tipo === "prestadora" || u.tipo === "loja"); }
function isLabor(u) { return !!u && (u.tipo === "autonomo" || u.tipo === "prestadora"); }
function isEmp(u) { return !!u && u.tipo === "empresa"; }
function isLoja(u) { return !!u && u.tipo === "loja"; }
function isCliente(u) { return !!u && u.tipo === "cliente"; }
function canContract(u) { return isEmp(u) || isLoja(u) || isCliente(u); }
function hasStore(u) { return isProv(u) || isLoja(u); }
function tipoLabel(t) { return t === "empresa" ? "Empresa contratante" : t === "prestadora" ? "Empresa prestadora" : t === "loja" ? "Loja / Comércio local" : t === "cliente" ? "Pessoa física" : "Profissional autônomo"; }
function favKind(u) { return !u ? "empresa" : u.tipo === "autonomo" ? "profissional" : u.tipo === "loja" ? "loja" : "empresa"; }

function ratingOf(uid_) {
  var rs = db.reviews.filter(function (r) { return r.paraId === uid_; });
  if (!rs.length) return { m: 0, t: 0 };
  return { m: rs.reduce(function (a, b) { return a + b.estrelas; }, 0) / rs.length, t: rs.length };
}
function starsHTML(m, t) {
  if (!t) return '<span class="muted">Novo · sem avaliações</span>';
  var s = "";
  for (var i = 1; i <= 5; i++) s += i <= Math.round(m) ? "★" : "☆";
  return '<span class="stars" title="' + m.toFixed(1) + '">' + s + "</span> " + m.toFixed(1).replace(".", ",") + (t ? " (" + t + ")" : "");
}
function jobsOf(u) {
  var done = db.schedules.filter(function (a) { return a.prestId === u.id; }).length;
  return (u.jobs || 0) + done;
}
function svcProviders(s) { return (s.prestadores || []).map(userById).filter(Boolean); }
function svcRating(s) {
  var ps = svcProviders(s), vals = [], tot = 0;
  ps.forEach(function (p) { var r = ratingOf(p.id); if (r.t) { vals.push(r.m); tot += r.t; } });
  if (!vals.length) return { m: 4.9, t: 0, demo: true };
  return { m: vals.reduce(function (a, b) { return a + b; }, 0) / vals.length, t: tot, demo: false };
}
function dispLabel(d) {
  return d === "hoje" ? "Disponível hoje" : d === "semana" ? "Disponível esta semana" : d === "agenda" ? "Sob agenda" : (d || "A combinar");
}
function proposalsOf(reqId) { return db.proposals.filter(function (p) { return p.reqId === reqId; }).sort(function (a, b) { return a.valor - b.valor; }); }
function isFav(tipo, refId) { var u = me(); return !!u && db.favs.some(function (f) { return f.userId === u.id && f.tipo === tipo && f.refId === refId; }); }
function unreadNotifs() { var u = me(); return u ? db.notifs.filter(function (n) { return n.userId === u.id && !n.lida; }).length : 0; }
function unreadMsgs() {
  var u = me(); if (!u) return 0;
  var mine = db.convs.filter(function (c) { return c.parts.indexOf(u.id) >= 0; }).map(function (c) { return c.id; });
  return db.msgs.filter(function (m) { return mine.indexOf(m.convId) >= 0 && m.deId !== u.id && !m.lida; }).length;
}
function notify(userId, tipo, titulo, texto, link) {
  db.notifs.unshift({ id: NexoStore.uid("n"), userId: userId, tipo: tipo, titulo: titulo, texto: texto, link: link || "#/app/notificacoes", lida: false, criadoEm: new Date().toISOString() });
  save(); paintChrome();
}

/* ---------- toast + modal ---------- */
function toast(msg) {
  var root = $("#toast-root"); if (!root) return;
  var t = document.createElement("div");
  t.className = "toast"; t.textContent = msg;
  root.appendChild(t);
  setTimeout(function () { t.remove(); }, 3400);
}
function openModal(title, html) {
  $("#modalTitle").textContent = title;
  $("#modalBody").innerHTML = html;
  $("#modalScrim").hidden = false;
  document.body.style.overflow = "hidden";
}
function closeModal() {
  $("#modalScrim").hidden = true;
  $("#modalBody").innerHTML = "";
  document.body.style.overflow = "";
}
function setErr(id, msg) {
  var e = $("#" + id); if (!e) { toast(msg); return; }
  e.textContent = msg; e.hidden = false;
}
function needLogin(msg) {
  if (!me()) { location.hash = "#/login"; toast(msg || "Entre ou crie uma conta para continuar."); return true; }
  return false;
}

/* ---------- roteador ---------- */
function parseHash() {
  var h = location.hash || "#/";
  var parts = h.slice(1).split("?");
  var segs = parts[0].split("/").filter(Boolean);
  var q = {};
  (parts[1] || "").split("&").forEach(function (kv) {
    if (!kv) return;
    var p = kv.split("=");
    q[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || "");
  });
  return { segs: segs, q: q };
}
function route() {
  var r = parseHash(), segs = r.segs, q = r.q;
  window.scrollTo(0, 0);
  closeModal(); hidePop();
  if (segs[0] === "profissionais" || segs[0] === "buscar" || !segs[0]) { location.hash = "#/explorar"; return; }
  if (segs[0] === "app") { showApp(); renderApp(segs.slice(1).join("/") || "dashboard"); }
  else {
    showPublic();
    var v = segs[0] || "explorar";
    if (v === "explorar") renderBuscar(q);
    else if (v === "perfil") renderPerfil(segs[1]);
    else if (v === "carrinho") renderCarrinho();
    else if (v === "login") { touchSteps(1); }
    else if (v === "cadastro") prepCadastro(q);
    showView("view-" + v);
  }
  paintChrome();
  $all(".nav-desktop a").forEach(function (a) {
    var href = a.getAttribute("href") || "";
    a.classList.toggle("active", href === "#/" + (segs[0] || ""));
  });
}
function showView(id) {
  var ok = !!document.getElementById(id);
  $all("#publicZone .view").forEach(function (v) { v.hidden = v.id !== id; });
  if (!ok) { $("#view-explorar").hidden = false; }
}
function showPublic() {
  $("#publicZone").hidden = false;
  $("#appZone").hidden = true;
  $("#siteFooter").hidden = false;
}
function showApp() {
  $("#publicZone").hidden = true;
  $("#appZone").hidden = false;
  $("#siteFooter").hidden = true;
}

/* ---------- chrome (header, sino, drawer) ---------- */
var HEADER_DEFAULT = null;
function paintChrome() {
  var u = me(), ha = $(".header-actions");
  if (ha) {
    if (!HEADER_DEFAULT) HEADER_DEFAULT = ha.innerHTML;
    if (u) {
      var tgt = swapTarget();
      var swapTitle = tgt ? "Trocar para " + tgt.nome + " (" + tipoLabel(tgt.tipo) + ")" : "Trocar de conta (demo)";
      ha.innerHTML =
        '<a href="#/carrinho" class="icon-btn bell" aria-label="Sacola">🛒<em id="cartCount" style="display:none">0</em></a>' +
        '<button class="icon-btn swap-btn" onclick="Nexo.switchAccount()" title="' + esc(swapTitle) + '" aria-label="Trocar de conta (demo)">⇄</button>' +
        '<a href="#/app/dashboard" class="btn btn-secondary btn-sm btn-open-panel">Abrir painel</a>' +
        '<button class="avatar-btn" data-route="perfil" title="' + esc(u.nome) + '">' + esc(initials(u.nome)) + "</button>" +
        '<button class="icon-btn hamburger" id="openMenu" aria-label="Abrir menu" style="display:inline-flex">☰</button>';
    } else {
      ha.innerHTML = HEADER_DEFAULT;
    }
  }
  var wsN = $("#wsName"), wsR = $("#wsRole"), av = $(".avatar-btn");
  if (u) {
    if (wsN) wsN.textContent = u.nome;
    if (wsR) wsR.textContent = tipoLabel(u.tipo) + " · " + (u.cidade || "");
    if (av && av.hasAttribute("data-route")) av.textContent = initials(u.nome);
  }
  var n = unreadNotifs(), bell = $("#bellDot");
  if (bell) { bell.textContent = n; bell.style.display = n ? "flex" : "none"; }
  paintCartBadge();
}
function hidePop() { var p = $("#notifPop"); if (p) p.hidden = true; }
function renderPop() {
  var p = $("#notifPop"); if (!p) return;
  var u = me();
  var list = u ? db.notifs.filter(function (x) { return x.userId === u.id; }).slice(0, 5) : null;
  p.innerHTML = "<h4>Notificações</h4>" + (list
    ? (list.length ? list.map(function (x) {
        return '<div class="notif"><strong>' + (x.lida ? "" : "● ") + esc(x.titulo) + "</strong><p>" + esc(x.texto) + "</p><small>" + timeAgo(x.criadoEm) + "</small></div>";
      }).join("") + '<a class="btn btn-secondary btn-sm btn-block" href="#/app/notificacoes">Ver todas</a>'
      : '<div class="notif"><p>Sem notificações por aqui.</p></div>')
    : '<div class="notif"><strong>Nova proposta</strong><p>João Segurança enviou proposta para “Instalar 8 câmeras”.</p><small>há 12 min</small></div><div class="notif"><strong>Agendamento confirmado</strong><p>Manutenção de ar-condicionado · Qui 09:00.</p><small>há 1 h</small></div><div class="notif"><strong>Avaliação recebida</strong><p>Você recebeu 5★ de Hotel Atlântico.</p><small>ontem</small></div><a class="btn btn-secondary btn-sm btn-block" href="#/login">Entrar para ver as suas</a>');
  p.hidden = !p.hidden;
}

/* ================================================================
   SITE PÚBLICO
   ================================================================ */
function svcCard(s) {
  var c = catOf(s.cat), r = svcRating(s), fav = isFav("servico", s.id);
  return '<article class="svc"><div class="svc-cover ' + s.cor + '"><span>' + c.icon + " " + esc(c.name) + "</span></div>" +
    '<div class="svc-body"><h3>' + esc(s.titulo) + "</h3>" +
    '<div class="svc-meta"><span>' + (r.t ? "★ " + r.m.toFixed(1).replace(".", ",") : "★ novo") + "</span><span>·</span><span>" + s.dist + " km</span><span>·</span><span>" + esc(dispLabel(s.disp)) + "</span></div>" +
    '<p class="muted" style="margin:0;font-size:.88rem">' + esc(s.desc) + "</p>" +
    '<div class="row" style="gap:.4rem">' + svcProviders(s).slice(0, 3).map(function (p) {
      return '<a class="badge" href="#/perfil/' + p.id + '">' + esc(p.nome.split(" ")[0]) + " ★ " + (ratingOf(p.id).t ? ratingOf(p.id).m.toFixed(1).replace(".", ",") : "novo") + "</a>";
    }).join("") + "</div>" +
    '<div class="svc-foot"><strong>' + esc(s.precoLabel) + '</strong><span class="row" style="gap:.4rem"><button class="fav' + (fav ? " on" : "") + '" onclick="Nexo.fav(\'servico\',\'' + s.id + "')\" aria-label=\"Favoritar\">" + (fav ? "❤️" : "🤍") + "</button>" +
    '<button class="btn btn-secondary btn-xs" onclick="Nexo.svcModal(\'' + s.id + '\')">Ver</button><button class="btn btn-primary btn-xs" onclick="Nexo.askService(\'' + s.id + '\')">Pedir</button></span></div></div></article>';
}
function proCard(p) {
  var r = ratingOf(p.id), on = (p.disponibilidade === "hoje"), fk = favKind(p), fav = isFav(fk, p.id);
  return '<article class="pro"><div class="pro-top"><span class="pro-avatar" style="background:' + p.cor + '">' + esc(initials(p.nome)) + "</span>" +
    '<div style="flex:1"><strong>' + esc(p.nome) + "</strong><small>" + esc((p.especialidades || [tipoLabel(p.tipo)])[0]) + (p.verificado ? " · ✓ Verificado" : "") + "</small>" +
    '<span class="avail' + (on ? "" : " off") + '"><i></i>' + esc(dispLabel(p.disponibilidade)) + "</span></div>" +
    '<button class="fav' + (fav ? " on" : "") + '" onclick="Nexo.fav(\'' + fk + "','" + p.id + "')\" aria-label=\"Favoritar\">" + (fav ? "❤️" : "🤍") + "</button></div>" +
    '<div class="pro-stats"><span><strong>' + (r.t ? r.m.toFixed(1).replace(".", ",") + "★" : "novo") + "</strong> " + (r.t || "sem avaliações") + "</span><span><strong>" + jobsOf(p) + "</strong> serviços</span><span>" + (p.dist != null ? p.dist + " km" : esc(p.cidade || "")) + "</span></div>" +
    '<p class="muted" style="margin:0;font-size:.88rem">' + esc(p.descricao || "") + "</p>" +
    '<div class="row"><a class="btn btn-secondary btn-sm" href="#/perfil/' + p.id + '">Ver perfil</a><button class="btn btn-primary btn-sm" onclick="Nexo.talk(\'' + p.id + "')\">Conversar</button></div></article>";
}
function providers() { return db.users.filter(isProv); }
function professionals() { return db.users.filter(isLabor); }
function shops() { return db.users.filter(function (u) { return u.tipo === "loja"; }); }
var SHOP_CATS = [
  { id: "Moda", name: "Moda", icon: "👗" },
  { id: "Alimentos", name: "Alimentos", icon: "🍞" },
  { id: "Beleza", name: "Beleza", icon: "💅" },
  { id: "Casa", name: "Casa", icon: "🛋" },
  { id: "Saúde", name: "Saúde", icon: "💊" },
  { id: "Outros", name: "Outros", icon: "🏪" }
];
function shopCatName(id) { for (var i = 0; i < SHOP_CATS.length; i++) if (SHOP_CATS[i].id === id) return SHOP_CATS[i].name; return id || "Loja"; }
function shopProducts(lojaId) { return (db.products || []).filter(function (p) { return p.lojaId === lojaId; }); }
/* Categorias do catálogo na ordem do dono (só as que têm produto). */
function shopCats(lojaId) {
  var u = userById(lojaId), order = (u && u.menuCats) || [], seen = [];
  shopProducts(lojaId).forEach(function (p) {
    var c = p.cat || "Geral";
    if (seen.indexOf(c) < 0) seen.push(c);
  });
  var out = order.filter(function (c) { return seen.indexOf(c) >= 0; });
  seen.forEach(function (c) { if (out.indexOf(c) < 0) out.push(c); });
  return out;
}
/* Catálogo estilo iFood web: rail lateral + seções; "Mais vendidos" = 4 primeiros. */
function menuRowHTML(id, title, items, u) {
  return '<div class="menu-sec" id="' + id + '"><h3>' + esc(title) + "</h3>" + '<div class="menu-row">' + items.map(function (p) { return prodMenuHTML(p, u); }).join("") + "</div></div>";
}
function menuHTML(u) {
  var prods = shopProducts(u.id);
  if (!prods.length) return '<div class="empty"><div class="empty-art">🏷</div><p class="muted">Catálogo em breve.</p></div>';
  function link(cls, id, label) { return '<button class="' + cls + '" onclick="Nexo.menuGo(\'' + id + '\',this)">' + label + "</button>"; }
  var cats = shopCats(u.id);
  var rail = '<div class="menu-rail">' + link("menu-link", "sec-top", "★ Mais vendidos") + cats.map(function (c, i) { return link("menu-link", "sec-" + i, esc(c)); }).join("") + "</div>";
  var chips = '<div class="menu-chips">' + link("chip", "sec-top", "★ Mais vendidos") + cats.map(function (c, i) { return link("chip", "sec-" + i, esc(c)); }).join("") + "</div>";
  return chips + '<div class="menu-layout">' + rail + '<div class="menu-body">' +
    menuRowHTML("sec-top", "★ Mais vendidos", prods.slice(0, 4), u) +
    cats.map(function (c, i) { return menuRowHTML("sec-" + i, c, prods.filter(function (p) { return (p.cat || "Geral") === c; }), u); }).join("") +
    "</div></div>";
}
var FTIPO = "todos";
function openNow(p) { return !!p && p.disponibilidade === "hoje"; }
function coverClass(u) { return "cover-" + ((u && u.capa) || "g0"); }
function storePrice(u) { return u && u.precoBase > 0 ? "A partir de " + BRL(u.precoBase) : "A combinar"; }

/* ----- redes e contato da loja ----- */
function digits(v) { return String(v || "").replace(/\D/g, ""); }
function waLink(u) {
  var d = digits(u.whatsapp || u.telefone);
  if (d.length < 10 || d.length > 13) return null;
  return "https://wa.me/" + (d.length <= 11 ? "55" + d : d);
}
function instaUrl(h) {
  h = String(h || "").trim().replace(/^@/, "");
  if (!h || /\s/.test(h)) return null;
  if (/^https?:\/\//i.test(h)) return h;
  return "https://instagram.com/" + h;
}
function fbUrl(h) {
  h = String(h || "").trim();
  if (!h || /\s/.test(h)) return null;
  if (/^https?:\/\//i.test(h)) return h;
  return "https://facebook.com/" + h;
}
/* Ícone oficial do WhatsApp (SVG inline). */
function waIcon() {
  return '<svg class="wa-ic" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';
}

/* ----- card estilo "loja" (home iFood) ----- */
function storeCard(p) {
  var r = ratingOf(p.id), fk = favKind(p), fav = isFav(fk, p.id);
  var cat = p.tipo === "loja" ? (p.categoriaLoja || "Loja") : ((p.especialidades || [])[0] || tipoLabel(p.tipo));
  return '<article class="store-card" onclick="location.hash=\'#/perfil/' + p.id + '\'">' +
    '<span class="pro-avatar store-logo" style="background:' + p.cor + '">' + esc(initials(p.nome)) + "</span>" +
    '<div class="store-info"><strong>' + esc(p.nome) + (p.verificado ? ' <span class="seal">✓</span>' : "") + "</strong>" +
    '<span class="store-sub">★ ' + (r.t ? r.m.toFixed(1).replace(".", ",") + " (" + r.t + ")" : "novo") + " · " + esc(cat) + " · " + (p.dist != null ? p.dist + " km" : esc(p.cidade || "")) + "</span>" +
    '<span class="avail' + (openNow(p) ? "" : " off") + '"><i></i>' + (openNow(p) ? "Aberto agora" : esc(dispLabel(p.disponibilidade))) + "</span></div>" +
    '<div class="store-side"><button class="fav' + (fav ? " on" : "") + '" onclick="event.stopPropagation();Nexo.fav(\'' + fk + "','" + p.id + "')\" aria-label=\"Favoritar\">" + (fav ? "❤️" : "🤍") + "</button>" +
    "<small>" + esc(storePrice(p)) + "</small></div></article>";
}
function shopMatch(p) {
  var q = norm(F.q || "");
  if (!q) return true;
  var hay = norm(p.nome + " " + (p.categoriaLoja || "") + " " + (p.descricao || "") + " " + (p.cidade || "") + " " + (p.endereco || ""));
  return hay.indexOf(q) >= 0;
}
/* Filtros de gente (valem p/ Lojas e Profissionais): nota (só quem tem avaliação), distância e disponibilidade. */
function peopleMatch(p) {
  var r = ratingOf(p.id);
  if (r.t && r.m < F.rating) return false;
  if ((p.dist == null ? 99 : p.dist) > F.dist) return false;
  if (F.avail && p.disponibilidade === "agenda") return false;
  return true;
}
function shopPriceMatch(p) {
  if (!F.price) return true;
  var v = p.precoBase || 0;
  if (!v) return true;
  if (F.price === "low") return v <= 300;
  if (F.price === "mid") return v >= 300 && v <= 800;
  return v >= 800;
}
function byRating(a, b) { return ((ratingOf(b.id).m || 0) - (ratingOf(a.id).m || 0)) || ((a.dist || 99) - (b.dist || 99)); }

/* ----- buscar (pesquisa funcional, sem reload) ----- */
var F = { q: "", cats: {}, loc: "", dist: 15, rating: 4.5, price: "", date: "", avail: true, sort: "relevance" };
function renderBuscar(q) {
  F.q = q.q || ""; F.cats = {};
  if (q.cat) F.cats[q.cat] = true;
  if (q.loc) F.loc = q.loc;
  $all("#typeSeg [data-tipo]").forEach(function (b) { b.classList.toggle("active", (b.getAttribute("data-tipo") || "todos") === FTIPO); });
  $("#fQ").value = F.q;
  if (q.loc) $("#fLoc").value = q.loc;
  $("#fCats").innerHTML = CATS.map(function (c) {
    return '<label><input type="checkbox" data-cat="' + c.id + '"' + (F.cats[c.id] ? " checked" : "") + "> " + c.icon + " " + esc(c.name) + "</label>";
  }).join("");
  $all("#fCats input").forEach(function (cb) { cb.addEventListener("change", function () { F.cats[cb.getAttribute("data-cat")] = cb.checked; applySearch(); }); });
  applySearch();
}
function svcMatch(s) {
  var q = norm(F.q || "");
  if (q) {
    var prov = svcProviders(s).map(function (p) { return p.nome + " " + (p.especialidades || []).join(" "); }).join(" ");
    var hay = norm(s.titulo + " " + catOf(s.cat).name + " " + s.desc + " " + prov);
    if (hay.indexOf(q) < 0) return false;
  }
  var anyCat = Object.keys(F.cats).some(function (k) { return F.cats[k]; });
  if (anyCat && !F.cats[s.cat]) return false;
  if (s.dist > F.dist) return false;
  if (svcRating(s).m < F.rating) return false;
  if (F.price === "low" && s.preco > 300) return false;
  if (F.price === "mid" && (s.preco < 300 || s.preco > 800)) return false;
  if (F.price === "high" && s.preco < 800) return false;
  if (F.avail && ["agenda"].indexOf(s.disp) >= 0) return false;
  var loc = norm(F.loc || "");
  if (loc && loc.indexOf("aurora") < 0) {
    var where = norm(svcProviders(s).map(function (p) { return p.cidade || ""; }).join(" "));
    if (where.indexOf(norm(loc.split("/")[0]).trim()) < 0 && norm(s.desc).indexOf(norm(loc.split("/")[0]).trim()) < 0) return false;
  }
  return true;
}
function proMatch(p) {
  var q = norm(F.q || "");
  if (!q) return true;
  var hay = norm(p.nome + " " + (p.especialidades || []).join(" ") + " " + (p.descricao || "") + " " + (p.cidade || ""));
  return hay.indexOf(q) >= 0;
}
function applySearch() {
  F.q = $("#fQ").value; F.loc = $("#fLoc").value;
  F.dist = +$("#fDist").value; $("#fDistOut").textContent = "até " + F.dist + " km";
  F.rating = +$("#fRating").value; F.price = $("#fPrice").value;
  F.date = $("#fDate").value; F.avail = $("#fAvail").checked;
  var showSvcs = FTIPO !== "lojas", showShops = FTIPO !== "servicos";
  var svcs = showSvcs ? db.services.filter(svcMatch) : [];
  svcs.sort(function (a, b) {
    if (F.sort === "price") return a.preco - b.preco;
    if (F.sort === "rating") return svcRating(b).m - svcRating(a).m;
    return (svcRating(b).m * 2 - b.dist * 0.05) - (svcRating(a).m * 2 - a.dist * 0.05);
  });
  var pros = showSvcs ? professionals().filter(function (p) { return proMatch(p) && peopleMatch(p); }).sort(byRating).slice(0, 6) : [];
  var foundShops = showShops ? shops().filter(function (p) { return shopMatch(p) && peopleMatch(p) && shopPriceMatch(p); }) : [];
  $("#searchTitle").textContent = F.q ? "Resultados para “" + F.q + "”" : "Explorar Vila Aurora";
  $("#searchCount").textContent = svcs.length + " serviço(s) · " + foundShops.length + " loja(s)" + (F.q && showSvcs ? " · " + pros.length + " profissional(is)" : "") + " · atualiza automaticamente";
  $("#activeFilters").textContent = "📍 " + (F.loc || "Vila Aurora") + " · até " + F.dist + " km" + (F.date ? " · " + fdateFull(F.date) : "");
  var html = "";
  var anyCat = Object.keys(F.cats).some(function (k) { return F.cats[k]; });
  var isShowcase = !F.q && FTIPO === "todos" && !anyCat && F.dist === 15 && +F.rating === 4.5 && !F.price && F.avail;
  if (isShowcase) {
    var openAll = providers().concat(shops()).filter(openNow).sort(byRating).slice(0, 6);
    if (openAll.length) html += "<h3>🔥 Abertas agora</h3><div class='store-list' style='margin-bottom:1.4rem'>" + openAll.map(storeCard).join("") + "</div>";
    var topRated = db.users.filter(isLabor).sort(byRating).slice(0, 4);
    html += "<h3>★ Bem avaliados</h3><div class='cards-grid two' style='margin-bottom:1.4rem'>" + topRated.map(proCard).join("") + "</div>";
  }
  if (svcs.length) html += "<h3>Serviços</h3><div class='cards-grid two' style='margin-bottom:1.4rem'>" + svcs.map(svcCard).join("") + "</div>";
  if (foundShops.length) html += "<h3>Lojas</h3><div class='store-list' style='margin-bottom:1.4rem'>" + foundShops.map(storeCard).join("") + "</div>";
  if (pros.length) html += "<h3>Profissionais</h3><div class='cards-grid two'>" + pros.map(proCard).join("") + "</div>";
  $("#searchGrid").innerHTML = html;
  var hasAny = svcs.length + foundShops.length > 0;
  $("#searchEmpty").hidden = hasAny;
  $("#searchGrid").style.display = hasAny ? "" : "none";
}

/* ----- perfil público ----- */
var PTAB = null;
function contactHTML(u) {
  var wa = waLink(u), ig = instaUrl(u.instagram), fb = fbUrl(u.facebook);
  var btns = "";
  if (wa) btns += '<a class="btn btn-primary" target="_blank" rel="noopener" href="' + wa + '">' + waIcon() + ' Chamar no WhatsApp</a>';
  if (u.telefone) btns += '<a class="btn btn-secondary" href="tel:' + esc(digits(u.telefone)) + '">📞 ' + esc(u.telefone) + "</a>";
  if (ig) btns += '<a class="btn btn-secondary" target="_blank" rel="noopener" href="' + esc(ig) + '">📸 Instagram</a>';
  if (fb) btns += '<a class="btn btn-secondary" target="_blank" rel="noopener" href="' + esc(fb) + '">👍 Facebook</a>';
  if (!btns && !(u.portfolio || []).length) return "";
  return (btns ? "<h3>Contato</h3><div class='row'>" + btns + "</div>" : "") +
    ((u.portfolio || []).length ? "<h3>Portfólio</h3>" + '<ul class="checklist dark">' + u.portfolio.map(function (it) { return "<li>" + esc(it) + "</li>"; }).join("") + "</ul>" : "");
}
/* Topo estilo iFood (só p/ loja): capa + voltar/favoritar + logo + nota. */
function storeHeroHTML(u, r) {
  var fk = favKind(u), favOn = isFav(fk, u.id);
  var prices = shopProducts(u.id).filter(function (p) { return p.preco > 0; }).map(function (p) { return p.preco; });
  var minP = prices.length ? " · a partir de " + BRL(Math.min.apply(null, prices)) : "";
  return '<div class="food-cover ' + coverClass(u) + '"><div class="food-top"><button class="food-iconbtn" onclick="if(history.length>1){history.back();}else{location.hash=\'#/\';}" aria-label="Voltar">←</button>' +
    '<span style="flex:1"></span><button class="food-iconbtn fav' + (favOn ? " on" : "") + '" onclick="Nexo.fav(\'' + fk + "','" + u.id + "')\" aria-label=\"Favoritar\">" + (favOn ? "❤️" : "🤍") + "</button></div></div>" +
    '<div class="profile-body food-body">' +
    '<span class="food-logo" style="background:' + u.cor + '">' + esc(initials(u.nome)) + "</span>" +
    "<h1>" + esc(u.nome) + (u.verificado ? ' <span class="seal">✓</span>' : "") + "</h1>" +
    '<p class="food-meta">★ ' + (r.t ? r.m.toFixed(1).replace(".", ",") + " (" + r.t + ")" : "novo") + " · " + esc(u.categoriaLoja || "Loja") + " · " + (u.dist != null ? u.dist + " km" : esc(u.cidade || "")) + esc(minP) + "</p>" +
    '<div class="row"><span class="avail' + (openNow(u) ? "" : " off") + '"><i></i>' + (openNow(u) ? "Aberto agora" : esc(dispLabel(u.disponibilidade))) + "</span><span class='muted' style='font-size:.82rem'>" + esc(u.horario || "") + "</span></div>" +
    '<p class="food-addr">📍 ' + esc(u.endereco || u.cidade || "") + "</p></div>";
}
/* Linha do produto em pé (retrato): foto em cima, nome, preço e "+" embaixo. */
function prodMenuHTML(p, loja) {
  return '<div class="menu-card-v"><span class="mi-thumb" style="background:' + (loja.cor || "#334155") + '">' + esc(initials(p.nome)) + "</span>" +
    "<strong>" + esc(p.nome) + "</strong><small>" + esc(p.desc || "Sem descrição") + "</small>" +
    '<div class="menu-card-foot"><strong>' + (p.preco > 0 ? BRL(p.preco) : "A combinar") + '</strong><button class="add-btn" onclick="Nexo.cartAdd(\'' + loja.id + "','" + p.id + "')\" aria-label=\"Adicionar à sacola\">+</button></div></div>";
}
/* Aba Info: sobre + contato + avaliações juntos (perfil enxuto). */
function infoHTML(u, revs, isShop) {
  var tags = isShop ? [u.categoriaLoja || "Loja"] : (u.especialidades || []);
  var revsHTML = revs.length ? revs.map(function (v) {
    var by = userById(v.deId) || {};
    return '<div class="review"><div>' + starsHTML(v.estrelas, 1) + " · <strong>" + esc(by.nome || "Cliente") + "</strong> <span class='muted'>· " + timeAgo(v.criadoEm) + "</span></div><p style='margin:0'>" + esc(v.texto) + "</p></div>";
  }).join("") : "<p class='muted'>Ainda sem avaliações.</p>";
  return "<p>" + esc(u.descricao || "—") + "</p>" +
    "<div class='row'>" + tags.map(function (e) { return '<span class="badge">' + esc(e) + "</span>"; }).join("") + "</div>" +
    "<div class='panel' style='margin-top:1rem'><h3>Atendimento</h3><p class='muted' style='margin:0'>" +
    (isShop && u.endereco ? "📍 " + esc(u.endereco) + "<br>" : "") +
    (!isShop && u.tipo !== "empresa" && u.experiencia ? "🎓 " + esc(u.experiencia) + "<br>" : "") +
    "📍 " + esc(u.cidade || "") + (u.tipo !== "empresa" && u.raio ? " · até " + u.raio + " km" : "") + "<br>" +
    "🕒 " + esc(dispLabel(u.disponibilidade)) + (u.tipo !== "empresa" && u.horario ? " · " + esc(u.horario) : "") + "<br>" +
    "📞 " + esc(u.telefone || "—") + (u.tipo !== "empresa" ? "<br>💰 " + esc(storePrice(u)) : "") + "</p></div>" +
    contactHTML(u) + "<h3>Avaliações (" + revs.length + ")</h3>" + revsHTML;
}
function renderPerfil(id) {
  var u = userById(id), w = $("#profileWrap");
  if (!u) { w.innerHTML = '<div class="empty"><div class="empty-art">🙈</div><h3>Perfil não encontrado</h3><a class="btn btn-secondary" href="#/explorar">Explorar</a></div>'; return; }
  var r = ratingOf(u.id), revs = db.reviews.filter(function (x) { return x.paraId === u.id; });
  var isShop = u.tipo === "loja";
  if (!PTAB || ["sobre", "avaliacoes", "contato"].indexOf(PTAB) >= 0) PTAB = isShop ? "catalogo" : "servicos";
  if (isShop && PTAB === "servicos") PTAB = "catalogo";
  if (!isShop && PTAB === "catalogo") PTAB = "servicos";
  var mySvcs = db.services.filter(function (s) { return (s.prestadores || []).indexOf(u.id) >= 0; });
  var myProds = isShop ? shopProducts(u.id) : [];
  var waTop = waLink(u);
  var body = "";
  if (PTAB === "servicos") {
    body = mySvcs.length ? "<div class='cards-grid two'>" + mySvcs.map(svcCard).join("") + "</div>" : "<div class='empty'>Nenhum serviço catalogado ainda.</div>";
  } else if (PTAB === "catalogo") {
    body = menuHTML(u);
  } else {
    body = infoHTML(u, revs, isShop);
  }
  var fk = favKind(u), favOn = isFav(fk, u.id);
  var isMe = me() && me().id === u.id;
  var ctaRow = isMe
    ? '<a class="btn btn-primary" href="#/app/perfil">Editar meu perfil</a>'
    : (isShop && waTop)
    ? '<a class="btn btn-primary" target="_blank" rel="noopener" href="' + waTop + '">' + waIcon() + ' Chamar no WhatsApp</a>'
    : '<button class="btn btn-primary" onclick="Nexo.askService(\'\',\'' + u.id + '\')">Pedir serviço</button>';
  if (!isMe) ctaRow += '<button class="btn btn-secondary" onclick="Nexo.talk(\'' + u.id + "')\">Conversar</button>" +
    '<button class="fav' + (favOn ? " on" : "") + '" onclick="Nexo.fav(\'' + fk + "','" + u.id + "')\">" + (favOn ? "❤️ Salvo" : "🤍 Salvar") + "</button>";
  var midTab = isShop
    ? '<button class="' + (PTAB === "catalogo" ? "active" : "") + '" onclick="Nexo.ptab(\'catalogo\')">Catálogo (' + myProds.length + ")</button>"
    : '<button class="' + (PTAB === "servicos" ? "active" : "") + '" onclick="Nexo.ptab(\'servicos\')">Serviços (' + mySvcs.length + ")</button>";
  var heroShell, foodCta = "";
  if (isShop) {
    heroShell = '<div class="profile-hero food-shop">' + storeHeroHTML(u, r);
    if (PTAB === "catalogo") {
      var fromP = myProds.filter(function (x) { return x.preco > 0; });
      var minTxt = fromP.length ? "A partir de " + BRL(Math.min.apply(null, fromP.map(function (x) { return x.preco; }))) : "Fale com a loja";
      foodCta = '<div class="food-cta"><small>' + esc(minTxt) + " · " + esc(u.nome) + "</small>" + (waTop ? '<a class="btn btn-primary btn-sm" target="_blank" rel="noopener" href="' + waTop + '">WhatsApp</a>' : "") + '<a class="btn btn-secondary btn-sm" href="#/carrinho">🛒 Sacola</a></div>';
    }
  } else {
    heroShell = '<div class="profile-hero"><div class="profile-cover ' + coverClass(u) + '"></div><div class="profile-body">' +
      '<span class="pro-avatar profile-avatar" style="background:' + u.cor + '">' + esc(initials(u.nome)) + "</span>" +
      "<h1>" + esc(u.nome) + "</h1>" +
      '<p class="muted" style="margin:0">' + esc(tipoLabel(u.tipo)) + " · " + esc(u.cidade || "") + (u.verificado ? ' · <span class="badge ok">✓ Verificado</span>' : "") + "</p>" +
      '<div class="row">' + starsHTML(r.m, r.t) + '<span class="muted">· ' + (u.dist != null ? u.dist + " km" : esc(u.cidade || "")) + "</span></div>";
  }
  w.innerHTML = heroShell +
    (isShop ? '<div class="profile-body">' : "") +
    '<div class="row">' + ctaRow + "</div>" +
    '<div class="tabs">' + midTab + '<button class="' + (PTAB === "info" ? "active" : "") + '" onclick="Nexo.ptab(\'info\')">Info</button></div>' +
    "<div>" + body + "</div>" + foodCta + "</div></div>";
}

/* ----- auth ----- */
var loginTipo = "empresa", signupTipo = "empresa";
function touchSteps(n) {
  $all("#signupSteps span").forEach(function (s, i) { s.classList.toggle("on", i < n); });
}
function prepCadastro(q) {
  var map = { prestador: "prestadora", empresa: "empresa", autonomo: "autonomo", loja: "loja", cliente: "cliente" };
  if (q.tipo && map[q.tipo]) signupTipo = map[q.tipo];
  $all("#signupRoles .role").forEach(function (b) {
    b.classList.toggle("active", b.getAttribute("data-role") === (signupTipo === "prestadora" ? "prestador" : signupTipo));
  });
  $("#suExtra").hidden = signupTipo === "empresa" || signupTipo === "loja" || signupTipo === "cliente";
  touchSteps(1);
}
function doLogin(email, senha) {
  var u = db.users.filter(function (x) { return x.email.toLowerCase() === String(email).trim().toLowerCase() && x.senha === senha; })[0];
  if (!u) return null;
  db.session = u.id; save(); paintChrome();
  return u;
}
/* ----- troca rápida de conta (demo) -----
   Alterna entre Pessoa física (compra + solicita, ex.: Maria Silva)
   e Empresa (ex.: Lojas Prisma). Sem logout,
   sem tocar localStorage direto: usa db + save(). */
var DEMO_SWAP = ["u_cli_maria", "u_emp_prisma"];
function swapTarget() {
  var u = me();
  if (!u) return userById(DEMO_SWAP[0]);
  if (u.id === DEMO_SWAP[0]) return userById(DEMO_SWAP[1]);
  if (u.id === DEMO_SWAP[1]) return userById(DEMO_SWAP[0]);
  if (u.tipo === "cliente") return userById(DEMO_SWAP[1]) || db.users.filter(isEmp)[0] || null;
  if (u.tipo === "empresa") return userById(DEMO_SWAP[0]) || db.users.filter(isCliente)[0] || null;
  return userById(DEMO_SWAP[0]) || db.users.filter(isCliente)[0] || null;
}
function doSwap(id) {
  var target = id ? userById(id) : swapTarget();
  if (!target) { toast("Conta demo não encontrada. Restaure a demo."); return null; }
  if (me() && me().id === target.id) { toast("Você já está como " + target.nome.split(" ")[0] + "."); return target; }
  db.session = target.id; CHAT = null; save(); paintChrome();
  try { paintSide(curRoute()); } catch (_) {}
  toast("Agora você é " + target.nome.split(" ")[0] + " (" + tipoLabel(target.tipo) + ").");
  if (location.hash === "#/app/dashboard") renderApp("dashboard");
  else location.hash = "#/app/dashboard";
  return target;
}
function bindAuth() {
  $all("#view-login .role").forEach(function (b) {
    b.addEventListener("click", function () {
      loginTipo = b.getAttribute("data-role");
      $all("#view-login .role").forEach(function (x) { x.classList.toggle("active", x === b); });
    });
  });
  var demoBox = document.createElement("div");
  demoBox.className = "row";
  demoBox.style.margin = ".4rem 0 .8rem";
  demoBox.innerHTML = "<span class='muted' style='font-size:.82rem'>Acesso demo:</span>" +
    "<button class='btn btn-secondary btn-xs' data-demo='cliente@demo.com'>🧑 Pessoa física</button>" +
    "<button class='btn btn-secondary btn-xs' data-demo='empresa@demo.com'>🏢 Empresa</button>" +
    "<button class='btn btn-secondary btn-xs' data-demo='carlos@demo.com'>👤 Autônomo</button>" +
    "<button class='btn btn-secondary btn-xs' data-demo='eletrosul@demo.com'>🛠 Prestadora</button>" +
    "<button class='btn btn-secondary btn-xs' data-demo='loja@demo.com'>🏪 Loja</button>" +
    "<button class='btn btn-secondary btn-xs' data-demo='pet@demo.com'>🐾 Pet</button>" +
    "<button class='btn btn-secondary btn-xs' data-demo='essencia@demo.com'>💊 Essência</button>";
  var lf = $("#loginForm");
  lf.parentNode.insertBefore(demoBox, lf);
  demoBox.addEventListener("click", function (e) {
    var b = e.target.closest("[data-demo]"); if (!b) return;
    var u = doLogin(b.getAttribute("data-demo"), "demo1234");
    if (u) { toast("Bem-vindo(a), " + u.nome.split(" ")[0] + "!"); location.hash = "#/app/dashboard"; }
  });
  lf.addEventListener("submit", function (e) {
    e.preventDefault();
    var em = $("#loginEmail").value.trim(), pw = $("#loginPass").value;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return setErr("loginError", "Informe um e-mail válido.");
    if (!pw) return setErr("loginError", "Informe a senha.");
    var u = doLogin(em, pw);
    if (!u) return setErr("loginError", "E-mail ou senha inválidos. Use o acesso demo ou crie uma conta.");
    $("#loginError").hidden = true;
    toast("Bem-vindo(a), " + u.nome.split(" ")[0] + "!");
    location.hash = "#/app/dashboard";
  });
  $all("#signupRoles .role").forEach(function (b) {
    b.addEventListener("click", function () {
      var r = b.getAttribute("data-role");
      signupTipo = r === "prestador" ? "prestadora" : r;
      $all("#signupRoles .role").forEach(function (x) { x.classList.toggle("active", x === b); });
      $("#suExtra").hidden = signupTipo === "empresa" || signupTipo === "loja" || signupTipo === "cliente";
      touchSteps(2);
    });
  });
  $("#signupForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var nome = $("#suName").value.trim(), email = $("#suEmail").value.trim(),
        doc = $("#suDoc").value.trim(), city = $("#suCity").value.trim(), pw = $("#suPass").value;
    if (nome.length < 3) return setErr("suError", "Informe seu nome ou razão social.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setErr("suError", "Informe um e-mail válido.");
    if (db.users.some(function (x) { return x.email.toLowerCase() === email.toLowerCase(); })) return setErr("suError", "Este e-mail já está cadastrado. Tente entrar.");
    if (doc.length < 5) return setErr("suError", "Informe um CPF/CNPJ válido.");
    if (!city) return setErr("suError", "Informe sua cidade/UF.");
    if (pw.length < 6) return setErr("suError", "A senha precisa de ao menos 6 caracteres.");
    if (!$("#suTerms").checked) return setErr("suError", "Aceite os Termos e a LGPD para continuar.");
    var palette = ["#1D4ED8", "#0E7490", "#6D28D9", "#0F766E", "#BE123C", "#B45309"];
    var u = {
      id: NexoStore.uid("u"), tipo: signupTipo, nome: nome, email: email, senha: pw, doc: doc,
      cidade: city, telefone: "",       descricao: signupTipo === "empresa" ? "Empresa contratante na Nexo." : signupTipo === "loja" ? "Loja na Nexo. Edite sua vitrine e catálogo em Minha loja." : signupTipo === "cliente" ? "Cliente da Nexo — compras e serviços." : "Prestador de serviços na Nexo.",
      especialidades: signupTipo === "empresa" || signupTipo === "cliente" ? [] : signupTipo === "loja" ? ["Comércio local"] : ["Serviços gerais"],
      disponibilidade: "semana", cor: palette[db.users.length % palette.length],
      verificado: false, jobs: 0, dist: 3
    };
    if (signupTipo === "loja") {
      var capas = ["g0", "g1", "g2", "g3", "g4", "g5"];
      u.capa = capas[db.users.length % capas.length];
      u.horario = "Seg–Sáb · 08h–18h"; u.raio = 5; u.precoBase = 0;
      u.whatsapp = ""; u.instagram = ""; u.facebook = ""; u.portfolio = [];
      u.categoriaLoja = "Outros"; u.endereco = ""; u.menuCats = ["Geral"];
    }
    db.users.push(u); db.session = u.id; save(); paintChrome();
    $("#suError").hidden = true; touchSteps(3);
    toast("Conta criada! Bem-vindo(a) à Nexo.");
    location.hash = "#/app/dashboard";
  });
}
function openRecover() {
  openModal("Recuperar senha",
    '<p class="muted" style="margin:0">Informe seu e-mail e defina uma nova senha na hora (fluxo demo).</p>' +
    '<form id="frmRec"><label class="field"><span>E-mail</span><input id="rcEmail" type="email" placeholder="voce@empresa.com"></label>' +
    '<label class="field"><span>Nova senha (mín. 6)</span><input id="rcPass" type="password" placeholder="••••••"></label>' +
    '<p class="form-error" id="rcErr" hidden></p>' +
    '<button class="btn btn-primary btn-block" type="submit">Redefinir senha</button></form>');
  $("#frmRec").addEventListener("submit", function (e) {
    e.preventDefault();
    var u = db.users.filter(function (x) { return x.email.toLowerCase() === $("#rcEmail").value.trim().toLowerCase(); })[0];
    if (!u) return setErr("rcErr", "E-mail não encontrado.");
    if ($("#rcPass").value.length < 6) return setErr("rcErr", "A nova senha precisa de ao menos 6 caracteres.");
    u.senha = $("#rcPass").value; save(); closeModal();
    toast("Senha redefinida! Faça login.");
    location.hash = "#/login";
  });
}

/* ================================================================
   PAINEL (APP)
   ================================================================ */
var CHAT = null, AGV = "lista", REQSEG = "todas", CHATBACK = true;

function openOrders(u) { return u && u.tipo === "loja" ? (db.orders || []).filter(function (o) { return o.lojaId === u.id && ["pago", "enviado"].indexOf(o.status) >= 0; }).length : 0; }
var SIDE = [
  { r: "dashboard", icon: "🏠", label: "Início" },
  { r: "solicitacoes", icon: "📋", label: "Meus pedidos", show: function () { return canContract(me()); }, count: function () { var u = me(); return u && canContract(u) ? db.requests.filter(function (x) { return x.empresaId === u.id && ["solicitado", "recebendo_propostas"].indexOf(x.status) >= 0; }).length : 0; } },
  { r: "oportunidades", icon: "🎯", label: "Oportunidades", show: function () { return isProv(me()); }, count: function () { var u = me(); if (!u || !isProv(u)) return 0; var open = db.requests.filter(function (x) { return ["solicitado", "recebendo_propostas"].indexOf(x.status) >= 0; }).length; var pend = db.requests.filter(function (x) { return x.prestId === u.id && x.status === "solicitado"; }).length; return open + pend; } },
  { r: "servicos", icon: "🛠", label: "Meus serviços", show: function () { return isLabor(me()); } },
  { r: "pedidos", icon: "🧾", label: "Pedidos recebidos", show: function () { return isLoja(me()); }, count: function () { return openOrders(me()); } },
  { r: "produtos", icon: "🏷", label: "Meu catálogo", show: function () { return isLoja(me()); } },
  { r: "agenda", icon: "📅", label: "Agenda" },
  { r: "mensagens", icon: "💬", label: "Chat", count: unreadMsgs },
  { r: "perfil", icon: "👤", label: "Perfil" }
];
function paintSide(cur) {
  $("#sideNav").innerHTML = SIDE.filter(function (s) { return !s.show || s.show(); }).map(function (s) {
    var c = s.count ? s.count() : 0;
    return '<button class="side-item' + (cur === s.r ? " active" : "") + '" data-route="' + s.r + '"><span>' + s.icon + "</span> " + s.label + (c ? '<span class="count">' + c + "</span>" : "") + "</button>";
  }).join("");
  var mu = me(), bn;
  if (isLoja(mu)) bn = [
    { r: "dashboard", icon: "🏠", label: "Painel" },
    { r: "pedidos", icon: "🧾", label: "Pedidos" },
    { r: "produtos", icon: "🏷", label: "Catálogo" },
    { r: "mensagens", icon: "💬", label: "Chat" + (unreadMsgs() ? " (" + unreadMsgs() + ")" : "") },
    { r: "perfil", icon: "👤", label: "Perfil" }
  ];
  else if (isLabor(mu)) bn = [
    { r: "dashboard", icon: "🏠", label: "Painel" },
    { r: "oportunidades", icon: "🎯", label: "Oport." },
    { r: "agenda", icon: "📅", label: "Agenda" },
    { r: "mensagens", icon: "💬", label: "Chat" + (unreadMsgs() ? " (" + unreadMsgs() + ")" : "") },
    { r: "perfil", icon: "👤", label: "Perfil" }
  ];
  else bn = [
    { r: "dashboard", icon: "🏠", label: "Painel" },
    { r: "solicitacoes", icon: "📋", label: "Pedidos" },
    { r: "agenda", icon: "📅", label: "Agenda" },
    { r: "mensagens", icon: "💬", label: "Chat" + (unreadMsgs() ? " (" + unreadMsgs() + ")" : "") }
  ];
  $("#bottomNav").innerHTML = bn.map(function (b) {
    return '<button class="' + (cur === b.r ? "active" : "") + '" data-route="' + b.r + '"><span style="font-size:1.15rem">' + b.icon + "</span>" + b.label + "</button>";
  }).join("");
}
function timelineHTML(status) {
  var idx = STATUS.indexOf(status);
  return '<div class="row" style="gap:.35rem;margin:.6rem 0">' + STATUS.map(function (s, i) {
    return '<span class="status ' + (i < idx ? "ok" : i === idx ? (STATUS_CL[s] || "info") : "") + '">' + (i < idx ? "✓ " : "") + STATUS_LB[s] + "</span>";
  }).join("") + "</div>";
}
function reqItemHTML(r) {
  var n = proposalsOf(r.id).length, emp = userById(r.empresaId) || {};
  return '<div class="req-item"><div class="req-item-top"><strong>' + esc(r.titulo) + '</strong><span class="status ' + (STATUS_CL[r.status] || "") + '">' + STATUS_LB[r.status] + "</span>" +
    (r.prestId
      ? '<span class="muted" style="margin-left:auto;font-size:.8rem">' + (r.status === "solicitado" ? "⏳ aguardando confirmação" : "✔ " + esc(STATUS_LB[r.status] || r.status)) + "</span>"
      : '<span class="muted" style="margin-left:auto;font-size:.8rem">💬 ' + n + " proposta(s)</span>") + "</div>" +
    '<p class="muted" style="margin:0;font-size:.9rem">' + esc(r.desc.slice(0, 140)) + (r.desc.length > 140 ? "…" : "") + "</p>" +
    '<div class="row" style="font-size:.82rem"><span>📍 ' + esc(r.local) + "</span><span>🗓 " + esc(r.prazo) + "</span><span>💰 " + (r.orcamento ? BRL(r.orcamento) : "Aberto") + "</span><span>🏢 " + esc(emp.nome || "") + "</span></div>" +
    '<div class="row"><a class="btn btn-primary btn-sm" href="#/app/solicitacao/' + r.id + '">Ver detalhes</a><span class="muted" style="font-size:.78rem">' + timeAgo(r.criadoEm) + "</span></div></div>";
}
function agItemHTML(a) {
  var pr = userById(a.prestId) || {};
  var cls = a.status === "concluido" || a.status === "avaliado" ? "ok" : a.status === "em_andamento" ? "warn" : "info";
  var u = me();
  var acts = '<a class="btn btn-secondary btn-sm" href="#/app/solicitacao/' + a.reqId + '">Ver pedido</a>';
  if (u && u.id === a.prestId && a.status === "agendado") acts += '<button class="btn btn-primary btn-sm" onclick="Nexo.agStatus(\'' + a.id + "','em_andamento')\">▶ Iniciar</button>";
  if (u && u.id === a.prestId && a.status === "em_andamento") acts += '<button class="btn btn-primary btn-sm" onclick="Nexo.agStatus(\'' + a.id + "','concluido')\">✔ Concluir</button>";
  if (u && u.id === a.contratanteId && a.status === "concluido") acts += '<button class="btn btn-primary btn-sm" onclick="Nexo.rate(\'' + a.id + '\')">⭐ Avaliar</button>';
  return '<div class="agenda-day"><time>' + fdate(a.data) + "<br>" + esc(a.hora || "") + "</time><div style='flex:1'><strong>" + esc(a.titulo) + "</strong><br><span class='muted' style='font-size:.82rem'>👷 " + esc(pr.nome || "") + " · 📍 " + esc(a.local) + ' · <span class="status ' + cls + '">' + (STATUS_LB[a.status] || a.status) + "</span></span></div>" +
    '<div class="row" style="gap:.35rem">' + acts + "</div></div>";
}

/* ----- dashboard ----- */
function vDashboard() {
  var u = me(), el = $("#appContent");
  if (canContract(u)) {
    var my = db.requests.filter(function (r) { return r.empresaId === u.id; });
    var open = my.filter(function (r) { return ["solicitado", "recebendo_propostas"].indexOf(r.status) >= 0; });
    var waiting = my.filter(function (r) { return r.status === "solicitado"; });
    var next = db.schedules.filter(function (a) { return a.contratanteId === u.id && ["agendado", "em_andamento"].indexOf(a.status) >= 0; });
    var spent = db.proposals.filter(function (p) { return p.status === "aceita" && my.some(function (r) { return r.id === p.reqId; }); }).reduce(function (a, p) { return a + p.valor; }, 0);
    var shopPanel = isLoja(u) ? '<div class="panel"><h3>🏪 Minha loja</h3><div class="store-list">' + storeCard(u) + '</div><div class="row" style="margin-top:.7rem"><a class="btn btn-secondary btn-sm" href="#/perfil/' + u.id + '">Ver vitrine</a><a class="btn btn-secondary btn-sm" href="#/app/produtos">Meus produtos (' + shopProducts(u.id).length + ')</a><a class="btn btn-primary btn-sm" href="#/app/perfil">Editar loja</a></div></div>' : "";
    var catPanel = isLoja(u) ? '<div class="panel"><h3>🏷 Categorias do catálogo</h3>' + catManagerHTML(u) + "</div>" : "";
    var oppList = isLoja(u) ? db.requests.filter(function (r) { return r.empresaId !== u.id && ["solicitado", "recebendo_propostas"].indexOf(r.status) >= 0 && !db.proposals.some(function (p) { return p.reqId === r.id && p.prestId === u.id; }); }) : [];
    var oppPanel = isLoja(u) ? '<div class="panel"><h3>🎯 Oportunidades para você (' + oppList.length + ')</h3><p class="muted">Pedidos abertos na região. Sua loja também pode enviar propostas.</p><a class="btn btn-secondary btn-sm" href="#/app/oportunidades">Ver oportunidades →</a></div>' : "";
    var recvAll = isLoja(u) ? (db.orders || []).filter(function (o) { return o.lojaId === u.id; }).sort(function (a, b) { return b.criadoEm.localeCompare(a.criadoEm); }) : [];
    var recvPanel = isLoja(u) ? '<div class="panel"><h3>🧾 Últimos pedidos</h3>' + (recvAll.length ? recvAll.slice(0, 3).map(function (o) { return '<div class="row" style="justify-content:space-between;border-top:1px solid var(--line-soft);padding:.45rem 0"><span style="font-size:.88rem"><strong>' + esc(o.buyer.nome) + "</strong> · " + BRL(o.total) + "</span>" + orderBadge(o.status) + "</div>"; }).join("") + '<div class="row" style="margin-top:.5rem"><a class="btn btn-secondary btn-sm" href="#/app/pedidos">Ver todos →</a></div>' : "<p class='muted'>Nenhum pedido ainda.</p>") + "</div>" : "";
    el.innerHTML = "<h2>Olá, " + esc(u.nome.split(" ")[0]) + " 👋</h2><p class='muted'>Acompanhe pedidos, confirmações e serviços.</p>" +
      '<div class="kpis"><div class="kpi"><small>Pedidos abertos</small><strong>' + open.length + '</strong></div><div class="kpi"><small>Aguardando confirmação</small><strong>' + waiting.length + '</strong><span class="delta">pelas empresas</span></div><div class="kpi"><small>Próximos serviços</small><strong>' + next.length + '</strong></div><div class="kpi"><small>Total investido</small><strong style="font-size:1.25rem">' + BRL(spent) + "</strong></div></div>" +
      '<div class="dash-grid"><div><div class="panel"><h3>Próximos serviços</h3>' + (next.length ? next.map(agItemHTML).join("") : "<p class='muted'>Nada agendado. <a class='link' href='#/explorar'>Buscar prestadores →</a></p>") + '</div>' +
      '<div class="panel"><h3>Meus pedidos</h3><div class="req-list">' + (my.length ? my.slice(0, 4).map(reqItemHTML).join("") : "<p class='muted'>Nenhum pedido ainda. Busque uma empresa e peça o serviço.</p>") + '</div><div class="row" style="margin-top:.7rem"><a class="btn btn-secondary btn-sm" href="#/app/solicitacoes">Ver todos</a><a class="btn btn-primary btn-sm" href="#/explorar">Buscar prestador</a></div></div></div>' +
      '<div><div class="panel"><h3>Gastos por serviço</h3>' + barsHTML(my) + '</div>' + shopPanel + catPanel + oppPanel + recvPanel + '</div></div></div>';
    var fc = $("#frmCat");
    if (fc) fc.addEventListener("submit", function (e) {
      e.preventDefault();
      var u2 = me(); if (!isLoja(u2)) return;
      var nn = $("#catNome").value.trim().replace(/["']/g, "");
      if (nn.length < 2) { toast("Nome muito curto."); return; }
      if (!u2.menuCats) u2.menuCats = [];
      if (u2.menuCats.indexOf(nn) < 0) u2.menuCats.push(nn);
      save(); toast("Categoria adicionada! 🏷"); refresh();
    });
  } else {
    var open2 = db.requests.filter(function (r) { return ["solicitado", "recebendo_propostas"].indexOf(r.status) >= 0 && !db.proposals.some(function (p) { return p.reqId === r.id && p.prestId === u.id; }); });
    var sent = db.proposals.filter(function (p) { return p.prestId === u.id; });
    var sched = db.schedules.filter(function (a) { return a.prestId === u.id && ["agendado", "em_andamento"].indexOf(a.status) >= 0; });
    var done = db.schedules.filter(function (a) { return a.prestId === u.id && ["concluido", "avaliado"].indexOf(a.status) >= 0; });
    var earned = sent.filter(function (p) { return p.status === "aceita"; }).reduce(function (a, p) { return a + p.valor; }, 0);
    var rt = ratingOf(u.id);
    el.innerHTML = "<h2>Olá, " + esc(u.nome.split(" ")[0]) + " 👋</h2><p class='muted'>Oportunidades, propostas e agenda.</p>" +
      '<div class="kpis"><div class="kpi"><small>Novas oportunidades</small><strong>' + open2.length + '</strong></div><div class="kpi"><small>Propostas enviadas</small><strong>' + sent.length + '</strong></div><div class="kpi"><small>Ganhos (aceitas)</small><strong style="font-size:1.25rem">' + BRL(earned) + '</strong></div><div class="kpi"><small>Avaliação</small><strong>' + (rt.t ? rt.m.toFixed(1).replace(".", ",") + "★" : "Novo") + '</strong><span class="delta">' + rt.t + ' avaliações</span></div></div>' +
      '<div class="dash-grid"><div><div class="panel"><h3>🆕 Oportunidades para você</h3><div class="req-list">' + (open2.slice(0, 4).map(reqItemHTML).join("") || "<p class='muted'>Sem novidades agora.</p>") + '</div><div class="row" style="margin-top:.7rem"><a class="btn btn-secondary btn-sm" href="#/app/oportunidades">Ver todas →</a><a class="btn btn-primary btn-sm" href="#/app/servicos">Meus serviços</a></div></div></div>' +
      '<div><div class="panel"><h3>Serviços agendados</h3>' + (sched.length ? sched.map(agItemHTML).join("") : "<p class='muted'>Nada agendado.</p>") + '</div><div class="panel"><h3>Concluídos (' + done.length + ")</h3>" + (done.slice(0, 3).map(agItemHTML).join("") || "<p class='muted'>—</p>") + "</div></div></div>";
  }
}
function barsHTML(reqs) {
  var vals = reqs.map(function (r) {
    var acc = db.proposals.filter(function (p) { return p.reqId === r.id && p.status === "aceita"; })[0];
    return { t: r.titulo, v: acc ? acc.valor : 0 };
  }).filter(function (x) { return x.v > 0; }).slice(0, 6);
  if (!vals.length) return "<p class='muted'>Os valores aparecem aqui após aceitar propostas.</p>";
  var max = Math.max.apply(null, vals.map(function (x) { return x.v; }));
  return '<div class="bars">' + vals.map(function (x) { return "<i style='height:" + Math.max(12, Math.round(x.v / max * 100)) + "%' title='" + esc(x.t) + ": " + BRL(x.v) + "'></i>"; }).join("") + "</div>" +
    vals.map(function (x) { return "<p class='muted' style='font-size:.8rem;margin:.3rem 0'>" + esc(x.t.slice(0, 34)) + " — <strong>" + BRL(x.v) + "</strong></p>"; }).join("");
}

/* ----- solicitações / oportunidades / detalhe ----- */
function vReqList(mine) {
  var u = me(), el = $("#appContent");
  if (mine && isLabor(u)) { location.hash = "#/app/oportunidades"; return; }
  if (!mine && !isProv(u)) { location.hash = "#/app/solicitacoes"; return; }
  var list = mine ? db.requests.filter(function (r) { return r.empresaId === u.id; })
    : db.requests.filter(function (r) { return ["solicitado", "recebendo_propostas"].indexOf(r.status) >= 0; });
  var segs = [["todas", "Todas"], ["abertas", "Abertas"], ["agendadas", "Agendadas/Andamento"], ["concluidas", "Concluídas"]];
  var shown = list.filter(function (r) {
    if (REQSEG === "abertas") return ["solicitado", "recebendo_propostas"].indexOf(r.status) >= 0;
    if (REQSEG === "agendadas") return ["proposta_aceita", "agendado", "em_andamento"].indexOf(r.status) >= 0;
    if (REQSEG === "concluidas") return ["concluido", "avaliado"].indexOf(r.status) >= 0;
    return true;
  });
  el.innerHTML = "<h2>" + (mine ? "Meus pedidos" : "Oportunidades abertas") + " (" + shown.length + ")</h2>" +
    "<p class='muted'>" + (mine ? "Acompanhe cada pedido até a avaliação." : "Confirme os pedidos diretos e envie propostas nos abertos.") + "</p>" +
    ((!mine && u && db.requests.some(function (r) { return r.prestId === u.id && r.status === "solicitado"; }))
      ? '<div class="panel"><h3>⏳ Aguardando sua confirmação</h3><div class="req-list">' + db.requests.filter(function (r) { return r.prestId === u.id && r.status === "solicitado"; }).map(reqItemHTML).join("") + "</div></div>"
      : "") +
    '<div class="seg" style="margin-bottom:1rem">' + segs.map(function (s) { return '<button class="' + (REQSEG === s[0] ? "active" : "") + '" onclick="Nexo.reqSeg(\'' + s[0] + "')\">" + s[1] + "</button>"; }).join("") + "</div>" +
    '<div class="req-list">' + (shown.length ? shown.map(reqItemHTML).join("") : '<div class="empty"><div class="empty-art">📭</div><h3>Nada por aqui</h3><p class="muted">' + (mine ? "Você ainda não fez pedidos. Busque uma empresa e peça o serviço." : "Volte em breve para novas oportunidades.") + "</p>" + (mine ? '<a class="btn btn-primary" href="#/explorar">Buscar prestador</a>' : "") + "</div>") + "</div>";
}
function vReqDetail(id) {
  var r = reqById(id), el = $("#appContent");
  if (!r) { el.innerHTML = '<div class="empty"><h3>Solicitação não encontrada</h3><a class="btn btn-secondary" href="#/app/dashboard">Voltar</a></div>'; return; }
  var u = me(), emp = userById(r.empresaId) || {}, props = proposalsOf(r.id);
  var mine = r.empresaId === u.id;
  var canBid = !r.prestId && isProv(u) && ["solicitado", "recebendo_propostas"].indexOf(r.status) >= 0 && !props.some(function (p) { return p.prestId === u.id; });
  var directed = r.prestId ? userById(r.prestId) : null;
  var isResp = directed && u.id === directed.id;
  var html = '<p><a class="link" href="#/app/' + (mine ? "solicitacoes" : "oportunidades") + '">← Voltar</a></p>' +
    '<div class="panel"><span class="status ' + (STATUS_CL[r.status] || "") + '">' + STATUS_LB[r.status] + "</span> " +
    '<span class="badge">' + esc(catOf(r.cat).name) + "</span><h2 style='margin:.4rem 0'>" + esc(r.titulo) + "</h2>" + timelineHTML(r.status) +
    "<p>" + esc(r.desc) + "</p>" +
    '<div class="grid2"><div>📍 <strong>Local:</strong> ' + esc(r.local) + "<br>📅 <strong>Data desejada:</strong> " + fdateFull(r.dataDesejada) + " às " + esc(r.hora || "—") + "<br>🔢 <strong>Qtd:</strong> " + esc(r.qtd || 1) + "</div>" +
    "<div>💰 <strong>Orçamento:</strong> " + (r.orcamento ? BRL(r.orcamento) : "Aberto") + "<br>👤 <strong>Cliente:</strong> " + esc(emp.nome || "") + (directed ? "<br>👷 <strong>Responsável:</strong> " + esc(directed.nome || "") : "") + "<br>📝 <strong>Obs:</strong> " + esc(r.obs || "—") + "</div></div>" +
    '<div class="row" style="margin-top:.8rem">' +
    (canBid ? '<button class="btn btn-primary" onclick="Nexo.bid(\'' + r.id + '\')">Enviar proposta</button>' : "") +
    (directed && isResp && r.status === "solicitado" ? '<button class="btn btn-primary" onclick="Nexo.confirmReq(\'' + r.id + '\')">Confirmar agendamento</button><button class="btn btn-secondary" onclick="Nexo.refuseReq(\'' + r.id + '\')">Recusar</button>' : "") +
    (!mine && !isResp ? '<button class="btn btn-secondary" onclick="Nexo.talk(\'' + r.empresaId + "','" + r.id + "')\">💬 Falar com a empresa</button>" : "") +
    (mine && !directed ? '<span class="badge">Você publicou este pedido</span>' : "") +
    (mine && directed ? '<span class="badge">' + (r.status === "solicitado" ? "Aguardando " + esc(directed.nome.split(" ")[0]) : "Confirmado por " + esc(directed.nome.split(" ")[0])) + "</span>" : "") +
    (isResp && r.status !== "solicitado" ? '<span class="badge">Pedido dirigido a você</span>' : "") + "</div></div>";
  if (directed) {
    var drt = ratingOf(directed.id);
    html += "<h3>Empresa responsável</h3><div class='panel'><div class='row'><span class='pro-avatar' style='background:" + directed.cor + ";width:40px;height:40px;font-size:.8rem'>" + esc(initials(directed.nome)) + "</span><div style='flex:1'><strong>" + esc(directed.nome) + "</strong><br><span class='muted' style='font-size:.82rem'>" + starsHTML(drt.m, drt.t) + "</span></div><a class='btn btn-secondary btn-sm' href='#/perfil/" + directed.id + "'>Ver perfil</a></div></div>";
  } else {
    html += "<h3>Propostas recebidas (" + props.length + ")</h3>";
    if (!props.length) html += '<div class="empty"><div class="empty-art">💡</div><p class="muted">Ainda sem propostas.</p></div>';
    else if (!mine && !props.some(function (p) { return p.prestId === u.id; })) html += '<div class="panel"><p class="muted" style="margin:0">🔒 Os valores são visíveis para a empresa contratante e os autores.</p></div>';
    else html += compareTable(r, props, mine);
  }
  el.innerHTML = html;
}
function compareTable(r, props, mine) {
  return '<div class="panel" style="padding:.4rem;overflow:auto"><table class="table"><thead><tr><th>Profissional</th><th>Avaliação</th><th>Valor</th><th>Data</th><th>Status</th>' + (mine ? "<th>Ações</th>" : "") + "</tr></thead><tbody>" +
    props.map(function (p) {
      var pr = userById(p.prestId) || {}, rt = ratingOf(p.prestId);
      var st = p.status === "aceita" ? '<span class="status ok">Aceita</span>' : p.status === "recusada" ? '<span class="status">Recusada</span>' : '<span class="status warn">Pendente</span>';
      var acts = "<div class='row' style='gap:.35rem'><a class='btn btn-secondary btn-xs' href='#/perfil/" + pr.id + "'>Perfil</a>";
      if (mine && p.status === "pendente" && r.status !== "avaliado" && r.status !== "concluido") acts += "<button class='btn btn-primary btn-xs' onclick=\"Nexo.accept('" + p.id + "')\">Aceitar</button><button class='btn btn-secondary btn-xs' onclick=\"Nexo.refuse('" + p.id + "')\">Recusar</button>";
      acts += "</div>";
      return "<tr><td data-l='Profissional'><strong>" + esc(pr.nome || "") + "</strong><br><span class='muted' style='font-size:.8rem'>" + esc(p.prazo) + (p.garantia ? " · 🛡 " + esc(p.garantia) : "") + "<br>" + esc(p.msg) + "</span></td>" +
        "<td data-l='Avaliação'>" + starsHTML(rt.m, rt.t) + "</td><td data-l='Valor'><strong>" + BRL(p.valor) + "</strong></td><td data-l='Data'>" + fdate(p.dataDisp) + "</td><td data-l='Status'>" + st + "</td>" + (mine ? "<td data-l='Ações'>" + acts + "</td>" : "") + "</tr>";
    }).join("") + "</tbody></table></div>";
}

/* ----- pedir serviço direto à empresa (com confirmação) ----- */
function priceLabel(v) {
  v = +v || 0;
  return v > 0 ? "A partir de " + BRL(v) : "A combinar";
}
function askFormHTML(svcId, provId) {
  var s = svcById(svcId), p = userById(provId);
  var inner;
  if (s) {
    var provs = svcProviders(s);
    inner = '<label class="field"><span>Empresa *</span><select id="akProv">' +
      provs.map(function (x) { return '<option value="' + x.id + '">' + esc(x.nome) + "</option>"; }).join("") + "</select></label>";
  } else {
    var mine = db.services.filter(function (x) { return (x.prestadores || []).indexOf(p.id) >= 0; });
    inner = '<label class="field"><span>Serviço *</span><select id="akSvc">' +
      mine.map(function (x) { return '<option value="' + x.id + '">' + esc(x.titulo) + " — " + esc(x.precoLabel) + "</option>"; }).join("") + "</select></label>";
  }
  return '<form id="frmAsk">' + inner +
    '<div class="grid2"><label class="field"><span>Data desejada *</span><input id="akData" type="date" min="' + todayISO() + '" value="' + NexoStore.dayPlus(3) + '"></label><label class="field"><span>Horário</span><input id="akHora" type="time" value="09:00"></label></div>' +
    '<label class="field"><span>Observações</span><textarea id="akObs" class="input" rows="2" placeholder="Detalhes, medidas, pontos de acesso..."></textarea></label>' +
    '<p class="form-error" id="akErr" hidden></p>' +
    '<button class="btn btn-primary btn-block" type="submit">Enviar pedido</button></form>';
}
function submitDirected(svcId, provId) {
  var s, p;
  if (svcId) { s = svcById(svcId); p = userById($("#akProv").value); }
  else { p = userById(provId); s = svcById($("#akSvc").value); }
  if (!s || !p) return setErr("akErr", "Escolha o serviço e a empresa.");
  if ((s.prestadores || []).indexOf(p.id) < 0) return setErr("akErr", "Esta empresa não oferece o serviço escolhido.");
  var data = $("#akData").value, hora = $("#akHora").value, obs = $("#akObs").value.trim();
  if (!data) return setErr("akErr", "Escolha a data desejada.");
  if (data < todayISO()) return setErr("akErr", "A data não pode estar no passado.");
  var r = {
    id: NexoStore.uid("r"), empresaId: me().id, servicoId: s.id, prestId: p.id, titulo: s.titulo, cat: s.cat || "manutencao",
    desc: obs || ("Pedido direto de " + me().nome + " para " + p.nome + "."), local: me().cidade || "Vila Aurora", cidade: me().cidade || "Vila Aurora",
    prazo: "até " + fdate(data), dataDesejada: data, hora: hora || "09:00", qtd: 1, orcamento: 0, obs: obs,
    status: "solicitado", criadoEm: new Date().toISOString()
  };
  db.requests.unshift(r);
  save(); closeModal();
  notify(p.id, "pedido", "Novo pedido direto", me().nome + " pediu: " + s.titulo + " (" + fdate(data) + ").", "#/app/solicitacao/" + r.id);
  toast("Pedido enviado! Aguarde a confirmação da empresa.");
  location.hash = "#/app/solicitacao/" + r.id;
}
function vNova() {
  toast("Escolha o prestador e peça o serviço direto a ele.");
  location.hash = "#/explorar";
}

/* ----- agenda ----- */
var AGDAY = null;
function myAgenda() {
  var u = me();
  return db.schedules.filter(function (a) { return a.contratanteId === u.id || a.prestId === u.id; }).sort(function (a, b) { return (a.data + a.hora).localeCompare(b.data + b.hora); });
}
function vAgenda() {
  var mine = myAgenda(), body = "";
  if (!AGDAY) AGDAY = todayISO();
  if (AGV === "dia") {
    var l = mine.filter(function (a) { return a.data === AGDAY; });
    body = '<label class="field" style="max-width:240px;margin-bottom:1rem"><span>Dia</span><input type="date" id="agDay" value="' + AGDAY + '"></label>' +
      (l.length ? l.map(agItemHTML).join("") : '<div class="empty"><div class="empty-art">🗓</div><p class="muted">Nada agendado para este dia.</p></div>');
  } else if (AGV === "semana") {
    var base = new Date(AGDAY + "T12:00:00"), days = [];
    for (var i = 0; i < 7; i++) { var d = new Date(base); d.setDate(base.getDate() + i); days.push(d.toISOString().slice(0, 10)); }
    body = '<div class="cal-grid">' + days.map(function (day) {
      var l2 = mine.filter(function (a) { return a.data === day; });
      return '<div class="cal-cell' + (day === todayISO() ? " today" : "") + '"><strong>' + fdateFull(day) + "</strong>" +
        (l2.length ? l2.map(function (a) { return '<span class="cal-ev' + (a.status === "concluido" || a.status === "avaliado" ? " green" : "") + '">' + esc(a.hora || "") + " " + esc(a.titulo.slice(0, 26)) + "</span>"; }).join("") : '<span class="muted" style="font-size:.78rem">—</span>') + "</div>";
    }).join("") + "</div>";
  } else body = mine.length ? mine.map(agItemHTML).join("") : '<div class="empty"><div class="empty-art">📅</div><p class="muted">Nenhum serviço agendado.</p></div>';
  $("#appContent").innerHTML = "<h2>Agenda</h2><div class='seg' style='margin-bottom:1rem'>" +
    ["dia", "semana", "lista"].map(function (v) { return '<button class="' + (AGV === v ? "active" : "") + '" onclick="Nexo.agView(\'' + v + "')\">" + v[0].toUpperCase() + v.slice(1) + "</button>"; }).join("") + "</div>" + body;
  var di = $("#agDay");
  if (di) di.addEventListener("change", function () { AGDAY = di.value; vAgenda(); });
}

/* ----- mensagens ----- */
function otherOf(c) { return userById(c.parts.filter(function (p) { return p !== me().id; })[0]) || {}; }
function vMsgs() {
  var u = me();
  var convs = db.convs.filter(function (c) { return c.parts.indexOf(u.id) >= 0; }).sort(function (a, b) { return b.atualizadoEm.localeCompare(a.atualizadoEm); });
  if (!CHAT || !convs.some(function (c) { return c.id === CHAT; })) CHAT = convs.length ? convs[0].id : null;
  var c = db.convs.filter(function (x) { return x.id === CHAT; })[0];
  /* Mobile: master-detail — ou a lista, ou a conversa (com voltar). Desktop: lado a lado. */
  var mobChat = !!(window.matchMedia && window.matchMedia("(max-width: 859px)").matches);
  var showList = !mobChat || !c || CHATBACK;
  var showChat = !mobChat || (!!c && !CHATBACK);
  var html = "<h2>Mensagens</h2>" +
    ((mobChat && showChat && c) ? '<div class="row" style="margin-bottom:.7rem"><button class="btn btn-secondary btn-sm" onclick="Nexo.chatBack()">← Conversas</button></div>' : "") +
    "<div class='chat-list'><div class='threads panel' style='margin:0'" + (showList ? "" : " hidden") + ">";
  html += convs.length ? convs.map(function (cv) {
    var o = userById(cv.parts.filter(function (p) { return p !== u.id; })[0]) || {};
    var un = db.msgs.filter(function (m) { return m.convId === cv.id && m.deId !== u.id && !m.lida; }).length;
    return '<div class="thread' + (c && c.id === cv.id ? " active" : "") + '" onclick="Nexo.chat(\'' + cv.id + "')\">" +
      '<span class="pro-avatar" style="background:' + (o.cor || "#334155") + ';width:40px;height:40px;font-size:.8rem">' + esc(initials(o.nome)) + "</span>" +
      "<div style='flex:1'><strong style='font-size:.88rem'>" + esc(o.nome || "") + (un ? ' <span class="status info">' + un + " nova(s)</span>" : "") + "</strong><small>" + esc(cv.titulo || "") + "</small></div></div>";
  }).join("") : '<div class="empty"><div class="empty-art">💬</div><p class="muted">Sem conversas. Abra um perfil e clique em Conversar.</p></div>';
  html += "</div>";
  if (showChat) {
    html += "<div class='chat'>";
    if (c) {
      var o2 = otherOf(c);
      var msgs = db.msgs.filter(function (m) { return m.convId === c.id; });
      html += "<div class='msgs' id='msgs'><div style='text-align:center'><span class='badge'>" + esc(o2.nome || "") + " · " + esc(c.titulo || "") + (c.reqId ? ' · <a class="link" href="#/app/solicitacao/' + c.reqId + '">ver serviço</a>' : "") + "</span></div>" +
        msgs.map(function (m) { return '<div class="msg' + (m.deId === u.id ? " me" : "") + '">' + esc(m.texto) + "</div>"; }).join("") + "</div>" +
        '<div class="chat-input"><input id="chatIn" class="input" placeholder="Escreva uma mensagem..." autocomplete="off"><button class="btn btn-primary" onclick="Nexo.send()">Enviar</button></div>';
    } else html += '<div class="empty"><div class="empty-art">👈</div><p class="muted">Selecione uma conversa.</p></div>';
    html += "</div>";
  }
  html += "</div>";
  $("#appContent").innerHTML = html;
  db.msgs.filter(function (m) { return c && m.convId === c.id && m.deId !== u.id && !m.lida; }).forEach(function (m) { m.lida = true; });
  save(); paintChrome(); paintSide(curRoute());
  var box = $("#msgs"); if (box) box.scrollTop = box.scrollHeight;
  var inp = $("#chatIn");
  if (inp) { if (!mobChat) inp.focus(); inp.addEventListener("keydown", function (e) { if (e.key === "Enter") Nexo.send(); }); }
}

/* ----- favoritos ----- */
function vFav() {
  var u = me(), el = $("#appContent");
  var f = db.favs.filter(function (x) { return x.userId === u.id; });
  var svcs = f.filter(function (x) { return x.tipo === "servico"; }).map(function (x) { return svcById(x.refId); }).filter(Boolean);
  var pros = f.filter(function (x) { return x.tipo !== "servico"; }).map(function (x) { return userById(x.refId); }).filter(Boolean);
  el.innerHTML = "<h2>Meus favoritos (" + f.length + ")</h2>" +
    (f.length
      ? (svcs.length ? "<h3>Serviços</h3><div class='cards-grid two' style='margin-bottom:1.4rem'>" + svcs.map(svcCard).join("") + "</div>" : "") +
        (pros.length ? "<h3>Profissionais e empresas</h3><div class='cards-grid two'>" + pros.map(proCard).join("") + "</div>" : "")
      : '<div class="empty"><div class="empty-art">🤍</div><h3>Nada salvo ainda</h3><p class="muted">Toque em 🤍 nos serviços e profissionais.</p><a class="btn btn-primary" href="#/explorar">Explorar catálogo</a></div>');
}

/* ----- categorias do catálogo (dashboard da loja) ----- */
function catManagerHTML(u) {
  var cats = (u.menuCats || []).slice();
  var rows = cats.length ? cats.map(function (c) {
    var n = shopProducts(u.id).filter(function (p) { return (p.cat || "Geral") === c; }).length;
    return '<div class="prod"><div class="prod-info"><strong>' + esc(c) + "</strong><small>" + n + " produto(s)</small></div>" +
      '<div class="row" style="gap:.35rem"><button class="btn btn-secondary btn-xs" onclick="Nexo.shopCatRename(\'' + esc(c).replace(/'/g, "") + '\')">Renomear</button>' +
      '<button class="btn btn-secondary btn-xs" onclick="Nexo.shopCatDel(\'' + esc(c).replace(/'/g, "") + '\')">Apagar</button></div></div>';
  }).join("") : "<p class='muted'>Nenhuma categoria ainda.</p>";
  return '<div class="store-list" style="margin-bottom:.8rem">' + rows + "</div>" +
    '<form id="frmCat" class="row"><input id="catNome" class="input" placeholder="Nova categoria (ex.: Promoções)" style="flex:1;min-width:0" autocomplete="off"><button class="btn btn-primary btn-sm" type="submit">+ Adicionar</button></form>';
}
/* ----- meus produtos (loja) ----- */
function prodRowHTML(p) {
  return '<div class="prod"><div class="prod-info"><strong>' + esc(p.nome) + "</strong><small>" + esc(p.desc || "Sem descrição") + "</small><span class='badge'>" + esc(p.cat || "Geral") + "</span></div>" +
    '<span class="prod-price">' + (p.preco > 0 ? BRL(p.preco) : "A combinar") + '</span><div class="row" style="gap:.35rem"><button class="btn btn-secondary btn-xs" onclick="Nexo.prodEdit(\'' + p.id + '\')">Editar</button><button class="btn btn-secondary btn-xs" onclick="Nexo.prodDel(\'' + p.id + '\')">Remover</button></div></div>';
}
function vProdutos() {
  var u = me();
  if (!isLoja(u)) { location.hash = "#/app/dashboard"; return; }
  var list = shopProducts(u.id);
  var cats = shopCats(u.id);
  var grouped = cats.map(function (c) {
    var items = list.filter(function (p) { return (p.cat || "Geral") === c; });
    return "<h3>" + esc(c) + " (" + items.length + ")</h3><div class='store-list' style='margin-bottom:1rem'>" + items.map(prodRowHTML).join("") + "</div>";
  }).join("");
  $("#appContent").innerHTML = "<h2>Meus produtos (" + list.length + ")</h2><p class='muted'>É o catálogo da sua vitrine. Preço 0 = a combinar.</p>" +
    '<div class="row" style="margin-bottom:1rem"><button class="btn btn-primary" onclick="Nexo.prodAdd()">+ Adicionar produto</button><a class="btn btn-secondary" href="#/perfil/' + u.id + '">Ver minha vitrine</a></div>' +
    (list.length ? grouped
      : '<div class="empty"><div class="empty-art">🏷</div><h3>Catálogo vazio</h3><p class="muted">Adicione seu primeiro produto. Ex.: nome, preço e descrição.</p><button class="btn btn-primary" onclick="Nexo.prodAdd()">+ Adicionar produto</button></div>');
}
function catDataList() {
  var u = me(), cats = (u && u.menuCats) || ["Geral"];
  return '<datalist id="pdCatList">' + cats.map(function (c) { return '<option value="' + esc(c) + '">'; }).join("") + "</datalist>";
}
/* ----- meus serviços (a empresa cadastra o que faz) ----- */
function svcRowHTML(s) {
  var n = (s.prestadores || []).length;
  return '<div class="req-item"><div class="req-item-top"><strong>' + esc(s.titulo) + '</strong><span class="badge">' + esc(catOf(s.cat).name) + "</span>" + (n > 1 ? '<span class="badge info" title="Outras empresas também oferecem">compartilhado</span>' : "") + "</div>" +
    '<p class="muted" style="margin:0;font-size:.9rem">' + esc(s.desc || "Sem descrição") + "</p>" +
    '<div class="row" style="font-size:.85rem"><strong>' + esc(s.precoLabel || "A combinar") + "</strong></div>" +
    '<div class="row"><button class="btn btn-secondary btn-sm" onclick="Nexo.svcEdit(\'' + s.id + '\')">Editar</button><button class="btn btn-secondary btn-sm" onclick="Nexo.svcDel(\'' + s.id + '\')">Remover</button></div></div>';
}
function vServicos() {
  var u = me();
  if (!isLabor(u)) { location.hash = "#/app/dashboard"; return; }
  var list = db.services.filter(function (s) { return (s.prestadores || []).indexOf(u.id) >= 0; });
  $("#appContent").innerHTML = "<h2>Meus serviços (" + list.length + ")</h2><p class='muted'>O que sua empresa faz. É o que o cliente escolhe na hora de pedir.</p>" +
    '<div class="row" style="margin-bottom:1rem"><button class="btn btn-primary" onclick="Nexo.svcAdd()">+ Adicionar serviço</button></div>' +
    (list.length ? "<div class='req-list'>" + list.map(svcRowHTML).join("") + "</div>"
      : '<div class="empty"><div class="empty-art">🛠</div><h3>Nenhum serviço cadastrado</h3><p class="muted">Cadastre o que você faz para receber pedidos diretos.</p><button class="btn btn-primary" onclick="Nexo.svcAdd()">+ Adicionar serviço</button></div>');
}
function svcFormHTML(s) {
  s = s || { titulo: "", preco: 0, desc: "", cat: "manutencao" };
  return '<form id="frmSvc"><label class="field"><span>Nome do serviço *</span><input id="svNome" value="' + esc(s.titulo || "") + '" placeholder="Ex.: Limpeza pós-obra"></label>' +
    '<div class="grid2"><label class="field"><span>Categoria *</span><select id="svCat">' + CATS.map(function (c) { return '<option value="' + c.id + '"' + ((s.cat || "manutencao") === c.id ? " selected" : "") + ">" + c.icon + " " + esc(c.name) + "</option>"; }).join("") + "</select></label>" +
    '<label class="field"><span>Preço base R$ (0 = a combinar)</span><input id="svPreco" type="number" min="0" value="' + (s.preco || 0) + '"></label></div>' +
    '<label class="field"><span>Descrição</span><textarea id="svDesc" class="input" rows="2" placeholder="O que está incluso...">' + esc(s.desc || "") + "</textarea></label>" +
    '<p class="form-error" id="svErr" hidden></p>' +
    '<div class="row"><button type="button" class="btn btn-secondary" onclick="Nexo.close()">Cancelar</button><button class="btn btn-primary" type="submit">Salvar</button></div></form>';
}
/* ----- pedidos recebidos (loja) ----- */
function orderBadge(st) {
  return st === "pago" ? '<span class="status ok">Pago</span>' : st === "pronto" ? '<span class="status info">Pronto p/ entrega</span>' : st === "concluido" ? '<span class="status">Concluído</span>' : '<span class="status warn">A combinar</span>';
}
function vPedidos() {
  var u = me();
  if (!isLoja(u)) { location.hash = "#/app/dashboard"; return; }
  var list = (db.orders || []).filter(function (o) { return o.lojaId === u.id; }).sort(function (a, b) { return b.criadoEm.localeCompare(a.criadoEm); });
  $("#appContent").innerHTML = "<h2>Pedidos recebidos (" + list.length + ")</h2><p class='muted'>Vendas da sua vitrine. Marque pronto quando separar.</p>" +
    (list.length ? '<div class="store-list">' + list.map(function (o) {
      var items = o.items.map(function (it) { return it.qtd + "x " + it.nome; }).join(", ");
      var act = (o.status === "pago" || o.status === "enviado") ? '<button class="btn btn-primary btn-sm" onclick="Nexo.orderStatus(\'' + o.id + "','pronto')\">Marcar pronto</button>"
        : o.status === "pronto" ? '<button class="btn btn-secondary btn-sm" onclick="Nexo.orderStatus(\'' + o.id + "','concluido')\">Concluir</button>" : "";
      return '<div class="req-item"><div class="req-item-top"><strong>' + esc(o.buyer.nome) + " · " + BRL(o.total) + "</strong>" + orderBadge(o.status) + "</div>" +
        '<p class="muted" style="margin:0;font-size:.9rem">' + esc(items) + "</p>" +
        '<div class="row" style="font-size:.82rem"><span>💳 ' + esc(o.pay === "pix" ? "Pix" : o.pay === "card" ? "Cartão" : "WhatsApp") + "</span><span>📞 " + esc(o.buyer.tel || "—") + "</span>" + (o.buyer.addr ? "<span>📍 " + esc(o.buyer.addr) + "</span>" : "") + "</div>" +
        (act ? '<div class="row">' + act + "</div>" : "") + "</div>";
    }).join("") + "</div>" : '<div class="empty"><div class="empty-art">🧾</div><h3>Nenhum pedido ainda</h3><p class="muted">Compartilhe sua vitrine para vender.</p><a class="btn btn-primary" href="#/perfil/' + u.id + '">Ver minha vitrine</a></div>');
}
/* ----- sacola multi-loja (agrupada por loja) ----- */
function cartItems() {
  var cart = db.cart || { items: [] };
  return ((cart.items || [])).map(function (it) {
    var p = (db.products || []).filter(function (x) { return x.id === it.prodId; })[0];
    return p ? { p: p, qtd: it.qtd } : null;
  }).filter(Boolean);
}
function cartGroups() {
  var groups = [], seen = {};
  cartItems().forEach(function (x) {
    var id = x.p.lojaId;
    if (!seen[id]) { seen[id] = { id: id, loja: userById(id) || { nome: "Loja", cor: "#334155" }, items: [], total: 0 }; groups.push(seen[id]); }
    seen[id].items.push(x);
    seen[id].total += x.p.preco * x.qtd;
  });
  return groups;
}
function cartTotal() { return cartItems().reduce(function (a, x) { return a + x.p.preco * x.qtd; }, 0); }
function paintCartBadge() {
  var n = 0;
  cartItems().forEach(function (x) { n += x.qtd; });
  var el = $("#cartCount");
  if (el) { el.textContent = n; el.style.display = n ? "flex" : "none"; }
}
function prodFormHTML(p) {
  p = p || { nome: "", preco: 0, desc: "", cat: "Geral" };
  return '<form id="frmProd"><label class="field"><span>Nome do produto *</span><input id="pdNome" value="' + esc(p.nome) + '" placeholder="Ex.: Vestido verão"></label>' +
    '<label class="field"><span>Preço R$ (0 = a combinar)</span><input id="pdPreco" type="number" min="0" value="' + (p.preco || 0) + '"></label>' +
    '<label class="field"><span>Categoria</span><input id="pdCat" list="pdCatList" value="' + esc(p.cat || "Geral") + '" autocomplete="off">' + catDataList() + "</label>" +
    '<label class="field"><span>Descrição</span><textarea id="pdDesc" class="input" rows="2" placeholder="Ex.: Viscose, P ao GG.">' + esc(p.desc || "") + "</textarea></label>" +
    '<p class="form-error" id="pdErr" hidden></p>' +
    '<div class="row"><button type="button" class="btn btn-secondary" onclick="Nexo.close()">Cancelar</button><button class="btn btn-primary" type="submit">Salvar</button></div></form>';
}
function renderCarrinho() {
  var w = $("#cartWrap");
  var groups = cartGroups();
  if (!groups.length) {
    w.innerHTML = '<div class="empty"><div class="empty-art">🛒</div><h3>Sacola vazia</h3><p class="muted">Explore as lojas e toque em + para adicionar. Vale misturar lojas!</p><a class="btn btn-primary" href="#/">Ver lojas</a></div>';
    return;
  }
  var total = cartTotal();
  var meU = me();
  function rowHTML(x, cor) {
    return '<div class="prod"><span class="mi-thumb" style="background:' + cor + ';width:44px;height:44px;font-size:.9rem">' + esc(initials(x.p.nome)) + "</span>" +
      '<div class="prod-info"><strong>' + esc(x.p.nome) + "</strong><small>" + BRL(x.p.preco) + " cada</small></div>" +
      '<div class="qty"><button onclick="Nexo.cartQty(\'' + x.p.id + "',-1)\">−</button><strong>" + x.qtd + "</strong>" + '<button onclick="Nexo.cartQty(\'' + x.p.id + "',1)\">+</button></div>" +
      '<button class="fav" onclick="Nexo.cartDel(\'' + x.p.id + "')\" aria-label=\"Remover\">✕</button></div>";
  }
  w.innerHTML = "<p class='muted'>1 · Confira a sacola → 2 · Seus dados → 3 · Pagar. Cada loja recebe seu pedido.</p>" +
    groups.map(function (g) {
      return '<div class="panel"><div class="row"><strong style="font-size:1.05rem">' + esc(g.loja.nome) + '</strong><span class="muted" style="margin-left:auto;font-size:.82rem">' + BRL(g.total) + "</span></div>" +
        '<div class="store-list" style="margin-top:.8rem">' + g.items.map(function (x) { return rowHTML(x, g.loja.cor || "#334155"); }).join("") + "</div></div>";
    }).join("") +
    '<div class="panel"><div class="row" style="justify-content:space-between"><span class="muted">Total geral</span><strong style="font-size:1.3rem">' + BRL(total) + "</strong></div></div>" +
    '<div class="panel"><h3>Seus dados</h3><div class="grid2"><label class="field"><span>Nome *</span><input id="ctNome" autocomplete="name" value="' + esc(meU ? meU.nome : "") + '"></label>' +
    '<label class="field"><span>WhatsApp *</span><input id="ctTel" placeholder="(51) 99999-0000" autocomplete="tel" value="' + esc(meU ? (meU.whatsapp || meU.telefone || "") : "") + '"></label></div>' +
    '<label class="field"><span>Endereço p/ entrega ou retirada</span><input id="ctAddr" placeholder="Rua, número — bairro"></label></div>' +
    '<div class="panel"><h3>Pagamento</h3><label class="check"><input type="radio" name="ctPay" value="pix" checked> Pix (aprovação demo)</label>' +
    '<label class="check"><input type="radio" name="ctPay" value="card"> Cartão via Nexo Pay (demo)</label>' +
    '<label class="check"><input type="radio" name="ctPay" value="zap"> Combinar no WhatsApp</label>' +
    '<p class="muted" style="font-size:.8rem">Demonstração: nenhum valor é cobrado de verdade. Cada loja recebe o seu pedido.</p>' +
    '<div class="row"><button class="btn btn-secondary" onclick="Nexo.cartClear()">Esvaziar</button><button class="btn btn-primary btn-lg grow" onclick="Nexo.checkout()">Finalizar · ' + BRL(total) + "</button></div></div>";
}

/* ----- notificações ----- */
function vNotifs() {
  var u = me();
  var list = db.notifs.filter(function (n) { return n.userId === u.id; }).sort(function (a, b) { return b.criadoEm.localeCompare(a.criadoEm); });
  $("#appContent").innerHTML = "<h2>Notificações</h2><div class='row' style='margin-bottom:1rem'><button class='btn btn-secondary btn-sm' onclick='Nexo.readAll()'>Marcar todas como lidas</button></div>" +
    (list.length ? list.map(function (n) {
      return '<div class="panel" style="margin-bottom:.6rem"><div class="row"><strong>' + (n.lida ? "" : "🔵 ") + esc(n.titulo) + '</strong><span class="muted" style="margin-left:auto;font-size:.78rem">' + timeAgo(n.criadoEm) + '</span></div><p style="margin:.4rem 0">' + esc(n.texto) + '</p><a class="btn btn-secondary btn-sm" href="' + n.link + '" onclick="Nexo.read(\'' + n.id + "')\">Abrir</a></div>";
    }).join("") : '<div class="empty"><div class="empty-art">🔕</div><p class="muted">Sem notificações.</p></div>');
}

/* ----- minha loja / meu perfil ----- */
function contaHTML() {
  var u = me();
  return "<div class='panel'><h3>Conta</h3><p class='muted' style='margin:0 0 .7rem'>Logado como <strong>" + esc(u.email) + "</strong> (" + esc(tipoLabel(u.tipo)) + ").</p><div class='row'><button class='btn btn-secondary btn-sm' onclick='Nexo.logout()'>Sair</button><button class='btn btn-secondary btn-sm' onclick='Nexo.resetDemo()'>Restaurar demo</button></div></div>";
}
function capaPicker(cur) {
  var gs = ["g0", "g1", "g2", "g3", "g4", "g5"];
  return '<div class="swatches">' + gs.map(function (g) {
    return '<label class="swatch"><input type="radio" name="stCapa" value="' + g + '"' + (cur === g ? " checked" : "") + '><span class="' + ("cover-" + g) + '"></span></label>';
  }).join("") + "</div>";
}
function vPerfilApp() {
  var u = me(), r = ratingOf(u.id);
  if (isProv(u) || isLoja(u)) {
    var shopAddr = isLoja(u) ? '<div class="grid2"><label class="field"><span>Endereço *</span><input id="stEnd" value="' + esc(u.endereco || "") + '" placeholder="Rua, número — bairro"></label><label class="field"><span>Categoria da loja</span><select id="stCatLoja">' + SHOP_CATS.map(function (c) { return '<option value="' + c.id + '"' + ((u.categoriaLoja || "Outros") === c.id ? " selected" : "") + ">" + esc(c.name) + "</option>"; }).join("") + "</select></label></div>" : "";
    var especLabel = isLoja(u) ? "O que você vende (separado por vírgula)" : "Especialidades (separadas por vírgula)";
    $("#appContent").innerHTML = "<h2>Minha loja</h2><p class='muted'>Tudo aqui aparece na sua vitrine pública. <a class='link' href='#/perfil/" + u.id + "'>Ver como o cliente vê →</a></p>" +
      '<div class="panel"><h3>Prévia da vitrine</h3><div class="store-list">' + storeCard(u) + "</div></div>" +
      '<div class="panel"><h3>Vitrine</h3><form id="frmStore">' +
      '<div class="grid2"><label class="field"><span>Nome da loja *</span><input id="stNome" value="' + esc(u.nome) + '"></label>' +
      '<label class="field"><span>Cidade *</span><input id="stCity" value="' + esc(u.cidade || "") + '"></label></div>' + shopAddr +
      '<div class="field"><span>Capa da loja</span>' + capaPicker(u.capa || "g0") + "</div>" +
      '<label class="field"><span>Sobre a loja</span><textarea id="stDesc" class="input" rows="3">' + esc(u.descricao || "") + "</textarea></label>" +
      '<div class="grid2"><label class="field"><span>' + especLabel + '</span><input id="stEspec" value="' + esc((u.especialidades || []).join(", ")) + '"></label>' +
      '<label class="field"><span>Experiência</span><input id="stExp" value="' + esc(u.experiencia || "") + '"></label></div>' +
      "<h3>Atendimento e contato</h3>" +
      '<div class="grid2"><label class="field"><span>Telefone</span><input id="stTel" value="' + esc(u.telefone || "") + '"></label>' +
      '<label class="field"><span>WhatsApp</span><input id="stZap" value="' + esc(u.whatsapp || "") + '" placeholder="(51) 99999-0000"></label></div>' +
      '<div class="grid2"><label class="field"><span>Disponibilidade</span><select id="stDisp"><option value="hoje"' + (u.disponibilidade === "hoje" ? " selected" : "") + '>Aberto agora (hoje)</option><option value="semana"' + (u.disponibilidade === "semana" ? " selected" : "") + '>Disponível esta semana</option><option value="agenda"' + (u.disponibilidade === "agenda" ? " selected" : "") + '>Sob agenda</option></select></label>' +
      '<label class="field"><span>Horário de funcionamento</span><input id="stHorario" value="' + esc(u.horario || "") + '" placeholder="Seg–Sáb · 08h–18h"></label></div>' +
      '<div class="grid2"><label class="field"><span>Raio de atendimento (km)</span><input id="stRaio" type="number" min="1" value="' + (u.raio || 15) + '"></label>' +
      '<label class="field"><span>Preço base R$ (0 = a combinar)</span><input id="stPreco" type="number" min="0" value="' + (u.precoBase || 0) + '"></label></div>' +
      "<h3>Redes sociais</h3>" +
      '<div class="grid2"><label class="field"><span>Instagram (@ ou link)</span><input id="stInsta" value="' + esc(u.instagram || "") + '" placeholder="@sualoja"></label>' +
      '<label class="field"><span>Facebook (nome ou link)</span><input id="stFb" value="' + esc(u.facebook || "") + '" placeholder="sualoja"></label></div>' +
      '<label class="field"><span>Portfólio (um trabalho por linha)</span><textarea id="stPort" class="input" rows="3" placeholder="Ex.: CFTV 16 câmeras — Market Sul">' + esc((u.portfolio || []).join("\n")) + "</textarea></label>" +
      '<p class="form-error" id="stErr" hidden></p><div class="row"><button class="btn btn-primary" type="submit">Salvar loja</button> <button class="btn btn-secondary" type="button" onclick="Nexo.logout()">Sair da conta</button></div></form></div>' + contaHTML();
    $("#frmStore").addEventListener("submit", function (e) {
      e.preventDefault();
      var nome = $("#stNome").value.trim();
      if (nome.length < 3) return setErr("stErr", "Informe o nome da sua loja.");
      if (!$("#stCity").value.trim()) return setErr("stErr", "Informe a cidade.");
      var raio = +$("#stRaio").value, preco = +$("#stPreco").value;
      if (!(raio >= 1)) return setErr("stErr", "Raio mínimo: 1 km.");
      if (!(preco >= 0)) return setErr("stErr", "Preço base inválido (0 = a combinar).");
      var ig = $("#stInsta").value.trim(), fb = $("#stFb").value.trim();
      if ((ig && /\s/.test(ig.replace(/^@/, ""))) || (fb && /\s/.test(fb))) return setErr("stErr", "Redes sem espaços. Ex.: @sualoja.");
      var picked = document.querySelector('input[name="stCapa"]:checked');
      u.nome = nome; u.cidade = $("#stCity").value.trim();
      if (isLoja(u)) {
        if (!$("#stEnd").value.trim()) return setErr("stErr", "Informe o endereço da loja.");
        u.endereco = $("#stEnd").value.trim(); u.categoriaLoja = $("#stCatLoja").value;
      }
      u.capa = picked ? picked.value : (u.capa || "g0");
      u.descricao = $("#stDesc").value.trim();
      u.especialidades = $("#stEspec").value.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
      u.experiencia = $("#stExp").value.trim();
      u.telefone = $("#stTel").value.trim(); u.whatsapp = $("#stZap").value.trim();
      u.disponibilidade = $("#stDisp").value; u.horario = $("#stHorario").value.trim();
      u.raio = raio; u.precoBase = preco;
      u.instagram = ig; u.facebook = fb;
      u.portfolio = $("#stPort").value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
      save(); paintChrome(); toast("Loja atualizada! ✅");
      refresh();
    });
    return;
  }
  $("#appContent").innerHTML = "<h2>Meu perfil</h2><div class='panel'><div class='row'><span class='pro-avatar' style='background:" + u.cor + "'>" + esc(initials(u.nome)) + "</span>" +
    "<div><strong>" + esc(u.nome) + "</strong><br><span class='muted' style='font-size:.85rem'>" + esc(tipoLabel(u.tipo)) + " · " + starsHTML(r.m, r.t) + " · " + jobsOf(u) + " serviços</span></div></div>" +
    '<form id="frmMe" style="margin-top:1rem"><div class="grid2"><label class="field"><span>Nome / Razão social *</span><input id="meNome" value="' + esc(u.nome) + '"></label><label class="field"><span>Telefone</span><input id="meTel" value="' + esc(u.telefone || "") + '"></label></div>' +
    '<div class="grid2"><label class="field"><span>Cidade *</span><input id="meCity" value="' + esc(u.cidade || "") + '"></label><label class="field"><span>Região / Bairro</span><input id="meReg" value="' + esc(u.regiao || "") + '"></label></div>' +
    '<label class="field"><span>Sobre / descrição</span><textarea id="meDesc" class="input" rows="3">' + esc(u.descricao || "") + "</textarea></label>" +
    (isProv(u) ? '<div class="grid2"><label class="field"><span>Disponibilidade</span><select id="meDisp"><option value="hoje"' + (u.disponibilidade === "hoje" ? " selected" : "") + '>Disponível hoje</option><option value="semana"' + (u.disponibilidade === "semana" ? " selected" : "") + '>Disponível esta semana</option><option value="agenda"' + (u.disponibilidade === "agenda" ? " selected" : "") + '>Sob agenda</option></select></label><label class="field"><span>Experiência</span><input id="meExp" value="' + esc(u.experiencia || "") + '"></label></div>' : "") +
    '<p class="form-error" id="meErr" hidden></p><button class="btn btn-primary" type="submit">Salvar perfil</button> <button class="btn btn-secondary" type="button" onclick="Nexo.logout()">Sair da conta</button></form></div>' + contaHTML();
  $("#frmMe").addEventListener("submit", function (e) {
    e.preventDefault();
    if ($("#meNome").value.trim().length < 3) return setErr("meErr", "Informe um nome válido.");
    if (!$("#meCity").value.trim()) return setErr("meErr", "Informe a cidade.");
    u.nome = $("#meNome").value.trim(); u.telefone = $("#meTel").value.trim();
    u.cidade = $("#meCity").value.trim(); u.regiao = $("#meReg").value.trim(); u.descricao = $("#meDesc").value.trim();
    if (isProv(u)) { u.disponibilidade = $("#meDisp").value; u.experiencia = $("#meExp").value.trim(); }
    save(); paintChrome(); toast("Perfil atualizado!");
    refresh();
  });
}
function vConfig() {
  $("#appContent").innerHTML = "<h2>Configurações</h2><div class='settings-grid'><div class='panel'><h3>Conta</h3><p class='muted'>Logado como <strong>" + esc(me().email) + "</strong> (" + esc(tipoLabel(me().tipo)) + ").</p><div class='row'><button class='btn btn-secondary' onclick='Nexo.logout()'>Sair</button></div></div>" +
    "<div class='panel'><h3>Dados de demonstração</h3><p class='muted'>Restaura 23 usuários, 15 serviços, 15 produtos, 10 solicitações, 20 propostas e demais dados demo.</p><button class='btn btn-secondary' onclick='Nexo.resetDemo()'>Restaurar dados demo</button></div>" +
    "<div class='panel'><h3>Backend futuro</h3><p class='muted'>Este MVP persiste em <strong>localStorage</strong> via <strong>js/store.js</strong>. Para produção, reimplemente o <strong>NexoStore</strong> com Supabase, Firebase ou PostgreSQL — as telas não mudam.</p></div></div>";
}

/* ----- dispatcher app ----- */
function curRoute() { return (parseHash().segs[1] || "dashboard"); }
function refresh() {
  /* Re-renderiza a visão atual sem trocar de rota (preserva filtros/scroll) */
  var p = parseHash(), segs = p.segs;
  if (segs[0] === "app") { renderApp(segs[1] || "dashboard", segs[2] || null); return; }
  var v = segs[0] || "explorar";
  if (!segs.length) { location.hash = "#/explorar"; return; }
  if (v === "explorar") applySearch();
  else if (v === "perfil") renderPerfil(segs[1]);
  else if (v === "carrinho") renderCarrinho();
}
function renderApp(sub, param) {
  if (needLogin("Entre para acessar o painel.")) return;
  var parts = String(sub || "dashboard").split("/");
  var name = parts[0] || "dashboard", id = param || parts[1] || null;
  if (name === "solicitacao" && id) {
    var _r = reqById(id);
    if (_r) name = (_r.empresaId === (me() || {}).id) ? "solicitacoes" : "oportunidades";
    vReqDetail(id);
  }
  else if (name === "dashboard") vDashboard();
  else if (name === "solicitacoes") vReqList(true);
  else if (name === "oportunidades") vReqList(false);
  else if (name === "solicitacao") vReqDetail(id);
  else if (name === "nova") vNova();
  else if (name === "agenda") vAgenda();
  else if (name === "mensagens") vMsgs();
  else if (name === "favoritos") vFav();
  else if (name === "produtos") vProdutos();
  else if (name === "servicos") vServicos();
  else if (name === "pedidos") vPedidos();
  else if (name === "notificacoes") vNotifs();
  else if (name === "perfil") vPerfilApp();
  else if (name === "config") vConfig();
  else vDashboard();
  paintSide(name);
}

/* ================================================================
   AÇÕES GLOBAIS
   ================================================================ */
window.Nexo = {
  close: closeModal,
  logout: function () { db.session = null; save(); paintChrome(); location.hash = "#/"; toast("Você saiu. Até logo!"); },
  switchAccount: function () {
    if (!me()) { location.hash = "#/login"; toast("Entre ou use o acesso demo para trocar de conta."); return null; }
    return doSwap(null);
  },
  switchTo: function (id) {
    if (!me()) { location.hash = "#/login"; toast("Entre ou use o acesso demo para trocar de conta."); return null; }
    return doSwap(id);
  },
  resetDemo: function () {
    if (!confirm("Restaurar todos os dados de demonstração? Suas alterações locais serão perdidas.")) return;
    db = NexoStore.reset(); CHAT = null; save(); paintChrome();
    toast("Dados demo restaurados.");
    refresh();
  },
  ptab: function (t) { PTAB = t; renderPerfil(parseHash().segs[1]); },
  menuGo: function (id, btn) {
    var el = document.getElementById(id);
    if (el && el.scrollIntoView) el.scrollIntoView();
    if (btn && btn.parentNode) {
      var sibs = btn.parentNode.querySelectorAll("button");
      for (var i = 0; i < sibs.length; i++) sibs[i].classList.toggle("active", sibs[i] === btn);
    }
  },
  reqSeg: function (s) { REQSEG = s; vReqList(curRoute() === "solicitacoes"); },
  agView: function (v) { AGV = v; vAgenda(); paintSide("agenda"); },
  fav: function (tipo, refId) {
    if (needLogin()) return;
    var i = -1;
    for (var k = 0; k < db.favs.length; k++) {
      if (db.favs[k].userId === me().id && db.favs[k].tipo === tipo && db.favs[k].refId === refId) { i = k; break; }
    }
    if (i >= 0) { db.favs.splice(i, 1); toast("Removido dos favoritos."); }
    else { db.favs.push({ userId: me().id, tipo: tipo, refId: refId }); toast("Salvo em Favoritos! ❤️"); }
    save(); refresh();
  },
  svcModal: function (id) {
    var s = svcById(id); if (!s) return;
    var r = svcRating(s), provs = svcProviders(s);
    openModal(s.titulo,
      "<p class='muted' style='margin:0'>" + esc(catOf(s.cat).name) + " · " + starsHTML(r.m, r.t) + " · " + s.dist + " km · " + esc(dispLabel(s.disp)) + " · <strong>" + esc(s.precoLabel) + "</strong></p>" +
      "<p>" + esc(s.desc) + "</p><h3>Quem oferece (" + provs.length + ")</h3>" +
      provs.map(function (p) {
        var pr = ratingOf(p.id);
        return '<div class="row"><span class="pro-avatar" style="background:' + p.cor + ';width:40px;height:40px;font-size:.8rem">' + esc(initials(p.nome)) + "</span><div style='flex:1'><strong>" + esc(p.nome) + "</strong><br><span class='muted' style='font-size:.82rem'>" + starsHTML(pr.m, pr.t) + "</span></div><a class='btn btn-secondary btn-sm' href='#/perfil/" + p.id + "'>Ver perfil</a></div>";
      }).join("") +
      '<div class="row"><button class="btn btn-primary btn-block" onclick="Nexo.askService(\'' + s.id + "')\">Pedir este serviço</button></div>");
  },
  askService: function (svcId, provId) {
    if (needLogin("Entre ou crie uma conta para pedir um serviço.")) return;
    if (!canContract(me())) { toast("Sua conta é de prestador. Quem pede é o cliente ou a empresa."); return; }
    var s = svcId ? svcById(svcId) : null, p = provId ? userById(provId) : null;
    if (s && !svcProviders(s).length) { toast("Este serviço está sem empresas no momento."); return; }
    if (p && !isProv(p)) { toast("Escolha uma empresa, loja ou profissional."); return; }
    if (p && !db.services.some(function (x) { return (x.prestadores || []).indexOf(p.id) >= 0; })) { toast(p.nome.split(" ")[0] + " ainda não cadastrou serviços. Chame no chat."); return; }
    if (!s && !p) return;
    openModal("Pedir serviço" + (s ? ": " + s.titulo : "") + (p && !s ? " — " + p.nome : ""), askFormHTML(s ? s.id : "", p && !s ? p.id : ""));
    $("#frmAsk").addEventListener("submit", function (e) { e.preventDefault(); submitDirected(s ? s.id : "", p && !s ? p.id : ""); });
  },
  confirmReq: function (reqId) {
    var r = reqById(reqId); if (!r) return;
    if (!r.prestId || r.prestId !== me().id) { toast("Só a empresa pode confirmar este pedido."); return; }
    if (r.status !== "solicitado") { toast("Este pedido já foi tratado."); return; }
    if (!confirm("Confirmar \"" + r.titulo + "\" para " + fdateFull(r.dataDesejada) + " às " + (r.hora || "—") + "?")) return;
    r.status = "agendado";
    var a = { id: NexoStore.uid("a"), reqId: r.id, propId: null, contratanteId: r.empresaId, prestId: r.prestId, titulo: r.titulo, local: r.local, data: r.dataDesejada, hora: r.hora || "09:00", status: "agendado" };
    db.schedules.push(a);
    if (!db.convs.some(function (x) { return x.reqId === r.id && x.parts.indexOf(r.prestId) >= 0; })) {
      db.convs.unshift({ id: NexoStore.uid("c"), reqId: r.id, parts: [r.empresaId, r.prestId], titulo: r.titulo, atualizadoEm: new Date().toISOString() });
    }
    save();
    notify(r.empresaId, "agendado", "Pedido confirmado!", r.titulo + " confirmado para " + fdateFull(a.data) + " às " + a.hora + ".", "#/app/agenda");
    toast("Agendamento confirmado! 🎉");
    vReqDetail(r.id); paintSide(curRoute());
  },
  refuseReq: function (reqId) {
    var r = reqById(reqId); if (!r) return;
    if (!r.prestId || r.prestId !== me().id) { toast("Só a empresa pode recusar este pedido."); return; }
    if (!confirm("Recusar e apagar este pedido? O cliente será avisado.")) return;
    db.requests = db.requests.filter(function (x) { return x.id !== reqId; });
    save();
    notify(r.empresaId, "pedido", "Pedido recusado", "Infelizmente " + me().nome + " não pôde atender: " + r.titulo + ".", "#/app/solicitacoes");
    toast("Pedido recusado.");
    location.hash = "#/app/oportunidades";
  },
  bid: function (reqId) {
    if (needLogin()) return;
    if (!isProv(me())) { toast("Sua conta é de cliente. Propostas são enviadas por prestadores e lojas."); location.hash = "#/app/solicitacoes"; return; }
    var r = reqById(reqId); if (!r) return;
    if (r.prestId) { toast("Pedido dirigido: só a empresa responsável atende."); return; }
    openModal("Enviar proposta",
      "<p class='muted' style='margin:0'>" + esc(r.titulo) + " · " + (r.orcamento ? "ref: " + BRL(r.orcamento) : "orçamento aberto") + "</p>" +
      '<form id="frmBid"><div class="grid2"><label class="field"><span>Valor (R$) *</span><input id="bdValor" type="number" min="1" placeholder="Ex.: 800"></label>' +
      '<label class="field"><span>Data disponível *</span><input id="bdData" type="date" min="' + todayISO() + '" value="' + r.dataDesejada + '"></label></div>' +
      '<div class="grid2"><label class="field"><span>Prazo de execução *</span><input id="bdPrazo" placeholder="Ex.: 1 dia"></label>' +
      '<label class="field"><span>Garantia</span><input id="bdGar" placeholder="Ex.: 12 meses"></label></div>' +
      '<label class="field"><span>Observação *</span><textarea id="bdObs" class="input" rows="3" placeholder="Incluso, condições, equipe..."></textarea></label>' +
      '<p class="form-error" id="bdErr" hidden></p>' +
      '<div class="row"><button type="button" class="btn btn-secondary" onclick="Nexo.close()">Cancelar</button><button class="btn btn-primary" type="submit">Enviar proposta</button></div></form>');
    $("#frmBid").addEventListener("submit", function (e) {
      e.preventDefault();
      var valor = +$("#bdValor").value, data = $("#bdData").value, prazo = $("#bdPrazo").value.trim(), obs = $("#bdObs").value.trim();
      if (!(valor > 0)) return setErr("bdErr", "Informe um valor válido maior que zero.");
      if (!data) return setErr("bdErr", "Escolha a data disponível.");
      if (data < todayISO()) return setErr("bdErr", "A data não pode estar no passado.");
      if (!prazo) return setErr("bdErr", "Informe o prazo de execução.");
      if (!obs) return setErr("bdErr", "Adicione uma observação à proposta.");
      db.proposals.push({ id: NexoStore.uid("p"), reqId: reqId, prestId: me().id, valor: valor, dataDisp: data, prazo: prazo, msg: obs, garantia: $("#bdGar").value.trim(), status: "pendente", criadoEm: new Date().toISOString() });
      if (r.status === "solicitado") r.status = "recebendo_propostas";
      save(); closeModal();
      notify(r.empresaId, "proposta", "Nova proposta recebida", me().nome + " enviou proposta de " + BRL(valor) + " para “" + r.titulo + "”.", "#/app/solicitacao/" + reqId);
      toast("Proposta enviada com sucesso!");
      vReqDetail(reqId); paintSide(curRoute());
    });
  },
  accept: function (pid) {
    var p = db.proposals.filter(function (x) { return x.id === pid; })[0]; if (!p) return;
    var r = reqById(p.reqId), pr = userById(p.prestId) || {};
    if (!r || r.empresaId !== me().id) { toast("Só quem publicou o pedido pode aceitar propostas."); return; }
    if (!confirm("Aceitar proposta de " + BRL(p.valor) + " (" + pr.nome + ")? As demais serão recusadas e o serviço será agendado.")) return;
    p.status = "aceita";
    db.proposals.filter(function (x) { return x.reqId === r.id && x.id !== pid && x.status === "pendente"; }).forEach(function (x) {
      x.status = "recusada";
      notify(x.prestId, "proposta", "Proposta não selecionada", "A empresa escolheu outro prestador para: " + r.titulo + ".", "#/app/solicitacao/" + r.id);
    });
    r.status = "proposta_aceita";
    var a = { id: NexoStore.uid("a"), reqId: r.id, propId: p.id, contratanteId: r.empresaId, prestId: p.prestId, titulo: r.titulo, local: r.local, data: p.dataDisp, hora: r.hora || "09:00", status: "agendado" };
    db.schedules.push(a);
    r.status = "agendado";
    if (!db.convs.some(function (x) { return x.reqId === r.id && x.parts.indexOf(p.prestId) >= 0; })) {
      db.convs.unshift({ id: NexoStore.uid("c"), reqId: r.id, parts: [r.empresaId, p.prestId], titulo: r.titulo, atualizadoEm: new Date().toISOString() });
    }
    save();
    notify(p.prestId, "aceita", "🎉 Proposta aceita!", "Sua proposta de " + BRL(p.valor) + " para “" + r.titulo + "” foi aceita. Serviço agendado.", "#/app/agenda");
    notify(r.empresaId, "agendado", "Serviço agendado", r.titulo + " agendado para " + fdateFull(a.data) + " às " + a.hora + ".", "#/app/agenda");
    toast("Proposta aceita! Serviço agendado. 🎉");
    vReqDetail(r.id); paintSide(curRoute());
  },
  refuse: function (pid) {
    var p = db.proposals.filter(function (x) { return x.id === pid; })[0]; if (!p) return;
    var r0 = reqById(p.reqId);
    if (!r0 || r0.empresaId !== me().id) { toast("Só quem publicou o pedido pode recusar propostas."); return; }
    if (!confirm("Recusar esta proposta?")) return;
    p.status = "recusada"; save();
    var r = reqById(p.reqId) || {};
    notify(p.prestId, "proposta", "Proposta recusada", "Sua proposta para “" + (r.titulo || "") + "” foi recusada.", "#/app/solicitacao/" + p.reqId);
    toast("Proposta recusada.");
    vReqDetail(p.reqId); paintSide(curRoute());
  },
  agStatus: function (id, st) {
    var a = db.schedules.filter(function (x) { return x.id === id; })[0]; if (!a) return;
    a.status = st;
    var r = reqById(a.reqId);
    if (r) r.status = st;
    save();
    var other = me().id === a.prestId ? a.contratanteId : a.prestId;
    notify(other, st, st === "em_andamento" ? "▶ Serviço iniciado" : "✔ Serviço concluído", a.titulo + (st === "concluido" ? " foi concluído. Avalie! ⭐" : " está em andamento."), "#/app/agenda");
    toast(st === "concluido" ? "Marcado como concluído! ✔" : "Serviço em andamento ▶");
    refresh();
  },
  rate: function (agId) {
    var a = db.schedules.filter(function (x) { return x.id === agId; })[0]; if (!a) return;
    var pr = userById(a.prestId) || {}, cur = 5;
    openModal("Avaliar " + pr.nome,
      "<p class='muted' style='margin:0'>“" + esc(a.titulo) + "” — sua avaliação atualiza a média do prestador.</p>" +
      '<div class="row" id="rateStars">' + [1, 2, 3, 4, 5].map(function (i) { return '<button class="btn btn-secondary" data-s="' + i + '" style="font-size:1.3rem;color:#F59E0B">★</button>'; }).join("") + "</div>" +
      '<label class="field"><span>Comentário *</span><textarea id="rateTxt" class="input" rows="3" placeholder="Como foi o serviço?"></textarea></label>' +
      '<p class="form-error" id="rateErr" hidden></p>' +
      '<div class="row"><button class="btn btn-secondary" onclick="Nexo.close()">Depois</button><button class="btn btn-primary" id="rateOk">Publicar avaliação</button></div>');
    function paint() { $all("#rateStars button").forEach(function (b) { b.style.opacity = +b.getAttribute("data-s") <= cur ? "1" : ".3"; }); }
    paint();
    $all("#rateStars button").forEach(function (b) { b.addEventListener("click", function () { cur = +b.getAttribute("data-s"); paint(); }); });
    $("#rateOk").addEventListener("click", function () {
      var txt = $("#rateTxt").value.trim();
      if (!txt) return setErr("rateErr", "Adicione um comentário à avaliação.");
      db.reviews.push({ id: NexoStore.uid("av"), agId: agId, reqId: a.reqId, deId: me().id, paraId: a.prestId, estrelas: cur, texto: txt, criadoEm: new Date().toISOString() });
      a.status = "avaliado";
      var r = reqById(a.reqId); if (r) r.status = "avaliado";
      save(); closeModal();
      notify(a.prestId, "avaliacao", "⭐ Nova avaliação", "Você recebeu " + cur + " estrelas: " + txt.slice(0, 70), "#/perfil/" + a.prestId);
      toast("Avaliação publicada. Obrigado! ⭐");
      refresh();
    });
  },
  talk: function (otherId, reqId) {
    if (needLogin("Entre para conversar.")) return;
    if (otherId === me().id) { toast("Este é o seu próprio perfil."); return; }
    var c = db.convs.filter(function (x) { return x.parts.indexOf(me().id) >= 0 && x.parts.indexOf(otherId) >= 0 && (!reqId || x.reqId === reqId); })[0];
    if (!c) {
      var o = userById(otherId) || {}, r = reqId ? reqById(reqId) : null;
      c = { id: NexoStore.uid("c"), reqId: reqId || null, parts: [me().id, otherId], titulo: r ? r.titulo : "Conversa com " + o.nome, atualizadoEm: new Date().toISOString() };
      db.convs.unshift(c); save();
    }
    CHAT = c.id; CHATBACK = false;
    location.hash = "#/app/mensagens";
    if (parseHash().segs[1] === "mensagens") vMsgs();
  },
  chat: function (id) { CHAT = id; CHATBACK = false; vMsgs(); paintSide("mensagens"); },
  chatBack: function () { CHATBACK = true; vMsgs(); paintSide("mensagens"); },
  send: function () {
    var inp = $("#chatIn"); if (!inp || !inp.value.trim()) return;
    var c = db.convs.filter(function (x) { return x.id === CHAT; })[0]; if (!c) return;
    var other = c.parts.filter(function (p) { return p !== me().id; })[0];
    db.msgs.push({ id: NexoStore.uid("m"), convId: c.id, deId: me().id, texto: inp.value.trim(), lida: false, criadoEm: new Date().toISOString() });
    c.atualizadoEm = new Date().toISOString(); save();
    notify(other, "mensagem", "Nova mensagem", me().nome.split(" ")[0] + ": " + inp.value.trim().slice(0, 60), "#/app/mensagens");
    vMsgs(); paintSide("mensagens");
  },
  read: function (id) {
    var n = db.notifs.filter(function (x) { return x.id === id; })[0];
    if (n) { n.lida = true; save(); paintChrome(); paintSide("notificacoes"); }
  },
  readAll: function () {
    db.notifs.filter(function (n) { return n.userId === me().id; }).forEach(function (n) { n.lida = true; });
    save(); vNotifs(); paintSide("notificacoes"); paintChrome();
    toast("Todas marcadas como lidas.");
  },
  prodAdd: function () {
    if (!isLoja(me())) return;
    openModal("Adicionar produto", prodFormHTML(null));
    $("#frmProd").addEventListener("submit", function (e) {
      e.preventDefault();
      var nome = $("#pdNome").value.trim(), preco = +$("#pdPreco").value;
      if (nome.length < 2) return setErr("pdErr", "Dê um nome ao produto.");
      if (!(preco >= 0)) return setErr("pdErr", "Preço inválido (0 = a combinar).");
      var catA = ($("#pdCat").value.trim().replace(/["']/g, "") || "Geral");
      var ua = me();
      if (!ua.menuCats) ua.menuCats = [];
      if (ua.menuCats.indexOf(catA) < 0) ua.menuCats.push(catA);
      if (!db.products) db.products = [];
      db.products.push({ id: NexoStore.uid("pd"), lojaId: me().id, nome: nome, preco: preco, desc: $("#pdDesc").value.trim(), cat: catA, criadoEm: new Date().toISOString() });
      save(); closeModal(); toast("Produto adicionado! 🏷");
      vProdutos();
    });
  },
  prodEdit: function (id) {
    var p = (db.products || []).filter(function (x) { return x.id === id; })[0];
    if (!p || p.lojaId !== me().id) return;
    openModal("Editar produto", prodFormHTML(p));
    $("#frmProd").addEventListener("submit", function (e) {
      e.preventDefault();
      var nome = $("#pdNome").value.trim(), preco = +$("#pdPreco").value;
      if (nome.length < 2) return setErr("pdErr", "Dê um nome ao produto.");
      if (!(preco >= 0)) return setErr("pdErr", "Preço inválido (0 = a combinar).");
      var catE = ($("#pdCat").value.trim().replace(/["']/g, "") || "Geral");
      var ue = me();
      if (!ue.menuCats) ue.menuCats = [];
      if (ue.menuCats.indexOf(catE) < 0) ue.menuCats.push(catE);
      p.nome = nome; p.preco = preco; p.desc = $("#pdDesc").value.trim(); p.cat = catE;
      save(); closeModal(); toast("Produto atualizado!");
      vProdutos();
    });
  },
  prodDel: function (id) {
    var i = -1;
    for (var k = 0; k < (db.products || []).length; k++) {
      if (db.products[k].id === id && db.products[k].lojaId === me().id) { i = k; break; }
    }
    if (i < 0) return;
    if (!confirm("Remover este produto do catálogo?")) return;
    db.products.splice(i, 1); save(); toast("Produto removido.");
    vProdutos();
  },
  svcAdd: function () {
    if (!isLabor(me())) return;
    openModal("Adicionar serviço", svcFormHTML(null));
    $("#frmSvc").addEventListener("submit", function (e) {
      e.preventDefault();
      var nome = $("#svNome").value.trim(), preco = +$("#svPreco").value;
      if (nome.length < 3) return setErr("svErr", "Dê um nome ao serviço.");
      if (!(preco >= 0)) return setErr("svErr", "Preço inválido (0 = a combinar).");
      var u = me(), colors = ["c0", "c1", "c2", "c3", "c4", "c5"];
      db.services.push({ id: NexoStore.uid("s"), titulo: nome, cat: $("#svCat").value, preco: preco, precoLabel: priceLabel(preco), dist: (u.dist != null ? u.dist : 3), disp: u.disponibilidade || "semana", cor: colors[db.services.length % colors.length], desc: $("#svDesc").value.trim(), prestadores: [u.id] });
      save(); closeModal(); toast("Serviço cadastrado! 🛠");
      vServicos(); paintSide("servicos");
    });
  },
  svcEdit: function (id) {
    var u = me(), s = svcById(id);
    if (!s || (s.prestadores || []).indexOf(u.id) < 0) return;
    var shared = (s.prestadores || []).length > 1;
    openModal("Editar serviço" + (shared ? " (compartilhado: muda para as outras também)" : ""), svcFormHTML(s));
    $("#frmSvc").addEventListener("submit", function (e) {
      e.preventDefault();
      var nome = $("#svNome").value.trim(), preco = +$("#svPreco").value;
      if (nome.length < 3) return setErr("svErr", "Dê um nome ao serviço.");
      if (!(preco >= 0)) return setErr("svErr", "Preço inválido (0 = a combinar).");
      s.titulo = nome; s.cat = $("#svCat").value; s.preco = preco; s.precoLabel = priceLabel(preco); s.desc = $("#svDesc").value.trim();
      save(); closeModal(); toast("Serviço atualizado!");
      vServicos(); paintSide("servicos");
    });
  },
  svcDel: function (id) {
    var u = me(), s = svcById(id);
    if (!s || (s.prestadores || []).indexOf(u.id) < 0) return;
    if (!confirm("Remover \"" + s.titulo + "\" dos seus serviços?")) return;
    s.prestadores = (s.prestadores || []).filter(function (x) { return x !== u.id; });
    if (!s.prestadores.length) db.services = db.services.filter(function (x) { return x.id !== id; });
    save(); toast("Serviço removido.");
    vServicos(); paintSide("servicos");
  },
  cartAdd: function (lojaId, prodId) {
    if (!db.cart) db.cart = { items: [] };
    if (!db.cart.items) db.cart.items = [];
    var it = db.cart.items.filter(function (x) { return x.prodId === prodId; })[0];
    if (it) it.qtd++;
    else db.cart.items.push({ prodId: prodId, lojaId: lojaId, qtd: 1 });
    save(); paintCartBadge(); refresh();
    var p = (db.products || []).filter(function (x) { return x.id === prodId; })[0] || {};
    toast("Na sacola: " + (p.nome || "item") + " 🛒");
  },
  cartQty: function (prodId, d) {
    var items = (db.cart || { items: [] }).items || [];
    var it = items.filter(function (x) { return x.prodId === prodId; })[0];
    if (!it) return;
    it.qtd += d;
    if (it.qtd <= 0) db.cart.items = items.filter(function (x) { return x !== it; });
    save(); paintCartBadge(); renderCarrinho();
  },
  cartDel: function (prodId) {
    db.cart.items = (db.cart.items || []).filter(function (x) { return x.prodId !== prodId; });
    save(); paintCartBadge(); renderCarrinho();
  },
  cartClear: function () {
    db.cart = { items: [] };
    save(); paintCartBadge(); renderCarrinho();
  },
  checkout: function () {
    var groups = cartGroups();
    if (!groups.length) return;
    var pay = "pix", picked = document.querySelector('input[name="ctPay"]:checked');
    if (picked) pay = picked.value;
    var buyer = { nome: $("#ctNome").value.trim(), tel: $("#ctTel").value.trim(), addr: $("#ctAddr").value.trim() };
    if (buyer.nome.length < 2) { toast("Informe seu nome."); return; }
    if (!buyer.tel) { toast("Informe seu telefone/WhatsApp."); return; }
    if (!db.orders) db.orders = [];
    var orders = groups.map(function (g) {
      return {
        id: NexoStore.uid("o"), lojaId: g.id,
        items: g.items.map(function (x) { return { nome: x.p.nome, preco: x.p.preco, qtd: x.qtd }; }),
        total: g.total, pay: pay, buyer: buyer,
        status: pay === "zap" ? "enviado" : "aguardando_pagamento",
        criadoEm: new Date().toISOString()
      };
    });
    if (pay === "zap") {
      orders.forEach(function (order) {
        db.orders.push(order);
        var loja = userById(order.lojaId) || {};
        notify(order.lojaId, "pedido", "🛒 Pedido novo", buyer.nome + " · " + BRL(order.total) + " (via WhatsApp).", "#/app/dashboard");
        var lines = order.items.map(function (it) { return "• " + it.qtd + "x " + it.nome + " — " + BRL(it.preco * it.qtd); });
        var msg = "Olá " + (loja.nome || "") + "! Meu pedido Nexo:\n" + lines.join("\n") + "\nTotal: " + BRL(order.total) + "\n— " + buyer.nome + (buyer.addr ? " · " + buyer.addr : "");
        var d = digits(loja.whatsapp || loja.telefone);
        if (d) window.open("https://wa.me/" + (d.length <= 11 ? "55" + d : d) + "?text=" + encodeURIComponent(msg), "_blank");
      });
      db.cart = { items: [] };
      save(); paintCartBadge();
      toast(orders.length > 1 ? "Pedidos enviados às lojas! 🛒" : "Pedido enviado! 🛒");
      location.hash = "#/";
      return;
    }
    NexoPay.checkoutMulti(orders);
  },
  orderStatus: function (id, st) {
    var o = (db.orders || []).filter(function (x) { return x.id === id; })[0];
    if (!o || o.lojaId !== me().id) return;
    o.status = st; save();
    toast(st === "pronto" ? "Pedido pronto! 🛍" : "Pedido concluído! ✔");
    vPedidos(); paintSide("pedidos");
  },
  shopCatRename: function (old) {
    var u = me(); if (!isLoja(u)) return;
    openModal("Renomear categoria",
      '<form id="frmCatRn"><label class="field"><span>Novo nome</span><input id="catNovo" value="' + esc(old) + '" autocomplete="off"></label>' +
      '<p class="form-error" id="catRnErr" hidden></p>' +
      '<div class="row"><button type="button" class="btn btn-secondary" onclick="Nexo.close()">Cancelar</button><button class="btn btn-primary" type="submit">Salvar</button></div></form>');
    $("#frmCatRn").addEventListener("submit", function (e) {
      e.preventDefault();
      var nn = $("#catNovo").value.trim().replace(/["']/g, "");
      if (nn.length < 2) return setErr("catRnErr", "Nome muito curto.");
      if (nn !== old && u.menuCats.indexOf(nn) >= 0) return setErr("catRnErr", "Já existe essa categoria.");
      u.menuCats = u.menuCats.map(function (c) { return c === old ? nn : c; });
      shopProducts(u.id).forEach(function (p) { if ((p.cat || "Geral") === old) p.cat = nn; });
      save(); closeModal(); toast("Categoria atualizada!"); refresh();
    });
  },
  shopCatDel: function (old) {
    var u = me(); if (!isLoja(u)) return;
    var n = shopProducts(u.id).filter(function (p) { return (p.cat || "Geral") === old; }).length;
    if (!confirm("Apagar '" + old + "'? " + n + " produto(s) vão para Geral.")) return;
    u.menuCats = u.menuCats.filter(function (c) { return c !== old; });
    shopProducts(u.id).forEach(function (p) { if ((p.cat || "Geral") === old) p.cat = "Geral"; });
    if (!u.menuCats.length) u.menuCats = ["Geral"];
    save(); toast("Categoria apagada."); refresh();
  },
  demoProposal: function () {
    var r = reqById("r1"), props = proposalsOf("r1");
    if (!r) return;
    if (me()) { location.hash = "#/app/solicitacao/r1"; return; }
    openModal("Exemplo real: " + r.titulo,
      '<p class="muted" style="margin:0">📍 ' + esc(r.local) + " · 🗓 " + esc(r.prazo) + " · 💰 Orçamento aberto</p>" +
      props.map(function (p) {
        var pr = userById(p.prestId) || {}, rt = ratingOf(p.prestId);
        return '<div class="req-item"><div class="req-item-top"><span class="pro-avatar" style="background:' + pr.cor + ';width:38px;height:38px;font-size:.75rem">' + esc(initials(pr.nome)) + "</span><div><strong>" + esc(pr.nome) + "</strong><br><span class='muted' style='font-size:.8rem'>" + starsHTML(rt.m, rt.t) + "</span></div>" +
          '<div style="margin-left:auto;text-align:right"><strong>' + BRL(p.valor) + "</strong><br><span class='muted' style='font-size:.8rem'>" + fdate(p.dataDisp) + "</span></div></div>" +
          '<p class="muted" style="margin:0;font-size:.88rem">' + esc(p.msg) + "</p></div>";
      }).join("") +
      '<a class="btn btn-primary btn-block" href="#/cadastro">Criar conta para aceitar propostas</a>');
  }
};

/* ================================================================
   NexoPay — adaptador de pagamento (DEMO).
   Cobrança real exige backend: implemente aqui a chamada ao gateway
   (Mercado Pago / Stripe / API Pix do banco), com chave secreta no
   servidor, webhook de confirmação e TLS. Nunca exponha segredos no front.
   ================================================================ */
window.NexoPay = {
  checkoutMulti: function (orders) {
    var isPix = orders[0].pay === "pix";
    var total = 0, names = [];
    orders.forEach(function (o) {
      total += o.total;
      var l = userById(o.lojaId) || {};
      if (l.nome) names.push(l.nome);
    });
    openModal("Pagamento Nexo Pay",
      "<p class='muted' style='margin:0'><strong>" + BRL(total) + "</strong> · " + orders.length + (orders.length > 1 ? " lojas" : " loja") + " (" + esc(names.join(", ")) + ") · " + (isPix ? "Pix" : "Cartão") + "</p>" +
      (isPix
        ? '<div class="panel" style="text-align:center;margin:0"><div style="font-size:2.6rem">▦</div><p class="muted" style="font-size:.82rem;margin:0">QR demo — na versão real o código aparece aqui.</p></div>'
        : '<p class="muted">Cartão final 0000 (demo) · sem cobrança real.</p>') +
      '<div class="row"><span class="muted" id="paySpin">⏳ Aguardando aprovação...</span></div>' +
      '<div class="row"><button class="btn btn-secondary" onclick="Nexo.close()">Cancelar</button></div>');
    setTimeout(function () {
      if (!db.orders) db.orders = [];
      orders.forEach(function (order) {
        order.status = "pago";
        db.orders.push(order);
        var n = 0;
        order.items.forEach(function (it) { n += it.qtd; });
        notify(order.lojaId, "pedido", "🛒 Pedido pago!", order.buyer.nome + " · " + n + " item(ns) · " + BRL(order.total) + ".", "#/app/dashboard");
      });
      db.cart = { items: [] };
      save(); closeModal(); paintCartBadge();
      openModal("Pedidos confirmados! 🎉",
        "<p>Pagamento aprovado (demonstração, sem cobrança real). Cada loja recebeu o seu pedido.</p>" +
        '<div class="row"><a class="btn btn-secondary grow" href="#/app/mensagens">Acompanhar no chat</a><a class="btn btn-primary grow" href="#/">Voltar à vitrine</a></div>');
    }, 1600);
  }
};

/* ================================================================
   BINDINGS + INIT
   ================================================================ */
function bindChrome() {
  document.addEventListener("click", function (e) {
    var t = e.target;
    var open = t.closest("#openMenu");
    if (open) {
      var d = $("#mobileDrawer");
      d.classList.add("open"); d.setAttribute("aria-hidden", "false");
      $("#drawerScrim").hidden = false; open.setAttribute("aria-expanded", "true");
      return;
    }
    if (t.closest("#closeMenu") || t.id === "drawerScrim") {
      var d2 = $("#mobileDrawer");
      d2.classList.remove("open"); d2.setAttribute("aria-hidden", "true");
      $("#drawerScrim").hidden = true;
      var om = $("#openMenu"); if (om) om.setAttribute("aria-expanded", "false");
      return;
    }
    if (t.closest(".drawer-nav a") || t.closest(".drawer-cta a")) {
      $("#mobileDrawer").classList.remove("open"); $("#drawerScrim").hidden = true;
    }
    var dt = t.closest("[data-toast]");
    if (dt) {
      var msg = dt.getAttribute("data-toast") || "";
      if (msg.indexOf("Link de recuperação") === 0) { e.preventDefault(); openRecover(); return; }
      toast(msg); return;
    }
    if (t.closest("[data-demo-proposal]")) { e.preventDefault(); Nexo.demoProposal(); return; }
    if (t.closest("#bellBtn")) { renderPop(); return; }
    if (t.closest("#modalClose")) { closeModal(); return; }
    var rt = t.closest("[data-route]");
    if (rt) {
      var sb = $(".sidebar"); if (sb) sb.classList.remove("open");
      location.hash = "#/app/" + rt.getAttribute("data-route");
      return;
    }
    if (t.closest("#logoutBtn")) { Nexo.logout(); return; }
    if (t.closest("#openSide")) { $(".sidebar").classList.toggle("open"); return; }
    var pp = t.closest("[data-toggle-pass]");
    if (pp) {
      var inp = pp.parentNode.querySelector("input");
      inp.type = inp.type === "password" ? "text" : "password";
      return;
    }
    var np = $("#notifPop");
    if (np && !np.hidden && !t.closest("#notifPop") && !t.closest("#bellBtn")) np.hidden = true;
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { closeModal(); hidePop(); }
    if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
      var g = $("#globalSearch"); if (g && !$("#appZone").hidden) { e.preventDefault(); g.focus(); }
    }
  });
  $("#modalScrim").addEventListener("click", function (e) { if (e.target.id === "modalScrim") closeModal(); });
  var gs = $("#globalSearch");
  if (gs) gs.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && gs.value.trim()) location.hash = "#/explorar?q=" + encodeURIComponent(gs.value.trim());
  });
  /* buscar: filtros vivos */
  ["fQ", "fLoc", "fPrice", "fDate"].forEach(function (id) {
    $("#" + id).addEventListener("input", applySearch);
  });
  ["fDist", "fRating", "fAvail"].forEach(function (id) {
    $("#" + id).addEventListener("change", applySearch);
    $("#" + id).addEventListener("input", applySearch);
  });
  $all("[data-sort]").forEach(function (b) {
    b.addEventListener("click", function () {
      F.sort = b.getAttribute("data-sort");
      $all("[data-sort]").forEach(function (x) { x.classList.toggle("active", x === b); });
      applySearch();
    });
  });
  $all("[data-tipo]").forEach(function (b) {
    b.addEventListener("click", function () {
      FTIPO = b.getAttribute("data-tipo") || "todos";
      $all("[data-tipo]").forEach(function (x) { x.classList.toggle("active", x === b); });
      applySearch();
    });
  });
  function clearF() {
    F = { q: "", cats: {}, loc: "Vila Aurora", dist: 50, rating: 0, price: "", date: "", avail: false, sort: F.sort };
    $("#fQ").value = ""; $("#fLoc").value = "Vila Aurora";
    $("#fDist").value = 50; $("#fRating").value = "0"; $("#fPrice").value = ""; $("#fDate").value = "";
    $("#fAvail").checked = false;
    $all("#fCats input").forEach(function (c) { c.checked = false; });
    applySearch();
  }
  $("#clearFilters").addEventListener("click", clearF);
  $("#emptyClear").addEventListener("click", clearF);
}

function init() {
  bindAuth();
  bindChrome();
  window.addEventListener("hashchange", route);
  if (!location.hash) location.hash = "#/explorar";
  route();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();

})();
