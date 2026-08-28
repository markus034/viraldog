"""Pydantic schemas for all API request/response models."""
from typing import List, Optional, Dict
from pydantic import BaseModel, Field


class CookieAccountCreate(BaseModel):
    username: str
    cookies_json: Optional[str] = None
    proxy_url: Optional[str] = None
    folder: Optional[str] = None

class AccountPatchRequest(BaseModel):
    username: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[str] = None
    proxy_url: Optional[str] = None
    platform: Optional[str] = None
    session_cookies: Optional[str] = None
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    folder: Optional[str] = None
    last_opened_at: Optional[str] = None
    auth_mode: Optional[str] = None
    token_expires_at: Optional[str] = None
    fb_access_token: Optional[str] = None
    fb_ig_account_id: Optional[str] = None
    instagram_user_id: Optional[str] = None

class DownloadSingleRequest(BaseModel):
    url: str
    account_username: Optional[str] = None

class DownloadProfileRequest(BaseModel):
    profile_name: str
    count: int
    account_username: Optional[str] = None
    min_views: int = 0
    min_likes: int = 0
    sort_by: str = "recent"
    skip_duplicates: bool = True

class DownloadStoriesRequest(BaseModel):
    username: str
    account_username: Optional[str] = None

class TikTokVideoDownloadRequest(BaseModel):
    url: str
    skip_duplicates: bool = True

class TikTokProfileDownloadRequest(BaseModel):
    profile: str
    count: int = Field(default=20, ge=1, le=100)
    skip_duplicates: bool = True

class EditVideoParams(BaseModel):
    input_path: str
    output_filename: str
    crop_9_16: bool = False
    crop_video: bool = False
    mirror: bool = False
    speed: float = 1.0
    volume: float = 1.0
    template_image_path: Optional[str] = None
    top_text: Optional[str] = None
    bottom_text: Optional[str] = None
    text_color: str = "white"
    bg_color: str = "rgba(0, 0, 0, 200)"
    watermark_text: Optional[str] = None
    anti_duplicity: bool = False
    normalize_audio: bool = False
    background_music_path: Optional[str] = None
    bg_music_volume: float = 0.3
    fade_in: float = 0.0
    fade_out: float = 0.0
    generate_subtitles: bool = False
    burn_subtitles: bool = False
    subtitle_style: str = "default"
    aspect_ratio_mode: str = "original"
    generate_thumbnail: bool = False
    thumbnail_timestamp: float = 1.0
    template_header_height: Optional[int] = 160
    template_bottom_y: Optional[int] = 1820
    top_text_y: Optional[int] = 200
    bottom_text_y: Optional[int] = 1820
    cut_start: float = 0.0
    cut_end: Optional[float] = None
    video_scale: float = 1.0
    video_x_offset: int = 0
    video_y_offset: int = 0

    def to_editor_kwargs(self) -> dict:
        """Convert to kwargs dict for editor.edit_video(), eliminating 30+ repeated kwargs."""
        return {
            "crop_9_16": self.crop_9_16,
            "crop_video": self.crop_video,
            "mirror": self.mirror,
            "speed": self.speed,
            "volume": self.volume,
            "template_image_path": self.template_image_path,
            "top_text": self.top_text,
            "bottom_text": self.bottom_text,
            "text_color": self.text_color,
            "bg_color": self.bg_color,
            "watermark_text": self.watermark_text,
            "anti_duplicity": self.anti_duplicity,
            "normalize_audio": self.normalize_audio,
            "background_music_path": self.background_music_path,
            "bg_music_volume": self.bg_music_volume,
            "fade_in": self.fade_in,
            "fade_out": self.fade_out,
            "burn_subs": self.burn_subtitles,
            "subtitle_style": self.subtitle_style,
            "aspect_ratio_mode": self.aspect_ratio_mode,
            "generate_thumb": self.generate_thumbnail,
            "thumbnail_timestamp": self.thumbnail_timestamp,
            "template_header_height": self.template_header_height,
            "template_bottom_y": self.template_bottom_y,
            "top_text_y": self.top_text_y,
            "bottom_text_y": self.bottom_text_y,
            "cut_start": self.cut_start,
            "cut_end": self.cut_end,
            "video_scale": self.video_scale,
            "video_x_offset": self.video_x_offset,
            "video_y_offset": self.video_y_offset,
        }

class PreviewVideoRequest(BaseModel):
    video_path: str
    params: EditVideoParams

class EditBatchRequest(BaseModel):
    video_paths: List[str]
    params: EditVideoParams
    custom_params: Optional[Dict[str, EditVideoParams]] = None

class SchedulePostRequest(BaseModel):
    video_path: str
    caption: str
    scheduled_time: str
    account_username: Optional[str] = None
    post_type: str = "reel"
    carousel_image_paths: Optional[List[str]] = None

class BulkScheduleItem(BaseModel):
    video_path: str
    caption: str
    scheduled_time: str
    account_username: Optional[str] = None
    post_type: str = "reel"

class BulkScheduleRequest(BaseModel):
    posts: List[BulkScheduleItem]

class AIRequest(BaseModel):
    video_title: Optional[str] = ""

class SettingsUpdate(BaseModel):
    settings: dict

class DownloadRegisterRequest(BaseModel):
    file_path: str
    url: Optional[str] = None
    shortcode: Optional[str] = None
    profile_source: Optional[str] = None

class ImportDirectoryRequest(BaseModel):
    directory_path: str
    skip_duplicates: bool = True

class RepostRequest(BaseModel):
    original_post_id: int
    scheduled_time: Optional[str] = None

class AccountProfileUpdate(BaseModel):
    proxy_url: Optional[str] = None
    caption_style: Optional[str] = None
    posting_schedule: Optional[str] = None
    timezone: Optional[str] = None
    auto_repost_enabled: Optional[bool] = None
    auto_repost_days: Optional[int] = None
    min_engagement_for_repost: Optional[float] = None
