# Votação — Pitch Day UFPR (7 e 8/11/2026)

Site estático (GitHub Pages) + API em Google Apps Script gravando numa Google Sheet do seu Drive.
**Nenhuma senha fica neste repositório**: as senhas ficam nas *Propriedades do script* do Apps Script.

## Páginas (rotas)
| Endereço | Uso |
|---|---|
| `…/` | início, com todas as votações |
| `…/#/popular/I` | **QR 4** · voto popular: melhor startup **Ideação** (sábado) |
| `…/#/popular/A` | **QR 3** · voto popular: melhor startup **Avançado** (sábado) |
| `…/#/ideathon` | **QR 2** · voto popular: equipes do Ideathon (domingo) |
| `…/#/<AVAL_ROTA>` | **QR 1** · avaliadores (rota não divulgada em `config.js`; entrada com CPF) |
| `…/#/resultados` | resultados (só depois de liberados; sem QR) |
| `…/#/<ADMIN_ROTA>` | painel do administrador (rota definida em `config.js`; **sem QR code e sem link público**) |

## Regras
- Códigos: Avançado A01–A07, A09, A11–A15; Ideação I01–I39 (aba `startups`: `codigo`, `categoria`, `ativo`, `nome`).
- O nome é preenchido pelo admin no painel ou direto na planilha. Aparece como `A02 · Nome`.
- Toda startup **ativa** aparece e pode ser votada/avaliada; com nome exibe `A02 · Nome`, sem nome só `A02`. O servidor recusa só código inexistente ou inativo. No painel, as sem nome ficam marcadas "pendente de nome" (lembrete).
- 9 critérios, nota inteira de 1 a 10, todos obrigatórios. Nota do avaliador = 0,25 × Pitch + 0,75 × média dos critérios 1–8 (pesos em `apps-script/Calculo.gs`, constante `PESOS`).
- Nota da startup = média das notas dos avaliadores que a avaliaram (1 ou mais); o resultado mostra quantos. Sem avaliação = fora do ranking.
- Ranking separado por categoria. Desempate: maior Pitch médio, depois maior média dos 8.
- Avaliadores entram **só com CPF válido** (dígitos verificadores; nome opcional). Cada CPF avalia cada startup uma vez; envio definitivo. Comentário opcional (até 500 caracteres, não aparece no resultado), ligável no painel.
- Voto popular: **1 voto por CPF em cada votação** (Ideação, Avançado, Ideathon; o mesmo CPF pode votar nas três). CPF validado pelos dígitos verificadores no celular e no servidor. O CPF do público **não é gravado**: a planilha guarda só `HMAC-SHA256(CPF, VOTO_SEGREDO)`. O celular compartilhado não bloqueia (só mostra um aviso). Nunca se mistura com a nota dos avaliadores.

## Passo a passo

### 1. Planilha e script
1. No Google Drive, crie uma planilha nova, por exemplo **"PitchDay2026 – Votação"**.
2. Menu **Extensões → Apps Script**.
3. Apague o conteúdo de `Código.gs` e cole o conteúdo de `apps-script/Code.gs`.
4. Clique em **+ → Script**, nomeie `Calculo` e cole `apps-script/Calculo.gs`.
5. (Opcional) Em **Configurações do projeto**, marque "Mostrar arquivo de manifesto" e cole `apps-script/appsscript.json`.
6. Selecione a função **setup** e clique em **Executar**. O Google vai pedir autorização: escolha sua conta → "Avançado" → "Acessar (não seguro)" → Permitir. (É o seu próprio script; ele só acessa esta planilha.) As abas `startups`, `config`, `avaliacoes` e `votos` serão criadas.

### 2. Credenciais (Propriedades do script)
**Configurações do projeto (engrenagem) → Propriedades do script → Adicionar**:
- `ADMIN_USUARIO` e `ADMIN_SENHA`: defina com os valores que você escolheu.

- `VOTO_SEGREDO`: criado automaticamente pelo `setup()` (não precisa preencher; não apague nem altere durante o evento, senão o controle de 1 voto por CPF recomeça).

As credenciais ficam **somente** aí, nunca em arquivos do repositório.

### 3. Publicar a API
1. **Implantar → Nova implantação → tipo "App da Web"**.
2. *Executar como*: **Eu**. *Quem pode acessar*: **Qualquer pessoa**.
3. Copie a URL que termina em `/exec`.
4. Se alterar o código depois: **Implantar → Gerenciar implantações → editar → Nova versão** (a URL continua a mesma).

### 4. Configurar o site
Abra `config.js` e cole a URL em `API_URL`. Se quiser, troque o sufixo de `ADMIN_ROTA` (endereço do painel). Guarde o endereço completo só com você.

### 5. GitHub Pages
1. No repositório `pitchday-votacao`, envie todos os arquivos desta pasta (Add file → Upload files). Confira que a pasta `.github/workflows/` subiu.
2. **Settings → Pages → Source: GitHub Actions** (o workflow `pages.yml` roda os testes e publica). Alternativa: *Deploy from a branch → `main` / `(root)`*.
3. O site fica em `https://SEU_USUARIO.github.io/pitchday-votacao/`.

### 6. Antes do evento
1. Abra `…/#/<ADMIN_ROTA>`, entre com usuário e senha, preencha os nomes das startups e imprima os QR codes (Ctrl+P).
2. Faça votos e avaliações de teste. Depois use **Limpar dados de teste** (pede para digitar APAGAR).
3. No domingo, cadastre as 3 opções do Ideathon no painel.
4. Abra cada votação na hora certa e feche ao terminar; libere os resultados quando quiser.

## Avaliadores e CPF (LGPD)
- O CPF fica só na aba privada `avaliacoes` e no painel admin (mascarado `***.456.789-**`; botão "Mostrar CPFs completos"). Nunca sai em página pública.
- **CPFs autorizados** (painel admin): lista vazia = qualquer CPF válido avalia; com 1 ou mais CPFs = só os cadastrados ("CPF não autorizado, procure a organização"). Dá para cadastrar e remover durante o evento.
- Apague ou arquive a planilha após o encerramento e a auditoria do evento.

## Painel admin: selos e Trabalhos
- Cada startup tem dois selos independentes: **Startup feminina** e **Ensino médio** (colunas `feminina` e `ensino_medio` na aba `startups`, TRUE/FALSE). Edite no painel ou direto na planilha. Rodar `setup()` de novo migra planilhas antigas sem perder dados.
- Por padrão os selos aparecem só no admin; a opção "Mostrar selos ao público" fica no painel.
- Aba **Trabalhos** (`#/<ADMIN_ROTA>/trabalhos`): cards de resumo, ranking por tag (Startup feminina / Ensino médio, com "tem as duas" ou "tem qualquer uma"), separado por Ideação e Avançado; tabela com filtros, busca e ordenação; atualização automática opcional a cada 30 s; exportação CSV.

## QR codes
O painel gera exatamente 4: **1 Avaliadores, 2 Ideathon, 3 Avançado, 4 Ideação**. "Imprimir os 4 QR codes" gera 1 por página A4; cada QR tem botão "Baixar PNG". O painel admin não tem QR.

## Segurança
- **Não compartilhe a planilha** (Compartilhar → Acesso geral: *Restrito*). O site só fala com o Apps Script, que roda como você.
- Login do admin por usuário + senha, comparados em tempo constante; o servidor devolve um token de sessão aleatório (8 h). 5 falhas em 10 min bloqueiam o login do admin por 10 min; 20 CPFs inválidos/não autorizados em 10 min bloqueiam a entrada de avaliadores por 10 min.
- O público só recebe: códigos+nomes das startups visíveis, estado das votações, opções do Ideathon e, se liberados, resultados agregados. Nunca: dispositivos, nomes de avaliadores, comentários, startups ocultas.
- Todas as entradas são validadas no servidor; textos que começam com `= + - @` são gravados como texto (proteção contra fórmula).
- O site tem Content-Security-Policy e `no-referrer`; nada vindo do servidor é inserido como HTML.

## Testes
```
node tests/calculo.test.js   # regras de cálculo
node tests/api.test.js       # API com planilha simulada: login, rate limit, validação, vazamento, visibilidade
```
Sem dependências.

## Identidade visual
Cores, fontes (Sora, Manrope, IBM Plex Mono) e imagens do site oficial pitchdayufpr.com.br; arquivos em `assets/`.
