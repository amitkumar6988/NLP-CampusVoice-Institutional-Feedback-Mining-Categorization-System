from __future__ import annotations

import numpy as np

from app.config import DEFAULT_REVIEW_THRESHOLD
from app.preprocessing import preprocess_text
from app.recommendations import build_recommendation


def get_influential_features(model, text, top_n=8):
    try:
        vectorizer = model.named_steps['tfidf']
        classifier = model.named_steps['classifier']
        if hasattr(classifier, 'coef_') and hasattr(classifier, 'predict_proba'):
            features = vectorizer.transform([text])
            class_index = np.argmax(classifier.predict_proba(features)[0])
            top_indices = np.argsort(classifier.coef_[class_index])[-top_n:][::-1]
            names = vectorizer.get_feature_names_out()
            ranked = [names[i] for i in top_indices if classifier.coef_[class_index][i] > 0]
            return ranked[:top_n]
    except Exception:
        pass
    return []


def infer_single_feedback(model_bundle, text: str, threshold: float = DEFAULT_REVIEW_THRESHOLD):
    cleaned = preprocess_text(text)
    model = model_bundle['selected_model']
    class_labels = list(model.classes_)
    if not cleaned:
        return {
            'predicted_category': 'Negative Feedback',
            'confidence': 0.0,
            'alternatives': [],
            'influential_features': [],
            'recommendation': build_recommendation('Negative Feedback'),
            'human_review': True,
        }

    prediction = model.predict([cleaned])[0]
    probs = model.predict_proba([cleaned])[0] if hasattr(model, 'predict_proba') else None
    confidence = float(np.max(probs)) if probs is not None else 0.5
    if probs is not None:
        ranked = sorted(zip(class_labels, probs), key=lambda x: x[1], reverse=True)
        alternatives = [label for label, _ in ranked[1:4]]
    else:
        alternatives = []

    return {
        'predicted_category': prediction,
        'confidence': round(float(confidence), 4),
        'alternatives': alternatives,
        'influential_features': get_influential_features(model, cleaned),
        'recommendation': build_recommendation(prediction),
        'human_review': bool(confidence < threshold),
    }
