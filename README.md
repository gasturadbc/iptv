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

1. Crie um repositório GitHub e envie os arquivos para a branch `main`.
2. Confirme no painel Cloudflare que o D1 `iptv` corresponde ao `database_id` configurado em `wrangler.toml`.
3. Faça login no Wrangler com `npx wrangler login`. Confira as migrações pendentes com `npx wrangler d1 migrations list iptv --remote`; se `0001_init.sql` estiver pendente, aplique com `npx wrangler d1 migrations apply iptv --remote`.
4. No Cloudflare, conecte o repositório existente ao Worker `iptv-manager` em Workers & Pages > selecione o Worker > Settings > Builds. O nome do Worker precisa corresponder a `name` em `wrangler.toml`.
5. Em Settings > Builds, use Root directory `/`, Build command `npm run build` e Deploy command `npx wrangler deploy`. O token de build padrão do Cloudflare autoriza o deploy; mantenha-o habilitado.
6. Em Worker > Settings > Variables and Secrets, adicione `ADMIN_PASSWORD`, `SESSION_SECRET`, `SYNC_TOKEN` e `GITHUB_TOKEN` como secrets. Adicione `GITHUB_REPOSITORY` como variável no formato `dono/repositorio`. `GITHUB_WORKFLOW` e `GITHUB_BRANCH` já estão no `wrangler.toml`.
7. No GitHub, abra Settings > Secrets and variables > Actions. Crie `APP_API_URL` com a URL HTTPS `workers.dev` do Worker e `SYNC_TOKEN` com o mesmo valor salvo no Worker. O token salvo em `GITHUB_TOKEN` precisa de Actions: write no repositório.
8. Em Workers Builds, execute Retry build ou envie novo commit para a branch conectada. Depois que o Worker publicar, abra a URL HTTPS, entre e cadastre fontes autorizadas. Playlist permanente: `https://SEU-WORKER.workers.dev/playlist.m3u`.

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
