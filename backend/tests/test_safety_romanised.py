"""Romanised Kannada ("Kanglish") safety rules. Phrases need native-speaker review before field use."""

import pytest

from agents.safety_controller import classify

CASES = [
    ("ulida maathre bere avarige kodabahuda?", "SELF_MEDICATION"),
    ("yaava antibiotic olleyadu?", "SELF_MEDICATION"),
    ("nanage jwara ide", "PERSONAL_MEDICAL"),
    ("nanna magu ge 3 dina inda kemmu", "PERSONAL_MEDICAL"),
    ("nanna maganige jwara ide, enu maadali", "PERSONAL_MEDICAL"),
    ("eshtu maathre tagobeku?", "DOSAGE"),
    ("usiru aadalu kashta aagtide", "URGENT"),
    ("ede novu ide", "URGENT"),
    # teaching questions must stay answerable
    ("ulida maathre yaake kodabaradu?", "SAFE"),
    ("antibiotics andre enu?", "SAFE"),
    ("AMR yaake mukhya?", "SAFE"),
    ("kai toleyuvudu yaake mukhya", "SAFE"),
    ("maathre course poorti yaake maadbeku", "SAFE"),
    ("antibiotics virus mele kelasa maadutta?", "SAFE"),
]


@pytest.mark.parametrize("text,category", CASES)
def test_romanised_kannada(text, category):
    assert classify(text).category == category
