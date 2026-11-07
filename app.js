/* Pitch Day UFPR — frontend estático (sem build).
   Rotas: #/ · #/<AVAL_ROTA> · #/popular/I · #/popular/A · #/ideathon · #/resultados · #/<ADMIN_ROTA>
   Segurança: nenhum dado do servidor/usuário passa por innerHTML — tudo é montado com el()/textContent. */
(function () {
  'use strict';
  var CFG = window.PITCHDAY_CONFIG || {};
  var API = CFG.API_URL || '', ROTA_ADMIN = CFG.ADMIN_ROTA || '', ROTA_AVAL = CFG.AVAL_ROTA || '';
  var app = document.getElementById('app');
  var CAT = { A: 'Avançado', I: 'Ideação' };
  var EST = null, NOMES = {};

  /* ---------- DOM seguro ---------- */
  function el(tag, at) {
    var e = document.createElement(tag);
    if (at) for (var k in at) {
      var v = at[k]; if (v == null || v === false) continue;
      if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v);
    }
    for (var i = 2; i < arguments.length; i++) add(e, arguments[i]);
    return e;
  }
  function add(e, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(function (x) { add(e, x); });
    else e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  function tela() {
    while (app.firstChild) app.removeChild(app.firstChild);
    for (var i = 0; i < arguments.length; i++) add(app, arguments[i]);
    window.scrollTo(0, 0); var t = app.querySelector('h1'); if (t) { t.tabIndex = -1; t.focus(); }
  }
  function msg(tipo, t) { return el('div', { class: 'msg msg-' + tipo, role: tipo === 'erro' ? 'alert' : 'status', text: t }); }
  function mostraMsg(alvo, tipo, t) { while (alvo.firstChild) alvo.removeChild(alvo.firstChild); alvo.appendChild(msg(tipo, t)); }
  function fmt(n) { return Number(n).toFixed(2).replace('.', ','); }
  function rotulo(cod) { var n = NOMES[cod]; return n ? cod + ' · ' + n : cod; }
  function selo(s) { return el('span', { class: 'estado ' + (s === 'aberta' ? 'aberta' : 'fechada'), text: s === 'aberta' ? 'ABERTA' : 'FECHADA' }); }
  function link(href, cls, txt, extra) { return el('a', { class: 'btn ' + cls, href: href }, txt, extra); }

  /* ---------- API ---------- */
  function api(dados) {
    if (!/^https:\/\/script\.google\.com\//.test(API)) return Promise.reject(new Error('API não configurada: edite config.js.'));
    return fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(dados),
      redirect: 'follow', credentials: 'omit', referrerPolicy: 'no-referrer' })
      .then(function (r) { return r.json(); }, function () { throw new Error('Sem conexão com o servidor. Tente de novo.'); })
      .then(function (j) { if (!j || !j.ok) throw new Error((j && typeof j.erro === 'string') ? j.erro : 'Erro.'); return j; });
  }
  var SELOS = {};
  function guardaNomes(lista) { NOMES = {}; SELOS = {}; (lista || []).forEach(function (s) { if (s.nome) NOMES[s.codigo] = String(s.nome); SELOS[s.codigo] = { f: s.feminina === true, em: s.ensino_medio === true }; }); }
  function selos(cod) { var x = SELOS[cod] || {}; return [x.f ? el('span', { class: 'tag-selo tag-f', text: 'Feminina' }) : null, x.em ? el('span', { class: 'tag-selo tag-em', text: 'Ensino médio' }) : null]; }
  function estado() { return api({ acao: 'estado' }).then(function (j) { EST = j; guardaNomes(j.startups); return j; }); }

  function dispositivo() {
    var k = 'pd_dispositivo', v = localStorage.getItem(k);
    if (!/^[a-f0-9]{32}$/.test(v || '')) {
      var a = new Uint8Array(16); window.crypto.getRandomValues(a);
      v = Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
      localStorage.setItem(k, v);
    }
    return v;
  }
  function confirmar(titulo, corpo, okTxt) {
    return new Promise(function (res) {
      var d;
      function fim(v) { d.remove(); res(v); }
      var ok = el('button', { class: 'btn btn-pri', onclick: function () { fim(true); } }, okTxt || 'Confirmar e enviar');
      d = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
        el('div', { class: 'cartao' }, el('h2', { text: titulo }), corpo, ok,
          el('button', { class: 'btn btn-sec', onclick: function () { fim(false); } }, 'Voltar e revisar')));
      document.body.appendChild(d); ok.focus();
    });
  }
  function erroTela(e) { tela(el('h1', { text: 'Ops' }), msg('erro', e.message), link('#/', 'btn-sec', 'Voltar ao início')); }

  /* ---------- início (sem link para o admin) ---------- */
  function inicio() {
    estado().then(function (e) {
      var s = e.estados;
      tela(el('p', { class: 'eyebrow', text: 'Pitch Day UFPR 2026' }), el('h1', { text: 'Votação' }),
        el('nav', { class: 'menu' },
          link('#/popular/I', 'btn-pri', 'Voto popular · Ideação ', selo(s.pop_I)),
          link('#/popular/A', 'btn-pri', 'Voto popular · Avançado ', selo(s.pop_A)),
          link('#/ideathon', 'btn-pri', 'Voto popular · Ideathon ', selo(s.ideathon)),
          e.resultados_liberados ? link('#/resultados', 'btn-sec', 'Resultados') : null));
    }, erroTela);
  }

  /* ---------- avaliadores ---------- */
  var AV = { token: sessionStorage.getItem('pd_av') || '', ja: JSON.parse(sessionStorage.getItem('pd_av_ja') || '[]') };
  function salvaAV() { sessionStorage.setItem('pd_av', AV.token); sessionStorage.setItem('pd_av_ja', JSON.stringify(AV.ja)); }
  function sairAV() { if (AV.token) api({ acao: 'sair', token: AV.token }).catch(function () {}); AV.token = ''; AV.ja = []; sessionStorage.removeItem('pd_av'); sessionStorage.removeItem('pd_av_ja'); }
  function avaliadores() { estado().then(function (e) { AV.token ? listaAvaliar(e) : loginAvaliador(); }, erroTela); }
  function cpfValido(v) { // mesma regra do servidor (Calculo.gs normalizarCPF)
    var d = String(v).replace(/[.\-\s]/g, '');
    if (!/^[0-9]{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
    for (var t = 9; t < 11; t++) { var s = 0; for (var i = 0; i < t; i++) s += +d[i] * (t + 1 - i); if (((s * 10) % 11) % 10 !== +d[t]) return false; }
    return true;
  }
  function mascaraDigitacao(inp) {
    inp.addEventListener('input', function () {
      var d = inp.value.replace(/\D/g, '').slice(0, 11), o = d.slice(0, 3);
      if (d.length > 3) o += '.' + d.slice(3, 6); if (d.length > 6) o += '.' + d.slice(6, 9); if (d.length > 9) o += '-' + d.slice(9);
      inp.value = o;
    });
  }
  function loginAvaliador(erro) {
    var cpf = el('input', { id: 'cpf', inputmode: 'numeric', autocomplete: 'off', required: true, maxlength: '14', placeholder: '000.000.000-00' });
    var nome = el('input', { id: 'nome', autocomplete: 'name', maxlength: '60' });
    var m = el('div'); mascaraDigitacao(cpf);
    tela(el('p', { class: 'eyebrow', text: 'Avaliadores' }), el('h1', { text: 'Entrar com CPF' }), erro ? msg('erro', erro) : null, m,
      el('form', { class: 'cartao', onsubmit: function (ev) {
        ev.preventDefault();
        if (!cpfValido(cpf.value)) return mostraMsg(m, 'erro', 'CPF inválido. Confira os números.');
        api({ acao: 'login_avaliador', cpf: cpf.value, nome: nome.value }).then(function (j) { AV.token = j.token; AV.ja = j.ja || []; cpf.value = ''; salvaAV(); avaliadores(); },
          function (err) { mostraMsg(m, 'erro', err.message); });
      } }, el('label', { for: 'cpf', text: 'Seu CPF' }), cpf,
        el('label', { for: 'nome', text: 'Seu nome (opcional)' }), nome,
        el('p', { class: 'lgpd', text: 'Seu CPF será usado apenas para identificar e auditar sua avaliação no Pitch Day UFPR.' }),
        el('button', { class: 'btn btn-pri' }, 'Entrar')));
  }
  function listaAvaliar(e) {
    var aberta = e.estados.aval === 'aberta';
    var grupos = ['A', 'I'].map(function (c) {
      var lst = e.startups.filter(function (s) { return s.categoria === c; });
      if (!lst.length) return null;
      return [el('h2', { text: CAT[c] }), el('div', { class: 'opcoes largas' }, lst.map(function (s) {
        var feito = AV.ja.indexOf(s.codigo) >= 0;
        return el('button', { class: 'opcao', disabled: feito || !aberta, onclick: function () { formAvaliar(e, s.codigo); } },
          rotulo(s.codigo) + (feito ? ' ✓' : ''), selos(s.codigo));
      }))];
    });
    tela(el('p', { class: 'eyebrow', text: 'Área dos avaliadores' }), el('h1', { text: 'Escolha a startup' }),
      aberta ? null : msg('erro', 'A avaliação está fechada no momento.'),
      el('p', { class: 'ajuda', text: 'Você avaliou ' + AV.ja.length + ' startup(s). ✓ = já enviada (definitivo).' }), grupos,
      el('button', { class: 'btn btn-sec', onclick: function () { sairAV(); location.hash = '#/'; } }, 'Sair'));
  }
  function formAvaliar(e, cod) {
    var notas = {}, nCrit = e.criterios.length, pesoDemais = e.pesos.demais / (nCrit - 1) * 100;
    var cnt = el('span', { text: '0' }), m = el('div'), com = null;
    var blocos = e.criterios.map(function (c, i) {
      var p = c.id === 'pitch' ? e.pesos.pitch * 100 : pesoDemais, bts = [];
      for (var n = e.nota_min; n <= e.nota_max; n++) (function (n) {
        var b = el('button', { type: 'button', class: 'nota', 'aria-pressed': 'false', 'aria-label': c.nome + ': nota ' + n, onclick: function () {
          notas[c.id] = n; bts.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
          cnt.textContent = Object.keys(notas).length;
        } }, n);
        bts.push(b);
      })(n);
      return el('div', { class: 'criterio', id: 'cr-' + c.id, role: 'group', 'aria-labelledby': 't-' + c.id },
        el('h3', { id: 't-' + c.id }, (i + 1) + '. ' + c.nome + ' ', el('span', { class: 'peso', text: String(+p.toFixed(3)).replace('.', ',') + '%' })),
        el('p', { class: 'ajuda', text: c.pergunta }), el('div', { class: 'notas' }, bts));
    });
    if (e.comentario_ativo) com = el('textarea', { id: 'com', maxlength: '500' });
    var env = el('button', { class: 'btn btn-pri' }, 'Revisar e enviar (', cnt, '/' + nCrit + ')');
    tela(el('p', { class: 'eyebrow', text: CAT[cod[0]] + ' · Avaliação' }), el('h1', { text: 'Avaliar ' + rotulo(cod) }),
      el('div', { class: 'cartao' }, el('p', { class: 'ajuda', text: 'Dê uma nota de ' + e.nota_min + ' (mínimo) a ' + e.nota_max + ' (máximo) em todos os ' + nCrit + ' critérios. O envio é definitivo.' }), blocos,
        com ? el('div', { class: 'criterio' }, el('label', { for: 'com', text: 'Comentário (opcional, não aparece no resultado)' }), com) : null),
      m, el('div', { class: 'sticky' }, env, link('#/' + ROTA_AVAL, 'btn-sec', 'Cancelar')));
    env.onclick = function () {
      var falta = e.criterios.filter(function (c) { return !notas[c.id]; });
      if (falta.length) { mostraMsg(m, 'erro', 'Falta nota em: ' + falta.map(function (c) { return c.nome; }).join(', ') + '.');
        document.getElementById('cr-' + falta[0].id).scrollIntoView({ behavior: 'smooth' }); return; }
      var soma = 0; e.criterios.forEach(function (c) { if (c.id !== 'pitch') soma += notas[c.id]; });
      var final = e.pesos.pitch * notas.pitch + e.pesos.demais * soma / (nCrit - 1);
      var resumo = [el('table', null, e.criterios.map(function (c) { return el('tr', null, el('td', { text: c.nome }), el('td', { class: 'num', text: String(notas[c.id]) })); }),
        el('tr', null, el('th', { text: 'Sua nota final' }), el('th', { class: 'num', text: fmt(final) }))),
        el('p', { class: 'ajuda', text: 'Depois de enviar, não é possível alterar.' })];
      confirmar('Enviar avaliação de ' + rotulo(cod) + '?', resumo).then(function (ok) {
        if (!ok) return;
        env.disabled = true; env.textContent = 'Enviando…';
        api({ acao: 'avaliar', token: AV.token, codigo: cod, notas: notas, comentario: com ? com.value : '' }).then(function () {
          AV.ja.push(cod); salvaAV();
          tela(el('h1', { text: 'Avaliação enviada' }), msg('ok', 'Sua avaliação de ' + rotulo(cod) + ' foi registrada.'), link('#/' + ROTA_AVAL, 'btn-pri', 'Avaliar outra startup'));
        }, function (err) {
          if (/Sessão expirada/.test(err.message)) { sairAV(); return loginAvaliador(err.message); }
          env.disabled = false; env.textContent = 'Tentar enviar de novo'; mostraMsg(m, 'erro', err.message);
        });
      });
    };
  }

  /* ---------- voto popular: 1 voto por CPF em cada votação ---------- */
  function popular(votacao, titulo, opcoes, largas) {
    estado().then(function (e) {
      var chave = 'pd_votou_' + votacao, jaNeste = localStorage.getItem(chave);
      var cab = [el('p', { class: 'eyebrow', text: 'Voto popular · 1 voto por CPF' }), el('h1', { text: titulo })];
      if (e.estados[votacao] !== 'aberta') return tela(cab, msg('erro', 'Esta votação está fechada no momento.'), link('#/', 'btn-sec', 'Início'));
      var ops = opcoes(e), escolha = null, bts = [], m = el('div');
      if (!ops.length) return tela(cab, msg('erro', 'Nenhuma opção disponível ainda.'), link('#/', 'btn-sec', 'Início'));
      var cpf = el('input', { id: 'cpf-voto', class: 'campo-grande', inputmode: 'numeric', autocomplete: 'off', maxlength: '14', placeholder: '000.000.000-00', 'aria-describedby': 'lgpd-voto' });
      mascaraDigitacao(cpf);
      var env = el('button', { class: 'btn btn-pri', disabled: true }, 'Escolha uma opção');
      ops.forEach(function (o) {
        var b = el('button', { class: 'opcao', 'aria-pressed': 'false', onclick: function () {
          escolha = o.valor; bts.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
          env.disabled = false; env.textContent = 'Votar em ' + o.rotulo;
        } }, o.rotulo, o.valor.length <= 4 ? selos(o.valor) : null);
        bts.push(b);
      });
      tela(cab,
        jaNeste ? el('div', { class: 'msg msg-aviso', role: 'status', text: 'Este celular já registrou um voto nesta categoria. Se for outra pessoa, pode votar com o próprio CPF.' }) : null,
        el('p', { class: 'ajuda', text: '1. Toque na sua escolha. 2. Informe seu CPF. 3. Confirme.' }),
        el('div', { class: 'opcoes' + (largas ? ' largas' : '') }, bts),
        el('div', { class: 'cartao' }, el('label', { for: 'cpf-voto', text: 'Seu CPF (1 voto por CPF nesta categoria)' }), cpf,
          el('p', { class: 'lgpd', id: 'lgpd-voto', text: 'LGPD: seu CPF serve só para garantir 1 voto por pessoa. Ele não é gravado nem exibido: guardamos apenas um código irreversível.' })),
        m, el('div', { class: 'sticky' }, env));
      env.onclick = function () {
        if (!cpfValido(cpf.value)) { mostraMsg(m, 'erro', 'CPF inválido. Confira os números.'); cpf.focus(); return; }
        var rot = ops.filter(function (o) { return o.valor === escolha; })[0].rotulo;
        confirmar('Confirmar voto em ' + rot + '?', el('p', { text: 'O voto é único por CPF nesta categoria e não pode ser alterado.' }), 'Confirmar voto').then(function (ok) {
          if (!ok) return; env.disabled = true; env.textContent = 'Enviando…';
          api({ acao: 'votar', votacao: votacao, opcao: escolha, cpf: cpf.value, dispositivo: dispositivo() }).then(function () {
            localStorage.setItem(chave, '1'); cpf.value = '';
            tela(el('h1', { text: 'Voto registrado!' }), msg('ok', 'Você votou em ' + rot + '. Obrigado!'),
              el('p', { class: 'ajuda', text: 'Quer votar também nas outras categorias? Use os QR codes de cada votação.' }), link('#/', 'btn-sec', 'Início'));
          }, function (err) {
            env.disabled = false; env.textContent = 'Votar em ' + rot; mostraMsg(m, 'erro', err.message);
          });
        });
      };
    }, erroTela);
  }

  /* ---------- resultados ---------- */
  function tabRanking(lista, sem) {
    return [lista.length ? el('table', null, el('tr', null, el('th', { text: '#' }), el('th', { text: 'Startup' }), el('th', { class: 'num', text: 'Nota' }), el('th', { class: 'num', text: 'Aval.' })),
      lista.map(function (r) { return el('tr', null, el('td', { text: r.posicao + 'º' }), el('td', null, el('b', { text: rotulo(r.codigo) }), selos(r.codigo)), el('td', { class: 'num', text: fmt(r.nota) }), el('td', { class: 'num', text: String(r.avaliadores) })); }))
      : el('p', { text: 'Nenhuma avaliação ainda.' }),
      sem && sem.length ? [el('p', { class: 'ajuda', text: 'Sem avaliação (fora do ranking):' }), el('div', { class: 'chips' }, sem.map(function (c) { return el('span', { class: 'chip', text: c }); }))] : null];
  }
  function tabVotos(l, ehStartup) {
    if (!l.length) return el('p', { text: 'Nenhum voto ainda.' });
    var tot = l.reduce(function (s, x) { return s + x.votos; }, 0);
    return [el('table', null, l.map(function (x, i) { return el('tr', null, el('td', { text: (i + 1) + 'º' }), el('td', null, el('b', { text: ehStartup ? rotulo(x.opcao) : x.opcao }), ehStartup ? selos(x.opcao) : null), el('td', { class: 'num', text: String(x.votos) }), el('td', { class: 'num', text: Math.round(100 * x.votos / tot) + '%' })); })),
      el('p', { class: 'ajuda', text: 'Total: ' + tot + ' voto(s).' })];
  }
  function blocoResultados(r, comSem) {
    function cartao(t, c) { return el('div', { class: 'cartao' }, el('h2', { text: t }), c); }
    return [el('p', { class: 'ajuda', text: 'Nota do avaliador = 25% Pitch + 75% média dos outros 8 critérios. Nota da startup = média dos seus avaliadores. Desempate: maior Pitch, depois maior média dos 8.' }),
      ['A', 'I'].map(function (c) { return cartao('Avaliadores · ' + CAT[c], tabRanking(r.ranking[c], comSem ? r.ranking.semAvaliacao[c] : null)); }),
      cartao('Popular · Ideação', tabVotos(r.populares.pop_I, true)), cartao('Popular · Avançado', tabVotos(r.populares.pop_A, true)),
      cartao('Popular · Ideathon', tabVotos(r.populares.ideathon, false))];
  }
  function resultados() {
    api({ acao: 'resultados' }).then(function (r) { guardaNomes(r.startups); tela(el('p', { class: 'eyebrow', text: 'Pitch Day UFPR' }), el('h1', { text: 'Resultados' }), blocoResultados(r, false)); }, erroTela);
  }

  /* ---------- admin ---------- */
  var ADM = sessionStorage.getItem('pd_adm') || '';
  function adm(op, extra) { var q = { acao: 'admin', token: ADM, op: op }; for (var k in extra) q[k] = extra[k]; return api(q); }
  function sairADM() { if (ADM) api({ acao: 'sair', token: ADM }).catch(function () {}); ADM = ''; sessionStorage.removeItem('pd_adm'); }
  function admin() {
    if (!ADM) return loginAdmin();
    adm('painel').then(painel, function (e) { sairADM(); loginAdmin(e.message); });
  }
  function loginAdmin(erro) {
    var u = el('input', { id: 'u', autocomplete: 'username', required: true, maxlength: '100', autocapitalize: 'none' });
    var s = el('input', { id: 's', type: 'password', autocomplete: 'current-password', required: true, maxlength: '200' });
    var m = el('div');
    tela(el('p', { class: 'eyebrow', text: 'Administração' }), el('h1', { text: 'Entrar' }), erro ? msg('erro', erro) : null, m,
      el('form', { class: 'cartao', onsubmit: function (ev) {
        ev.preventDefault();
        api({ acao: 'login_admin', usuario: u.value, senha: s.value }).then(function (j) { ADM = j.token; sessionStorage.setItem('pd_adm', ADM); s.value = ''; admin(); },
          function (err) { mostraMsg(m, 'erro', err.message); });
      } }, el('label', { for: 'u', text: 'Usuário' }), u, el('label', { for: 's', text: 'Senha' }), s, el('button', { class: 'btn btn-pri' }, 'Entrar')));
  }
  function painel(p) {
    var e = p.estado, base = location.href.split('#')[0], m = el('div');
    NOMES = {}; e.startups.forEach(function (s) { if (s.nome) NOMES[s.codigo] = s.nome; });
    function feito(pr) { pr.then(function () { admin(); }, function (err) { mostraMsg(m, 'erro', err.message); window.scrollTo(0, 0); }); }
    var nomesV = { aval: 'Avaliação dos avaliadores', pop_I: 'Popular · Ideação', pop_A: 'Popular · Avançado', ideathon: 'Popular · Ideathon (domingo)' };
    var controles = Object.keys(nomesV).map(function (k) {
      var ab = e.estados[k] === 'aberta';
      return el('div', { class: 'criterio' }, el('h3', null, nomesV[k] + ' ', selo(e.estados[k])),
        el('button', { class: 'btn ' + (ab ? 'btn-perigo' : 'btn-pri'), onclick: function () { feito(adm('estado', { votacao: k, valor: ab ? 'fechada' : 'aberta' })); } }, ab ? 'Fechar' : 'Abrir'));
    });
    // edição de startups
    var linhas = [], pend = e.startups.filter(function (s) { return s.ativo && !String(s.nome).trim(); }).length;
    var tab = el('div', { class: 'lista-st' }, e.startups.map(function (s) {
      var nome = el('input', { value: s.nome || '', maxlength: '80', 'aria-label': 'Nome de ' + s.codigo, placeholder: 'Nome da startup' });
      function tg(rot, val) { var i = el('input', { type: 'checkbox', class: 'tg-in' }); i.checked = !!val; return { i: i, l: el('label', { class: 'toggle' }, i, el('span', { class: 'tg-ui', 'aria-hidden': 'true' }), el('span', { text: rot })) }; }
      var at = tg('Ativa', s.ativo), fe = tg('Startup feminina', s.feminina), em = tg('Ensino médio', s.ensino_medio);
      var tag = !String(s.nome).trim() ? el('span', { class: 'chip', text: 'pendente de nome' }) : null;
      linhas.push(function () { return { codigo: s.codigo, ativo: at.i.checked, nome: nome.value, feminina: fe.i.checked, ensino_medio: em.i.checked }; });
      return el('div', { class: 'st-linha' + (tag ? ' pendente' : '') }, el('b', { class: 'st-cod', text: s.codigo }), nome,
        el('div', { class: 'toggles' }, at.l, fe.l, em.l), tag);
    }));
    var novo = el('input', { placeholder: 'Novo código (ex.: A16 ou I40)', maxlength: '4', autocapitalize: 'characters', 'aria-label': 'Novo código' });
    var novoNome = el('input', { placeholder: 'Nome (opcional)', maxlength: '80', 'aria-label': 'Nome do novo código' });
    var ide = el('textarea', { id: 'ide' }); ide.value = e.ideathon_opcoes.join('\n');
    var autCpf = el('input', { id: 'aut-cpf', class: 'campo-grande', inputmode: 'numeric', autocomplete: 'off', maxlength: '14', placeholder: '000.000.000-00', required: true });
    var autNome = el('input', { id: 'aut-nome', maxlength: '60', autocomplete: 'off' }), autMsg = el('div');
    mascaraDigitacao(autCpf);
    var monBox = el('div');
    function desenhaMonitor(lista, completo) {
      while (monBox.firstChild) monBox.removeChild(monBox.firstChild);
      add(monBox, [el('button', { class: 'btn btn-sec no-print', onclick: function () {
          if (completo) return desenhaMonitor(p.monitor, false);
          adm('cpfs').then(function (j) { desenhaMonitor(j.monitor, true); }, function (err) { mostraMsg(m, 'erro', err.message); });
        } }, completo ? 'Ocultar CPFs' : 'Mostrar CPFs completos'),
        lista.length ? el('table', { class: 'monitor' }, el('tr', null, el('th', { text: 'CPF' }), el('th', { class: 'num', text: 'Qtd' }), el('th', { text: 'Startups (horário)' })),
          lista.map(function (a) {
            return el('tr', null, el('td', null, el('span', { class: 'cpf', text: a.cpf }), a.nome ? el('br') : null, a.nome ? el('span', { class: 'ajuda', text: a.nome }) : null),
              el('td', { class: 'num', text: String(a.total) }),
              el('td', null, el('div', { class: 'chips' }, a.itens.map(function (i) { return el('span', { class: 'chip ok', text: i.codigo + ' · ' + i.hora }); }))));
          })) : el('p', { class: 'ajuda', text: 'Nenhuma avaliação ainda.' })]);
    }
    desenhaMonitor(p.monitor, false);
    tela(navAdmin('painel'), el('h1', { text: 'Painel' }), m,
      el('div', { class: 'cartao' }, el('h2', { text: 'Votações' }), controles,
        el('div', { class: 'criterio' }, el('h3', null, 'Resultados públicos ', selo(e.resultados_liberados ? 'aberta' : 'fechada')),
          el('button', { class: 'btn btn-sec', onclick: function () { feito(adm('liberar', { valor: !e.resultados_liberados })); } }, e.resultados_liberados ? 'Ocultar resultados' : 'Liberar resultados')),
        el('div', { class: 'criterio' }, el('h3', { text: 'Comentário opcional dos avaliadores: ' + (e.comentario_ativo ? 'ativo' : 'desativado') }),
          el('button', { class: 'btn btn-sec', onclick: function () { feito(adm('comentario', { valor: !e.comentario_ativo })); } }, e.comentario_ativo ? 'Desativar' : 'Ativar')),
        el('div', { class: 'criterio' }, el('h3', { text: 'Mostrar selos (Feminina / Ensino médio) ao público: ' + (e.selos_publicos ? 'sim' : 'não') }),
          el('button', { class: 'btn btn-sec', onclick: function () { feito(adm('selos_publicos', { valor: !e.selos_publicos })); } }, e.selos_publicos ? 'Ocultar selos do público' : 'Mostrar selos ao público'))),
      el('div', { class: 'cartao' }, el('h2', { text: 'Startups (código → nome)' }),
        el('p', { class: 'ajuda', text: 'Toda startup ATIVA aparece e pode ser votada/avaliada. Com nome, exibe "CÓDIGO · Nome"; sem nome, só o código. Ativas pendentes de nome (lembrete): ' + pend + '.' }),
        tab, el('button', { class: 'btn btn-pri', onclick: function () { feito(adm('startups', { lista: linhas.map(function (f) { return f(); }) })); } }, 'Salvar nomes, ativação e selos'),
        el('h3', { text: 'Adicionar código' }), novo, novoNome,
        el('button', { class: 'btn btn-sec', onclick: function () { feito(adm('startups', { lista: [{ codigo: novo.value.trim().toUpperCase(), ativo: true, nome: novoNome.value }] })); } }, 'Adicionar')),
      el('div', { class: 'cartao' }, el('h2', { text: 'Ainda sem avaliação' }), ['A', 'I'].map(function (c) {
        var s = p.resultado.ranking.semAvaliacao[c];
        return [el('h3', { text: CAT[c] + ' (' + s.length + ')' }), el('div', { class: 'chips' }, s.length ? s.map(function (x) { return el('span', { class: 'chip', text: rotulo(x) }); }) : el('span', { class: 'ajuda', text: 'todas avaliadas' }))];
      })),
      el('div', { class: 'cartao' }, el('h2', { text: 'Monitoramento dos avaliadores (por CPF)' }),
        el('p', { class: 'ajuda', text: 'CPF mascarado por padrão. Dado pessoal: não fotografe nem compartilhe esta tela.' }), monBox,
        null),
      el('div', { class: 'cartao', id: 'autorizados' }, el('h2', { text: 'CPFs autorizados a avaliar' }),
        el('p', { class: 'msg ' + (e.restricao_ativa ? 'msg-ok' : 'msg-aviso'), text: e.restricao_ativa
          ? 'Restrição ATIVA: só os ' + e.autorizados.length + ' CPF(s) abaixo podem avaliar.'
          : 'Restrição INATIVA: lista vazia, qualquer CPF válido pode avaliar.' }),
        el('form', { onsubmit: function (ev) {
          ev.preventDefault();
          if (!cpfValido(autCpf.value)) { mostraMsg(autMsg, 'erro', 'CPF inválido. Confira os números.'); autCpf.focus(); return; }
          adm('aut_add', { cpf: autCpf.value, nome: autNome.value }).then(function () { admin(); setTimeout(function () { var x = document.getElementById('aut-cpf'); if (x) { x.scrollIntoView(); x.focus(); } }, 400); },
            function (err) { mostraMsg(autMsg, 'erro', err.message); });
        } }, el('label', { for: 'aut-cpf', text: 'CPF do avaliador' }), autCpf, el('label', { for: 'aut-nome', text: 'Nome (opcional)' }), autNome, autMsg,
          el('button', { class: 'btn btn-pri' }, 'Autorizar CPF')),
        e.autorizados.length ? el('ul', { class: 'aut-lista' }, e.autorizados.map(function (x) {
          return el('li', null, el('span', null, el('span', { class: 'cpf', text: x.cpf }), x.nome ? ' · ' + x.nome : ''),
            el('button', { class: 'btn btn-perigo btn-mini', 'aria-label': 'Remover ' + x.cpf, onclick: function () {
              if (window.confirm('Remover ' + x.cpf + (x.nome ? ' (' + x.nome + ')' : '') + ' da lista?')) feito(adm('aut_remover', { ref: x.ref }));
            } }, 'Remover'));
        })) : null),
      el('div', { class: 'cartao' }, el('h2', { text: 'Opções do Ideathon (domingo)' }), el('label', { for: 'ide', text: 'Uma opção por linha (até 10)' }), ide,
        el('button', { class: 'btn btn-pri', onclick: function () { feito(adm('ideathon', { opcoes: ide.value.split('\n') })); } }, 'Salvar opções')),
      el('h2', { text: 'Parcial (só admin)' }), blocoResultados(p.resultado, true),
      el('div', { class: 'cartao qr-cartao' }, el('h2', { text: 'QR codes' }),
        el('p', { class: 'ajuda no-print', text: 'Cada QR abre direto a votação. O painel admin não tem QR code.' }),
        el('button', { class: 'btn btn-pri no-print', onclick: function () { document.body.classList.add('imprimir-qr'); window.print(); } }, 'Imprimir os 4 QR codes (1 por página A4)'),
        QRS.map(function (q) { return folhaQR(q, base + q.rota); })),
      el('div', { class: 'cartao no-print' }, el('h2', { text: 'Limpar dados de teste' }), el('p', { class: 'ajuda', text: 'Apaga permanentemente as linhas da planilha. Votos populares: ' + p.total_votos + '.' }),
        [['votos', 'Apagar votos populares'], ['avaliacoes', 'Apagar avaliações'], ['tudo', 'Apagar tudo']].map(function (x) {
          return el('button', { class: 'btn btn-perigo', onclick: function () {
            if (window.prompt('Isto apaga "' + x[0] + '" de forma PERMANENTE. Digite APAGAR para confirmar:') === 'APAGAR') feito(adm('limpar', { alvo: x[0], confirmacao: 'APAGAR' }));
          } }, x[1]);
        })),
      el('button', { class: 'btn btn-sec no-print', onclick: admin }, 'Atualizar'),
      el('button', { class: 'btn btn-sec no-print', onclick: function () { sairADM(); location.hash = '#/'; } }, 'Sair'));
  }

  /* ---------- navegação admin ---------- */
  function navAdmin(atual) {
    return el('nav', { class: 'abas no-print', 'aria-label': 'Admin' },
      el('a', { href: '#/' + ROTA_ADMIN, class: 'aba' + (atual === 'painel' ? ' ativa' : ''), 'aria-current': atual === 'painel' ? 'page' : null }, 'Painel'),
      el('a', { href: '#/' + ROTA_ADMIN + '/trabalhos', class: 'aba' + (atual === 'trab' ? ' ativa' : ''), 'aria-current': atual === 'trab' ? 'page' : null }, 'Trabalhos'));
  }

  /* ---------- dashboard Trabalhos (só admin) ---------- */
  var DASH = { filtro: { cat: '', fem: false, em: false, aval: '', busca: '' }, ordem: { col: 'posicao', asc: true }, tags: { feminina: false, ensino_medio: false, modo: 'E' }, timer: null, auto: false };
  function pararAuto() { if (DASH.timer) { clearInterval(DASH.timer); DASH.timer = null; } }
  function trabalhos() {
    if (!ADM) return loginAdmin();
    adm('dashboard').then(dashboard, function (e) { if (/Sessão/.test(e.message)) { pararAuto(); sairADM(); return loginAdmin(e.message); } erroTela(e); });
  }
  var COLS = [['codigo', 'Código'], ['nome', 'Nome'], ['categoria', 'Cat.'], ['selos', 'Selos'], ['ativo', 'Ativo'], ['avaliadores', 'Aval.'],
    ['nota', 'Nota'], ['mediaPitch', 'Pitch'], ['posicao', 'Pos.'], ['votos_populares', 'Votos pop.']];
  function dashboard(d) {
    var R = d.resumo, F = DASH.filtro, corpo = el('tbody'), info = el('p', { class: 'ajuda' }), tagBox = el('div');
    function card(t, v, sub) { return el('div', { class: 'card' }, el('p', { class: 'card-t', text: t }), el('p', { class: 'card-v', text: String(v) }), sub ? el('p', { class: 'card-s', text: sub }) : null); }
    function ac(o) { return o.A + o.I; } function ai(o) { return 'A ' + o.A + ' · I ' + o.I; }
    function seloTxt(t) { return (t.feminina ? 'Feminina ' : '') + (t.ensino_medio ? 'Ensino médio' : ''); }
    function filtrados() {
      var b = F.busca.trim().toLowerCase();
      return d.trabalhos.filter(function (t) {
        return (!F.cat || t.categoria === F.cat) && (!F.fem || t.feminina) && (!F.em || t.ensino_medio) &&
          (!F.aval || (F.aval === 'sim' ? t.avaliadores > 0 : t.avaliadores === 0)) &&
          (!b || t.codigo.toLowerCase().indexOf(b) >= 0 || t.nome.toLowerCase().indexOf(b) >= 0);
      }).sort(function (x, y) {
        var c = DASH.ordem.col, vx = c === 'selos' ? seloTxt(x) : x[c], vy = c === 'selos' ? seloTxt(y) : y[c];
        if (vx == null && vy == null) return x.codigo < y.codigo ? -1 : 1; if (vx == null) return 1; if (vy == null) return -1;
        var r = typeof vx === 'string' ? vx.localeCompare(vy, 'pt-BR') : (vx === vy ? 0 : vx < vy ? -1 : 1);
        if (r === 0) r = x.codigo < y.codigo ? -1 : 1;
        return DASH.ordem.asc ? r : -r;
      });
    }
    function celula(t, c) {
      if (c === 'nome') return el('td', { text: t.nome || '—' });
      if (c === 'selos') return el('td', null, t.feminina ? el('span', { class: 'tag-selo tag-f', text: 'Feminina' }) : null, t.ensino_medio ? el('span', { class: 'tag-selo tag-em', text: 'EM' }) : null);
      if (c === 'ativo') return el('td', { text: t.ativo ? 'sim' : 'não' });
      if (c === 'nota' || c === 'mediaPitch') return el('td', { class: 'num', text: t[c] == null ? '—' : fmt(t[c]) });
      if (c === 'posicao') return el('td', { class: 'num', text: t.posicao == null ? '—' : t.posicao + 'º' });
      if (c === 'codigo') return el('td', null, el('b', { text: t.codigo }));
      return el('td', { class: typeof t[c] === 'number' ? 'num' : null, text: String(t[c]) });
    }
    function desenhaTabela() {
      while (corpo.firstChild) corpo.removeChild(corpo.firstChild);
      var l = filtrados(); info.textContent = l.length + ' de ' + d.trabalhos.length + ' trabalhos';
      l.forEach(function (t) { corpo.appendChild(el('tr', { class: t.ativo ? null : 'inativa' }, COLS.map(function (c) { return celula(t, c[0]); }))); });
    }
    var cab = el('tr', null, COLS.map(function (c) {
      var th = el('th', { scope: 'col' });
      if (DASH.ordem.col === c[0]) th.setAttribute('aria-sort', DASH.ordem.asc ? 'ascending' : 'descending');
      add(th, el('button', { class: 'ord', onclick: function () {
        DASH.ordem = { col: c[0], asc: DASH.ordem.col === c[0] ? !DASH.ordem.asc : true };
        cab.querySelectorAll('th').forEach(function (x) { x.removeAttribute('aria-sort'); });
        th.setAttribute('aria-sort', DASH.ordem.asc ? 'ascending' : 'descending'); desenhaTabela();
      } }, c[1]));
      return th;
    }));
    function sel(rot, chave, ops) {
      var s = el('select', { 'aria-label': rot, onchange: function () { F[chave] = s.value; desenhaTabela(); } }, ops.map(function (o) { return el('option', { value: o[0], text: o[1] }); }));
      s.value = F[chave]; return el('label', { class: 'filtro' }, rot, s);
    }
    function chk(rot, chave) { var i = el('input', { type: 'checkbox', onchange: function () { F[chave] = i.checked; desenhaTabela(); } }); i.checked = F[chave]; return el('label', { class: 'filtro chk' }, i, ' ' + rot); }
    var busca = el('input', { type: 'search', placeholder: 'Buscar código ou nome', 'aria-label': 'Buscar', maxlength: '80', oninput: function () { F.busca = busca.value; desenhaTabela(); } }); busca.value = F.busca;

    // seletor de TAGs (chips) + ranking por tag, separado por categoria
    function desenhaTags() {
      while (tagBox.firstChild) tagBox.removeChild(tagBox.firstChild);
      var T = DASH.tags, sel2 = ['feminina', 'ensino_medio'].filter(function (k) { return T[k]; });
      function chip(k, rot) { return el('button', { class: 'chip-tag' + (T[k] ? ' on' : ''), 'aria-pressed': T[k] ? 'true' : 'false', onclick: function () { T[k] = !T[k]; desenhaTags(); } }, rot); }
      add(tagBox, el('div', { class: 'chips-tag' }, chip('feminina', 'Startup feminina'), chip('ensino_medio', 'Ensino médio')));
      if (sel2.length === 2) add(tagBox, el('div', { class: 'modo', role: 'radiogroup', 'aria-label': 'Combinação' },
        [['E', 'Tem as duas'], ['OU', 'Tem qualquer uma']].map(function (m) {
          return el('button', { class: 'chip-tag mini' + (T.modo === m[0] ? ' on' : ''), role: 'radio', 'aria-checked': T.modo === m[0] ? 'true' : 'false', onclick: function () { T.modo = m[0]; desenhaTags(); } }, m[1]);
        })));
      if (!sel2.length) return add(tagBox, el('p', { class: 'ajuda', text: 'Selecione uma ou mais tags para ver o ranking das mais bem classificadas.' }));
      var alvo = el('div', null, el('p', { class: 'ajuda', text: 'Carregando ranking…' })); add(tagBox, alvo);
      adm('ranking_tags', { tags: sel2, modo: sel2.length === 2 ? T.modo : 'E' }).then(function (r) {
        while (alvo.firstChild) alvo.removeChild(alvo.firstChild);
        ['I', 'A'].forEach(function (c) {
          add(alvo, [el('h3', { text: CAT[c] + ' (' + r[c].length + ' avaliada(s) de ' + r.total[c] + ' com a tag)' }),
            r[c].length ? el('div', { class: 'tab-scroll' }, el('table', null, el('tr', null, ['Pos.', 'Código', 'Nome', 'Nota', 'Aval.', 'Pitch'].map(function (h) { return el('th', { text: h }); })),
              r[c].map(function (x) { return el('tr', { class: x.posicao <= 3 ? 'podio' : null }, el('td', { text: x.posicao + 'º' }), el('td', null, el('b', { text: x.codigo })), el('td', { text: x.nome || '—' }),
                el('td', { class: 'num', text: fmt(x.nota) }), el('td', { class: 'num', text: String(x.avaliadores) }), el('td', { class: 'num', text: fmt(x.mediaPitch) })); })))
            : el('p', { class: 'ajuda', text: 'Nenhuma avaliada com essa(s) tag(s).' })]);
        });
      }, function (err) { while (alvo.firstChild) alvo.removeChild(alvo.firstChild); add(alvo, msg('erro', err.message)); });
    }

    function csv() {
      function q(v) { v = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; }
      var linhas = [['codigo', 'nome', 'categoria', 'feminina', 'ensino_medio', 'ativo', 'avaliadores', 'nota_final', 'nota_pitch', 'posicao_categoria', 'votos_populares'].join(';')];
      filtrados().forEach(function (t) { linhas.push([t.codigo, t.nome, t.categoria, t.feminina ? 'sim' : 'nao', t.ensino_medio ? 'sim' : 'nao', t.ativo ? 'sim' : 'nao', t.avaliadores,
        t.nota == null ? '' : fmt(t.nota), t.mediaPitch == null ? '' : fmt(t.mediaPitch), t.posicao == null ? '' : t.posicao, t.votos_populares].map(q).join(';')); });
      var a = el('a', { href: URL.createObjectURL(new Blob(['\ufeff' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' })), download: 'pitchday-trabalhos.csv' });
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }
    var auto = el('input', { type: 'checkbox', onchange: function () { DASH.auto = auto.checked; pararAuto(); if (DASH.auto) DASH.timer = setInterval(trabalhos, 30000); } }); auto.checked = DASH.auto;

    tela(navAdmin('trab'), el('h1', { text: 'Trabalhos' }),
      el('div', { class: 'acoes no-print' }, el('button', { class: 'btn btn-pri', onclick: trabalhos }, 'Atualizar'),
        el('label', { class: 'filtro chk' }, auto, ' Atualizar sozinho a cada 30 s'),
        el('button', { class: 'btn btn-sec', onclick: csv }, 'Exportar CSV (filtro atual)')),
      el('div', { class: 'cards' },
        card('Startups ativas', ac(R.ativas), ai(R.ativas)), card('Avaliadas', ac(R.avaliadas), ai(R.avaliadas)),
        card('Não avaliadas', ac(R.nao_avaliadas), ai(R.nao_avaliadas)), card('Avaliações', R.avaliacoes),
        card('Avaliadores distintos', R.avaliadores_distintos), card('Votos populares', R.votos.pop_I + R.votos.pop_A + R.votos.ideathon, 'Ideação ' + R.votos.pop_I + ' · Avançado ' + R.votos.pop_A + ' · Ideathon ' + R.votos.ideathon),
        card('Startups femininas', ac(R.femininas), ai(R.femininas)), card('Ensino médio', ac(R.ensino_medio), ai(R.ensino_medio))),
      el('div', { class: 'cartao destaque-tags' }, el('h2', { text: 'Ranking por tag (premiações especiais)' }), tagBox),
      el('div', { class: 'cartao' }, el('h2', { text: 'Todos os trabalhos' }),
        el('div', { class: 'filtros' }, busca, sel('Categoria', 'cat', [['', 'Todas'], ['I', 'Ideação'], ['A', 'Avançado']]),
          sel('Avaliação', 'aval', [['', 'Todas'], ['sim', 'Avaliadas'], ['nao', 'Não avaliadas']]), chk('Feminina', 'fem'), chk('Ensino médio', 'em')),
        info, el('div', { class: 'tab-scroll' }, el('table', { class: 'tab-trab' }, el('thead', null, cab), corpo)),
        el('p', { class: 'ajuda', text: 'Toque no título da coluna para ordenar. Pos. = posição no ranking da categoria (avaliadores).' })),
      el('button', { class: 'btn btn-sec no-print', onclick: function () { pararAuto(); sairADM(); location.hash = '#/'; } }, 'Sair'));
    desenhaTabela(); desenhaTags();
  }

  /* ---------- QR codes (exatamente 4, numerados) ---------- */
  var QRS = [{ n: 1, titulo: 'Avaliadores', rota: '#/' + ROTA_AVAL }, { n: 2, titulo: 'Voto popular · Ideathon', rota: '#/ideathon' },
    { n: 3, titulo: 'Voto popular · Startups Avançadas', rota: '#/popular/A' }, { n: 4, titulo: 'Voto popular · Startups Ideação', rota: '#/popular/I' }];
  function matrizQR(url) { var q = qrcode(0, 'M'); q.addData(url); q.make(); return q; }
  function pngQR(q, url) { // QR + título + URL num PNG (canvas; sem rede)
    var qr = matrizQR(url), m = qr.getModuleCount(), cel = Math.floor(800 / (m + 8)), lado = cel * (m + 8);
    var c = document.createElement('canvas'); c.width = 1000; c.height = lado + 360;
    var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#07162f'; g.textAlign = 'center'; g.font = 'bold 64px Sora, sans-serif'; g.fillText('QR ' + q.n, 500, 90);
    g.font = 'bold 44px Sora, sans-serif'; g.fillText(q.titulo, 500, 160);
    var x0 = (1000 - lado) / 2 + cel * 4, y0 = 200 + cel * 4;
    for (var r = 0; r < m; r++) for (var k = 0; k < m; k++) if (qr.isDark(r, k)) g.fillRect(x0 + k * cel, y0 + r * cel, cel, cel);
    g.font = '24px monospace'; g.fillText(url, 500, lado + 280, 960);
    return c.toDataURL('image/png');
  }
  function folhaQR(q, url) {
    var img = el('img', { alt: 'QR code ' + q.n + ': ' + q.titulo });
    var baixar = el('a', { class: 'btn btn-sec no-print', download: 'QR' + q.n + '-' + q.rota.replace(/[^a-z]/gi, '') + '.png', href: '#' }, 'Baixar PNG');
    if (window.qrcode) { img.src = matrizQR(url).createDataURL(10, 4); baixar.addEventListener('click', function () { baixar.href = pngQR(q, url); }); }
    return el('section', { class: 'qr-folha' }, el('p', { class: 'qr-num', text: 'QR ' + q.n }), el('h3', { class: 'qr-titulo', text: q.titulo }),
      el('div', { class: 'qr' }, img), el('p', { class: 'qr-url', text: url }), baixar);
  }
  window.addEventListener('afterprint', function () { document.body.classList.remove('imprimir-qr'); });

  /* ---------- roteador ---------- */
  function rota() {
    tela(el('p', { class: 'carregando', text: 'Carregando…' }));
    var r = location.hash.replace(/^#\/?/, '');
    if (ROTA_AVAL && r === ROTA_AVAL) return avaliadores();
    if (r === 'popular/I' || r === 'popular/A') {
      var c = r.slice(-1);
      return popular('pop_' + c, 'Melhor startup · ' + CAT[c], function (e) {
        return e.startups.filter(function (s) { return s.categoria === c; }).map(function (s) { return { valor: s.codigo, rotulo: rotulo(s.codigo) }; });
      });
    }
    if (r === 'ideathon') return popular('ideathon', 'Melhor apresentação · Ideathon', function (e) { return e.ideathon_opcoes.map(function (o) { return { valor: o, rotulo: o }; }); }, true);
    if (r === 'resultados') return resultados();
    if (ROTA_ADMIN && r === ROTA_ADMIN + '/trabalhos') return trabalhos();
    pararAuto();
    if (ROTA_ADMIN && r === ROTA_ADMIN) return admin();
    inicio();
  }
  window.addEventListener('hashchange', rota);
  rota();
})();
