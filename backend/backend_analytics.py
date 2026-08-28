"""
Analytics module — Collects and processes Instagram metrics.
Supports Hybrid collection:
1. Instagram Session/Cookies via instagrapi (followers, following, posts, likes, comments, views)
2. Meta Graph API (Official Business/Creator accounts with Access Token)
3. Public Web Scraper fallback
Provides follower tracking, post performance analysis, and best-time suggestions.
"""
import os
import json
import requests
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from database import Config, Post, PostAnalytics, FollowerSnapshot, Account
from utils import get_config_val


def _get_matching_usernames(db: Session, account_username: str = None) -> list:
    """Helper to resolve all aliases (username, display_name, id) for a given account filter."""
    if not account_username or account_username in ("all", "Todas as contas", ""):
        return []
    matched = [account_username]
    try:
        acc_id = int(account_username) if account_username.isdigit() else -1
    except Exception:
        acc_id = -1

    acc = db.query(Account).filter(
        (Account.username == account_username) |
        (Account.display_name == account_username) |
        (Account.id == acc_id)
    ).first()

    if acc:
        if acc.username and acc.username not in matched:
            matched.append(acc.username)
        if acc.display_name and acc.display_name not in matched:
            matched.append(acc.display_name)
    return matched


def _get_account_token(db: Session, account_username: str = None):
    """Get access token and IG account ID, preferring per-account settings."""
    if account_username:
        matched = _get_matching_usernames(db, account_username)
        acc = db.query(Account).filter(Account.username.in_(matched)).first()
        if acc and acc.fb_access_token and acc.fb_ig_account_id:
            return acc.fb_access_token, acc.fb_ig_account_id
    # Fallback to global config
    return get_config_val(db, "fb_access_token"), get_config_val(db, "fb_instagram_account_id")


def _init_instagrapi_client(acc: Account):
    """Initialize an instagrapi client with account cookies and proxy."""
    if not acc.session_cookies:
        return None
    try:
        from instagrapi import Client
        cl = Client()
        if acc.proxy_url:
            cl.set_proxy(acc.proxy_url)
        cl.set_country("BR")
        cl.set_locale("pt_BR")
        cl.set_timezone_offset(-3 * 3600)

        cookies = json.loads(acc.session_cookies)
        cookies_dict = {}
        if isinstance(cookies, list):
            for c in cookies:
                if isinstance(c, dict) and c.get('name') and c.get('value'):
                    cookies_dict[c.get('name')] = c.get('value')
        elif isinstance(cookies, dict):
            cookies_dict = cookies

        sessionid = cookies_dict.get('sessionid')
        if sessionid:
            cl.login_by_sessionid(sessionid)
            return cl
    except Exception as e:
        print(f"Analytics: Falha ao autenticar instagrapi para @{acc.username}: {e}")
    return None


def fetch_media_insights(media_id: str, access_token: str) -> dict:
    """Fetch insights for a specific media via Meta Graph API."""
    metrics = "reach,impressions,saved,shares,likes,comments,plays"
    params = {"metric": metrics, "access_token": access_token}
    
    response = requests.get(f"https://graph.facebook.com/v19.0/{media_id}/insights", params=params, timeout=10)
    if response.status_code != 200:
        response = requests.get(f"https://graph.instagram.com/v19.0/{media_id}/insights", params=params, timeout=10)

    result = {
        "reach": 0, "impressions": 0, "saves": 0,
        "shares": 0, "likes": 0, "comments": 0, "plays": 0
    }
    
    if response.status_code == 200:
        data = response.json().get("data", [])
        for metric in data:
            name = metric.get("name", "")
            values = metric.get("values", [{}])
            value = values[0].get("value", 0) if values else 0
            if name in result:
                result[name] = value
            elif name == "saved":
                result["saves"] = value

    result["engagement"] = (
        result["likes"] + result["comments"] +
        result["saves"] + result["shares"]
    )
    return result


def fetch_account_info(ig_user_id: str, access_token: str) -> dict:
    """Fetch basic account info via Meta Graph API."""
    url = f"https://graph.facebook.com/v19.0/{ig_user_id}"
    params = {
        "fields": "followers_count,follows_count,media_count,username",
        "access_token": access_token
    }
    try:
        response = requests.get(url, params=params, timeout=8)
        if response.status_code == 200:
            data = response.json()
            return {
                "follower_count": data.get("followers_count", 0),
                "following_count": data.get("follows_count", 0),
                "media_count": data.get("media_count", 0),
                "username": data.get("username", "")
            }
    except Exception as e:
        print(f"Analytics: Graph API account info error: {e}")
    return {"follower_count": 0, "following_count": 0, "media_count": 0, "username": ""}


def _fetch_public_profile_info(username: str, proxy_url: str = None) -> dict:
    """Fallback: Scrape basic profile metrics via public Instagram web endpoint."""
    proxies = {"http": proxy_url, "https": proxy_url} if proxy_url else None
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "x-ig-app-id": "936619743392459",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    }
    try:
        url = f"https://www.instagram.com/api/v1/users/web_profile_info/?username={username}"
        r = requests.get(url, headers=headers, proxies=proxies, timeout=10)
        if r.status_code == 200:
            user = r.json().get("data", {}).get("user", {})
            return {
                "follower_count": user.get("edge_followed_by", {}).get("count", 0),
                "following_count": user.get("edge_follow", {}).get("count", 0),
                "media_count": user.get("edge_owner_to_timeline_media", {}).get("count", 0),
                "profile_pic_url": user.get("profile_pic_url_hd") or user.get("profile_pic_url"),
                "username": username
            }
    except Exception as e:
        print(f"Analytics: Fallback public profile error for @{username}: {e}")
    return {"follower_count": 0, "following_count": 0, "media_count": 0, "username": username}


def collect_follower_snapshot(db: Session, account_username: str = None):
    """
    Take a snapshot of follower counts for growth tracking across active accounts.
    Uses Hybrid Strategy: Session -> Graph API -> Web Scraper.
    """
    if account_username and account_username not in ("all", "Todas as contas", ""):
        matched = _get_matching_usernames(db, account_username)
        accounts = db.query(Account).filter(Account.username.in_(matched)).all()
    else:
        accounts = db.query(Account).filter(Account.status == "active").all()

    for acc in accounts:
        info = None

        # 1. Try instagrapi with session cookies
        if acc.session_cookies:
            cl = _init_instagrapi_client(acc)
            if cl:
                try:
                    u = None
                    if getattr(cl, 'user_id', None):
                        try:
                            u = cl.user_info(cl.user_id)
                        except Exception:
                            pass
                    if not u:
                        try:
                            u = cl.account_info()
                        except Exception:
                            pass
                    if not u:
                        try:
                            u = cl.user_info_by_username(acc.username)
                        except Exception:
                            pass

                    if u:
                        info = {
                            "follower_count": getattr(u, "follower_count", 0),
                            "following_count": getattr(u, "following_count", 0),
                            "media_count": getattr(u, "media_count", 0),
                            "username": acc.username
                        }
                        if getattr(u, "profile_pic_url", None) and not acc.avatar_url:
                            acc.avatar_url = str(u.profile_pic_url)
                except Exception as ex:
                    print(f"Analytics: instagrapi follower fetch error for @{acc.username}: {ex}")

        # 2. Try Meta Graph API if access token configured
        if (not info or info.get("follower_count", 0) == 0) and acc.fb_access_token and acc.fb_ig_account_id:
            info = fetch_account_info(acc.fb_ig_account_id, acc.fb_access_token)

        # 3. Fallback to public web profile lookup
        if not info or info.get("follower_count", 0) == 0:
            public_info = _fetch_public_profile_info(acc.username, acc.proxy_url)
            if public_info.get("follower_count", 0) > 0:
                info = public_info
                if public_info.get("profile_pic_url") and not acc.avatar_url:
                    acc.avatar_url = public_info.get("profile_pic_url")

        if info and (info.get("follower_count", 0) > 0 or info.get("media_count", 0) > 0):
            snapshot = FollowerSnapshot(
                account_username=acc.username,
                follower_count=info["follower_count"],
                following_count=info["following_count"],
                media_count=info["media_count"],
                snapshot_at=datetime.utcnow()
            )
            db.add(snapshot)
            print(f"Analytics: Snapshot gravado para @{acc.username}: {info['follower_count']} seguidores.")

    db.commit()


def collect_post_analytics(db: Session, account_username: str = None):
    """
    Collect analytics for published posts and import recent Instagram posts for metrics calculation.
    """
    if account_username and account_username not in ("all", "Todas as contas", ""):
        matched = _get_matching_usernames(db, account_username)
        accounts = db.query(Account).filter(Account.username.in_(matched)).all()
    else:
        accounts = db.query(Account).filter(Account.status == "active").all()

    for acc in accounts:
        # 1. Fetch recent posts & metrics via instagrapi
        if acc.session_cookies:
            cl = _init_instagrapi_client(acc)
            if cl:
                try:
                    user_pk = getattr(cl, 'user_id', None)
                    if not user_pk:
                        try:
                            user_pk = cl.user_id_from_username(acc.username)
                        except Exception:
                            pass

                    if user_pk:
                        medias = cl.user_medias(user_pk, amount=15)
                        for m in medias:
                            try:
                                media_pk = str(m.pk)
                                likes = int(getattr(m, "like_count", 0) or 0)
                                comments = int(getattr(m, "comment_count", 0) or 0)
                                plays = int(getattr(m, "play_count", 0) or getattr(m, "view_count", 0) or 0)
                                reach = max(plays, likes + comments, 1)
                                engagement = likes + comments

                                post = db.query(Post).filter(
                                    (Post.ig_media_id == media_pk) |
                                    ((Post.account_username == acc.username) & (Post.ig_media_id == media_pk))
                                ).first()

                                thumb_url = str(getattr(m, "thumbnail_url", "") or "")
                                if not thumb_url or thumb_url == "None":
                                    thumb_url = "Instagram Media"

                                cap_text = str(getattr(m, "caption_text", "") or "")[:500]
                                taken_at = m.taken_at if isinstance(m.taken_at, datetime) else datetime.utcnow()

                                if not post:
                                    post = Post(
                                        account_username=acc.username,
                                        status="posted",
                                        ig_media_id=media_pk,
                                        scheduled_time=taken_at,
                                        caption=cap_text,
                                        video_path=thumb_url,
                                        post_type="reel" if getattr(m, "media_type", 1) == 2 else "feed",
                                        created_at=taken_at,
                                        engagement_score=round(((engagement) / max(reach, 1)) * 100, 2)
                                    )
                                    db.add(post)
                                    db.flush()

                                existing = db.query(PostAnalytics).filter(PostAnalytics.post_id == post.id).first()
                                if existing:
                                    existing.reach = reach
                                    existing.impressions = reach
                                    existing.engagement = engagement
                                    existing.likes = likes
                                    existing.comments = comments
                                    existing.plays = plays
                                    existing.collected_at = datetime.utcnow()
                                else:
                                    analytics_rec = PostAnalytics(
                                        post_id=post.id,
                                        ig_media_id=media_pk,
                                        reach=reach,
                                        impressions=reach,
                                        engagement=engagement,
                                        saves=0,
                                        shares=0,
                                        likes=likes,
                                        comments=comments,
                                        plays=plays,
                                        collected_at=datetime.utcnow()
                                    )
                                    db.add(analytics_rec)

                                post.engagement_score = round(((engagement) / max(reach, 1)) * 100, 2)
                                db.commit()
                            except Exception as post_err:
                                db.rollback()
                                print(f"Analytics: Erro ao processar post {getattr(m, 'pk', 'desconhecido')}: {post_err}")
                except Exception as ex:
                    print(f"Analytics: Erro ao coletar posts via instagrapi para @{acc.username}: {ex}")

        # 2. Collect Graph API Insights for published posts if token present
        if acc.fb_access_token:
            published_posts = db.query(Post).filter(
                Post.status == "posted",
                Post.ig_media_id.isnot(None),
                Post.account_username == acc.username
            ).all()

            for post in published_posts:
                try:
                    insights = fetch_media_insights(post.ig_media_id, acc.fb_access_token)
                    existing = db.query(PostAnalytics).filter(PostAnalytics.post_id == post.id).first()
                    if existing:
                        existing.reach = insights["reach"]
                        existing.impressions = insights["impressions"]
                        existing.engagement = insights["engagement"]
                        existing.saves = insights["saves"]
                        existing.shares = insights["shares"]
                        existing.likes = insights["likes"]
                        existing.comments = insights["comments"]
                        existing.plays = insights["plays"]
                        existing.collected_at = datetime.utcnow()
                    else:
                        analytics_rec = PostAnalytics(
                            post_id=post.id,
                            ig_media_id=post.ig_media_id,
                            reach=insights["reach"],
                            impressions=insights["impressions"],
                            engagement=insights["engagement"],
                            saves=insights["saves"],
                            shares=insights["shares"],
                            likes=insights["likes"],
                            comments=insights["comments"],
                            plays=insights["plays"]
                        )
                        db.add(analytics_rec)

                    if insights["reach"] > 0:
                        post.engagement_score = round((insights["engagement"] / insights["reach"]) * 100, 2)
                except Exception as ex:
                    print(f"Analytics: Erro Graph API para post {post.id}: {ex}")

    db.commit()


def calculate_engagement_rate(post_analytics: PostAnalytics) -> float:
    """Calculate engagement rate for a single post."""
    if not post_analytics or post_analytics.reach == 0:
        return 0.0
    return round((post_analytics.engagement / post_analytics.reach) * 100, 2)


def get_best_posting_times(db: Session, account_username: str = None, top_n: int = 5) -> list:
    """
    Analyze historical post data to find the best posting times.
    Returns list of {day, hour, avg_engagement, sample_count}.
    """
    matched = _get_matching_usernames(db, account_username)
    query = db.query(Post, PostAnalytics).join(
        PostAnalytics, PostAnalytics.post_id == Post.id
    ).filter(Post.status == "posted")

    if matched:
        query = query.filter(Post.account_username.in_(matched))

    results = query.all()

    default_recommendations = [
        {"day": "Segunda", "hour": 9, "avg_engagement": 0, "note": "Horário sugerido padrão"},
        {"day": "Terça", "hour": 12, "avg_engagement": 0, "note": "Horário sugerido padrão"},
        {"day": "Quarta", "hour": 18, "avg_engagement": 0, "note": "Horário sugerido padrão"},
        {"day": "Quinta", "hour": 20, "avg_engagement": 0, "note": "Horário sugerido padrão"},
        {"day": "Sábado", "hour": 10, "avg_engagement": 0, "note": "Horário sugerido padrão"},
    ]

    if not results:
        return default_recommendations

    time_slots = {}
    day_names = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]

    for post, p_analytics in results:
        if not post.scheduled_time:
            continue
        day = post.scheduled_time.weekday()
        hour = post.scheduled_time.hour
        key = (day, hour)

        rate = calculate_engagement_rate(p_analytics)
        if key not in time_slots:
            time_slots[key] = {"rates": [], "day": day_names[day], "hour": hour}
        time_slots[key]["rates"].append(rate)

    ranked = []
    for key, data in time_slots.items():
        avg_rate = sum(data["rates"]) / len(data["rates"]) if data["rates"] else 0
        ranked.append({
            "day": data["day"],
            "hour": data["hour"],
            "avg_engagement": round(avg_rate, 2),
            "sample_count": len(data["rates"])
        })

    ranked.sort(key=lambda x: x["avg_engagement"], reverse=True)
    return ranked[:top_n] if ranked else default_recommendations


def get_analytics_overview(db: Session, period_days: int = 30, account_username: str = None) -> dict:
    """Get an overview of analytics for the dashboard."""
    cutoff = datetime.utcnow() - timedelta(days=period_days)
    matched = _get_matching_usernames(db, account_username)

    query = db.query(Post, PostAnalytics).join(
        PostAnalytics, PostAnalytics.post_id == Post.id
    ).filter(
        Post.status == "posted",
        Post.scheduled_time >= cutoff
    )

    if matched:
        query = query.filter(Post.account_username.in_(matched))

    results = query.all()

    total_reach = 0
    total_engagement = 0
    total_saves = 0
    total_shares = 0
    total_plays = 0
    engagement_rates = []
    best_post = None
    best_engagement = -1

    posts_data = []

    for post, p_analytics in results:
        total_reach += p_analytics.reach
        total_engagement += p_analytics.engagement
        total_saves += p_analytics.saves
        total_shares += p_analytics.shares
        total_plays += p_analytics.plays

        rate = calculate_engagement_rate(p_analytics)
        engagement_rates.append(rate)

        if rate > best_engagement:
            best_engagement = rate
            best_post = {
                "post_id": post.id,
                "video_path": post.video_path,
                "engagement_rate": rate,
                "reach": p_analytics.reach,
                "likes": p_analytics.likes,
                "scheduled_time": post.scheduled_time.isoformat() if post.scheduled_time else None
            }

        # Resolve display title / video filename
        filename = "Post de Feed"
        if post.video_path:
            raw_fn = os.path.basename(post.video_path.replace("\\", "/"))
            if raw_fn and not raw_fn.startswith("http") and raw_fn != "Instagram Media":
                filename = raw_fn
            elif post.caption:
                clean_title = post.caption.strip().split("\n")[0]
                filename = (clean_title[:40] + "...") if len(clean_title) > 40 else clean_title
            else:
                filename = f"Reels #{post.id}"
        elif post.caption:
            clean_title = post.caption.strip().split("\n")[0]
            filename = (clean_title[:40] + "...") if len(clean_title) > 40 else clean_title

        posts_data.append({
            "post_id": post.id,
            "title": filename,
            "video_path": post.video_path,
            "post_type": post.post_type or ("reel" if post.video_path else "feed"),
            "caption": post.caption or "",
            "account_username": post.account_username,
            "scheduled_time": post.scheduled_time.isoformat() if post.scheduled_time else None,
            "reach": p_analytics.reach,
            "impressions": p_analytics.impressions,
            "engagement": p_analytics.engagement,
            "engagement_rate": rate,
            "saves": p_analytics.saves,
            "shares": p_analytics.shares,
            "likes": p_analytics.likes,
            "comments": p_analytics.comments,
            "plays": p_analytics.plays,
        })

    avg_engagement = round(sum(engagement_rates) / len(engagement_rates), 2) if engagement_rates else 0

    return {
        "period_days": period_days,
        "total_posts": len(results),
        "total_reach": total_reach,
        "total_engagement": total_engagement,
        "avg_engagement_rate": avg_engagement,
        "total_saves": total_saves,
        "total_shares": total_shares,
        "total_plays": total_plays,
        "best_post": best_post,
        "posts": sorted(posts_data, key=lambda x: x["scheduled_time"] or "", reverse=True)
    }


def get_follower_history(db: Session, period_days: int = 90, account_username: str = None) -> dict:
    """Get follower count history for charting with precise daily aggregation."""
    cutoff = datetime.utcnow() - timedelta(days=period_days)
    matched = _get_matching_usernames(db, account_username)

    query = db.query(FollowerSnapshot).filter(
        FollowerSnapshot.snapshot_at >= cutoff
    )

    if matched:
        query = query.filter(FollowerSnapshot.account_username.in_(matched))
    else:
        active_accounts = db.query(Account).filter(Account.status == "active").all()
        valid_usernames = set()
        for a in active_accounts:
            if a.username:
                valid_usernames.add(a.username)
            if a.display_name:
                valid_usernames.add(a.display_name)
        if valid_usernames:
            query = query.filter(FollowerSnapshot.account_username.in_(valid_usernames))

    snapshots = query.order_by(FollowerSnapshot.snapshot_at.asc()).all()

    # Calculate real current total followers directly from latest snapshot of each active account
    if matched:
        latest_snap = db.query(FollowerSnapshot).filter(
            FollowerSnapshot.account_username.in_(matched)
        ).order_by(FollowerSnapshot.snapshot_at.desc()).first()
        current_followers = latest_snap.follower_count if latest_snap else 0
    else:
        current_followers = 0
        for acc in db.query(Account).filter(Account.status == "active").all():
            latest_snap = db.query(FollowerSnapshot).filter(
                (FollowerSnapshot.account_username == acc.username) |
                (FollowerSnapshot.account_username == acc.display_name)
            ).order_by(FollowerSnapshot.snapshot_at.desc()).first()
            if latest_snap:
                current_followers += latest_snap.follower_count

    history = []

    if not snapshots:
        if current_followers > 0:
            today_str = datetime.utcnow().strftime("%Y-%m-%d")
            history.append({
                "date": f"{today_str}T00:00:00",
                "followers": current_followers,
                "following": 0,
                "media_count": 0
            })
        return {
            "snapshots": history,
            "growth": 0,
            "growth_percent": 0,
            "current_followers": current_followers
        }

    if not matched:
        # Aggregation across all accounts:
        # 1. Map each account's latest snapshot for each calendar day
        day_account_latest = {}  # { date_str: { account: follower_count } }
        all_dates = set()

        for snap in snapshots:
            day_str = snap.snapshot_at.strftime("%Y-%m-%d")
            acc_name = snap.account_username
            all_dates.add(day_str)

            if day_str not in day_account_latest:
                day_account_latest[day_str] = {}
            # Because snapshots are ordered asc by snapshot_at, the last one per day is the latest
            day_account_latest[day_str][acc_name] = snap.follower_count

        sorted_dates = sorted(list(all_dates))
        running_account_counts = {}

        for d in sorted_dates:
            for acc_name, count in day_account_latest[d].items():
                running_account_counts[acc_name] = count

            day_total = sum(running_account_counts.values())
            history.append({
                "date": f"{d}T00:00:00",
                "followers": day_total,
                "following": 0,
                "media_count": 0
            })
    else:
        # Single account: group by day and take latest reading per day
        by_day = {}
        for snap in snapshots:
            day_str = snap.snapshot_at.strftime("%Y-%m-%d")
            by_day[day_str] = snap

        for d in sorted(by_day.keys()):
            snap = by_day[d]
            history.append({
                "date": f"{d}T00:00:00",
                "followers": snap.follower_count,
                "following": snap.following_count,
                "media_count": snap.media_count
            })

    if len(history) >= 2:
        first = history[0]["followers"]
        last = history[-1]["followers"]
        growth = last - first
        growth_pct = round((growth / first * 100), 2) if first > 0 else 0
    else:
        growth = 0
        growth_pct = 0

    return {
        "snapshots": history,
        "growth": growth,
        "growth_percent": growth_pct,
        "current_followers": current_followers
    }
