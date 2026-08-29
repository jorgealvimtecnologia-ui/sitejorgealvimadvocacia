# Jorge Alvim Advocacia — Website & Landing Page Institucional

Website institucional moderno, ágil e de alta performance desenvolvido para o escritório **Jorge Alvim Advocacia**.

---

## 🏛️ Tecnologias Utilizadas

- **Vite 6**: Ambiente de desenvolvimento ultrarrápido com Hot Module Replacement (HMR) e empacotamento otimizado.
- **Tailwind CSS 3**: Estilização com utilitários CSS modernos, design responsivo, cores nobres e efeitos de *glassmorphism*.
- **JavaScript Moderno (ES6+)**: Lógica interativa para menu mobile, formulário com integração direta ao WhatsApp, máscara de telefone brasileira e accordion de perguntas frequentes (FAQ).
- **SEO & OAB Ready**: Meta tags Open Graph completas para compartilhamento no WhatsApp/redes sociais, marcação Schema.org (`LegalService`) e conformidade com o Código de Ética da OAB.

---

## 📁 Estrutura de Arquivos

```
sitejorgealvimadvocacia/
├── index.html              # Estrutura semântica e seções do site
├── package.json            # Dependências e scripts
├── tailwind.config.js      # Paleta de cores jurídica e tipografia
├── postcss.config.js       # Autoprefixer e PostCSS
├── vite.config.js          # Configuração do Vite
├── public/
│   └── favicon.svg         # Favicon vetorial com símbolo da balança
├── src/
│   ├── css/
│   │   └── style.css       # Diretivas Tailwind e estilização refinada
│   └── js/
│       └── main.js         # Lógica do WhatsApp, menu mobile, FAQ e máscaras
└── dist/                   # Build final pronto para publicação
```

---

## 🚀 Como Executar o Projeto

### 1. Iniciar o Servidor de Desenvolvimento Local
```bash
npm run dev
```
O Vite iniciará o servidor local (geralmente em `http://localhost:3000` ou porta equivalente) com recarregamento em tempo real a cada alteração.

### 2. Gerar o Build de Produção
```bash
npm run build
```
Gera os arquivos otimizados, minificados e comprimidos na pasta `dist/`.

### 3. Testar a Versão de Produção Localmente
```bash
npm run preview
```

---

## ⚙️ Como Personalizar Dados de Contato e Textos

### 1. Alterar o Número do WhatsApp:
Abra o arquivo [src/js/main.js](file:///home/jorgealvim/Documents/sitejorgealvimadvocacia/src/js/main.js) e atualize a constante `whatsappNumber`:
```javascript
const SITE_CONFIG = {
  whatsappNumber: '5511999999999', // Substitua pelo DDD + Número (ex: 5511988887777)
  ...
};
```
*Dica: Você também pode substituir as ocorrências do link `wa.me/5511999999999` no [index.html](file:///home/jorgealvim/Documents/sitejorgealvimadvocacia/index.html).*

### 2. Alterar E-mail, Endereço e Textos:
Todos os textos, áreas de atuação e dados de contato estão centralizados de forma semântica e comentada no arquivo [index.html](file:///home/jorgealvim/Documents/sitejorgealvimadvocacia/index.html).

---

## 🌐 Como Publicar na Internet Gratuitamente

Você pode hospedar este site com certificado SSL grátis em serviços como:
- **Vercel**: Basta conectar o repositório Git ou rodar `npx vercel`.
- **Netlify**: Arraste e solte a pasta `dist` ou conecte via Git.
- **GitHub Pages**: Publicando a pasta `dist` no branch `gh-pages`.
- **Hospedagem Tradicional (cPanel / Hostinger / Locaweb / etc.)**: Basta enviar os arquivos gerados dentro de `dist/` para a pasta `public_html`.
