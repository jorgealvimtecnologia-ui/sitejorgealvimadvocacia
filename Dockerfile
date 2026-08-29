# Imagem oficial do Node.js 22 (Alpine Linux - leve, segura e rápida)
FROM node:22-alpine

# Diretório de trabalho dentro do contêiner
WORKDIR /app

# Copia os arquivos de dependências
COPY package*.json ./

# Instala dependências necessárias para o build e execução
RUN npm install

# Copia todo o código-fonte da aplicação
COPY . .

# Compila os arquivos estáticos com Vite e Tailwind CSS
RUN npm run build

# Garante que a pasta de armazenamento de ficheiros exista
RUN mkdir -p /app/storage/clients

# Expõe a porta 3000
EXPOSE 3000

# Variáveis de ambiente
ENV NODE_ENV=production
ENV PORT=3000

# Inicia o servidor Node.js
CMD ["npm", "start"]
