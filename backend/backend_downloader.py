"""
Download module — Downloads Instagram media (Reels, Posts, Stories) with
filtering, deduplication, and proxy support.
"""
import os
import json
import re
import instaloader
from sqlalchemy.orm import Session
from database import DownloadedVideo
from utils import compute_file_hash as _compute_file_hash


def get_instaloader_instance(cookies_json: str = None, proxy_url: str = None) -> instaloader.Instaloader:
    L = instaloader.Instaloader(
        download_pictures=False,
        download_videos=True,
        download_video_thumbnails=False,
        download_geotags=False,
        download_comments=False,
        save_metadata=False,
        compress_json=False,
        filename_pattern="{target}_{shortcode}"
    )
    
    if cookies_json:
        try:
            cookies_to_set = {}
            raw_str = cookies_json.strip()
            
            # Caso 1: String de cabeçalho HTTP clássico (ex: sessionid=123; ds_user_id=456)
            if not raw_str.startswith('{') and not raw_str.startswith('['):
                for item in raw_str.split(';'):
                    if '=' in item:
                        k, v = item.split('=', 1)
                        cookies_to_set[k.strip()] = v.strip()
            else:
                parsed = json.loads(raw_str)
                # Caso 2: Array de objetos detalhados do Chrome/EditThisCookie (ex: [{"name":"sessionid", "value":"..."}])
                if isinstance(parsed, list):
                    for cookie in parsed:
                        if isinstance(cookie, dict) and "name" in cookie and "value" in cookie:
                            cookies_to_set[cookie["name"]] = cookie["value"]
                # Caso 3: Dicionário JSON simples (ex: {"sessionid": "..."})
                elif isinstance(parsed, dict):
                    cookies_to_set = parsed
            
            if cookies_to_set:
                L.context._session.cookies.update(cookies_to_set)
                L.context._session.headers.update({
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                })
                print(f"Instaloader cookies parsed successfully. Sessionid present: {'sessionid' in cookies_to_set}")
        except Exception as e:
            print(f"Error loading cookies into Instaloader: {e}")
    
    if proxy_url:
        L.context._session.proxies = {
            "http": proxy_url,
            "https": proxy_url
        }
            
    return L


def extract_shortcode(url: str) -> str:
    match = re.search(r"/(?:p|reel|reels)/([A-Za-z0-9_-]+)", url)
    if match:
        return match.group(1)
    return ""


# ─── Deduplication ───

def is_already_downloaded(db: Session, shortcode: str) -> bool:
    """Check if a video with this shortcode was already downloaded."""
    return db.query(DownloadedVideo).filter(
        DownloadedVideo.shortcode == shortcode
    ).first() is not None


def _get_existing_path(db: Session, shortcode: str):
    """Return local_path if already downloaded and file still on disk, else None."""
    existing = db.query(DownloadedVideo).filter(
        DownloadedVideo.shortcode == shortcode
    ).first()
    if existing and os.path.exists(existing.local_path):
        return existing.local_path
    return None


def register_download(
    db: Session, url: str, shortcode: str, profile: str,
    local_path: str, views: int = None, likes: int = None, comments: int = None
):
    """Register a downloaded video in the dedup database."""
    file_hash = _compute_file_hash(local_path) if os.path.exists(local_path) else None
    
    dv = DownloadedVideo(
        url=url,
        shortcode=shortcode,
        profile_source=profile,
        local_path=local_path,
        file_hash=file_hash,
        views=views,
        likes=likes,
        comments=comments
    )
    db.add(dv)
    db.commit()



# ─── Single Post Download ───

def download_single_post(url: str, cookies_json: str, output_dir: str, db: Session = None, proxy_url: str = None) -> str:
    """
    Downloads a single Instagram video by URL.
    Saves under output_dir/<owner_username>/ and returns the path to the downloaded file.
    """
    shortcode = extract_shortcode(url)
    if not shortcode:
        raise ValueError("URL do Instagram inválida ou shortcode não encontrado.")
    
    # Deduplication check
    if db:
        existing_path = _get_existing_path(db, shortcode)
        if existing_path:
            return existing_path
        # File was deleted from disk — re-download

    L = get_instaloader_instance(cookies_json, proxy_url)

    os.makedirs(output_dir, exist_ok=True)
        
    post = instaloader.Post.from_shortcode(L.context, shortcode)

    # Build profile subfolder: output_dir/<owner_username>/
    profile_dir = os.path.join(output_dir, post.owner_username)
    os.makedirs(profile_dir, exist_ok=True)

    L.dirname_pattern = profile_dir
    L.filename_pattern = "{owner_username}_{shortcode}"

    L.download_post(post, target=post.owner_username)

    media_exts = (".mp4", ".jpg", ".jpeg", ".png")

    # Search in profile_dir for the downloaded file
    for file in os.listdir(profile_dir):
        if post.shortcode in file and file.lower().endswith(media_exts):
            file_path = os.path.join(profile_dir, file)
            if db:
                views = post.video_view_count if post.is_video else None
                register_download(db, url, shortcode, post.owner_username,
                                  file_path, views, post.likes, post.comments)
            return file_path

    # Fallback: any media file added to profile_dir
    for file in os.listdir(profile_dir):
        if file.lower().endswith(media_exts):
            file_path = os.path.join(profile_dir, file)
            if db:
                register_download(db, url, shortcode, post.owner_username, file_path)
            return file_path

    raise FileNotFoundError("Não foi possível encontrar o arquivo de mídia baixado.")


# ─── Profile Download with Filters ───

def download_profile_reels(
    profile_name: str, count: int, cookies_json: str, output_dir: str,
    db: Session = None, proxy_url: str = None,
    min_views: int = 0, min_likes: int = 0,
    sort_by: str = "recent",  # recent, most_liked, most_viewed
    skip_duplicates: bool = True,
    progress_callback=None
) -> list:
    """
    Downloads the latest N video posts from a profile with filtering.
    Returns list of local file paths.
    """
    L = get_instaloader_instance(cookies_json, proxy_url)
    
    profile_dir = os.path.join(output_dir, profile_name)
    if not os.path.exists(profile_dir):
        os.makedirs(profile_dir, exist_ok=True)
        
    profile = instaloader.Profile.from_username(L.context, profile_name)
    
    # If sorting by metrics, we need to collect posts first, then sort
    if sort_by in ("most_liked", "most_viewed"):
        all_video_posts = []
        scan_limit = count * 5  # Scan more posts to find top ones
        scanned = 0
        
        for post in profile.get_posts():
            if scanned >= scan_limit:
                break
            if post.is_video:
                views = post.video_view_count or 0
                likes = post.likes or 0
                
                # Apply minimum filters
                if views < min_views or likes < min_likes:
                    continue
                
                all_video_posts.append(post)
            scanned += 1
        
        # Sort by criteria
        if sort_by == "most_liked":
            all_video_posts.sort(key=lambda p: p.likes or 0, reverse=True)
        elif sort_by == "most_viewed":
            all_video_posts.sort(key=lambda p: p.video_view_count or 0, reverse=True)
        
        posts_to_download = all_video_posts[:count]
    else:
        # Recent: iterate and filter on the fly
        posts_to_download = []
        for post in profile.get_posts():
            if len(posts_to_download) >= count:
                break
            if post.is_video:
                views = post.video_view_count or 0
                likes = post.likes or 0
                if views >= min_views and likes >= min_likes:
                    posts_to_download.append(post)
    
    # Download the selected posts
    downloaded_files = []
    
    for i, post in enumerate(posts_to_download):
        # Deduplication check
        if skip_duplicates and db:
            existing_path = _get_existing_path(db, post.shortcode)
            if existing_path:
                downloaded_files.append(existing_path)
                if progress_callback:
                    progress_callback(
                        int(((i + 1) / len(posts_to_download)) * 100),
                        f"Pulando duplicata: {post.shortcode}"
                    )
                continue

        
        try:
            L.dirname_pattern = profile_dir
            L.filename_pattern = "{owner_username}_{shortcode}"
            L.download_post(post, target=profile_name)
            
            for file in os.listdir(profile_dir):
                if post.shortcode in file and file.endswith(".mp4"):
                    file_path = os.path.join(profile_dir, file)
                    if file_path not in downloaded_files:
                        downloaded_files.append(file_path)
                        # Register for dedup
                        if db:
                            register_download(
                                db,
                                f"https://www.instagram.com/p/{post.shortcode}/",
                                post.shortcode,
                                profile_name,
                                file_path,
                                post.video_view_count,
                                post.likes,
                                post.comments
                            )
                        break
        except Exception as e:
            print(f"Error downloading post {post.shortcode}: {e}")
        
        if progress_callback:
            progress_callback(
                int(((i + 1) / len(posts_to_download)) * 100),
                f"Baixando {i + 1}/{len(posts_to_download)} de @{profile_name}"
            )
                
    return downloaded_files


# ─── Stories Download ───

def download_stories(
    username: str, cookies_json: str, output_dir: str,
    db: Session = None, proxy_url: str = None,
    progress_callback=None
) -> list:
    """
    Download Stories from a specific user.
    Requires authentication (cookies) since Stories are only visible to followers.
    Stories expire in 24h, so this is time-sensitive.
    """
    if not cookies_json:
        raise ValueError("Cookies de sessão obrigatórios para baixar Stories.")
    
    L = get_instaloader_instance(cookies_json, proxy_url)
    # Enable picture downloads for Stories (which are often images)
    L.download_pictures = True
    
    stories_dir = os.path.join(output_dir, f"stories_{username}")
    os.makedirs(stories_dir, exist_ok=True)
    
    downloaded_files = []
    
    try:
        profile = instaloader.Profile.from_username(L.context, username)
        
        # Get stories for this user
        stories = L.get_stories(userids=[profile.userid])
        
        for story in stories:
            items = list(story.get_items())
            total = len(items)
            
            for i, item in enumerate(items):
                try:
                    L.dirname_pattern = stories_dir
                    L.download_storyitem(item, target=username)
                    
                    # Find the downloaded file
                    for file in os.listdir(stories_dir):
                        full_path = os.path.join(stories_dir, file)
                        if full_path not in downloaded_files and (
                            file.endswith(".mp4") or file.endswith(".jpg")
                        ):
                            downloaded_files.append(full_path)
                except Exception as e:
                    print(f"Error downloading story item: {e}")
                
                if progress_callback:
                    progress_callback(
                        int(((i + 1) / max(total, 1)) * 100),
                        f"Baixando Story {i + 1}/{total} de @{username}"
                    )
    except Exception as e:
        raise ValueError(f"Erro ao acessar Stories de @{username}: {e}")
    
    return downloaded_files
