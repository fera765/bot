# Video Generator App 🎬

Um aplicativo Node.js para gerar vídeos automaticamente com animações de fundo dinâmicas e diálogos estilo chat (WhatsApp/TikTok).

## 🚀 Características

- ✨ Geração automática de vídeos em 1080p
- 💬 Interface de chat estilo WhatsApp/TikTok
- 🎨 Múltiplos fundos animados (Minecraft, Espaço, Cidade)
- 📱 Interface web moderna e responsiva
- 📤 Upload de JSON ou formulário interativo
- 🎥 Visualização e download de vídeos gerados
- ⚡ Processamento assíncrono com feedback em tempo real

## 📋 Pré-requisitos

- Node.js (v18+ recomendado)
- FFmpeg instalado no sistema
- Dependências do sistema para Canvas:
  ```bash
  sudo apt-get install -y libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev libpixman-1-dev pkg-config
  ```

## 🛠️ Instalação

1. Clone o repositório:
```bash
git clone <repository-url>
cd video-generator-app
```

2. Instale as dependências:
```bash
npm install
```

3. Configure as variáveis de ambiente (opcional):
```bash
cp .env.example .env
# Edite o arquivo .env conforme necessário
```

4. Inicie o servidor:
```bash
# Modo desenvolvimento
npm run dev

# Modo produção
npm start
```

5. Acesse a aplicação:
```
http://localhost:5000
```

## 📖 Como Usar

### 1. Via Interface Web

1. Acesse `http://localhost:5000`
2. Escolha um método de entrada:
   - **Colar JSON**: Cole diretamente o JSON no campo de texto
   - **Upload Arquivo**: Faça upload de um arquivo .json
   - **Formulário**: Preencha o formulário interativo

3. Clique em "Gerar Vídeo"
4. Aguarde o processamento
5. Assista ou baixe o vídeo gerado

### 2. Estrutura do JSON

```json
{
  "title": "Título do Vídeo",
  "background": "minecraft",
  "dialogues": [
    {
      "speaker": "João",
      "message": "Olá! Como você está?",
      "image": "https://example.com/image.jpg"
    },
    {
      "speaker": "Maria",
      "message": "Estou bem, obrigada!"
    }
  ]
}
```

#### Campos:
- `title` (string): Título do vídeo
- `background` (string): Tipo de fundo animado
  - Opções: `minecraft`, `space`, `cityscape`, `default`
- `dialogues` (array): Lista de diálogos
  - `speaker` (string): Nome do remetente
  - `message` (string): Texto da mensagem
  - `image` (string, opcional): URL de uma imagem para incluir

## 🏗️ Estrutura do Projeto

```
video-generator-app/
├── src/
│   ├── server.js           # Servidor Express principal
│   ├── controllers/        # Controladores da API
│   ├── services/          # Lógica de negócios
│   ├── routes/            # Definição de rotas
│   └── utils/             # Utilitários
├── client/                # Frontend
│   ├── index.html         # Página principal
│   ├── styles.css         # Estilos
│   └── app.js            # JavaScript do cliente
├── public/               # Arquivos estáticos
│   ├── uploads/          # Arquivos JSON enviados
│   └── videos/           # Vídeos gerados
├── temp/                 # Arquivos temporários
├── package.json          # Dependências
├── .env                  # Configurações
└── README.md            # Documentação
```

## 🔧 API Endpoints

### POST `/api/videos/generate`
Gera um vídeo a partir de JSON no corpo da requisição.

**Body:**
```json
{
  "title": "string",
  "background": "string",
  "dialogues": [...]
}
```

**Response:**
```json
{
  "message": "Video generation started",
  "jobId": "uuid",
  "statusUrl": "/api/videos/status/{jobId}"
}
```

### POST `/api/videos/generate-from-file`
Gera um vídeo a partir de arquivo JSON enviado.

**Form Data:**
- `jsonFile`: Arquivo JSON

### GET `/api/videos/status/{jobId}`
Verifica o status de geração de um vídeo.

**Response:**
```json
{
  "status": "processing|completed|failed",
  "progress": 50,
  "filename": "video_xxx.mp4",
  "url": "/videos/video_xxx.mp4"
}
```

### GET `/api/videos/list`
Lista todos os vídeos gerados.

### GET `/api/videos/download/{filename}`
Baixa um vídeo específico.

### DELETE `/api/videos/{filename}`
Deleta um vídeo.

## ⚙️ Configuração

### Variáveis de Ambiente (.env)

```env
PORT=5000                          # Porta do servidor
NODE_ENV=development               # Ambiente (development/production)
MAX_FILE_SIZE=10485760            # Tamanho máximo de upload (10MB)
VIDEO_OUTPUT_DIR=public/videos    # Diretório de saída dos vídeos
UPLOAD_DIR=public/uploads         # Diretório de uploads
TEMP_DIR=temp                     # Diretório temporário
```

## 🎨 Personalização

### Adicionar Novos Fundos

Edite `src/services/videoService.js`:

```javascript
const gradients = {
  minecraft: ['#87CEEB', '#98D98E', '#90EE90'],
  space: ['#000428', '#004e92', '#1a1a2e'],
  cityscape: ['#141E30', '#243B55', '#2C5F7C'],
  // Adicione seu novo fundo aqui
  custom: ['#color1', '#color2', '#color3']
};
```

### Modificar Estilo do Chat

Edite a função `drawChatInterface` em `src/services/videoService.js` para personalizar:
- Cores das mensagens
- Fontes
- Layout
- Animações

## 🚨 Solução de Problemas

### Erro de instalação do Canvas
```bash
# Instale as dependências do sistema
sudo apt-get update
sudo apt-get install -y build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev libpixman-1-dev pkg-config
```

### FFmpeg não encontrado
```bash
# Ubuntu/Debian
sudo apt-get install ffmpeg

# macOS
brew install ffmpeg

# Windows
# Baixe de https://ffmpeg.org/download.html
```

### Porta já em uso
```bash
# Mude a porta no arquivo .env
PORT=3000
```

## 📝 Scripts NPM

- `npm start` - Inicia o servidor em produção
- `npm run dev` - Inicia o servidor em desenvolvimento (com hot reload)
- `npm test` - Executa testes (não implementado)

## 🤝 Contribuindo

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob a licença ISC.

## 👥 Autores

- Desenvolvido com ❤️ usando Node.js, Canvas e FFmpeg

## 🙏 Agradecimentos

- [FFmpeg](https://ffmpeg.org/) - Processamento de vídeo
- [node-canvas](https://github.com/Automattic/node-canvas) - Renderização de frames
- [Express.js](https://expressjs.com/) - Framework web

## 📞 Suporte

Para suporte, abra uma issue no GitHub ou entre em contato.

---

**Nota:** Este é um projeto educacional. Use responsavelmente e respeite os direitos autorais ao usar imagens e conteúdo de terceiros.