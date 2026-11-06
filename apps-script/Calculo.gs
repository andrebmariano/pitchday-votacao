/**
 * Calculo.gs — regras de pontuação (puro, sem APIs do Google; testado em node).
 * PESOS ficam SÓ aqui.
 */
var CRITERIOS = [
  { id: 'c1', nome: 'Oportunidade e problema', pergunta: 'A equipe mostrou com clareza o problema e o impacto dele na sociedade?' },
  { id: 'c2', nome: 'Solução', pergunta: 'A solução proposta ficou clara?' },
  { id: 'c3', nome: 'Tamanho do mercado', pergunta: 'A equipe estimou e explicou bem o mercado que pretende atingir?' },
  { id: 'c4', nome: 'Concorrentes', pergunta: 'A equipe comparou sua solução com as alternativas que já existem no mercado?' },
  { id: 'c5', nome: 'Modelo de negócio', pergunta: 'O modelo de negócio apresentado faz sentido?' },
  { id: 'c6', nome: 'Financiamento', pergunta: 'A equipe mostrou o que fez com o que já recebeu e o que fará com o investimento que pede para a próxima fase?' },
  { id: 'c7', nome: 'Equipe', pergunta: 'A equipe mostrou as competências do time, deixou clara a missão, a visão e os valores, e demonstrou motivação?' },
  { id: 'c8', nome: 'Estágio de tração', pergunta: 'A equipe classificou corretamente o próprio estágio de tração?' },
  { id: 'pitch', nome: 'Pitch (nota geral)', pergunta: 'Que nota geral você dá para o pitch da equipe?' }
];
var PESOS = { pitch: 0.25, demais: 0.75 }; // demais = dividido igualmente entre c1..c8
var NOTA_MIN = 1, NOTA_MAX = 10;
var COMENTARIO_MAX = 500;

/** Valida notas {c1..c8,pitch}. Retorna mensagem de erro ou null. */
function validarNotas(notas) {
  if (!notas || typeof notas !== 'object') return 'Notas ausentes.';
  for (var i = 0; i < CRITERIOS.length; i++) {
    var v = notas[CRITERIOS[i].id];
    if (typeof v !== 'number' || v % 1 !== 0 || v < NOTA_MIN || v > NOTA_MAX)
      return 'Nota inválida em "' + CRITERIOS[i].nome + '" (inteiro de ' + NOTA_MIN + ' a ' + NOTA_MAX + ').';
  }
  return null;
}

function mediaDemais(notas) {
  var s = 0, n = 0;
  for (var i = 0; i < CRITERIOS.length; i++) if (CRITERIOS[i].id !== 'pitch') { s += notas[CRITERIOS[i].id]; n++; }
  return s / n;
}

/** Nota de UM avaliador = 0,25*Pitch + 0,75*média(c1..c8) */
function notaAvaliador(notas) {
  return PESOS.pitch * notas.pitch + PESOS.demais * mediaDemais(notas);
}

/**
 * avaliacoes: [{codigo, notas}] ; startups: [{codigo, categoria, ativo}]
 * Retorna {A: [...ranking], I: [...], semAvaliacao: {A:[...], I:[...]}}
 */
function calcularRanking(avaliacoes, startups) {
  var por = {};
  avaliacoes.forEach(function (a) {
    var p = por[a.codigo] || (por[a.codigo] = { soma: 0, pitch: 0, demais: 0, n: 0 });
    p.soma += notaAvaliador(a.notas); p.pitch += a.notas.pitch; p.demais += mediaDemais(a.notas); p.n++;
  });
  var out = { A: [], I: [], semAvaliacao: { A: [], I: [] } };
  startups.forEach(function (s) {
    if (!s.ativo) return;
    var p = por[s.codigo];
    if (!p) { out.semAvaliacao[s.categoria].push(s.codigo); return; }
    out[s.categoria].push({ codigo: s.codigo, nota: p.soma / p.n, mediaPitch: p.pitch / p.n,
      mediaDemais: p.demais / p.n, avaliadores: p.n });
  });
  var cmp = function (x, y) {
    var e = 1e-9;
    if (Math.abs(y.nota - x.nota) > e) return y.nota - x.nota;
    if (Math.abs(y.mediaPitch - x.mediaPitch) > e) return y.mediaPitch - x.mediaPitch;
    if (Math.abs(y.mediaDemais - x.mediaDemais) > e) return y.mediaDemais - x.mediaDemais;
    return x.codigo < y.codigo ? -1 : 1;
  };
  ['A', 'I'].forEach(function (c) {
    out[c].sort(cmp);
    out[c].forEach(function (r, i) {
      var prev = out[c][i - 1];
      r.posicao = (prev && cmp(prev, r) < 0 && Math.abs(prev.nota - r.nota) < 1e-9 &&
        Math.abs(prev.mediaPitch - r.mediaPitch) < 1e-9 && Math.abs(prev.mediaDemais - r.mediaDemais) < 1e-9) ? prev.posicao : i + 1;
    });
  });
  return out;
}

/** votos: [{votacao, opcao}] -> {opcao: n} ordenado desc */
function contarVotos(votos, votacao) {
  var c = {};
  votos.forEach(function (v) { if (v.votacao === votacao) c[v.opcao] = (c[v.opcao] || 0) + 1; });
  return Object.keys(c).map(function (k) { return { opcao: k, votos: c[k] }; })
    .sort(function (a, b) { return b.votos - a.votos || (a.opcao < b.opcao ? -1 : 1); });
}

/** CPF: retorna 11 dígitos normalizados ou null (dígitos verificadores; rejeita sequência repetida). */
function normalizarCPF(v) {
  if (typeof v !== 'string' || v.length > 20) return null;
  var d = v.replace(/[.\-\s]/g, '');
  if (!/^[0-9]{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return null;
  for (var t = 9; t < 11; t++) {
    var s = 0;
    for (var i = 0; i < t; i++) s += +d[i] * (t + 1 - i);
    if (((s * 10) % 11) % 10 !== +d[t]) return null;
  }
  return d;
}
function mascararCPF(d) { return '***.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-**'; }

/**
 * Dashboard "Trabalhos" (só admin). Puro/testável.
 * avaliacoes: [{codigo, cpf, notas}] ; startups: [{codigo,categoria,ativo,nome,feminina,ensino_medio}] ; votos: [{votacao, opcao}]
 */
function montarDashboard(avaliacoes, startups, votos) {
  var rk = calcularRanking(avaliacoes, startups);
  var porCod = {};
  ['A', 'I'].forEach(function (c) { rk[c].forEach(function (r) { porCod[r.codigo] = r; }); });
  var vt = {};
  votos.forEach(function (v) { if (v.votacao === 'pop_A' || v.votacao === 'pop_I') vt[v.opcao] = (vt[v.opcao] || 0) + 1; });
  var trabalhos = startups.map(function (s) {
    var r = porCod[s.codigo];
    return { codigo: s.codigo, nome: s.nome || '', categoria: s.categoria, ativo: !!s.ativo, feminina: !!s.feminina, ensino_medio: !!s.ensino_medio,
      avaliadores: r ? r.avaliadores : 0, nota: r ? r.nota : null, mediaPitch: r ? r.mediaPitch : null, posicao: r ? r.posicao : null,
      votos_populares: vt[s.codigo] || 0 };
  });
  function especial(campo) {
    var sub = startups.filter(function (s) { return s.ativo && s[campo]; });
    var r = calcularRanking(avaliacoes, sub);
    return { A: r.A, I: r.I };
  }
  var ativas = trabalhos.filter(function (t) { return t.ativo; });
  var cpfs = {}; avaliacoes.forEach(function (a) { if (a.cpf) cpfs[a.cpf] = 1; });
  function conta(f) { return { A: ativas.filter(function (t) { return t.categoria === 'A' && f(t); }).length, I: ativas.filter(function (t) { return t.categoria === 'I' && f(t); }).length }; }
  var resumo = {
    ativas: conta(function () { return true; }),
    avaliadas: conta(function (t) { return t.avaliadores > 0; }),
    nao_avaliadas: conta(function (t) { return t.avaliadores === 0; }),
    femininas: conta(function (t) { return t.feminina; }),
    ensino_medio: conta(function (t) { return t.ensino_medio; }),
    avaliacoes: avaliacoes.length,
    avaliadores_distintos: Object.keys(cpfs).length,
    votos: { pop_I: 0, pop_A: 0, ideathon: 0 }
  };
  votos.forEach(function (v) { if (v.votacao in resumo.votos) resumo.votos[v.votacao]++; });
  return { resumo: resumo, trabalhos: trabalhos, especiais: { feminina: especial('feminina'), ensino_medio: especial('ensino_medio') } };
}

var TAGS = ['feminina', 'ensino_medio'];
/** Ranking por tags. modo 'E' = tem todas as tags; 'OU' = tem qualquer uma. Posição recalculada dentro do filtro, por categoria. */
function rankingPorTags(avaliacoes, startups, tags, modo) {
  var sub = startups.filter(function (s) {
    if (!s.ativo) return false;
    var tem = tags.map(function (t) { return !!s[t]; });
    return modo === 'E' ? tem.every(Boolean) : tem.some(Boolean);
  });
  var r = calcularRanking(avaliacoes, sub), nomes = {};
  sub.forEach(function (s) { nomes[s.codigo] = s.nome || ''; });
  ['A', 'I'].forEach(function (c) { r[c].forEach(function (x) { x.nome = nomes[x.codigo]; }); });
  return { A: r.A, I: r.I, sem_avaliacao: r.semAvaliacao, total: { A: sub.filter(function (s) { return s.categoria === 'A'; }).length, I: sub.filter(function (s) { return s.categoria === 'I'; }).length } };
}
