import os
import sys
import json
from datetime import datetime
# pyrefly: ignore [missing-import]
from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, Float, Boolean, ForeignKey
# pyrefly: ignore [missing-import]
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship


def _get_app_data_dir() -> str:
    """Retorna o diretório de dados persistente do app.

    - Packaged (PyInstaller): %APPDATA%\\ViralDog\\
    - Dev: pasta do próprio backend/
    """
    if getattr(sys, "frozen", False):
        # Rodando como executável PyInstaller
        base = os.environ.get("APPDATA", os.path.expanduser("~"))
        app_dir = os.path.join(base, "ViralDog")
    else:
        # Modo desenvolvimento
        app_dir = os.path.dirname(os.path.abspath(__file__))
    os.makedirs(app_dir, exist_ok=True)
    return app_dir


def _get_downloads_base() -> str:
    """Retorna a pasta raiz onde os vídeos do usuário são salvos.

    - Packaged: %APPDATA%\\ViralDog\\downloads\\
    - Dev: <workspace_root>\\downloads\\
    """
    if getattr(sys, "frozen", False):
        base = os.path.join(_get_app_data_dir(), "downloads")
    else:
        # Dois níveis acima do backend/ → raiz do projeto
        base = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "downloads")
    os.makedirs(base, exist_ok=True)
    return base


APP_DATA_DIR = _get_app_data_dir()

DATABASE_URL = os.getenv("DATABASE_URL")
if DATABASE_URL:
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    engine = create_engine(DATABASE_URL)
else:
    DB_PATH = os.getenv("DATABASE_PATH", os.path.join(APP_DATA_DIR, "database.db"))
    os.makedirs(os.path.dirname(os.path.abspath(DB_PATH)), exist_ok=True)
    engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# ─── Core Models ───

class Account(Base):
    __tablename__ = "accounts"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    session_cookies = Column(Text, nullable=True)  # JSON string of cookies
    status = Column(String, default="active")  # active, expired, invalid
    created_at = Column(DateTime, default=datetime.utcnow)
    # Per-account isolation fields
    proxy_url = Column(String, nullable=True)  # Dedicated proxy for this account
    fb_access_token = Column(Text, nullable=True)  # Individual Graph API token
    fb_ig_account_id = Column(String, nullable=True)  # Individual IG business account ID
    notes = Column(Text, nullable=True)  # Notes about the account
    tags = Column(Text, nullable=True)  # Comma-separated profile tags
    platform = Column(String, default="instagram")  # Platform for this account (instagram, tiktok, etc.)
    display_name = Column(String, nullable=True)  # Custom display name for the account
    avatar_url = Column(String, nullable=True)  # Local path or URL to profile avatar image
    folder = Column(String, nullable=True, default="Geral")  # Folder/Group name for account organization
    last_opened_at = Column(DateTime, nullable=True)  # Last time profile was opened
    token_expires_at = Column(DateTime, nullable=True)  # Expiration date of the OAuth long-lived access token
    auth_mode = Column(String, default="cookie")  # "official" (OAuth Instagram Login) or "cookie" (instagrapi/web session)
    instagram_user_id = Column(String, nullable=True)  # Instagram Login App-Scoped User ID (IG User ID)
    
    # Relationships
    profile = relationship("AccountProfile", back_populates="account", uselist=False)

class Post(Base):
    __tablename__ = "posts"
    
    id = Column(Integer, primary_key=True, index=True)
    original_url = Column(String, nullable=True)
    video_path = Column(String, nullable=False)
    caption = Column(Text, nullable=True)
    scheduled_time = Column(DateTime, nullable=False)
    status = Column(String, default="pending")  # pending, processing, posted, failed
    ig_media_id = Column(String, nullable=True)
    error_message = Column(Text, nullable=True)
    account_username = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    # New fields
    post_type = Column(String, default="reel")  # reel, carousel, story
    is_repost = Column(Boolean, default=False)
    original_post_id = Column(Integer, ForeignKey("posts.id"), nullable=True)
    cross_post_targets = Column(Text, nullable=True)  # JSON array: ["tiktok", "youtube"]
    engagement_score = Column(Float, nullable=True)
    # Carousel-specific
    carousel_image_paths = Column(Text, nullable=True)  # JSON array of image paths
class Config(Base):
    __tablename__ = "configs"
    
    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, index=True, nullable=False)
    value = Column(Text, nullable=False)


class TemplateLibrary(Base):
    """Locally persisted editor templates and their detected video slot."""
    __tablename__ = "template_library"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    file_path = Column(Text, nullable=False)
    thumbnail_path = Column(Text, nullable=False)
    width = Column(Integer, nullable=False)
    height = Column(Integer, nullable=False)
    hole_x = Column(Integer, nullable=False)
    hole_y = Column(Integer, nullable=False)
    hole_width = Column(Integer, nullable=False)
    hole_height = Column(Integer, nullable=False)
    has_alpha = Column(Boolean, default=False, nullable=False)
    origin = Column(String, default="uploaded", nullable=False)
    extra_config = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

# ─── Download & Deduplication ───

class DownloadedVideo(Base):
    """Tracks all downloaded videos for deduplication and history."""
    __tablename__ = "downloaded_videos"
    
    id = Column(Integer, primary_key=True, index=True)
    url = Column(String, nullable=True)
    shortcode = Column(String, unique=True, index=True, nullable=False)
    profile_source = Column(String, nullable=True)  # Username the video was downloaded from
    local_path = Column(String, nullable=False)
    file_hash = Column(String, nullable=True)  # SHA256 hash for binary dedup
    views = Column(Integer, nullable=True)
    likes = Column(Integer, nullable=True)
    comments = Column(Integer, nullable=True)
    downloaded_at = Column(DateTime, default=datetime.utcnow)


# ─── Analytics ───

class PostAnalytics(Base):
    """Metrics collected via Instagram Graph API for published posts."""
    __tablename__ = "post_analytics"
    
    id = Column(Integer, primary_key=True, index=True)
    post_id = Column(Integer, ForeignKey("posts.id"), nullable=False)
    ig_media_id = Column(String, nullable=True)
    reach = Column(Integer, default=0)
    impressions = Column(Integer, default=0)
    engagement = Column(Integer, default=0)  # Total interactions
    saves = Column(Integer, default=0)
    shares = Column(Integer, default=0)
    likes = Column(Integer, default=0)
    comments = Column(Integer, default=0)
    plays = Column(Integer, default=0)  # Video views
    collected_at = Column(DateTime, default=datetime.utcnow)

class FollowerSnapshot(Base):
    """Daily snapshots of follower counts for growth tracking."""
    __tablename__ = "follower_snapshots"
    
    id = Column(Integer, primary_key=True, index=True)
    account_username = Column(String, nullable=False, index=True)
    follower_count = Column(Integer, default=0)
    following_count = Column(Integer, default=0)
    media_count = Column(Integer, default=0)
    snapshot_at = Column(DateTime, default=datetime.utcnow)

# ─── Account Profiles (Isolated Settings) ───

class AccountProfile(Base):
    """Per-account configuration for templates, hashtags, style, proxy, schedule."""
    __tablename__ = "account_profiles"
    
    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), unique=True, nullable=False)
    default_template_path = Column(String, nullable=True)
    caption_style = Column(Text, nullable=True)  # Custom prompt/style for AI captions
    posting_schedule = Column(Text, nullable=True)  # JSON: [{"day": "mon", "times": ["09:00","18:00"]}]
    timezone = Column(String, default="America/Sao_Paulo")
    auto_repost_enabled = Column(Boolean, default=False)
    auto_repost_days = Column(Integer, default=30)  # Min days before repost
    min_engagement_for_repost = Column(Float, default=5.0)  # Min engagement rate %
    
    account = relationship("Account", back_populates="profile")

# ─── Scheduler Job Tracking ───

class SchedulerJob(Base):
    """Tracks last run time for recurring scheduler jobs."""
    __tablename__ = "scheduler_jobs"
    
    id = Column(Integer, primary_key=True, index=True)
    job_name = Column(String, unique=True, nullable=False)
    last_run_at = Column(DateTime, nullable=True)
    interval_hours = Column(Integer, default=6)

# ─── Init ───

def init_db():
    # Run simple sqlite migrations for existing tables
    db_path = os.path.join(APP_DATA_DIR, "database.db")
    if os.path.exists(db_path):
        import sqlite3
        conn = sqlite3.connect(db_path)
        try:
            cursor = conn.cursor()
            
            # Migrate accounts
            cursor.execute("PRAGMA table_info(accounts)")
            accounts_cols = [col[1] for col in cursor.fetchall()]
            new_accounts_cols = {
                "proxy_url": "VARCHAR",
                "fb_access_token": "TEXT",
                "fb_ig_account_id": "VARCHAR",
                "notes": "TEXT",
                "tags": "TEXT",
                "platform": "VARCHAR DEFAULT 'instagram'",
                "display_name": "VARCHAR",
                "avatar_url": "VARCHAR",
                "folder": "VARCHAR DEFAULT 'Geral'",
                "last_opened_at": "DATETIME",
                "token_expires_at": "DATETIME",
                "auth_mode": "VARCHAR DEFAULT 'cookie'",
                "instagram_user_id": "VARCHAR",
            }
            for col, col_type in new_accounts_cols.items():
                if col not in accounts_cols:
                    cursor.execute(f"ALTER TABLE accounts ADD COLUMN {col} {col_type}")
                    
            # Migrate posts
            cursor.execute("PRAGMA table_info(posts)")
            posts_cols = [col[1] for col in cursor.fetchall()]
            new_posts_cols = {
                "post_type": "VARCHAR DEFAULT 'reel'",
                "is_repost": "BOOLEAN DEFAULT 0",
                "original_post_id": "INTEGER",
                "cross_post_targets": "TEXT",
                "engagement_score": "FLOAT",
                "carousel_image_paths": "TEXT",
                "meta_container_id": "VARCHAR"
            }
            for col, col_type in new_posts_cols.items():
                if col not in posts_cols:
                    cursor.execute(f"ALTER TABLE posts ADD COLUMN {col} {col_type}")

            # Migrate template_library
            cursor.execute("PRAGMA table_info(template_library)")
            template_cols = [col[1] for col in cursor.fetchall()]
            if "extra_config" not in template_cols:
                cursor.execute("ALTER TABLE template_library ADD COLUMN extra_config TEXT")

            conn.commit()

        except Exception as e:
            print(f"Database migration error: {e}")
        finally:
            conn.close()

    Base.metadata.create_all(bind=engine)
    
    # Initialize default configuration if not present
    db = SessionLocal()
    try:
        default_configs = {
            "openai_api_key": "",
            "gemini_api_key": "",
            "anthropic_api_key": "",
            "active_ai_provider": "openai",  # openai, gemini, anthropic
            "caption_prompt_template": "Escreva uma legenda curta, engajadora e viral para o Instagram Reels sobre este vídeo. Use emojis e hashtags relevantes. Evite clichês e duplicidades.",
            "output_directory": _get_downloads_base(),
            "download_directory": os.path.join(_get_downloads_base(), "downloaded"),
            "edited_directory": os.path.join(_get_downloads_base(), "edited"),
            "whisper_mode": "api",  # "api" or "local"
            "whisper_model_size": "base",  # tiny, base, small, medium, large
            "auto_repost_global": "false",
            "analytics_collect_interval_hours": "6",
            "meta_app_id": "1640190021019907",
            "meta_app_secret": "",
            "public_media_base_url": "",
        }
        
        # Expunge removed configs
        keys_to_remove = [
            "fb_access_token", "fb_instagram_account_id", "use_official_api",
            "tiktok_access_token", "youtube_api_key", "youtube_client_secret",
            "multilogin_automation_token", "multilogin_default_folder_id",
        ]
        db.query(Config).filter(Config.key.in_(keys_to_remove)).delete(synchronize_session=False)

        for key, val in default_configs.items():
            config = db.query(Config).filter(Config.key == key).first()
            if not config:
                db.add(Config(key=key, value=val))
            elif key == "meta_app_id" and not config.value:
                config.value = "1640190021019907"
        
        # Initialize default scheduler jobs
        default_jobs = [
            {"job_name": "analytics_collect", "interval_hours": 6},
            {"job_name": "follower_snapshot", "interval_hours": 24},
            {"job_name": "repost_check", "interval_hours": 24},
            {"job_name": "token_refresh_check", "interval_hours": 24},
        ]
        for job in default_jobs:
            existing = db.query(SchedulerJob).filter(SchedulerJob.job_name == job["job_name"]).first()
            if not existing:
                db.add(SchedulerJob(**job))
        
        db.commit()
    except Exception as e:
        print(f"Error initializing configs: {e}")
        db.rollback()
    finally:
        db.close()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
