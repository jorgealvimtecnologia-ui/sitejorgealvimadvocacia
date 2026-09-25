#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
OCR de documentos (RG / CNH) — "Zero Digitação".
Lê uma foto/scan e extrai nome, CPF, RG, data de nascimento e filiação para
pré-preencher o cadastro do cliente. Chamado pelo Node (src/modules/ocr/ocr.routes.js)
seguindo o mesmo padrão do radar_crawler.py (execFile python3 + JSON no stdout).

Uso:
    python3 ocr_documento.py --file <caminho_da_imagem> [--type rg|cnh|auto]

Saída (stdout): SEMPRE um JSON único.
    { "ok": true, "tipo": "cnh", "campos": {..}, "confianca": 0.0-1.0 }
    { "ok": false, "erro": "mensagem", "codigo": "SEM_TESSERACT" | ... }

Dependências no servidor: tesseract-ocr (binário, idioma por) + pip: pytesseract pillow
    sudo apt-get install -y tesseract-ocr tesseract-ocr-por
    pip install pytesseract pillow
"""
import sys
import json
import re
import argparse


def _fail(msg, codigo="ERRO"):
    print(json.dumps({"ok": False, "erro": msg, "codigo": codigo}, ensure_ascii=False))
    sys.exit(0)  # sai 0: o erro é comunicado no JSON, não no exit code


def _load_deps():
    try:
        import pytesseract  # noqa
        from PIL import Image, ImageOps, ImageFilter  # noqa
        return pytesseract, Image, ImageOps, ImageFilter
    except Exception as e:  # ambiente sem OCR instalado
        _fail(
            "OCR indisponivel no servidor: instale 'tesseract-ocr tesseract-ocr-por' "
            "e 'pip install pytesseract pillow'. Detalhe: " + str(e),
            "SEM_TESSERACT",
        )


# ---------------------------------------------------------------------------
#  Extração de campos por expressão regular (tolerante a ruído do OCR)
# ---------------------------------------------------------------------------
CPF_RE = re.compile(r"(\d{3})\D?(\d{3})\D?(\d{3})\D?(\d{2})")
DATA_RE = re.compile(r"(\d{2})[\/\.\- ](\d{2})[\/\.\- ](\d{4})")
RG_RE = re.compile(r"\b(\d{1,2}\.?\d{3}\.?\d{3}[-\.]?[0-9Xx])\b")


def _digits(s):
    return re.sub(r"\D", "", s or "")


def _valida_cpf(cpf):
    c = _digits(cpf)
    if len(c) != 11 or c == c[0] * 11:
        return False
    for i in (9, 10):
        soma = sum(int(c[n]) * ((i + 1) - n) for n in range(i))
        dv = (soma * 10) % 11
        dv = 0 if dv == 10 else dv
        if dv != int(c[i]):
            return False
    return True


def _fmt_cpf(cpf):
    c = _digits(cpf)
    return f"{c[0:3]}.{c[3:6]}.{c[6:9]}-{c[9:11]}" if len(c) == 11 else cpf


def _pega_nome(linhas, rotulos):
    """Nome costuma vir na linha logo após o rótulo (NOME / FILIAÇÃO)."""
    for i, ln in enumerate(linhas):
        up = ln.upper()
        for rot in rotulos:
            if rot in up:
                # tenta o resto da própria linha; senão, a linha seguinte
                resto = ln[up.find(rot) + len(rot):].strip(" :.-")
                cand = resto if len(resto) >= 4 else (linhas[i + 1].strip() if i + 1 < len(linhas) else "")
                cand = re.sub(r"[^A-Za-zÀ-ÿ ']", "", cand).strip()
                if len(cand) >= 4:
                    return cand.upper()
    return ""


def extrair_campos(texto):
    linhas = [l.strip() for l in texto.splitlines() if l.strip()]
    campos = {"nome": "", "cpf": "", "rg": "", "data_nascimento": "", "nome_mae": ""}

    # CPF (valida dígitos verificadores; pega o primeiro válido)
    for m in CPF_RE.finditer(texto):
        cand = "".join(m.groups())
        if _valida_cpf(cand):
            campos["cpf"] = _fmt_cpf(cand)
            break

    # Data de nascimento (a primeira data plausível dd/mm/aaaa)
    for m in DATA_RE.finditer(texto):
        d, mth, y = m.groups()
        if 1 <= int(d) <= 31 and 1 <= int(mth) <= 12 and 1900 <= int(y) <= 2100:
            campos["data_nascimento"] = f"{d}/{mth}/{y}"
            break

    # RG
    mrg = RG_RE.search(texto)
    if mrg:
        campos["rg"] = mrg.group(1)

    # Nome e filiação (mãe)
    campos["nome"] = _pega_nome(linhas, ["NOME"])
    campos["nome_mae"] = _pega_nome(linhas, ["FILIACAO", "FILIAÇÃO", "MAE", "MÃE"])

    return campos


def detecta_tipo(texto, forcado):
    if forcado in ("rg", "cnh"):
        return forcado
    up = texto.upper()
    if any(k in up for k in ["CARTEIRA NACIONAL", "HABILITACAO", "HABILITAÇÃO", "CNH", "DETRAN"]):
        return "cnh"
    if any(k in up for k in ["REGISTRO GERAL", "IDENTIDADE", "SSP", "SECRETARIA"]):
        return "rg"
    return "desconhecido"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", required=True)
    ap.add_argument("--type", default="auto", choices=["rg", "cnh", "auto"])
    args = ap.parse_args()

    pytesseract, Image, ImageOps, ImageFilter = _load_deps()

    try:
        img = Image.open(args.file)
    except Exception as e:
        _fail("Nao foi possivel abrir a imagem: " + str(e), "IMAGEM_INVALIDA")

    # Pré-processamento simples (sem OpenCV): tons de cinza, autocontraste, nitidez.
    try:
        proc = ImageOps.grayscale(img)
        proc = ImageOps.autocontrast(proc)
        proc = proc.filter(ImageFilter.SHARPEN)
    except Exception:
        proc = img

    try:
        texto = pytesseract.image_to_string(proc, lang="por")
    except Exception:
        # fallback sem o pacote de idioma português instalado
        try:
            texto = pytesseract.image_to_string(proc)
        except Exception as e:
            _fail("Falha ao executar o Tesseract: " + str(e), "FALHA_TESSERACT")

    campos = extrair_campos(texto)
    tipo = detecta_tipo(texto, args.type)
    preenchidos = sum(1 for v in campos.values() if v)
    confianca = round(preenchidos / len(campos), 2)

    print(json.dumps({
        "ok": True,
        "tipo": tipo,
        "campos": campos,
        "confianca": confianca,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
