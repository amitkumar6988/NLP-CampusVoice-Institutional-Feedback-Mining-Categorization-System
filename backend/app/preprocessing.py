from __future__ import annotations

import html
import re
from typing import Optional, Sequence

import spacy

try:
    nlp = spacy.load('en_core_web_sm')
except OSError:
    nlp = spacy.blank('en')
NEGATION_WORDS = {'not', 'no', 'never', 'none', 'cannot', 'cant', 'wont'}


def normalize_text(text: str) -> str:
    if not isinstance(text, str):
        return ''
    cleaned = html.unescape(text)
    cleaned = re.sub(r'https?://\S+|www\.\S+', ' ', cleaned)
    cleaned = re.sub(r'<.*?>', ' ', cleaned)
    cleaned = re.sub(r'[^A-Za-z0-9\s]', ' ', cleaned.lower())
    cleaned = re.sub(r'\s+', ' ', cleaned)
    return cleaned.strip()


def preprocess_text(text: str, remove_stopwords: bool = False, pos_filter: Optional[Sequence[str]] = None) -> str:
    normalized = normalize_text(text)
    if not normalized:
        return ''
    doc = nlp(normalized)
    tokens = []
    for token in doc:
        if token.is_space or token.is_punct:
            continue
        if not token.is_alpha and not token.is_digit:
            continue
        if token.is_stop and remove_stopwords and token.lemma_.lower() not in NEGATION_WORDS:
            continue
        if pos_filter and token.pos_ not in pos_filter:
            continue
        lemma = token.lemma_.lower()
        if lemma == '-PRON-':
            continue
        tokens.append(lemma)
    return ' '.join(tokens)


def safe_preprocess(text: str, **kwargs) -> str:
    try:
        return preprocess_text(text, **kwargs)
    except Exception:
        return normalize_text(text)
