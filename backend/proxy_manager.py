"""
Proxy manager — Per-account proxy rotation and health checking.
Ensures each Instagram account uses its own dedicated proxy to avoid IP bans.
"""
import time
import requests
from sqlalchemy.orm import Session
from database import Account


def get_proxy_for_account(db: Session, account_username: str) -> str:
    """Get the configured proxy URL for a specific account."""
    if not account_username:
        return None
    acc = db.query(Account).filter(Account.username == account_username).first()
    if acc and acc.proxy_url:
        return acc.proxy_url
    return None


def set_proxy_for_account(db: Session, account_username: str, proxy_url: str):
    """Set or update the proxy for an account."""
    acc = db.query(Account).filter(Account.username == account_username).first()
    if not acc:
        raise ValueError(f"Conta @{account_username} não encontrada.")
    acc.proxy_url = proxy_url
    db.commit()


def test_proxy(proxy_url: str, timeout: int = 10) -> dict:
    """
    Test if a proxy is working and measure its latency.
    Returns {working, ip, latency_ms, error}.
    """
    if not proxy_url:
        return {"working": False, "ip": None, "latency_ms": None, "error": "Nenhum proxy configurado."}
    
    proxies = {
        "http": proxy_url,
        "https": proxy_url
    }
    
    try:
        start = time.time()
        response = requests.get(
            "https://api.ipify.org?format=json",
            proxies=proxies,
            timeout=timeout
        )
        latency = round((time.time() - start) * 1000)
        
        if response.status_code == 200:
            data = response.json()
            return {
                "working": True,
                "ip": data.get("ip", "unknown"),
                "latency_ms": latency,
                "error": None
            }
        else:
            return {
                "working": False,
                "ip": None,
                "latency_ms": latency,
                "error": f"HTTP {response.status_code}"
            }
    except requests.exceptions.ProxyError as e:
        return {"working": False, "ip": None, "latency_ms": None, "error": f"Erro de proxy: {str(e)[:100]}"}
    except requests.exceptions.ConnectTimeout:
        return {"working": False, "ip": None, "latency_ms": None, "error": "Timeout de conexão."}
    except Exception as e:
        return {"working": False, "ip": None, "latency_ms": None, "error": str(e)[:100]}


def apply_proxy_to_session(session: requests.Session, proxy_url: str):
    """Apply proxy settings to a requests.Session object."""
    if proxy_url:
        session.proxies = {
            "http": proxy_url,
            "https": proxy_url
        }


def test_all_account_proxies(db: Session) -> list:
    """Test proxies for all accounts that have one configured."""
    accounts = db.query(Account).filter(Account.proxy_url.isnot(None)).all()
    results = []
    for acc in accounts:
        result = test_proxy(acc.proxy_url)
        result["username"] = acc.username
        result["proxy_url"] = acc.proxy_url
        results.append(result)
    return results
