#!/usr/bin/env python3

import subprocess
import time
import re
import sys

def get_tunnel_url():
    print("🔍 Procurando URL do túnel Cloudflare...")
    
    # Inicia o cloudflared e captura a saída
    process = subprocess.Popen(
        ['cloudflared', 'tunnel', '--url', 'http://localhost:5000', '--no-autoupdate'],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        universal_newlines=True,
        bufsize=1
    )
    
    url_pattern = re.compile(r'https://[a-zA-Z0-9-]+\.trycloudflare\.com')
    
    start_time = time.time()
    timeout = 30  # 30 segundos de timeout
    
    try:
        for line in process.stdout:
            print(f"Log: {line.strip()}")
            
            match = url_pattern.search(line)
            if match:
                url = match.group(0)
                print("\n" + "="*50)
                print("🚀 APLICAÇÃO DISPONÍVEL PUBLICAMENTE!")
                print("="*50)
                print(f"\n📱 URL Pública: {url}")
                print(f"\n🎬 Video Generator App está pronto!")
                print(f"Acesse: {url}")
                print("\n" + "="*50)
                
                # Salva a URL em um arquivo
                with open('/tmp/tunnel-url.txt', 'w') as f:
                    f.write(url)
                
                # Mantém o processo rodando
                while True:
                    time.sleep(1)
                    
            if time.time() - start_time > timeout:
                print("⏱️ Timeout ao procurar URL do túnel")
                break
                
    except KeyboardInterrupt:
        print("\n⛔ Túnel interrompido pelo usuário")
        process.terminate()
        sys.exit(0)
    except Exception as e:
        print(f"❌ Erro: {e}")
        process.terminate()
        sys.exit(1)

if __name__ == "__main__":
    get_tunnel_url()