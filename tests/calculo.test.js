// node tests/calculo.test.js — sem dependências
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + '/../apps-script/Calculo.gs', 'utf8'), ctx);
let ok = 0, fail = 0;
function t(nome, fn) { try { fn(); ok++; console.log('✔', nome); } catch (e) { fail++; console.log('✘', nome, '\n ', e.message); } }
const n = (c, p) => ({ c1: c, c2: c, c3: c, c4: c, c5: c, c6: c, c7: c, c8: c, pitch: p });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, a + ' != ' + b);
const S = [{ codigo: 'A01', categoria: 'A', ativo: true }, { codigo: 'A02', categoria: 'A', ativo: true },
  { codigo: 'A03', categoria: 'A', ativo: true }, { codigo: 'I01', categoria: 'I', ativo: true },
  { codigo: 'I02', categoria: 'I', ativo: false }];

t('9 critérios, pesos somam 1', () => { assert.strictEqual(ctx.CRITERIOS.length, 9); near(ctx.PESOS.pitch + ctx.PESOS.demais, 1); });
t('nota todos 10 = 10; todos 1 = 1', () => { near(ctx.notaAvaliador(n(10, 10)), 10); near(ctx.notaAvaliador(n(1, 1)), 1); });
t('pitch vale 25%', () => { near(ctx.notaAvaliador(n(6, 10)), 0.25 * 10 + 0.75 * 6); });
t('cada critério 1-8 vale 9,375%', () => { const a = n(5, 5); a.c3 = 9; near(ctx.notaAvaliador(a) - 5, 4 * 0.09375); });
t('validação: faltando, fora da faixa, fracionário, string', () => {
  assert.ok(ctx.validarNotas(n(5, 5)) === null);
  const f = n(5, 5); delete f.c7; assert.ok(ctx.validarNotas(f));
  assert.ok(ctx.validarNotas(n(0, 5))); assert.ok(ctx.validarNotas(n(5, 11)));
  assert.ok(ctx.validarNotas(n(5.5, 5))); assert.ok(ctx.validarNotas({ ...n(5, 5), pitch: '7' }));
});
t('média entre 1 e N avaliadores + contagem', () => {
  const r = ctx.calcularRanking([{ codigo: 'A01', notas: n(8, 8) }, { codigo: 'A01', notas: n(6, 6) }, { codigo: 'A02', notas: n(9, 9) }], S);
  assert.strictEqual(r.A[0].codigo, 'A02'); assert.strictEqual(r.A[0].avaliadores, 1);
  near(r.A[1].nota, 7); assert.strictEqual(r.A[1].avaliadores, 2);
});
t('sem avaliação fica fora do ranking; inativa ignorada', () => {
  const r = ctx.calcularRanking([{ codigo: 'A01', notas: n(8, 8) }], S);
  assert.deepStrictEqual(Array.from(r.semAvaliacao.A), ['A02', 'A03']);
  assert.deepStrictEqual(Array.from(r.semAvaliacao.I), ['I01']); assert.strictEqual(r.A.length, 1);
});
t('categorias nunca se misturam', () => {
  const r = ctx.calcularRanking([{ codigo: 'A01', notas: n(2, 2) }, { codigo: 'I01', notas: n(10, 10) }], S);
  assert.strictEqual(r.A.length, 1); assert.strictEqual(r.I.length, 1); assert.strictEqual(r.A[0].posicao, 1);
});
t('desempate 1: maior Pitch', () => {
  // A01: c=8,p=4 -> 7 ; A02: c=6,p=10 -> 7
  const r = ctx.calcularRanking([{ codigo: 'A01', notas: n(8, 4) }, { codigo: 'A02', notas: n(6, 10) }], S);
  near(r.A[0].nota, r.A[1].nota); assert.strictEqual(r.A[0].codigo, 'A02'); assert.strictEqual(r.A[1].posicao, 2);
});
t('desempate 2: maior média dos 8 (mesma nota e mesmo pitch médio)', () => {
  // A01: 2 avaliadores (c8 p6 -> 7.5) e (c6 p6 -> 6) => nota 6.75, pitch 6, demais 7
  // A03: (c7 p6) e (c7 p6) => 6.75, pitch 6, demais 7 -> empate total => mesma posição
  const r = ctx.calcularRanking([{ codigo: 'A01', notas: n(8, 6) }, { codigo: 'A01', notas: n(6, 6) },
    { codigo: 'A03', notas: n(7, 6) }, { codigo: 'A03', notas: n(7, 6) }], S);
  assert.strictEqual(r.A[0].posicao, 1); assert.strictEqual(r.A[1].posicao, 1);
  const a = n(7, 6); a.c1 = 8; // A02 demais maior, mas nota maior também; checar regra pura de ordenação:
  const r2 = ctx.calcularRanking([{ codigo: 'A02', notas: n(6, 8) }, { codigo: 'A01', notas: n(6, 8) }], S);
  assert.strictEqual(r2.A[0].codigo, 'A01'); assert.strictEqual(r2.A[1].posicao, 1);
});
t('contagem de votos populares por votação', () => {
  const c = ctx.contarVotos([{ votacao: 'pop_I', opcao: 'I01' }, { votacao: 'pop_I', opcao: 'I03' }, { votacao: 'pop_I', opcao: 'I03' }, { votacao: 'pop_A', opcao: 'A01' }], 'pop_I');
  assert.strictEqual(c[0].opcao, 'I03'); assert.strictEqual(c[0].votos, 2); assert.strictEqual(c.length, 2);
});
console.log(`\n${ok} ok, ${fail} falha(s)`); process.exit(fail ? 1 : 0);
