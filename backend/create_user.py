"""
ViralDog CLI — Gerenciador de Usuários e Licenças de Clientes.

Uso:
    python create_user.py add <email> <senha> [nome] [--admin]
    python create_user.py list
    python create_user.py toggle <email>
    python create_user.py reset-pass <email> <nova_senha>
    python create_user.py delete <email>

Exemplos:
    python create_user.py add cliente@empresa.com 123456 "Cliente VIP"
    python create_user.py add novo_admin@empresa.com admin123 "Admin Secundario" --admin
    python create_user.py list
    python create_user.py toggle cliente@empresa.com
"""
import sys
import os
import hashlib
import secrets

# Forçar stdout UTF-8 no Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Adicionar diretório atual ao path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import SessionLocal, User, init_db


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    pw_hash = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), 100000).hex()
    return f"{salt}:{pw_hash}"


def add_user(email: str, password: str, name: str = None, is_admin: bool = False):
    init_db()
    db = SessionLocal()
    try:
        email = email.strip().lower()
        if not email or "@" not in email:
            print(f"❌ Erro: E-mail inválido '{email}'.")
            return
        if len(password) < 6:
            print("❌ Erro: A senha deve ter pelo menos 6 caracteres.")
            return

        existing = db.query(User).filter(User.email == email).first()
        if existing:
            print(f"⚠️ Atenção: O usuário com e-mail '{email}' já existe (ID: {existing.id}).")
            return

        user = User(
            email=email,
            password_hash=hash_password(password),
            name=name or email.split("@")[0],
            role="admin" if is_admin else "user",
            is_active=True
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        print(f"✅ Usuário criado com sucesso!")
        print(f"   ID: {user.id}")
        print(f"   Nome: {user.name}")
        print(f"   E-mail: {user.email}")
        print(f"   Tipo: {'👑 Administrador' if user.role == 'admin' else '👤 Cliente/Usuário'}")
        print(f"   Status: {'🟢 Ativo' if user.is_active else '🔴 Desativado'}")
    finally:
        db.close()


def list_users():
    init_db()
    db = SessionLocal()
    try:
        users = db.query(User).order_by(User.id.asc()).all()
        if not users:
            print("ℹ️ Nenhum usuário cadastrado no banco de dados.")
            return

        print("\n" + "=" * 70)
        print(f"{'ID':<4} | {'NOME':<22} | {'E-MAIL':<25} | {'TIPO':<7} | {'STATUS'}")
        print("-" * 70)
        for u in users:
            role_badge = "Admin" if u.role == "admin" else "User"
            status_badge = "🟢 Ativo" if u.is_active else "🔴 Inativo"
            print(f"{u.id:<4} | {(u.name or ''):<22} | {u.email:<25} | {role_badge:<7} | {status_badge}")
        print("=" * 70 + "\n")
    finally:
        db.close()


def toggle_user(email: str):
    init_db()
    db = SessionLocal()
    try:
        email = email.strip().lower()
        user = db.query(User).filter(User.email == email).first()
        if not user:
            print(f"❌ Erro: Usuário '{email}' não encontrado.")
            return

        user.is_active = not user.is_active
        db.commit()
        print(f"✅ Status do usuário '{user.email}' alterado para: {'🟢 Ativo' if user.is_active else '🔴 Desativado'}")
    finally:
        db.close()


def reset_password(email: str, new_password: str):
    init_db()
    db = SessionLocal()
    try:
        email = email.strip().lower()
        if len(new_password) < 6:
            print("❌ Erro: A senha deve ter pelo menos 6 caracteres.")
            return
        user = db.query(User).filter(User.email == email).first()
        if not user:
            print(f"❌ Erro: Usuário '{email}' não encontrado.")
            return

        user.password_hash = hash_password(new_password)
        db.commit()
        print(f"✅ Senha do usuário '{user.email}' redefinida com sucesso!")
    finally:
        db.close()


def delete_user(email: str):
    init_db()
    db = SessionLocal()
    try:
        email = email.strip().lower()
        user = db.query(User).filter(User.email == email).first()
        if not user:
            print(f"❌ Erro: Usuário '{email}' não encontrado.")
            return

        db.delete(user)
        db.commit()
        print(f"🗑️ Usuário '{email}' excluído permanentemente.")
    finally:
        db.close()


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args or args[0] in ("-h", "--help", "help"):
        print(__doc__)
        sys.exit(0)

    cmd = args[0].lower()

    if cmd == "list":
        list_users()

    elif cmd == "add":
        if len(args) < 3:
            print("❌ Uso: python create_user.py add <email> <senha> [nome] [--admin]")
            sys.exit(1)
        email = args[1].strip("'\"")
        password = args[2].strip("'\"")
        is_admin = any(a in ("--admin", "-admin", "admin") for a in args[3:])
        # Nome opcional
        name_parts = [a.strip("'\"\\ ") for a in args[3:] if a not in ("--admin", "-admin", "admin")]
        name = " ".join([p for p in name_parts if p]) if name_parts else None
        add_user(email, password, name, is_admin)

    elif cmd == "toggle":
        if len(args) < 2:
            print("❌ Uso: python create_user.py toggle <email>")
            sys.exit(1)
        toggle_user(args[1])

    elif cmd == "reset-pass":
        if len(args) < 3:
            print("❌ Uso: python create_user.py reset-pass <email> <nova_senha>")
            sys.exit(1)
        reset_password(args[1], args[2])

    elif cmd == "delete":
        if len(args) < 2:
            print("❌ Uso: python create_user.py delete <email>")
            sys.exit(1)
        delete_user(args[1])

    else:
        print(f"❌ Comando desconhecido '{cmd}'. Digite 'python create_user.py --help' para ver o manual.")
