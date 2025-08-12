#!/bin/bash

echo "Starting Cloudflare Tunnel..."
cloudflared tunnel --url http://localhost:5000 2>&1 | while read line; do
    echo "$line"
    if [[ $line == *"https://"*"trycloudflare.com"* ]]; then
        url=$(echo "$line" | grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com')
        echo ""
        echo "=========================================="
        echo "🚀 Application is now publicly accessible!"
        echo "=========================================="
        echo ""
        echo "📱 Public URL: $url"
        echo ""
        echo "🎬 Video Generator App is ready!"
        echo "Access the app at: $url"
        echo ""
        echo "=========================================="
        echo "$url" > /tmp/tunnel-url.txt
    fi
done