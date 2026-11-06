// node tests/api.test.js — testa Code.gs com mocks em memória de Sheet/Cache/Properties (sem dependências).
// Credenciais aqui são FICTÍCIAS de teste.
const fs = require('fs'), vm = require('vm'), assert = require('assert'), crypto = require('crypto');

function novoAmbiente() {
  const abas = {};
  function aba(nome) {
    const d = [];
    return { d, appendRow: r => d.push(r.slice()), getLastRow: () => d.length,
      getDataRange: () => ({ getValues: () => d.map(r => r.slice()) }),
      getRange: (r, c, nr = 1, nc = 1) => ({
        setValue: v => { d[r - 1][c - 1] = v; },
        setValues: vs => vs.forEach((row, i) => { d[r - 1 + i] = d[r - 1 + i] || []; row.forEach((v, j) => { d[r - 1 + i][c - 1 + j] = v; }); }) }),
      deleteRows: (r, n) => d.splice(r - 1, n) };
  }
  const ss = { getSheetByName: n => abas[n] || null, insertSheet: n => (abas[n] = aba(n)) };
  const cache = {};
  const props = { ADMIN_USUARIO: 'adm_teste', ADMIN_SENHA: 'senha-teste-123' };
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    CacheService: { getScriptCache: () => ({ get: k => cache[k] ?? null, put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Utilities: { getUuid: () => crypto.randomUUID(), formatDate: d => d.toISOString().slice(5, 16), DigestAlgorithm: { SHA_256: 'sha256' },
      computeHmacSha256Signature: (v, k) => Array.from(crypto.createHmac('sha256', k).update(v).digest()).map(b => b > 127 ? b - 256 : b),
      computeDigest: (a, t) => Array.from(crypto.createHash('sha256').update(t).digest()).map(b => b > 127 ? b - 256 : b) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ t, setMimeType() { return this; } }) },
  };
  vm.createContext(ctx);
  for (const f of ['Calculo.gs', 'Code.gs']) vm.runInContext(fs.readFileSync(__dirname + '/../apps-script/' + f, 'utf8'), ctx);
  ctx.setup();
  const call = q => JSON.parse(ctx.doPost({ postData: { contents: typeof q === 'string' ? q : JSON.stringify(q) } }).t);
  return { ctx, abas, cache, call, props };
}
function preparado() {
  const E = novoAmbiente();
  const tok = E.call({ acao: 'login_admin', usuario: 'adm_teste', senha: 'senha-teste-123' }).token;
  const adm = (op, x) => E.call(Object.assign({ acao: 'admin', token: tok, op }, x));
  adm('startups', { lista: [{ codigo: 'A01', ativo: true, nome: 'Alfa' }, { codigo: 'A02', ativo: true, nome: '=HYPERLINK("x")' },
    { codigo: 'I01', ativo: true, nome: 'Ideia Um' }, { codigo: 'A03', ativo: false, nome: 'Inativa SA' }] });
  ['aval', 'pop_I', 'pop_A', 'ideathon'].forEach(v => adm('estado', { votacao: v, valor: 'aberta' }));
  return Object.assign(E, { tok, adm });
}
const N = (c, p) => ({ c1: c, c2: c, c3: c, c4: c, c5: c, c6: c, c7: c, c8: c, pitch: p });
// CPFs FICTÍCIOS gerados na hora (dígitos verificadores válidos); nenhum CPF real no repositório.
function gerarCPF() {
  const d = Array.from({ length: 9 }, () => crypto.randomInt(10));
  if (d.every(x => x === d[0])) d[0] = (d[0] + 1) % 10;
  for (let t = 9; t < 11; t++) { let s = 0; for (let i = 0; i < t; i++) s += d[i] * (t + 1 - i); d.push(((s * 10) % 11) % 10); }
  return d.join('');
}
const fmtCPF = c => c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
const CPF1 = gerarCPF(), CPF2 = gerarCPF();
const DEV = () => crypto.randomBytes(16).toString('hex');

let ok = 0, fail = 0;
function t(nome, fn) { try { fn(); ok++; console.log('✔', nome); } catch (e) { fail++; console.log('✘', nome, '\n ', e.stack.split('\n').slice(0, 2).join('\n  ')); } }

t('login admin: usuário/senha errados recusam; certo dá token de 64 hex', () => {
  const E = novoAmbiente();
  assert.strictEqual(E.call({ acao: 'login_admin', usuario: 'adm_teste', senha: 'x' }).ok, false);
  assert.strictEqual(E.call({ acao: 'login_admin', usuario: 'outro', senha: 'senha-teste-123' }).ok, false);
  const r = E.call({ acao: 'login_admin', usuario: 'adm_teste', senha: 'senha-teste-123' });
  assert.ok(r.ok && /^[a-f0-9]{64}$/.test(r.token));
});
t('rate limit: 5 falhas bloqueiam até a senha certa', () => {
  const E = novoAmbiente();
  for (let i = 0; i < 5; i++) E.call({ acao: 'login_admin', usuario: 'adm_teste', senha: 'errada' });
  const r = E.call({ acao: 'login_admin', usuario: 'adm_teste', senha: 'senha-teste-123' });
  assert.strictEqual(r.ok, false); assert.match(r.erro, /Muitas tentativas/);
});
t('admin sem token / token inválido / token de avaliador é recusado', () => {
  const E = preparado();
  assert.strictEqual(E.call({ acao: 'admin', op: 'painel' }).ok, false);
  assert.strictEqual(E.call({ acao: 'admin', op: 'painel', token: 'a'.repeat(64) }).ok, false);
  const av = E.call({ acao: 'login_avaliador', cpf: CPF1, nome: 'Ana Teste' }).token;
  assert.strictEqual(E.call({ acao: 'admin', op: 'painel', token: av }).ok, false);
  assert.strictEqual(E.adm('painel').ok, true);
});
t('público: todas as ativas (com ou sem nome); inativa não aparece', () => {
  const E = preparado(), r = E.call({ acao: 'estado' });
  const cods = r.startups.map(s => s.codigo);
  assert.strictEqual(cods.length, 12 + 39); assert.ok(!cods.includes('A03'));
  assert.strictEqual(r.startups.find(s => s.codigo === 'A01').nome, 'Alfa');
  assert.strictEqual(r.startups.find(s => s.codigo === 'A04').nome, '');
});
t('código SEM nome é ACEITO em voto e avaliação', () => {
  const E = preparado(), av = E.call({ acao: 'login_avaliador', cpf: CPF1, nome: 'Ana Teste' }).token;
  assert.ok(E.call({ acao: 'avaliar', token: av, codigo: 'A04', notas: N(5, 5) }).ok);
  assert.ok(E.call({ acao: 'votar', votacao: 'pop_I', opcao: 'I02', cpf: gerarCPF(), dispositivo: DEV() }).ok);
});
t('código inativo ou inexistente é recusado', () => {
  const E = preparado(), av = E.call({ acao: 'login_avaliador', cpf: CPF1, nome: 'Ana Teste' }).token;
  for (const cod of ['A03', 'A08', 'A10', 'I40', 'A99', 'a01x', '']) {
    assert.strictEqual(E.call({ acao: 'avaliar', token: av, codigo: cod, notas: N(5, 5) }).ok, false, cod);
    assert.strictEqual(E.call({ acao: 'votar', votacao: cod[0] === 'I' ? 'pop_I' : 'pop_A', opcao: cod, cpf: gerarCPF(), dispositivo: DEV() }).ok, false, cod);
  }
  assert.strictEqual(E.abas.votos.d.length, 1); assert.strictEqual(E.abas.avaliacoes.d.length, 1);
});
t('validação de entrada de avaliação (nota, tipos, comentário, repetição)', () => {
  const E = preparado(), av = E.call({ acao: 'login_avaliador', cpf: CPF1, nome: 'Ana Teste' }).token;
  const bad = [{ ...N(5, 5), c3: 0 }, { ...N(5, 5), c3: 11 }, { ...N(5, 5), c3: 5.5 }, { ...N(5, 5), c3: '5' }, { c1: 5 }, [], null];
  bad.forEach(n => assert.strictEqual(E.call({ acao: 'avaliar', token: av, codigo: 'A01', notas: n }).ok, false, JSON.stringify(n)));
  assert.strictEqual(E.call({ acao: 'avaliar', token: av, codigo: 'A01', notas: N(5, 5), comentario: 'x'.repeat(501) }).ok, false);
  assert.strictEqual(E.call({ acao: 'avaliar', token: av, codigo: 'A01', notas: N(5, 5), comentario: { a: 1 } }).ok, false);
  assert.strictEqual(E.call({ acao: 'avaliar', token: 'x', codigo: 'A01', notas: N(5, 5) }).ok, false);
  assert.strictEqual(E.call({ acao: 'avaliar', token: av, codigo: 'A01', notas: N(5, 5), comentario: '=cmd()' }).ok, true);
  assert.strictEqual(E.call({ acao: 'avaliar', token: av, codigo: 'A01', notas: N(9, 9) }).ok, false, 'repetida');
  assert.strictEqual(E.abas.avaliacoes.d[1][14], "'=cmd()", 'fórmula neutralizada');
});
t('voto popular por CPF: inválido recusado; 2º voto mesma categoria recusado; mesmo CPF em outra categoria aceito; mesmo celular com outro CPF aceito', () => {
  const E = preparado(), d = DEV(), V = (votacao, opcao, cpf, disp = DEV()) => E.call({ acao: 'votar', votacao, opcao, cpf, dispositivo: disp });
  for (const c of ['11111111111', '12345678900', '', undefined, 123]) assert.strictEqual(V('pop_A', 'A01', c).ok, false, String(c));
  assert.ok(V('pop_A', 'A01', fmtCPF(CPF1), d).ok);
  const r = V('pop_A', 'A02', CPF1); assert.strictEqual(r.ok, false); assert.strictEqual(r.erro, 'Este CPF já votou nesta categoria.');
  assert.ok(V('pop_I', 'I01', CPF1, d).ok, 'outra categoria');
  E.adm('estado', { votacao: 'ideathon', valor: 'aberta' });
  assert.ok(V('ideathon', 'Equipe 1', CPF1, d).ok, 'ideathon');
  assert.ok(V('pop_A', 'A01', CPF2, d).ok, 'mesmo celular, outro CPF');
  assert.strictEqual(V('pop_I', 'A01', gerarCPF()).ok, false, 'categoria errada');
  assert.strictEqual(V('aval', 'A01', gerarCPF()).ok, false);
  E.adm('estado', { votacao: 'pop_A', valor: 'fechada' });
  assert.strictEqual(V('pop_A', 'A02', gerarCPF()).ok, false, 'fechada');
});
t('voto popular: só HMAC na planilha (sem CPF em claro); segredo criado no setup e fora do código', () => {
  const E = preparado();
  E.call({ acao: 'votar', votacao: 'pop_A', opcao: 'A01', cpf: fmtCPF(CPF1), dispositivo: DEV() });
  const linhas = JSON.stringify(E.abas.votos.d);
  assert.ok(!linhas.includes(CPF1) && !linhas.includes(fmtCPF(CPF1)) && !linhas.includes(CPF1.slice(3, 9)));
  assert.strictEqual(E.abas.votos.d[0][3], 'cpf_hash'); assert.match(E.abas.votos.d[1][3], /^[a-f0-9]{64}$/);
  const esperado = crypto.createHmac('sha256', E.props.VOTO_SEGREDO).update(CPF1).digest('hex');
  assert.strictEqual(E.abas.votos.d[1][3], esperado); assert.match(E.props.VOTO_SEGREDO, /^[a-f0-9]{64}$/);
  const code = require('fs').readFileSync(__dirname + '/../apps-script/Code.gs', 'utf8'); assert.ok(!code.includes(E.props.VOTO_SEGREDO));
  const p = JSON.stringify(E.adm('painel')); assert.ok(!p.includes(esperado), 'admin não vê hash'); assert.ok(!p.includes(CPF1));
});
t('voto popular: rate limit de CPFs inválidos por cliente', () => {
  const E = preparado(), d = DEV();
  for (let i = 0; i < 10; i++) E.call({ acao: 'votar', votacao: 'pop_A', opcao: 'A01', cpf: '11111111111', dispositivo: d });
  const r = E.call({ acao: 'votar', votacao: 'pop_A', opcao: 'A01', cpf: CPF1, dispositivo: d });
  assert.strictEqual(r.ok, false); assert.match(r.erro, /Muitas tentativas/);
  assert.ok(E.call({ acao: 'votar', votacao: 'pop_A', opcao: 'A01', cpf: CPF1, dispositivo: DEV() }).ok, 'outro cliente segue');
});
t('ações desconhecidas e JSON inválido dão erro genérico sem stack', () => {
  const E = preparado();
  for (const q of ['{', '[]', 'null', { acao: 'setup' }, { acao: 'admin_', op: 'limpar' }, { acao: '__proto__' }]) {
    const r = E.call(q); assert.strictEqual(r.ok, false); assert.ok(!/at |Error|\.gs/.test(r.erro), r.erro);
  }
  const r = E.call('x'.repeat(9000)); assert.strictEqual(r.ok, false);
});
t('resposta pública NUNCA contém dispositivo, avaliador, comentário ou startup inativa', () => {
  const E = preparado(), d = DEV(), av = E.call({ acao: 'login_avaliador', cpf: CPF1, nome: 'Ana Teste' }).token;
  E.call({ acao: 'avaliar', token: av, codigo: 'A01', notas: N(8, 8), comentario: 'COMENTARIO-SECRETO' });
  E.call({ acao: 'votar', votacao: 'pop_A', opcao: 'A01', cpf: CPF2, dispositivo: d });
  // avaliação de startup depois desativada não pode vazar
  E.call({ acao: 'avaliar', token: av, codigo: 'A02', notas: N(7, 7) });
  E.adm('startups', { lista: [{ codigo: 'A02', ativo: false, nome: 'Oculta' }] });
  E.adm('liberar', { valor: true });
  const pub = JSON.stringify([E.call({ acao: 'estado' }), E.call({ acao: 'resultados' })]);
  for (const proib of [d, CPF1, fmtCPF(CPF1), CPF1.slice(3, 9), 'Ana Teste', 'COMENTARIO-SECRETO', 'Inativa SA', '"A03"', '"A02"', 'Oculta', 'semAvaliacao', 'senha'])
    assert.ok(!pub.includes(proib), 'vazou: ' + proib);
  assert.ok(pub.includes('Alfa'));
});
t('CPF sem senha: validação (dígitos, formato, repetidos)', () => {
  const E = preparado(), L = cpf => E.call({ acao: 'login_avaliador', cpf });
  assert.ok(L(CPF1).ok); assert.ok(L(fmtCPF(CPF2)).ok, 'aceita com pontuação');
  const errado = CPF1.slice(0, 10) + ((+CPF1[10] + 1) % 10);
  for (const c of [errado, '11111111111', '00000000000', '123', CPF1 + '0', 'abcdefghijk', '', null, 12345678909])
    assert.strictEqual(L(c).ok, false, String(c));
  assert.ok(E.ctx.normalizarCPF(fmtCPF(CPF1)) === CPF1);
});
t('unicidade (CPF, startup); outro CPF pode avaliar a mesma; CPF gravado normalizado', () => {
  const E = preparado();
  const a = E.call({ acao: 'login_avaliador', cpf: fmtCPF(CPF1) }).token;
  assert.ok(E.call({ acao: 'avaliar', token: a, codigo: 'A01', notas: N(8, 8) }).ok);
  const a2 = E.call({ acao: 'login_avaliador', cpf: CPF1 }); // novo login, mesmo CPF
  assert.deepStrictEqual(Array.from(a2.ja), ['A01']);
  assert.strictEqual(E.call({ acao: 'avaliar', token: a2.token, codigo: 'A01', notas: N(9, 9) }).ok, false);
  const b = E.call({ acao: 'login_avaliador', cpf: CPF2 }).token;
  assert.ok(E.call({ acao: 'avaliar', token: b, codigo: 'A01', notas: N(6, 6) }).ok);
  assert.strictEqual(E.abas.avaliacoes.d[1][1], CPF1);
});
t('admin: monitor mascarado por padrão; completo só via op cpfs', () => {
  const E = preparado(), a = E.call({ acao: 'login_avaliador', cpf: CPF1, nome: 'Ana' }).token;
  E.call({ acao: 'avaliar', token: a, codigo: 'A01', notas: N(8, 8) }); E.call({ acao: 'avaliar', token: a, codigo: 'I01', notas: N(8, 8) });
  const p = E.adm('painel'), txt = JSON.stringify(p);
  assert.ok(!txt.includes(CPF1)); const m = p.monitor[0];
  assert.strictEqual(m.cpf, '***.' + CPF1.slice(3, 6) + '.' + CPF1.slice(6, 9) + '-**');
  assert.strictEqual(m.total, 2); assert.deepStrictEqual(m.itens.map(i => i.codigo), ['A01', 'I01']); assert.ok(m.itens[0].hora);
  assert.strictEqual(E.adm('cpfs').monitor[0].cpf, CPF1);
  assert.strictEqual(E.call({ acao: 'admin', op: 'cpfs', token: a }).ok, false, 'avaliador não lê CPFs');
});
t('rate limit de CPF inválido (20 falhas bloqueiam)', () => {
  const E = preparado();
  for (let i = 0; i < 20; i++) E.call({ acao: 'login_avaliador', cpf: '11111111111' });
  const r = E.call({ acao: 'login_avaliador', cpf: CPF1 }); assert.strictEqual(r.ok, false); assert.match(r.erro, /Muitas tentativas/);
});
t('lista branca: vazia libera; com 1+ CPF restringe; cadastro/remoção pelo admin', () => {
  const E = preparado(), L = c => E.call({ acao: 'login_avaliador', cpf: c });
  assert.ok(L(CPF2).ok, 'vazia: qualquer CPF válido');
  assert.strictEqual(E.adm('painel').estado.restricao_ativa, false);
  assert.strictEqual(E.adm('aut_add', { cpf: '12345678900' }).ok, false, 'dígito inválido');
  assert.strictEqual(E.adm('aut_add', { cpf: '22222222222' }).ok, false, 'repetido');
  assert.ok(E.adm('aut_add', { cpf: fmtCPF(CPF1), nome: 'Ana' }).ok);
  assert.strictEqual(E.adm('aut_add', { cpf: CPF1 }).ok, false, 'duplicado');
  assert.strictEqual(E.call({ acao: 'admin', op: 'aut_add', cpf: CPF2 }).ok, false, 'sem token');
  const r = L(CPF2); assert.strictEqual(r.ok, false); assert.strictEqual(r.erro, 'CPF não autorizado, procure a organização.');
  assert.ok(L(CPF1).ok);
  const p = E.adm('painel'); assert.strictEqual(p.estado.restricao_ativa, true);
  assert.ok(!JSON.stringify(p).includes(CPF1), 'lista no admin vem mascarada');
  assert.strictEqual(p.estado.autorizados[0].nome, 'Ana');
  assert.strictEqual(E.adm('aut_remover', { ref: 'zz' }).ok, false);
  assert.ok(E.adm('aut_remover', { ref: p.estado.autorizados[0].ref }).ok);
  assert.strictEqual(E.adm('painel').estado.restricao_ativa, false); assert.ok(L(CPF2).ok, 'voltou a liberar');
  assert.ok(!JSON.stringify(E.call({ acao: 'estado' })).includes('autorizados'));
});
t('selos: editáveis só pelo admin; não vazam ao público com opção desligada; aparecem se ligada', () => {
  const E = preparado();
  assert.strictEqual(E.call({ acao: 'admin', op: 'startups', lista: [{ codigo: 'A01', ativo: true, feminina: true }] }).ok, false, 'sem token');
  const av = E.call({ acao: 'login_avaliador', cpf: CPF1 }).token;
  assert.strictEqual(E.call({ acao: 'admin', op: 'startups', token: av, lista: [{ codigo: 'A01', ativo: true, feminina: true }] }).ok, false, 'token avaliador');
  assert.strictEqual(E.adm('startups', { lista: [{ codigo: 'A01', ativo: true, nome: 'Alfa', feminina: 'sim' }] }).ok, false, 'tipo');
  assert.ok(E.adm('startups', { lista: [{ codigo: 'A01', ativo: true, nome: 'Alfa', feminina: true }, { codigo: 'I01', ativo: true, nome: 'Ideia Um', feminina: true, ensino_medio: true }] }).ok);
  // sem os campos, mantém os selos
  assert.ok(E.adm('startups', { lista: [{ codigo: 'A01', ativo: true, nome: 'Alfa 2' }] }).ok);
  const st = E.adm('painel').estado.startups, a1 = st.find(x => x.codigo === 'A01'), i1 = st.find(x => x.codigo === 'I01');
  assert.ok(a1.feminina && !a1.ensino_medio && a1.nome === 'Alfa 2'); assert.ok(i1.feminina && i1.ensino_medio);
  assert.strictEqual(E.adm('painel').estado.selos_publicos, false);
  E.adm('liberar', { valor: true });
  let pub = JSON.stringify([E.call({ acao: 'estado' }), E.call({ acao: 'resultados' })]);
  assert.ok(!/feminina|ensino_medio/.test(pub), 'vazou selo');
  E.adm('selos_publicos', { valor: true });
  const r = E.call({ acao: 'estado' }).startups.find(x => x.codigo === 'I01'); assert.ok(r.feminina && r.ensino_medio);
});
t('setup migra planilha antiga (4 colunas) sem perder dados', () => {
  const E = novoAmbiente(), st = E.abas.startups.d;
  st.length = 0; st.push(['codigo', 'categoria', 'ativo', 'nome'], ['A01', 'A', true, 'Antiga'], ['I07', 'I', false, '']);
  E.ctx.setup(); E.ctx.setup();
  assert.deepStrictEqual(st[0], ['codigo', 'categoria', 'ativo', 'nome', 'feminina', 'ensino_medio']);
  assert.deepStrictEqual(st[1], ['A01', 'A', true, 'Antiga', false, false]); assert.strictEqual(st.length, 3);
});
t('dashboard: só admin; resumo, posições e rankings filtrados (feminina / ensino médio)', () => {
  const E = preparado();
  E.adm('startups', { lista: [{ codigo: 'A01', ativo: true, nome: 'Alfa', feminina: true }, { codigo: 'A04', ativo: true, feminina: true },
    { codigo: 'A02', ativo: true, nome: 'B', ensino_medio: true }, { codigo: 'I01', ativo: true, nome: 'Ideia Um', feminina: true, ensino_medio: true }] });
  const a = E.call({ acao: 'login_avaliador', cpf: CPF1 }).token, b = E.call({ acao: 'login_avaliador', cpf: CPF2 }).token;
  E.call({ acao: 'avaliar', token: a, codigo: 'A02', notas: N(10, 10) }); // melhor geral, não feminina
  E.call({ acao: 'avaliar', token: a, codigo: 'A01', notas: N(6, 6) });
  E.call({ acao: 'avaliar', token: b, codigo: 'A04', notas: N(8, 8) });
  E.call({ acao: 'avaliar', token: b, codigo: 'I01', notas: N(7, 7) });
  E.call({ acao: 'votar', votacao: 'pop_A', opcao: 'A01', cpf: gerarCPF(), dispositivo: DEV() });
  assert.strictEqual(E.call({ acao: 'admin', op: 'dashboard', token: a }).ok, false);
  const d = E.adm('dashboard');
  assert.ok(d.ok); assert.strictEqual(d.resumo.avaliacoes, 4); assert.strictEqual(d.resumo.avaliadores_distintos, 2);
  assert.deepStrictEqual(d.resumo.ativas, { A: 12, I: 39 }); assert.deepStrictEqual(d.resumo.avaliadas, { A: 3, I: 1 });
  assert.deepStrictEqual(d.resumo.femininas, { A: 2, I: 1 }); assert.strictEqual(d.resumo.votos.pop_A, 1);
  const t1 = c => d.trabalhos.find(x => x.codigo === c);
  assert.strictEqual(t1('A02').posicao, 1); assert.strictEqual(t1('A04').posicao, 2); assert.strictEqual(t1('A01').posicao, 3);
  assert.strictEqual(t1('A01').votos_populares, 1); assert.strictEqual(t1('A05').posicao, null);
  assert.deepStrictEqual(d.especiais.feminina.A.map(x => [x.codigo, x.posicao]), [['A04', 1], ['A01', 2]]);
  assert.deepStrictEqual(d.especiais.ensino_medio.A.map(x => x.codigo), ['A02']);
  assert.deepStrictEqual(d.especiais.ensino_medio.I.map(x => x.codigo), ['I01']);
  assert.ok(!JSON.stringify(d).includes(CPF1), 'dashboard sem CPF');
});
t('ranking por tags: E (tem as duas) vs OU (qualquer uma), por categoria; só admin; valida parâmetros', () => {
  const E = preparado();
  E.adm('startups', { lista: [{ codigo: 'A01', ativo: true, nome: 'Alfa', feminina: true }, { codigo: 'A02', ativo: true, nome: 'B', ensino_medio: true },
    { codigo: 'A04', ativo: true, feminina: true, ensino_medio: true }, { codigo: 'A05', ativo: true }, { codigo: 'I01', ativo: true, nome: 'Ideia Um', feminina: true, ensino_medio: true },
    { codigo: 'A03', ativo: false, feminina: true, ensino_medio: true }] });
  const a = E.call({ acao: 'login_avaliador', cpf: CPF1 }).token;
  [['A01', 9], ['A02', 10], ['A04', 7], ['A05', 10], ['I01', 6]].forEach(([c, n]) => E.call({ acao: 'avaliar', token: a, codigo: c, notas: N(n, n) }));
  const ou = E.adm('ranking_tags', { tags: ['feminina', 'ensino_medio'], modo: 'OU' });
  assert.deepStrictEqual(ou.A.map(x => [x.posicao, x.codigo]), [[1, 'A02'], [2, 'A01'], [3, 'A04']], 'OU exclui A05 (sem tag) e A03 (inativa)');
  assert.strictEqual(ou.A[1].nome, 'Alfa'); assert.strictEqual(ou.A[0].avaliadores, 1); assert.ok(ou.A[0].mediaPitch === 10);
  const e = E.adm('ranking_tags', { tags: ['feminina', 'ensino_medio'], modo: 'E' });
  assert.deepStrictEqual(e.A.map(x => [x.posicao, x.codigo]), [[1, 'A04']]); assert.deepStrictEqual(e.I.map(x => x.codigo), ['I01']);
  const f = E.adm('ranking_tags', { tags: ['feminina'], modo: 'E' });
  assert.deepStrictEqual(f.A.map(x => x.codigo), ['A01', 'A04']);
  for (const x of [{ tags: [], modo: 'E' }, { tags: ['outra'], modo: 'E' }, { tags: ['feminina'], modo: 'XOR' }, { tags: 'feminina', modo: 'E' }])
    assert.strictEqual(E.adm('ranking_tags', x).ok, false, JSON.stringify(x));
  assert.strictEqual(E.call({ acao: 'admin', op: 'ranking_tags', token: a, tags: ['feminina'], modo: 'E' }).ok, false);
});
t('resultados públicos só após liberação', () => {
  const E = preparado(); assert.strictEqual(E.call({ acao: 'resultados' }).ok, false);
  E.adm('liberar', { valor: true }); assert.strictEqual(E.call({ acao: 'resultados' }).ok, true);
});
t('admin: editar nome, desativar, adicionar código; valida código e tamanho; anti-fórmula', () => {
  const E = preparado();
  assert.ok(E.adm('startups', { lista: [{ codigo: 'i40', ativo: true, nome: 'Nova' }] }).ok);
  assert.strictEqual(E.adm('startups', { lista: [{ codigo: 'X01', ativo: true, nome: 'a' }] }).ok, false);
  assert.strictEqual(E.adm('startups', { lista: [{ codigo: 'A01', ativo: 'sim', nome: 'a' }] }).ok, false);
  E.adm('startups', { lista: [{ codigo: 'A01', ativo: true, nome: 'n'.repeat(200) }] });
  const p = E.adm('painel'), s = p.estado.startups;
  assert.ok(s.find(x => x.codigo === 'I40' && x.categoria === 'I' && x.nome === 'Nova'));
  assert.strictEqual(s.find(x => x.codigo === 'A01').nome.length, 80);
  assert.strictEqual(s.find(x => x.codigo === 'A02').nome, '=HYPERLINK("x")', 'admin vê o texto');
  assert.strictEqual(E.abas.startups.d.find(r => r[0] === 'A02')[3], `'=HYPERLINK("x")`, 'planilha guarda neutralizado');
  assert.ok(s.find(x => x.codigo === 'A04' && x.nome === ''), 'admin vê as sem nome');
});
t('limpar exige APAGAR', () => {
  const E = preparado(); E.call({ acao: 'votar', votacao: 'pop_A', opcao: 'A01', cpf: gerarCPF(), dispositivo: DEV() });
  assert.strictEqual(E.adm('limpar', { alvo: 'votos' }).ok, false);
  assert.ok(E.adm('limpar', { alvo: 'votos', confirmacao: 'APAGAR' }).ok); assert.strictEqual(E.abas.votos.d.length, 1);
});
t('sair invalida o token', () => {
  const E = preparado(); E.call({ acao: 'sair', token: E.tok }); assert.strictEqual(E.adm('painel').ok, false);
});
console.log(`\n${ok} ok, ${fail} falha(s)`); process.exit(fail ? 1 : 0);
