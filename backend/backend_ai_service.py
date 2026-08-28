"""
AI service module — Integrates with OpenAI, Google Gemini, and Anthropic Claude
for caption generation, hashtag suggestions, and other AI-powered features.
"""
from sqlalchemy.orm import Session
from database import Config
import openai
import google.generativeai as genai
import anthropic
from utils import get_config_val


def generate_caption_raw(db: Session, prompt: str) -> str:
    """
    Send a raw prompt to the configured AI provider and return the response.
    Used by multiple modules (captions, hashtags, etc).
    """
    provider = get_config_val(db, "active_ai_provider").lower()
    
    if provider == "openai":
        api_key = get_config_val(db, "openai_api_key")
        if not api_key:
            raise ValueError("Chave de API da OpenAI não configurada.")
            
        client = openai.OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "Você é um especialista em marketing e mídias sociais, focado em criar conteúdo altamente viral e engajador para o Instagram."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=500
        )
        return response.choices[0].message.content.strip()
        
    elif provider == "gemini":
        api_key = get_config_val(db, "gemini_api_key")
        if not api_key:
            raise ValueError("Chave de API do Gemini não configurada.")
            
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-1.5-flash")
        response = model.generate_content(
            contents=prompt,
            generation_config=genai.types.GenerationConfig(
                max_output_tokens=500,
                temperature=0.7
            )
        )
        return response.text.strip()
        
    elif provider == "anthropic":
        api_key = get_config_val(db, "anthropic_api_key")
        if not api_key:
            raise ValueError("Chave de API do Anthropic (Claude) não configurada.")
            
        client = anthropic.Anthropic(api_key=api_key)
        message = client.messages.create(
            model="claude-3-haiku-20240307",
            max_tokens=500,
            system="Você é um especialista em marketing e mídias sociais, focado em criar conteúdo altamente viral e engajador para o Instagram.",
            messages=[
                {"role": "user", "content": prompt}
            ]
        )
        return message.content[0].text.strip()
        
    else:
        raise ValueError(f"Provedor de IA desconhecido ou não suportado: {provider}")


def generate_caption(db: Session, video_title: str = "") -> str:
    """
    Generates an engaging caption using the selected AI provider.
    """
    prompt_template = get_config_val(db, "caption_prompt_template")
    prompt = f"{prompt_template}\n\nAssunto/Título do vídeo: {video_title}" if video_title else prompt_template
    return generate_caption_raw(db, prompt)


def generate_caption_variation(db: Session, original_caption: str) -> str:
    """
    Generate a variation of an existing caption for reposting.
    Keeps the same topic but changes the wording to avoid duplicity.
    """
    prompt = f"""Reescreva a legenda abaixo para Instagram de forma completamente diferente, 
mantendo o mesmo assunto e tom. Use emojis diferentes, hashtags diferentes, e 
uma estrutura de texto diferente. A legenda deve parecer totalmente nova.

Legenda original:
{original_caption}

Responda apenas com a nova legenda, sem explicações."""
    
    return generate_caption_raw(db, prompt)


def scan_template_image(db: Session, image_path: str) -> dict:
    """
    Scans a template image using the active AI provider (OpenAI or Gemini Vision)
    to identify the profile name, username, verification status, and bottom text overlay.
    """
    import base64
    import json
    import re
    
    provider = get_config_val(db, "active_ai_provider").lower()
    
    if not os.path.isfile(image_path):
        raise FileNotFoundError(f"Arquivo da imagem não encontrado: {image_path}")
        
    with open(image_path, "rb") as image_file:
        img_base64 = base64.b64encode(image_file.read()).decode("utf-8")
        
    prompt = """Analyze this image which is a social media video template. Extract:
- The name of the profile (usually bold text next to the circular profile image, e.g. 'clt lascado' or 'Zoeira Versa')
- The username (starts with @, e.g. '@cltlascado' or '@zoeiraversa')
- Whether there is a blue verified checkmark badge next to the profile name (true or false)
- The text content of the video overlay at the bottom if any (e.g. 'Siga para mais videos como esse' or 'DIGITE SEU TEXTO AQUI').

Return a JSON object in this format:
{
  "profileName": "...",
  "profileUsername": "...",
  "profileVerified": true/false,
  "text": "..."
}
Output ONLY valid JSON. No explanations, no markdown block wrappers like ```json."""

    if provider == "openai":
        api_key = get_config_val(db, "openai_api_key")
        if not api_key:
            raise ValueError("Chave de API da OpenAI não configurada.")
            
        client = openai.OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a precise data extraction assistant."},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{img_base64}"
                            }
                        }
                    ]
                }
            ],
            max_tokens=300
        )
        res_text = response.choices[0].message.content.strip()
        res_text = re.sub(r"^```json\s*|\s*```$", "", res_text, flags=re.MULTILINE).strip()
        return json.loads(res_text)
        
    elif provider == "gemini":
        api_key = get_config_val(db, "gemini_api_key")
        if not api_key:
            raise ValueError("Chave de API do Gemini não configurada.")
            
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-1.5-flash")
        
        img_data = {
            'mime_type': 'image/png',
            'data': base64.b64decode(img_base64)
        }
        
        response = model.generate_content(
            contents=[prompt, img_data],
            generation_config=genai.types.GenerationConfig(
                response_mime_type="application/json",
                max_output_tokens=300,
                temperature=0.1
            )
        )
        res_text = response.text.strip()
        res_text = re.sub(r"^```json\s*|\s*```$", "", res_text, flags=re.MULTILINE).strip()
        return json.loads(res_text)
        
    else:
        raise ValueError("Provedor de IA ativo não suporta visão ou chave ausente.")
