"""Background scheduler daemon for periodic jobs."""
import json
import time
from datetime import datetime
from database import SessionLocal, Post, Account, SchedulerJob
import backend_publisher as publisher
import backend_analytics as analytics


def _should_run(db, job_name: str) -> bool:
    job = db.query(SchedulerJob).filter(SchedulerJob.job_name == job_name).first()
    if not job:
        return False
    if not job.last_run_at:
        return True
    elapsed = datetime.utcnow() - job.last_run_at
    return elapsed.total_seconds() >= job.interval_hours * 3600


def _mark_run(db, job_name: str):
    job = db.query(SchedulerJob).filter(SchedulerJob.job_name == job_name).first()
    if job:
        job.last_run_at = datetime.utcnow()
        db.commit()


def run_scheduler():
    """Background worker — runs every 60s. Publishes posts, collects analytics, manages reposts."""
    print("Scheduler daemon started (v2).")
    while True:
        db = SessionLocal()
        try:
            now = datetime.utcnow()

            # ── Job 1: Publish pending posts ──
            pending = db.query(Post).filter(Post.status == "pending", Post.scheduled_time <= now).all()
            for post in pending:
                print(f"Scheduler: Publishing post {post.id}...")
                post.status = "processing"
                db.commit()
                try:
                    cookies_json, proxy_url = None, None
                    if post.account_username:
                        acc = db.query(Account).filter(Account.username == post.account_username).first()
                        if acc:
                            cookies_json = acc.session_cookies
                            proxy_url = acc.proxy_url

                    cross_targets = json.loads(post.cross_post_targets) if post.cross_post_targets else None
                    carousel_images = json.loads(post.carousel_image_paths) if post.carousel_image_paths else None

                    media_id = publisher.publish_post(
                        post.video_path, post.caption, cookies_json, db,
                        post.account_username, post.post_type or "reel",
                        carousel_images, cross_targets
                    )
                    post.status = "posted"
                    post.ig_media_id = media_id
                    post.error_message = None
                    print(f"Scheduler: Post {post.id} published — media_id {media_id}")
                except Exception as ex:
                    post.status = "failed"
                    post.error_message = str(ex)
                    print(f"Scheduler: Post {post.id} failed: {ex}")
                db.commit()
                # Intervalo preventivo entre posts para não estourar rate limit do Instagram
                time.sleep(5)

            # ── Job 2: Collect analytics ──
            if _should_run(db, "analytics_collect"):
                try:
                    analytics.collect_post_analytics(db)
                    _mark_run(db, "analytics_collect")
                except Exception as e:
                    print(f"Scheduler: Analytics error: {e}")

            # ── Job 3: Follower snapshot ──
            if _should_run(db, "follower_snapshot"):
                try:
                    for acc in db.query(Account).filter(Account.status == "active").all():
                        analytics.collect_follower_snapshot(db, acc.username)
                    _mark_run(db, "follower_snapshot")
                except Exception as e:
                    print(f"Scheduler: Follower snapshot error: {e}")

            # ── Job 4: Auto-repost ──
            if _should_run(db, "repost_check"):
                try:
                    for post_data in publisher.check_repost_eligible(db)[:3]:
                        publisher.create_repost(db, post_data["id"])
                        print(f"Scheduler: Repost created for post #{post_data['id']}")
                    _mark_run(db, "repost_check")
                except Exception as e:
                    print(f"Scheduler: Repost error: {e}")

            # ── Job 5: Token refresh check ──
            if _should_run(db, "token_refresh_check"):
                try:
                    from datetime import timedelta
                    import requests
                    cutoff_renew = datetime.utcnow() + timedelta(days=15)
                    official_accs = db.query(Account).filter(Account.fb_access_token != None).all()
                    for acc in official_accs:
                        if not acc.token_expires_at or acc.token_expires_at <= cutoff_renew:
                            print(f"Scheduler: Renewing Instagram token for @{acc.username}...")
                            refresh_url = "https://graph.instagram.com/refresh_access_token"
                            res = requests.get(refresh_url, params={"grant_type": "ig_refresh_token", "access_token": acc.fb_access_token}, timeout=15)
                            if res.status_code == 200:
                                data = res.json()
                                acc.fb_access_token = data.get("access_token", acc.fb_access_token)
                                expires_in = data.get("expires_in", 5184000)
                                acc.token_expires_at = datetime.utcnow() + timedelta(seconds=expires_in)
                                acc.status = "active"
                                db.commit()
                                print(f"Scheduler: Token renewed for @{acc.username} until {acc.token_expires_at.strftime('%Y-%m-%d')}")
                    _mark_run(db, "token_refresh_check")
                except Exception as e:
                    print(f"Scheduler: Token refresh check error: {e}")

        except Exception as e:
            print(f"Scheduler loop error: {e}")
        finally:
            db.close()

        time.sleep(60)
