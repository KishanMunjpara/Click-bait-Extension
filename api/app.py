"""
CliNe API — classify news headlines as clickbait or not.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

import tensorflow as tf
from flask import Flask, jsonify, request
from flask_cors import CORS

BASE_DIR = Path(__file__).resolve().parent
MODELS_DIR = BASE_DIR / "models"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("cline")

MAX_LEN = 20
THRESHOLD = float(os.getenv("CLICKBAIT_THRESHOLD", "0.5"))

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

# Lazy-load so /health works even if model path is wrong during boot checks
_model = None
_tokenizer = None


def get_model():
    global _model, _tokenizer
    if _model is None:
        model_path = MODELS_DIR / "model8_10.h5"
        weights_path = MODELS_DIR / "weights_10.h5"
        tokenizer_path = MODELS_DIR / "tokenizer_10.pickle"
        logger.info("Loading Keras model from %s", model_path)
        _model = tf.keras.models.load_model(model_path, compile=False)
        _model.load_weights(weights_path)
        # pickle5 shim not needed on Python 3.8+
        import pickle

        with open(tokenizer_path, "rb") as f:
            _tokenizer = pickle.load(f)
        logger.info("Model ready")
    return _model, _tokenizer


@app.get("/")
def index():
    return jsonify(
        {
            "service": "CliNe API",
            "docs": "POST /predict with JSON {\"text\": \"<headline>\"}",
            "health": "/health",
        }
    )


@app.get("/health")
def health():
    try:
        get_model()
        return jsonify({"status": "ok", "model_loaded": True})
    except Exception as e:
        logger.exception("Health check failed")
        return jsonify({"status": "error", "detail": str(e)}), 500


@app.post("/predict")
def predict():
    payload = request.get_json(silent=True) or {}
    text = (payload.get("text") or "").strip()
    if not text:
        return jsonify({"error": "Field 'text' is required"}), 400

    try:
        model, tokenizer = get_model()
        sequence = tokenizer.texts_to_sequences([text])
        padded = tf.keras.preprocessing.sequence.pad_sequences(
            sequence, maxlen=MAX_LEN, padding="post"
        )
        score = float(model.predict(padded, verbose=0)[0][0])
        label = "clickbait" if score > THRESHOLD else "not_clickbait"
        logger.info("text=%r score=%.4f label=%s", text[:120], score, label)
        return jsonify(
            {
                "label": label,
                "score": round(score, 4),
                "threshold": THRESHOLD,
                "text": text,
            }
        )
    except Exception as e:
        logger.exception("Prediction failed")
        return jsonify({"error": "Prediction failed", "detail": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "10000"))
    # Warm model at startup for snappier first request
    try:
        get_model()
    except Exception:
        logger.warning("Model failed to preload; will retry on first /predict")
    app.run(host="0.0.0.0", port=port)
