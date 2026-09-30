"""
Rate Limiter em memória com janela deslizante (Sliding Window).
Thread-safe, leve e sem dependências externas (como Redis).
"""
import time
import threading
from typing import Tuple, Dict, List
from fastapi import Request, HTTPException


class SlidingWindowRateLimiter:
    def __init__(self):
        self._lock = threading.Lock()
        # {key: [timestamp1, timestamp2, ...]}
        self._requests: Dict[str, List[float]] = {}
        self._last_cleanup = time.time()

    def _cleanup_old_keys(self, now: float, max_age: float = 300.0):
        """Limpa chaves sem atividade nos últimos 5 minutos para economizar memória."""
        if now - self._last_cleanup < 60.0:
            return
        keys_to_delete = []
        for key, timestamps in self._requests.items():
            valid_timestamps = [t for t in timestamps if now - t < max_age]
            if not valid_timestamps:
                keys_to_delete.append(key)
            else:
                self._requests[key] = valid_timestamps
        for key in keys_to_delete:
            self._requests.pop(key, None)
        self._last_cleanup = now

    def check(self, key: str, max_requests: int, window_seconds: int) -> Tuple[bool, int, int]:
        """
        Verifica se a requisição é permitida.
        Retorna:
            - allowed (bool): True se permitida, False se bloqueada.
            - retry_after (int): Segundos restantes para desbloqueio (se bloqueada).
            - remaining (int): Quantidade de requisições restantes na janela.
        """
        now = time.time()
        with self._lock:
            self._cleanup_old_keys(now)
            timestamps = self._requests.get(key, [])
            # Filtrar apenas timestamps dentro da janela atual
            cutoff = now - window_seconds
            valid_timestamps = [t for t in timestamps if t > cutoff]

            if len(valid_timestamps) >= max_requests:
                # Bloqueado: tempo para a requisição mais antiga expirar
                oldest = valid_timestamps[0]
                retry_after = max(1, int(oldest + window_seconds - now))
                self._requests[key] = valid_timestamps
                return False, retry_after, 0

            # Permitido: registra timestamp atual
            valid_timestamps.append(now)
            self._requests[key] = valid_timestamps
            remaining = max_requests - len(valid_timestamps)
            return True, 0, remaining


# Instância global do Rate Limiter
limiter = SlidingWindowRateLimiter()


def get_client_ip(request: Request) -> str:
    """Extrai o IP real do cliente, respeitando headers de proxy (CF-Connecting-IP, X-Forwarded-For)."""
    cf_ip = request.headers.get("CF-Connecting-IP")
    if cf_ip:
        return cf_ip.strip()
    
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        # Pega o primeiro IP da lista de proxies
        return forwarded.split(",")[0].strip()
    
    if request.client and request.client.host:
        return request.client.host
    
    return "127.0.0.1"
