# IPTV Manager

Painel React/Vite entregue por Cloudflare Workers Static Assets. Um Worker atende API e playlist M3U; Cloudflare D1 guarda fontes, canais e histórico. GitHub Actions roda Python/FFprobe; nenhum token administrativo vai ao navegador.

## Requisitos

- Node.js 20 ou superior e npm
- Python 3.12 para validar localmente
- Conta gratuita Cloudflare e repositório GitHub
- FFmpeg/FFprobe apenas para executar o validador fora do GitHub Actions
- Fontes de transmissão e XMLTV que você tenha autorização para usar

## Executar localmente

1. Instale dependências: `npm install`.
2. Crie banco local: `npx wrangler d1 migrations apply iptv --local`.
3. Crie `.dev.vars` com `ADMIN_PASSWORD`, `SESSION_SECRET`, `SYNC_TOKEN`, `GITHUB_TOKEN`, `GITHUB_REPOSITORY`, `GITHUB_WORKFLOW=validate.yml` e `GITHUB_BRANCH=main`.
4. Rode `npm run dev:worker` para testar frontend, Worker e D1 local juntos. `npm run dev` inicia apenas o Vite.
5. Instale dependências do validador: `python -m pip install -r requirements.txt`.
6. Rode os testes: `npm test` e `python -m unittest discover -s tests -v`.

Gere `SESSION_SECRET` e `SYNC_TOKEN` com valores aleatórios longos. Nunca versione `.dev.vars` ou tokens.

## Publicar gratuitamente

1. Crie um repositório GitHub e envie estes arquivos para a branch `main`.
2. Crie D1: `npx wrangler d1 create iptv-manager`.
3. Copie o `database_id` retornado para `wrangler.toml`.
4. Aplique o schema remoto: `npx wrangler d1 migrations apply iptv-manager --remote`.
5. Conecte o repositório em Workers & Pages > Workers > Create application > Connect to Git.
6. Configure Build command `npm run build` e Deploy command `npx wrangler deploy`. `wrangler.toml` aponta para Worker e `dist` como Static Assets.
7. Crie D1: `npx wrangler d1 create iptv`. Copie o `database_id` retornado para `wrangler.toml` e aplique o schema: `npx wrangler d1 migrations apply iptv --remote`.
8. Configure secrets do Worker: `ADMIN_PASSWORD`, `SESSION_SECRET`, `SYNC_TOKEN` e `GITHUB_TOKEN`. Configure `GITHUB_REPOSITORY`, `GITHUB_WORKFLOW=validate.yml` e `GITHUB_BRANCH=main` como variáveis. Use Cloudflare Worker Settings ou `npx wrangler secret put NOME` para cada secret.
9. Em GitHub Actions, crie secrets `APP_API_URL` com a URL HTTPS `workers.dev` do Worker e `SYNC_TOKEN` com o mesmo token do Worker. O token GitHub precisa de Actions: write no repositório. O workflow roda a cada 6 horas e também pelo painel.
10. Abra a URL HTTPS do Worker, entre e cadastre fontes autorizadas. Playlist permanente: `https://SEU-WORKER.workers.dev/playlist.m3u`.

O binding D1 `DB`, o Worker entry point e Static Assets vêm de `wrangler.toml`. O comando de deploy é `npx wrangler deploy`; não use `wrangler pages deploy`.

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
