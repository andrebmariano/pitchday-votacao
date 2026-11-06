/**
 * Code.gs — API do Pitch Day UFPR (Google Apps Script, app da Web).
 * Credenciais SÓ em Script Properties (Configurações do projeto > Propriedades do script):
 *   ADMIN_USUARIO, ADMIN_SENHA  — perfil administrador
 * Avaliadores entram só com CPF válido (rota não divulgada). Lista branca (aba 'avaliadores_autorizados'):
 *   vazia = qualquer CPF válido avalia; com 1+ CPF = só os autorizados.
 * CPF: só na aba privada 'avaliacoes'; nunca em resposta pública nem em log.
 * Nunca coloque credenciais no repositório.
 *
 * Nomes das startups não são segredo e são opcionais. Visível/votável = ativa;
 * o público recebe código(+nome) só das ativas e o servidor rejeita código inexistente ou inativo.
 * Superfície pública (sem login): estado, votar, resultados (só se liberados), login_admin, login_avaliador.
 * Autenticado por token de sessão (CacheService, 8h): avaliar (avaliador), admin (administrador).
 */
var VOTACOES_POP = ['pop_I', 'pop_A', 'ideathon'];
var VOTACOES = ['aval'].concat(VOTACOES_POP);
var CONFIG_PADRAO = { estado_aval: 'fechada', estado_pop_I: 'fechada', estado_pop_A: 'fechada',
  estado_ideathon: 'fechada', resultados_liberados: 'nao', comentario_ativo: 'sim',
  ideathon_opcoes: 'Equipe 1|Equipe 2|Equipe 3', selos_publicos: 'nao' };
var COLS_STARTUPS = ['codigo', 'categoria', 'ativo', 'nome', 'feminina', 'ensino_medio'];
var A_CODIGOS = ['A01','A02','A03','A04','A05','A06','A07','A09','A11','A12','A13','A14','A15'];
var SESSAO_SEG = 8 * 3600;          // validade do token
var RL_MAX = 5, RL_MAX_AVAL = 20, RL_JANELA = 600; // admin: 5 falhas em 10 min -> bloqueio 10 min; avaliadores (chave compartilhada): 20
var NOME_MAX = 80, OPCAO_MAX = 60, CODIGO_RE = /^[AI][0-9]{2,3}$/;
var ERRO_GENERICO = 'Não foi possível concluir. Tente de novo.';

/** Erro "esperado": mensagem pode ir ao cliente. Qualquer outro vira ERRO_GENERICO. */
function Falha(msg) { this.message = msg; this.publica = true; }

/** Migração idempotente: completa cabeçalho e preenche FALSE nas colunas novas, sem tocar nos dados existentes. */
function migrarStartups_(st) {
  var d = st.getDataRange().getValues(), cab = d[0] || [];
  for (var j = 0; j < COLS_STARTUPS.length; j++) if (cab[j] !== COLS_STARTUPS[j]) {
    if (cab[j] && String(cab[j]).trim() !== '') throw new Error('Aba startups: coluna ' + (j + 1) + ' deveria ser "' + COLS_STARTUPS[j] + '".');
    st.getRange(1, j + 1).setValue(COLS_STARTUPS[j]);
  }
  for (var i = 1; i < d.length; i++) for (var k = 4; k < 6; k++)
    if (d[i][k] === '' || d[i][k] == null) st.getRange(i + 1, k + 1).setValue(false);
}

/** Rode UMA vez pelo editor (pode rodar de novo: migra sem perder dados): cria as abas e a lista de startups. */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  function aba(nome, cab) {
    var sh = ss.getSheetByName(nome) || ss.insertSheet(nome);
    if (sh.getLastRow() === 0) sh.appendRow(cab);
    return sh;
  }
  var st = aba('startups', COLS_STARTUPS);
  migrarStartups_(st);
  if (st.getLastRow() === 1) {
    var rows = A_CODIGOS.map(function (c) { return [c, 'A', true, '', false, false]; });
    for (var i = 1; i <= 39; i++) rows.push(['I' + (i < 10 ? '0' : '') + i, 'I', true, '', false, false]);
    st.getRange(2, 1, rows.length, COLS_STARTUPS.length).setValues(rows);
  }
  var cf = aba('config', ['chave', 'valor']);
  var atual = lerConfig_();
  Object.keys(CONFIG_PADRAO).forEach(function (k) { if (!(k in atual)) cf.appendRow([k, CONFIG_PADRAO[k]]); });
  aba('avaliacoes', ['data_hora', 'cpf', 'nome', 'codigo', 'c1','c2','c3','c4','c5','c6','c7','c8', 'pitch', 'nota_avaliador', 'comentario']);
  aba('votos', ['data_hora', 'votacao', 'opcao', 'dispositivo']);
  aba('avaliadores_autorizados', ['cpf', 'observacao']);
}

function doGet() { return json_({ ok: true }); }

function doPost(e) {
  var req;
  try {
    var corpo = e && e.postData && e.postData.contents;
    if (typeof corpo !== 'string' || corpo.length > 8000) throw new Falha('Requisição inválida.');
    req = JSON.parse(corpo);
    if (!req || typeof req !== 'object' || Array.isArray(req)) throw new Falha('Requisição inválida.');
  } catch (x) { return json_({ ok: false, erro: 'Requisição inválida.' }); }
  try { return json_(rotear_(req)); }
  catch (x) { return json_({ ok: false, erro: x && x.publica ? x.message : ERRO_GENERICO }); }
}

function rotear_(q) {
  switch (q.acao) {
    case 'estado': return estadoPublico_();
    case 'votar': return comLock_(function () { return votar_(q); });
    case 'resultados': return resultadosPublicos_();
    case 'login_avaliador': return loginAvaliador_(q);
    case 'avaliar': var s = sessao_(q.token, 'avaliador'); return comLock_(function () { return avaliar_(s, q); });
    case 'login_admin': return loginAdmin_(q);
    case 'admin': sessao_(q.token, 'admin'); return admin_(q);
    case 'sair': if (typeof q.token === 'string' && q.token.length <= 80) CacheService.getScriptCache().remove('sess_' + q.token); return { ok: true };
  }
  throw new Falha('Requisição inválida.');
}

/* ---------- utilidades ---------- */
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function sh_(n) { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(n); }
function linhas_(n) { var v = sh_(n).getDataRange().getValues(); v.shift(); return v; }
function comLock_(fn) {
  var l = LockService.getScriptLock();
  if (!l.tryLock(20000)) throw new Falha('Servidor ocupado. Tente de novo em instantes.');
  try { return fn(); } finally { l.releaseLock(); }
}
/** Evita injeção de fórmula: strings iniciadas por = + - @ (ou tab/CR) viram texto. */
function seguro_(s) { s = String(s); return /^[=+\-@\t\r]/.test(s) ? "'" + s : s; }
/** Texto livre: remove caracteres de controle, apara e limita. */
function limpaTexto_(s, max) {
  if (typeof s !== 'string') return '';
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}
function strCurta_(s, max) { return typeof s === 'string' && s.length > 0 && s.length <= max; }
function lerConfig_() { var c = {}; linhas_('config').forEach(function (r) { c[r[0]] = String(r[1]); }); return c; }
function gravarConfig_(k, v) {
  var sh = sh_('config'), d = sh.getDataRange().getValues();
  for (var i = 1; i < d.length; i++) if (d[i][0] === k) { sh.getRange(i + 1, 2).setValue(seguro_(v)); return; }
  sh.appendRow([k, seguro_(v)]);
}
function ativo_(v) { return v === true || /^(true|sim|1)$/i.test(String(v)); }
/** Lista completa (com nomes) — só para uso interno/admin. */
function startupsCompleto_() {
  return linhas_('startups').filter(function (r) { return r[0]; }).map(function (r) {
    return { codigo: String(r[0]).trim().toUpperCase(), categoria: String(r[1]).trim().toUpperCase(),
      ativo: ativo_(r[2]), nome: String(r[3] == null ? '' : r[3]).replace(/^'/, ''), feminina: ativo_(r[4]), ensino_medio: ativo_(r[5]) };
  });
}
/** Visível/votável = ativa (nome é opcional, só para exibição). */
function visivel_(s) { return s.ativo; }
/** Versão pública: código, categoria e nome (nome não é segredo), só visíveis. */
function startupsPublicas_() {
  var selos = lerConfig_().selos_publicos === 'sim';
  return startupsCompleto_().filter(visivel_).map(function (s) {
    var o = { codigo: s.codigo, categoria: s.categoria, nome: s.nome };
    if (selos) { o.feminina = s.feminina; o.ensino_medio = s.ensino_medio; }
    return o;
  });
}
function opcoesIdeathon_(cfg) { return String(cfg.ideathon_opcoes || '').replace(/^'/, '').split('|').map(function (s) { return s.trim(); }).filter(String); }
function igual_(a, b) { // tempo constante no tamanho da maior string
  a = String(a); b = String(b); var d = a.length ^ b.length, n = Math.max(a.length, b.length);
  for (var i = 0; i < n; i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}
function token_() { return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''); }

/* ---------- sessões e rate limit ---------- */
function bloqueado_(chave, max) {
  var c = CacheService.getScriptCache();
  return Number(c.get('rl_' + chave) || 0) >= (max || RL_MAX);
}
function registraFalha_(chave) {
  var c = CacheService.getScriptCache(), n = Number(c.get('rl_' + chave) || 0) + 1;
  c.put('rl_' + chave, String(n), RL_JANELA);
}
function criaSessao_(papel, nome, cpf) {
  var t = token_();
  CacheService.getScriptCache().put('sess_' + t, JSON.stringify({ papel: papel, nome: nome, cpf: cpf || '' }), SESSAO_SEG);
  return t;
}
function sessao_(t, papel) {
  if (typeof t !== 'string' || !/^[a-f0-9]{64}$/.test(t)) throw new Falha('Sessão expirada. Entre novamente.');
  var v = CacheService.getScriptCache().get('sess_' + t), s = v ? JSON.parse(v) : null;
  if (!s || s.papel !== papel) throw new Falha('Sessão expirada. Entre novamente.');
  return s;
}
function loginAdmin_(q) {
  // rate limit global para o admin (só existe 1 conta; não depende de IP, que o Apps Script não expõe)
  if (bloqueado_('admin')) throw new Falha('Muitas tentativas. Aguarde 10 minutos.');
  var p = PropertiesService.getScriptProperties();
  var u = p.getProperty('ADMIN_USUARIO'), s = p.getProperty('ADMIN_SENHA');
  var okU = igual_(strCurta_(q.usuario, 100) ? q.usuario : '', u || '\u0000');
  var okS = igual_(strCurta_(q.senha, 200) ? q.senha : '', s || '\u0000');
  if (!u || !s || !(okU & okS)) { registraFalha_('admin'); throw new Falha('Usuário ou senha incorretos.'); }
  return { ok: true, token: criaSessao_('admin', 'admin') };
}
function loginAvaliador_(q) {
  if (bloqueado_('aval', RL_MAX_AVAL)) throw new Falha('Muitas tentativas. Aguarde 10 minutos.');
  var cpf = normalizarCPF(q.cpf);
  if (!cpf) { registraFalha_('aval'); throw new Falha('CPF inválido.'); }
  if (!autorizado_(cpf)) { registraFalha_('aval'); throw new Falha('CPF não autorizado, procure a organização.'); }
  if (q.nome != null && typeof q.nome !== 'string') throw new Falha('Nome inválido.');
  var nome = limpaTexto_(q.nome || '', 60);
  return { ok: true, token: criaSessao_('avaliador', nome, cpf), ja: jaAvaliadas_(cpf) };
}
/** Lista branca: vazia = todos os CPFs válidos; com 1+ CPF = só os listados. */
function cpfsAutorizados_() {
  if (!sh_('avaliadores_autorizados')) return [];
  return linhas_('avaliadores_autorizados').map(function (r) { return { cpf: normalizarCPF(String(r[0]).replace(/^'/, '')), nome: String(r[1] || '').replace(/^'/, '') }; })
    .filter(function (x) { return x.cpf; });
}
function autorizado_(cpf) {
  var l = cpfsAutorizados_();
  return l.length === 0 || l.some(function (x) { return x.cpf === cpf; });
}
/** Referência opaca para remover sem expor o CPF (hash SHA-256 truncado). */
function refCPF_(cpf) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'pd-aut:' + cpf).map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('').slice(0, 24);
}
function listaAutorizados_() {
  return cpfsAutorizados_().map(function (x) { return { ref: refCPF_(x.cpf), cpf: mascararCPF(x.cpf), nome: x.nome }; });
}
function addAutorizado_(q) {
  var cpf = normalizarCPF(q.cpf); if (!cpf) throw new Falha('CPF inválido.');
  if (q.nome != null && typeof q.nome !== 'string') throw new Falha('Nome inválido.');
  if (cpfsAutorizados_().some(function (x) { return x.cpf === cpf; })) throw new Falha('Este CPF já está autorizado.');
  // CPF gravado com ' para a planilha não converter em número (perderia zeros à esquerda)
  sh_('avaliadores_autorizados').appendRow(["'" + cpf, seguro_(limpaTexto_(q.nome || '', 60))]);
  return { ok: true };
}
function removerAutorizado_(q) {
  if (typeof q.ref !== 'string' || !/^[a-f0-9]{24}$/.test(q.ref)) throw new Falha('Parâmetros inválidos.');
  var sh = sh_('avaliadores_autorizados'), d = sh.getDataRange().getValues();
  for (var i = d.length - 1; i >= 1; i--) {
    var c = normalizarCPF(String(d[i][0]).replace(/^'/, ''));
    if (c && refCPF_(c) === q.ref) { sh.deleteRows(i + 1, 1); return { ok: true }; }
  }
  throw new Falha('CPF não encontrado na lista.');
}
function jaAvaliadas_(cpf) {
  return linhas_('avaliacoes').filter(function (r) { return String(r[1]) === cpf; }).map(function (r) { return String(r[3]); });
}

/* ---------- público ---------- */
function estadoBase_(c) {
  return { estados: { aval: c.estado_aval, pop_I: c.estado_pop_I, pop_A: c.estado_pop_A, ideathon: c.estado_ideathon },
    resultados_liberados: c.resultados_liberados === 'sim', comentario_ativo: c.comentario_ativo === 'sim',
    ideathon_opcoes: opcoesIdeathon_(c), criterios: CRITERIOS, pesos: PESOS, nota_min: NOTA_MIN, nota_max: NOTA_MAX };
}
function estadoPublico_() {
  var r = estadoBase_(lerConfig_()); r.ok = true; r.startups = startupsPublicas_(); return r;
}

function avaliar_(sess, q) {
  var c = lerConfig_();
  if (c.estado_aval !== 'aberta') throw new Falha('A avaliação está fechada.');
  var cod = typeof q.codigo === 'string' ? q.codigo.toUpperCase() : '';
  if (!CODIGO_RE.test(cod) || !startupsPublicas_().some(function (s) { return s.codigo === cod; })) throw new Falha('Código de startup inválido.');
  if (!q.notas || typeof q.notas !== 'object' || Array.isArray(q.notas)) throw new Falha('Notas ausentes.');
  var notas = {}; CRITERIOS.forEach(function (k) { notas[k.id] = q.notas[k.id]; });
  var erro = validarNotas(notas); if (erro) throw new Falha(erro);
  if (q.comentario != null && typeof q.comentario !== 'string') throw new Falha('Comentário inválido.');
  if (typeof q.comentario === 'string' && q.comentario.length > COMENTARIO_MAX) throw new Falha('Comentário acima de ' + COMENTARIO_MAX + ' caracteres.');
  if (!sess.cpf) throw new Falha('Sessão expirada. Entre novamente.');
  if (jaAvaliadas_(sess.cpf).indexOf(cod) >= 0) throw new Falha('Você já avaliou ' + cod + '. O envio é definitivo.');
  var com = c.comentario_ativo === 'sim' ? limpaTexto_(q.comentario, COMENTARIO_MAX) : '';
  sh_('avaliacoes').appendRow([new Date(), sess.cpf, seguro_(sess.nome), cod, notas.c1, notas.c2, notas.c3, notas.c4, notas.c5, notas.c6,
    notas.c7, notas.c8, notas.pitch, notaAvaliador(notas), seguro_(com)]);
  return { ok: true, codigo: cod };
}

function votar_(q) {
  var c = lerConfig_(), v = q.votacao;
  if (VOTACOES_POP.indexOf(v) < 0) throw new Falha('Votação inválida.');
  if (c['estado_' + v] !== 'aberta') throw new Falha('Esta votação está fechada.');
  var disp = typeof q.dispositivo === 'string' ? q.dispositivo : '';
  if (!/^[a-f0-9]{32}$/.test(disp)) throw new Falha('Dispositivo inválido. Recarregue a página.');
  var opcao = typeof q.opcao === 'string' ? q.opcao : '';
  var validas = v === 'ideathon' ? opcoesIdeathon_(c)
    : startupsPublicas_().filter(function (s) { return s.categoria === v.slice(4); }).map(function (s) { return s.codigo; });
  if (validas.indexOf(opcao) < 0) throw new Falha('Opção inválida.');
  if (linhas_('votos').some(function (r) { return r[1] === v && r[3] === disp; })) throw new Falha('Este celular já votou nesta categoria.');
  sh_('votos').appendRow([new Date(), v, seguro_(opcao), disp]);
  return { ok: true };
}

function avaliacoesParaCalculo_() {
  return linhas_('avaliacoes').map(avaliacaoDeLinha_);
}
function avaliacaoDeLinha_(r) {
  return { codigo: String(r[3]), notas: { c1: +r[4], c2: +r[5], c3: +r[6], c4: +r[7], c5: +r[8], c6: +r[9], c7: +r[10], c8: +r[11], pitch: +r[12] } };
}
/** Resultado SÓ com códigos, contagens e médias (nenhum nome, comentário ou dispositivo). */
function dadosResultado_(soVisiveis) {
  var votos = linhas_('votos').map(function (r) { return { votacao: String(r[1]), opcao: String(r[2]).replace(/^'/, '') }; });
  var lista = startupsCompleto_();
  var rk = calcularRanking(avaliacoesParaCalculo_(), lista.map(function (s) { return { codigo: s.codigo, categoria: s.categoria, ativo: soVisiveis ? visivel_(s) : s.ativo }; }));
  if (soVisiveis) {
    var ok = {}; lista.filter(visivel_).forEach(function (s) { ok[s.codigo] = true; });
    var opIde = opcoesIdeathon_(lerConfig_());
    votos = votos.filter(function (v) { return v.votacao === 'ideathon' ? opIde.indexOf(v.opcao) >= 0 : ok[v.opcao]; });
  }
  return { ok: true, ranking: rk,
    populares: { pop_I: contarVotos(votos, 'pop_I'), pop_A: contarVotos(votos, 'pop_A'), ideathon: contarVotos(votos, 'ideathon') } };
}
function resultadosPublicos_() {
  if (lerConfig_().resultados_liberados !== 'sim') throw new Falha('Os resultados ainda não foram liberados.');
  var r = dadosResultado_(true); delete r.ranking.semAvaliacao; r.startups = startupsPublicas_(); return r;
}

/* ---------- admin (exige token de admin) ---------- */
function admin_(q) {
  switch (q.op) {
    case 'painel':
      var c = lerConfig_(), e = estadoBase_(c);
      e.startups = startupsCompleto_();
      e.selos_publicos = c.selos_publicos === 'sim';
      e.autorizados = listaAutorizados_(); e.restricao_ativa = e.autorizados.length > 0;
      return { ok: true, estado: e, resultado: dadosResultado_(false), monitor: monitor_(false), total_votos: linhas_('votos').length };
    case 'cpfs': return { ok: true, monitor: monitor_(true) }; // CPF completo só sob pedido explícito do admin
    case 'estado':
      if (VOTACOES.indexOf(q.votacao) < 0 || ['aberta', 'fechada'].indexOf(q.valor) < 0) throw new Falha('Parâmetros inválidos.');
      gravarConfig_('estado_' + q.votacao, q.valor); return { ok: true };
    case 'liberar': gravarConfig_('resultados_liberados', q.valor === true ? 'sim' : 'nao'); return { ok: true };
    case 'selos_publicos': gravarConfig_('selos_publicos', q.valor === true ? 'sim' : 'nao'); return { ok: true };
    case 'dashboard':
      var av = linhas_('avaliacoes').map(function (r) { var x = avaliacaoDeLinha_(r); x.cpf = String(r[1]); return x; });
      var vts = linhas_('votos').map(function (r) { return { votacao: String(r[1]), opcao: String(r[2]).replace(/^'/, '') }; });
      var dash = montarDashboard(av, startupsCompleto_(), vts); dash.ok = true; return dash;
    case 'ranking_tags':
      if (!Array.isArray(q.tags) || q.tags.length < 1 || q.tags.length > TAGS.length ||
        q.tags.some(function (t) { return TAGS.indexOf(t) < 0; }) || ['E', 'OU'].indexOf(q.modo) < 0) throw new Falha('Parâmetros inválidos.');
      var rt = rankingPorTags(linhas_('avaliacoes').map(avaliacaoDeLinha_), startupsCompleto_(), q.tags, q.modo); rt.ok = true; return rt;
    case 'aut_add': return comLock_(function () { return addAutorizado_(q); });
    case 'aut_remover': return comLock_(function () { return removerAutorizado_(q); });
    case 'comentario': gravarConfig_('comentario_ativo', q.valor === true ? 'sim' : 'nao'); return { ok: true };
    case 'ideathon':
      if (!Array.isArray(q.opcoes) || q.opcoes.length > 10) throw new Falha('Opções inválidas.');
      var ops = q.opcoes.map(function (s) { return limpaTexto_(s, OPCAO_MAX).replace(/\|/g, '/'); }).filter(String);
      if (ops.length < 2) throw new Falha('Informe ao menos 2 opções.');
      gravarConfig_('ideathon_opcoes', ops.join('|')); return { ok: true };
    case 'startups': return comLock_(function () { return salvarStartups_(q.lista); });
    case 'limpar':
      if (q.confirmacao !== 'APAGAR' || ['avaliacoes', 'votos', 'tudo'].indexOf(q.alvo) < 0) throw new Falha('Confirmação ausente.');
      return comLock_(function () {
        var alvo = q.alvo === 'tudo' ? ['avaliacoes', 'votos'] : [q.alvo];
        alvo.forEach(function (n) { var s = sh_(n); if (s.getLastRow() > 1) s.deleteRows(2, s.getLastRow() - 1); });
        return { ok: true };
      });
  }
  throw new Falha('Operação inválida.');
}
/** Monitoramento por CPF: quantas/quais startups e horários. CPF mascarado salvo se completo=true. */
function monitor_(completo) {
  var por = {};
  linhas_('avaliacoes').forEach(function (r) {
    var cpf = String(r[1]), p = por[cpf] || (por[cpf] = { cpf: completo ? cpf : mascararCPF(cpf), nome: '', itens: [] });
    var n = String(r[2]).replace(/^'/, ''); if (n) p.nome = n;
    var d = r[0] instanceof Date ? r[0] : new Date(r[0]);
    p.itens.push({ codigo: String(r[3]), hora: isNaN(d) ? '' : Utilities.formatDate(d, 'America/Sao_Paulo', 'dd/MM HH:mm') });
  });
  return Object.keys(por).map(function (k) { var p = por[k]; p.total = p.itens.length; return p; })
    .sort(function (a, b) { return b.total - a.total; });
}

/** lista: [{codigo, ativo, nome}] — edita existentes e adiciona novos (categoria = 1ª letra). Nunca apaga linhas. */
function salvarStartups_(lista) {
  if (!Array.isArray(lista) || lista.length === 0 || lista.length > 300) throw new Falha('Lista inválida.');
  var limpa = {}, ordem = [];
  lista.forEach(function (it) {
    if (!it || typeof it !== 'object') throw new Falha('Lista inválida.');
    var cod = typeof it.codigo === 'string' ? it.codigo.trim().toUpperCase() : '';
    if (!CODIGO_RE.test(cod)) throw new Falha('Código inválido: use A01 ou I01 (letra A ou I + 2 a 3 dígitos).');
    if (typeof it.ativo !== 'boolean') throw new Falha('Campo "ativo" inválido em ' + cod + '.');
    if (it.nome != null && typeof it.nome !== 'string') throw new Falha('Nome inválido em ' + cod + '.');
    if (it.feminina != null && typeof it.feminina !== 'boolean') throw new Falha('Selo inválido em ' + cod + '.');
    if (it.ensino_medio != null && typeof it.ensino_medio !== 'boolean') throw new Falha('Selo inválido em ' + cod + '.');
    if (!(cod in limpa)) ordem.push(cod);
    limpa[cod] = { ativo: it.ativo, nome: limpaTexto_(it.nome || '', NOME_MAX), feminina: it.feminina, ensino_medio: it.ensino_medio };
  });
  var sh = sh_('startups'); migrarStartups_(sh);
  var d = sh.getDataRange().getValues(), vistos = {};
  for (var i = 1; i < d.length; i++) {
    var cod = String(d[i][0]).trim().toUpperCase(), l = limpa[cod]; vistos[cod] = true;
    if (l) sh.getRange(i + 1, 3, 1, 4).setValues([[l.ativo, seguro_(l.nome),
      l.feminina == null ? ativo_(d[i][4]) : l.feminina, l.ensino_medio == null ? ativo_(d[i][5]) : l.ensino_medio]]);
  }
  ordem.forEach(function (cod) { var l = limpa[cod]; if (!vistos[cod]) sh.appendRow([cod, cod[0], l.ativo, seguro_(l.nome), !!l.feminina, !!l.ensino_medio]); });
  return { ok: true };
}
