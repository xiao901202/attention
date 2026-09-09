"""
Ollama VLM API 客戶端範例
=========================
在另一台電腦上使用此腳本來呼叫 VLM API。

用法:
    # 方式1: 上傳圖片檔案
    python client_example.py --image photo.jpg --prompt "這張圖片裡有什麼？"

    # 方式2: 用 base64 傳送
    python client_example.py --image photo.jpg --prompt "Describe this image" --method json

環境變數:
    VLM_SERVER_URL  - 伺服器位址（預設 http://140.112.41.111:8899）
    VLM_API_KEY     - API 金鑰
"""

import argparse
import base64
import json
import os
import sys
from pathlib import Path

try:
    import requests
except ImportError:
    print("請先安裝 requests: pip install requests")
    sys.exit(1)


# ─── 設定 ──────────────────────────────────────────────────────────────────────

SERVER_URL = os.environ.get("VLM_SERVER_URL", "http://140.112.41.111:8899")
API_KEY = os.environ.get("VLM_API_KEY", "")


def describe_image_upload(image_path: str, prompt: str = "Describe this image in detail.", model: str = "moondream") -> dict:
    """
    方式1: 用 multipart/form-data 上傳圖片（推薦，簡單方便）
    """
    url = f"{SERVER_URL}/api/describe-upload"
    headers = {"Authorization": f"Bearer {API_KEY}"}

    with open(image_path, "rb") as f:
        files = {"file": (Path(image_path).name, f, "image/jpeg")}
        data = {"prompt": prompt, "model": model}
        response = requests.post(url, headers=headers, files=files, data=data, timeout=300)

    response.raise_for_status()
    return response.json()


def describe_image_json(image_path: str, prompt: str = "Describe this image in detail.", model: str = "moondream") -> dict:
    """
    方式2: 用 JSON body 傳送 base64 編碼的圖片
    """
    url = f"{SERVER_URL}/api/describe"
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    }

    with open(image_path, "rb") as f:
        image_b64 = base64.b64encode(f.read()).decode("utf-8")

    payload = {
        "prompt": prompt,
        "image_base64": image_b64,
        "model": model,
    }

    response = requests.post(url, headers=headers, json=payload, timeout=300)
    response.raise_for_status()
    return response.json()


def check_health() -> dict:
    """檢查伺服器健康狀態"""
    url = f"{SERVER_URL}/health"
    response = requests.get(url, timeout=10)
    response.raise_for_status()
    return response.json()


def list_models() -> list:
    """列出可用模型"""
    url = f"{SERVER_URL}/api/models"
    headers = {"Authorization": f"Bearer {API_KEY}"}
    response = requests.get(url, headers=headers, timeout=10)
    response.raise_for_status()
    return response.json()


# ─── 主程式 ────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Ollama VLM API 客戶端")
    parser.add_argument("--image", "-i", type=str, help="圖片檔案路徑")
    parser.add_argument("--prompt", "-p", type=str, default="Describe this image in detail.", help="提示語")
    parser.add_argument("--model", "-m", type=str, default="moondream", help="模型名稱")
    parser.add_argument("--method", type=str, choices=["upload", "json"], default="upload", help="傳送方式")
    parser.add_argument("--server", "-s", type=str, default=None, help="伺服器位址")
    parser.add_argument("--key", "-k", type=str, default=None, help="API 金鑰")
    parser.add_argument("--health", action="store_true", help="檢查伺服器狀態")
    parser.add_argument("--list-models", action="store_true", help="列出可用模型")

    args = parser.parse_args()

    global SERVER_URL, API_KEY
    if args.server:
        SERVER_URL = args.server
    if args.key:
        API_KEY = args.key

    # 健康檢查
    if args.health:
        result = check_health()
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return

    # 列出模型
    if args.list_models:
        result = list_models()
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return

    # 圖片描述
    if not args.image:
        parser.error("請提供圖片路徑 (--image)")

    if not os.path.exists(args.image):
        print(f"錯誤: 找不到圖片 '{args.image}'")
        sys.exit(1)

    print(f"伺服器: {SERVER_URL}")
    print(f"圖片: {args.image}")
    print(f"提示語: {args.prompt}")
    print(f"模型: {args.model}")
    print(f"方式: {args.method}")
    print("-" * 50)

    if args.method == "upload":
        result = describe_image_upload(args.image, args.prompt, args.model)
    else:
        result = describe_image_json(args.image, args.prompt, args.model)

    print(f"\n模型回應:\n{result['response']}")
    print(f"\n耗時: {result.get('total_duration_ms', 'N/A')} ms")


if __name__ == "__main__":
    main()
