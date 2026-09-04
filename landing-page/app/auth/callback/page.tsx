"use client";

import { useEffect, useState } from "react";

export default function AuthCallbackPage() {
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [message, setMessage] = useState("Conectando sua conta ao ViralDog...");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const error = params.get("error");
    const errorDesc = params.get("error_description");

    if (error) {
      setStatus("error");
      setMessage(errorDesc || error || "Autorização cancelada ou recusada.");
      return;
    }

    if (!code) {
      setStatus("error");
      setMessage("Código de autorização não recebido da Meta.");
      return;
    }

    const deepLinkUrl = `viraldog://auth/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state || "")}`;

    // 1. Tentar despachar para o backend local (porta 8000) e também tentar abrir Deep Link
    const syncCallback = async () => {
      try {
        // Tenta enviar para o backend local do usuário
        const targetUrl = `http://localhost:8000/auth/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state || "")}`;
        const res = await fetch(targetUrl);
        if (res.ok) {
          setStatus("success");
          setMessage("Conta conectada com sucesso no ViralDog!");
        } else {
          // Se o backend local não respondeu, dispara o deep link
          setStatus("success");
          setMessage("Autorização concluída! Retornando ao ViralDog...");
        }
      } catch {
        setStatus("success");
        setMessage("Autorização concluída! Retornando ao ViralDog...");
      }

      // Disparar Deep Link para o Electron
      try {
        window.location.href = deepLinkUrl;
      } catch (e) {
        console.log(e);
      }

      // Notificar janela pai se aberta via window.open
      if (window.opener) {
        window.opener.postMessage({
          type: "META_OAUTH_CODE",
          code,
          state
        }, "*");
      }

      // Fechar popup após 3 segundos se for janela filha
      if (window.opener) {
        setTimeout(() => {
          try { window.close(); } catch {}
        }, 3000);
      }
    };

    syncCallback();
  }, []);

  return (
    <main style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#0d0f17",
      color: "#ffffff",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      padding: 24,
      textAlign: "center"
    }}>
      <div style={{
        maxWidth: 440,
        width: "100%",
        background: "#161926",
        border: "1px solid #232738",
        borderRadius: 24,
        padding: "40px 32px",
        boxShadow: "0 20px 50px rgba(0,0,0,0.5)"
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>
          {status === "processing" ? "⏳" : status === "success" ? "🎉" : "❌"}
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 10px 0" }}>
          {status === "processing" ? "Processando Conexão..." : status === "success" ? "Conta Conectada!" : "Falha na Conexão"}
        </h1>

        <p style={{ color: "#9da4b8", fontSize: 14, lineHeight: 1.6, margin: "0 0 28px 0" }}>
          {message}
        </p>

        {status === "success" && (
          <a
            href="viraldog://auth/callback"
            style={{
              display: "inline-block",
              background: "#0071E3",
              color: "#ffffff",
              padding: "12px 28px",
              borderRadius: 12,
              fontWeight: 600,
              fontSize: 14,
              textDecoration: "none",
              boxShadow: "0 4px 16px rgba(0,113,227,0.3)"
            }}
          >
            Voltar para o ViralDog
          </a>
        )}
      </div>
    </main>
  );
}
