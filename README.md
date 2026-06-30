# Nossos gastos

App de controle de gastos do cartão de crédito, compartilhado entre duas pessoas.

Este projeto já está conectado ao seu projeto Firebase ("nossos-gastos-7dc8f") e pronto
para ser publicado no [Vercel](https://vercel.com) (plano gratuito).

---

## O que tem aqui dentro

- `src/App.jsx` — o aplicativo (interface, categorias, formas de pagamento, metas semanais, caixinha, etc.)
- `src/firebase.js` — conexão com o seu projeto Firebase (já configurada com suas chaves)
- `public/manifest.json` — permite criar um ícone na tela inicial do celular que abre o app direto

---

## Passo 1 — Ativar o Firestore no seu projeto Firebase (se ainda não fez)

1. Acesse **https://console.firebase.google.com** e abra o projeto **"nossos-gastos"**
2. No menu lateral, vá em **"Build" → "Firestore Database"**
3. Clique em **"Create database"**
   - Escolha uma localização (ex: `southamerica-east1`, mais perto do Brasil)
   - Escolha **"Start in production mode"**
4. Vá na aba **"Rules"** (Regras) e troque o conteúdo por:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /nossosGastos/{docId} {
         allow read, write: if true;
       }
     }
   }
   ```
   Clique em **"Publish"**.

   > ⚠️ Essa regra deixa os dados abertos para **qualquer pessoa que souber o endereço do seu projeto Firebase** ler ou escrever — não é exatamente público na internet (não tem como alguém "achar" por acaso), mas não é protegido por senha. Para o uso entre você e sua esposa, é uma simplificação aceitável. Se um dia quiser mais segurança, dá pra adicionar login (Firebase Authentication) — me chame se quiser isso depois.

---

## Passo 2 — Publicar o projeto no Vercel

Como as chaves do Firebase já estão dentro do código, **não é preciso configurar nenhuma variável de ambiente** — só publicar.

1. Crie uma conta gratuita em **https://vercel.com/signup**

### Opção A — Pelo site do GitHub (sem usar terminal)

1. Crie uma conta gratuita em **https://github.com/signup** (se ainda não tiver)
2. Crie um repositório novo (botão verde **"New"** em github.com)
3. Faça upload de **todos os arquivos desta pasta** para esse repositório (arraste os arquivos na página do GitHub, em "Add file" → "Upload files")
4. No site do Vercel, clique em **"Add New..." → "Project"**
5. Escolha **"Import"** no repositório que você criou
6. Clique em **"Deploy"** (pode deixar tudo no padrão)

### Opção B — Usando o terminal (se você tem um computador com Node.js instalado)

1. Descompacte este ZIP em uma pasta
2. Abra o terminal nessa pasta e rode:
   ```
   npm install -g vercel
   vercel
   ```
3. Siga as perguntas na tela (pode aceitar todas as opções padrão)

---

## Passo 3 — Testar

1. No painel do Vercel, copie a URL do projeto (algo como `https://nossos-gastos-seu-nome.vercel.app`)
2. Abra essa URL no celular
3. Lance um gasto de teste
4. Abra a mesma URL em outro celular (ou peça pra sua esposa abrir) — o gasto deve aparecer lá também **quase na hora** (o Firebase sincroniza em tempo real)

---

## Passo 4 — Adicionar à tela inicial do Android

1. Abra a URL do app no **Chrome**
2. Toque nos três pontinhos (⋮) → **"Adicionar à tela inicial"** (ou "Instalar app")
3. Confirme

Como esse projeto já tem a configuração certa (`manifest.json` com `start_url` apontando para a própria página do app), o ícone deve abrir direto no app, sem cair em nenhuma outra tela.

---

## Dúvidas comuns

**"O app abre, mas dá erro ou não salva nada"**
→ Confira se você criou o banco de dados Firestore e publicou as Regras (Passo 1). Esse é o único pré-requisito fora do Vercel.

**"Quero mudar alguma coisa no app depois"**
→ Edite o arquivo `src/App.jsx`, suba a alteração de novo pro GitHub (ou rode `vercel` de novo no terminal), e o Vercel atualiza o site automaticamente.

**Custo**
→ O plano gratuito do Firebase (Spark) e o plano gratuito do Vercel são suficientes para esse uso pessoal de duas pessoas, com bastante margem.
