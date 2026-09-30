"""
Teste automatizado para verificar:
1. Login com credenciais válidas.
2. Bloqueio por Rate Limiting (429) no Login após 5 tentativas por minuto.
3. Obtenção do usuário autenticado (/api/auth/me).
"""
import sys
import os
import requests

# Test with FastAPI TestClient
from fastapi.testclient import TestClient
from main import app
from rate_limiter import limiter

client = TestClient(app)

def run_tests():
    print("\n--- TESTE 1: Login Válido ---")
    res = client.post("/api/auth/login", json={"email": "admin@viraldog.com", "password": "admin123"})
    print(f"Status: {res.status_code}")
    data = res.json()
    assert res.status_code == 200, f"Falha no login: {data}"
    assert "access_token" in data, "access_token não encontrado"
    token = data["access_token"]
    print(f"Token JWT recebido: {token[:20]}... | Usuário: {data['user']}")

    print("\n--- TESTE 2: /api/auth/me com Token ---")
    res_me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    print(f"Status: {res_me.status_code}")
    me_data = res_me.json()
    assert res_me.status_code == 200
    assert me_data["email"] == "admin@viraldog.com"
    print(f"Dados /me: {me_data}")

    print("\n--- TESTE 3: Força Bruta & Rate Limiting no Login (429) ---")
    # Reset limiter for testclient IP
    limiter._requests.clear()
    
    # Executar 5 tentativas erradas
    for i in range(1, 6):
        res_fail = client.post("/api/auth/login", json={"email": "admin@viraldog.com", "password": f"wrong_{i}"})
        print(f"Tentativa {i}: Status {res_fail.status_code}")
        assert res_fail.status_code == 401

    # A 6ª tentativa DEVE ser bloqueada com 429 Too Many Requests
    res_block = client.post("/api/auth/login", json={"email": "admin@viraldog.com", "password": "wrong_6"})
    print(f"Tentativa 6 (Bloqueada): Status {res_block.status_code}")
    print(f"Resposta 429: {res_block.json()}")
    assert res_block.status_code == 429, f"Esperado 429, recebido {res_block.status_code}"
    assert "Retry-After" in res_block.headers
    print(f"Cabeçalho Retry-After: {res_block.headers.get('Retry-After')}s")

    print("\n🎉 TODOS OS TESTES DE AUTENTICAÇÃO E RATE LIMITING PASSARAM COM SUCESSO!\n")

if __name__ == "__main__":
    run_tests()
