# Deterministic Kannada transliteration helpers for search. No model calls and no extra dependencies.
# kannada_to_latin() gives the informal romanisation people type on phones (ಜ್ವರ -> jvara, long ಈ/ಊ as
# ee/oo and long ಏ/ಓ as plain e/o), and
# phonetic_key() folds common spelling variants together (jwara / jvara / jvar -> jvar).
import re
import unicodedata
from typing import List

_VOWELS = {
    "ಅ": "a", "ಆ": "aa", "ಇ": "i", "ಈ": "ee", "ಉ": "u", "ಊ": "oo", "ಋ": "ru",
    "ಎ": "e", "ಏ": "e", "ಐ": "ai", "ಒ": "o", "ಓ": "o", "ಔ": "au",
}
_SIGNS = {
    "ಾ": "aa", "ಿ": "i", "ೀ": "ee", "ು": "u", "ೂ": "oo", "ೃ": "ru",
    "ೆ": "e", "ೇ": "e", "ೈ": "ai", "ೊ": "o", "ೋ": "o", "ೌ": "au",
}
_CONSONANTS = {
    "ಕ": "k", "ಖ": "kh", "ಗ": "g", "ಘ": "gh", "ಙ": "n",
    "ಚ": "ch", "ಛ": "chh", "ಜ": "j", "ಝ": "jh", "ಞ": "n",
    "ಟ": "t", "ಠ": "th", "ಡ": "d", "ಢ": "dh", "ಣ": "n",
    "ತ": "t", "ಥ": "th", "ದ": "d", "ಧ": "dh", "ನ": "n",
    "ಪ": "p", "ಫ": "ph", "ಬ": "b", "ಭ": "bh", "ಮ": "m",
    "ಯ": "y", "ರ": "r", "ಱ": "r", "ಲ": "l", "ವ": "v",
    "ಶ": "sh", "ಷ": "sh", "ಸ": "s", "ಹ": "h", "ಳ": "l", "ೞ": "l", "ಫ಼": "f", "ಜ಼": "z",
}
_VIRAMA = "್"
_ANUSVARA = "ಂ"
_VISARGA = "ಃ"
_NUKTA = "಼"
_DIGITS = {chr(0x0CE6 + i): str(i) for i in range(10)}
_INVISIBLE = {"‌", "‍"}  # ZWNJ / ZWJ only shape the glyphs


def kannada_to_latin(text: str) -> str:
    """Romanise Kannada script; anything else passes through unchanged."""
    text = unicodedata.normalize("NFC", text)
    out: List[str] = []
    i, n = 0, len(text)
    while i < n:
        ch = text[i]
        if ch in _INVISIBLE or ch == _NUKTA:
            i += 1
            continue
        if ch in _CONSONANTS:
            out.append(_CONSONANTS[ch])
            nxt = text[i + 1] if i + 1 < n else ""
            if nxt == _NUKTA:
                i += 1
                nxt = text[i + 1] if i + 1 < n else ""
            if nxt == _VIRAMA:
                i += 2
                continue
            if nxt in _SIGNS:
                out.append(_SIGNS[nxt])
                i += 2
                continue
            out.append("a")  # inherent vowel
            i += 1
            continue
        if ch in _VOWELS:
            out.append(_VOWELS[ch])
            # ಆ್ಯ / ಎ್ಯ spell the English "a" of loanwords (ಆ್ಯಂಟಿ = anti); drop the extra glide
            if i + 2 < n and text[i + 1] == _VIRAMA and text[i + 2] == "ಯ":
                out[-1] = "a"
                i += 3
                continue
            i += 1
            continue
        if ch == _ANUSVARA:
            nxt = text[i + 1] if i + 1 < n else ""
            out.append("m" if _CONSONANTS.get(nxt, "").startswith(("p", "b", "m")) or not nxt.strip() else "n")
            i += 1
            continue
        if ch == _VISARGA:
            out.append("h")
            i += 1
            continue
        if ch in (_VIRAMA,) or ch in _SIGNS:
            i += 1  # stray sign after a vowel
            continue
        out.append(_DIGITS.get(ch, ch))
        i += 1
    return "".join(out)


# order matters: longer patterns first
_FOLDS = [
    ("chh", "c"), ("ch", "c"), ("sh", "s"), ("kh", "k"), ("gh", "g"), ("jh", "j"),
    ("th", "t"), ("dh", "d"), ("ph", "p"), ("bh", "b"), ("au", "o"), ("ou", "o"),
    ("ee", "i"), ("ii", "i"), ("oo", "u"), ("uu", "u"), ("aa", "a"),
    ("w", "v"), ("z", "j"), ("f", "p"), ("q", "k"), ("x", "ks"), ("c", "c"),
]
_REPEAT = re.compile(r"(.)\1+")
_LATIN_WORD = re.compile(r"[a-z]+")


def phonetic_key(token: str) -> str:
    """Fold a romanised word to a loose key so spelling variants compare equal."""
    key = token.lower()
    for src, dst in _FOLDS:
        key = key.replace(src, dst)
    key = _REPEAT.sub(r"\1", key)
    # a trailing short vowel is often dropped when typing (jvara / jvar)
    if len(key) > 4 and key[-1] in "a":
        key = key[:-1]
    return key


def latin_keys(text: str) -> List[str]:
    """Phonetic keys for every Latin-letter word in text (Kannada script is romanised first)."""
    return [phonetic_key(w) for w in _LATIN_WORD.findall(kannada_to_latin(text).lower())]
