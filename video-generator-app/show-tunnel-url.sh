#!/bin/bash

echo "🔍 Buscando URL do túnel Cloudflare..."

# Mata processos anteriores
pkill -f "cloudflared tunnel" 2>/dev/null

# Inicia novo túnel e captura saída
cloudflared tunnel --url http://localhost:5000 --no-autoupdate 2>&1 | while IFS= read -r line; do
    echo "$line"
    if [[ "$line" == *"https://"*".trycloudflare.com"* ]]; then
        url=$(echo "$line" | grep -oP 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' | head -1)
        if [ ! -z "$url" ]; then
            echo ""
            echo "============================================"
            echo "🎉 URL PÚBLICA ENCONTRADA!"
            echo "============================================"
            echo ""
            echo "🌐 LINK: $url"
            echo ""
            echo "============================================"
            echo "$url" > /tmp/public-url.txt
            break
        fi
    fi
done &

# Aguarda um pouco e mostra a URL
sleep 8
if [ -f /tmp/public-url.txt ]; then
    url=$(cat /tmp/public-url.txt)
    echo ""
    echo "============================================"
    echo "📱 ACESSE SUA APLICAÇÃO EM:"
    echo ""
    echo "   $url"
    echo ""
    echo "============================================"
else
    echo "⏳ Aguarde mais alguns segundos para obter a URL..."
fi

# Mantém o script rodando
wait