# IPTV Manager

Painel React/Vite e Cloudflare Pages Functions para playlists M3U/M3U8 públicas e autorizadas. Cloudflare D1 guarda fontes, canais e histórico. GitHub Actions roda Python/FFprobe; nenhum token administrativo vai ao navegador.

## Requisitos

- Node.js 20 ou superior e npm
- Python 3.12 para validar localmente
- Conta gratuita Cloudflare e repositório GitHub
- FFmpeg/FFprobe apenas para executar o validador fora do GitHub Actions
- Fontes de transmissão e XMLTV que você tenha autorização para usar

## Executar localmente

1. Instale dependências: `npm install`.
2. Crie banco local: `npx wrangler d1 migrations apply iptv-manager --local`.
3. Crie `.dev.vars` com `ADMIN_PASSWORD`, `SESSION_SECRET`, `SYNC_TOKEN`, `GITHUB_TOKEN`, `GITHUB_REPOSITORY`, `GITHUB_WORKFLOW=validate.yml` e `GITHUB_BRANCH=main`.
4. Rode `npm run build` e depois `npx wrangler pages dev dist` para testar frontend e Pages Functions juntos. `npm run dev` inicia apenas o frontend Vite.
5. Instale dependências do validador: `python -m pip install -r requirements.txt`.
6. Rode os testes: `npm test` e `python -m unittest discover -s tests -v`.

Gere `SESSION_SECRET` e `SYNC_TOKEN` com valores aleatórios longos. Nunca versione `.dev.vars` ou tokens.

## Publicar gratuitamente

1. Crie um repositório GitHub e envie estes arquivos para a branch `main`.
2. Crie D1: `npx wrangler d1 create iptv-manager`.
3. Copie o `database_id` retornado para `wrangler.toml`.
4. Aplique o schema remoto: `npx wrangler d1 migrations apply iptv-manager --remote`.
5. Crie um projeto Cloudflare Pages conectado ao repositório. Use `npm run build` e `dist` como diretório de saída.
6. Cadastre `ADMIN_PASSWORD`, `SESSION_SECRET`, `SYNC_TOKEN`, `GITHUB_TOKEN`, `GITHUB_REPOSITORY`, `GITHUB_WORKFLOW=validate.yml` e `GITHUB_BRANCH=main` como variáveis/segredos do Pages Functions. Marque senhas e tokens como secrets.
7. Em GitHub Actions, crie secrets `APP_API_URL` com a URL HTTPS do Pages e `SYNC_TOKEN` com o mesmo token do Worker.
8. Crie token GitHub com permissão Actions: write no repositório. Armazene somente em `GITHUB_TOKEN` no Cloudflare.
9. Faça deploy pelo fluxo GitHub Actions/Cloudflare Pages. O workflow de validação também dispara a cada 6 horas e manualmente pelo painel.
10. Abra `/`, entre com a senha administrativa e cadastre fontes autorizadas. `https://SEU-DOMINIO/playlist.m3u` é a playlist HTTPS permanente.

Em Cloudflare, associe o D1 ao binding `DB` conforme `wrangler.toml`. Pages Functions precisa receber as mesmas variáveis em Production e Preview. Use credenciais diferentes para Preview.

## Operação

- Ações de fontes, histórico e canais exigem sessão HttpOnly assinada, expira em 8 horas e usa `SameSite=Strict`.
- O workflow busca fontes via `SYNC_TOKEN`, limita playlist a 10 MB, executa FFprobe com timeout de 12 s e no máximo 5 processos simultâneos.
- Falhas gerais no workflow não alteram D1. Uma fonte só substitui canais após parsing bem-sucedido; duas falhas consecutivas desativam a fonte e removem seus canais.
- Cada execução registra fontes processadas e verificações no D1.
- URLs EPG ficam associadas à fonte e são publicadas como `url-tvg` na M3U. O app não baixa nem transforma o conteúdo XMLTV.
- O painel mostra apenas dados persistidos. Estado vazio significa que ainda não há fontes validadas.

## Limitações conhecidas

- Publicação e operação real exigem credenciais externas de GitHub e Cloudflare; não foram configuradas aqui.
- O token GitHub precisa autorizar `workflow_dispatch` no próprio repositório.
- D1 gratuito e Actions gratuitos têm limites de uso impostos por cada plataforma.
- Canais offline continuam listados no painel; a remoção automática após duas falhas vale para fonte/playlists, não para um canal individual.
- A URL de playlist é pública e inclui apenas canais online.
