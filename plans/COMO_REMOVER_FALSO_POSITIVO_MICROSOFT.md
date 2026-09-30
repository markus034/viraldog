# 🛡️ Guia Definitivo: Como Eliminar o Falso Positivo do Windows Defender no ViralDog

Este guia explica como registrar o executável do **ViralDog** oficialmente na Microsoft para que o **Windows Defender** nunca mais bloqueie nem apague o instalador nas máquinas dos seus clientes.

---

## 🚀 1. Por que isso acontecia?
1. **Compressão UPX no PyInstaller**: O PyInstaller vinha com `upx=True` ativado por padrão. Quase todos os antivírus tratam arquivos compactados com UPX como suspeitos (heurística genérica de Trojans). **Já desativamos isso no código (`upx=False`)**.
2. **Reputação de Software Novo (SmartScreen)**: Softwares novos que não foram baixados centenas de vezes ainda não possuem reputação construída nos servidores da Microsoft.
3. **Distribuição em ZIP**: Arquivos compactados em `.zip` evitam que o navegador bloqueie o download antes que o usuário possa interagir.

---

## 📋 2. Como Submeter à Microsoft para Whitelist Oficial (Gratuito)

A Microsoft possui um portal onde desenvolvedores enviam seus executáveis para análise automatizada e liberação no banco de dados do Windows Defender (normalmente aprovado em menos de 2 horas):

1. **Gere o novo instalador**:
   - Execute o script `build_dist.bat` na raiz do projeto.
   - O arquivo gerado estará em `dist_release\ViralDog Setup 1.0.0.exe` (ou `ViralDog-Setup-v1.0.0.zip`).

2. **Acesse o Portal de Submissão da Microsoft**:
   👉 [https://www.microsoft.com/en-us/wdsi/filesubmission](https://www.microsoft.com/en-us/wdsi/filesubmission)

3. **Preencha o formulário**:
   - Faça login com uma conta Microsoft (Outlook / Hotmail / Live).
   - Em **"What is the submission type?"**, selecione: `Software developer`.
   - Em **"Company name"**: `ViralDog Software`
   - Em **"Product name"**: `ViralDog Desktop`
   - Em **"File"**: Faça o upload do arquivo `ViralDog Setup 1.0.0.exe`.
   - Em **"Detection name"** (se souber o nome do alerta, ex: `Trojan:Win32/Wacatac` ou deixe em branco / `False Positive`).
   - Em **"Comments / Additional Information"**:
     ```text
     False positive detection. This is our legitimate commercial desktop application built with Electron and Python (FastAPI). It contains no malicious code. Please analyze and whitelist this binary.
     ```

4. **Resultado**:
   - A Microsoft analisa em 30 a 120 minutos e envia um e-mail com a confirmação `Analyst determination: Clean`.
   - A partir desse momento, todas as máquinas com Windows Defender atualizado não emitirão mais nenhum alerta ao baixar ou abrir o ViralDog!

---

## 📦 3. Boas Práticas ao Enviar para Clientes

1. **Sempre envie o arquivo `.zip`** (`dist_release\ViralDog-Setup-v1.0.0.zip`) através do seu link de download (Google Drive, VPS, landing page, etc.).
2. O arquivo ZIP já acompanha o `COMO_INSTALAR.txt` explicando ao cliente como clicar em **"Mais informações" -> "Executar assim mesmo"** caso o SmartScreen exiba o aviso nas primeiras horas de lançamento.
