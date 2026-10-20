import re
import unicodedata
import uuid
from typing import Dict, List, Optional, Pattern, Tuple

from agents.models import EscalationTask, SafetyResult

# Deterministic guardrail. No model calls. Its result can never be overridden by an agent.
# Priority: URGENT > DOSAGE > SELF_MEDICATION > PERSONAL_MEDICAL > SAFE

_FAMILY = r"(child|son|daughter|baby|kid|husband|wife|mother|father|mom|mum|dad|grand\w+|brother|sister|family|neighbou?r|patient)"
_MED = r"(antibiotics?|medicines?|medications?|tablets?|pills?|capsules?|drugs?|syrup|injection)"

# (rule id, category, regex). English rules use word boundaries to avoid hitting teaching questions
_EN_RULES: List[Tuple[str, str, str]] = [
    ("U-EN-BREATH", "URGENT", r"\b(can'?t|cannot|not|difficulty|trouble|hard to)\s+(breathe?|breathing)\b|\bshort(ness)? of breath\b"),
    ("U-EN-CHEST", "URGENT", r"\bchest pain\b"),
    ("U-EN-CONSCIOUS", "URGENT", r"\b(unconscious|fainted|fainting|passed out|not waking|seizures?|fits|convulsions?)\b"),
    ("U-EN-ALLERGY", "URGENT", r"\b(allergic reaction|anaphylaxis|severe allergy)\b|\breaction (to|after|from)\b[^.?!]{0,25}\b" + _MED),
    ("U-EN-SWELL", "URGENT", r"\b(swelling|swollen)\b[^.?!]{0,30}\b(face|lips?|tongue|throat)\b"),
    ("U-EN-RASH-AFTER", "URGENT", r"\b(rash|hives|swelling|itching)\b[^.?!]{0,40}\bafter\b[^.?!]{0,30}\b" + _MED),
    ("U-EN-BLEED", "URGENT", r"\bbleeding (heavily|a lot|won'?t stop)\b|\bblood in (vomit|stool|urine)\b"),
    ("U-EN-EMERGENCY", "URGENT", r"\bemergency\b"),
    ("D-EN-AMOUNT", "DOSAGE", r"\b(how (much|many)|what|which|correct|right|exact)\b[^.?!]{0,30}\b(doses?|dosage|mg|milligrams?|ml|tablets?|pills?|capsules?|spoons?|teaspoons?)\b"),
    ("D-EN-UNITS", "DOSAGE", r"\b\d+(\.\d+)?\s?(mg|ml|mcg)\b"),
    ("D-EN-FREQUENCY", "DOSAGE", r"\bhow (often|many times)\b[^.?!]{0,30}\b(take|give|have)\b"),
    ("D-EN-DOSAGE-FOR", "DOSAGE", r"\b(dosage|dose) (for|of)\b"),
    ("D-EN-PRESCRIBE", "DOSAGE", r"\b(prescribe|recommend|suggest)\b[^.?!]{0,20}\b" + _MED),
    ("S-EN-CAN-TAKE", "SELF_MEDICATION", r"\b(can|should|may|could|shall)\s+(i|we|he|she|they|my\s+\w+)\s+(take|give|use|buy|start|stop|continue|share)\b"),
    ("S-EN-WHICH-MED", "SELF_MEDICATION", r"\b(which|what)\s+" + _MED + r"\s+(should|to|can|do|for|is best)\b"),
    ("S-EN-NO-PRESCRIPTION", "SELF_MEDICATION", r"\bwithout (a |any )?(doctor|prescription)\b"),
    ("S-EN-START-STOP", "SELF_MEDICATION", r"\b(i|we|he|she|my\s+\w+)\s+(wants? to\s+|can\s+|should\s+|will\s+)?(stop|skip|quit|start)\s+(taking\s+|giving\s+)?(the\s+|my\s+|his\s+|her\s+)?(" + _MED + r"|course|dose)\b"),
    ("P-EN-SYMPTOM", "PERSONAL_MEDICAL", r"\b(i|i'm|i am|my\s+" + _FAMILY + r")\b[^.?!]{0,40}\b(fever|cough|cold|pain|sick|ill|infection|diarrh\w*|vomit\w*|rash|loose motions?|symptoms?|unwell|burning)\b"),
    ("P-EN-PREGNANT", "PERSONAL_MEDICAL", r"\b(i am|i'm|my wife is|she is)\s+pregnant\b|\bwhile pregnant\b|\bbreast-?feeding\b"),
    ("P-EN-NEED", "PERSONAL_MEDICAL", r"\b(do|does)\s+(i|he|she|my\s+\w+)\s+(have|need)\b"),
]

# Kannada phrases from lib/safety.ts (team-reviewed); matched as substrings
_KN_RULES: List[Tuple[str, str, List[str]]] = [
    ("U-KN", "URGENT", ["ಉಸಿರಾಟ ನಿಲ್ಲಿಸಿ", "ಎದೆ ನೋವು", "ಉಸಿರಾಟ ಕಷ್ಟ", "ಪ್ರತಿಕ್ರಿಯೆ", "ಅಲರ್ಜಿ", "ಪ್ರಜ್ಞೆ", "ಬಿದ್ದರು", "ರಕ್ತ ಬರುತ್ತಿದೆ", "ತಕ್ಷಣ ಸಹಾಯ"]),
    ("D-KN", "DOSAGE", ["ಎಷ್ಟು ಡೋಸ್", "ಔಷಧ ಸೂಚಿಸಿ", "ಡೋಸ್ ಏನು", "ಎಷ್ಟು ಮಿಲ್ಲಿಗ್ರಾಂ"]),
    ("S-KN", "SELF_MEDICATION", ["ಯಾವ ಔಷಧ ತೆಗೆದುಕೊಳ್ಳಲಿ", "ಯಾವ ಪ್ರತಿಜೀವಕ"]),
    ("P-KN", "PERSONAL_MEDICAL", ["ನನಗೆ ಜ್ವರ", "ನನ್ನ ಮಗುವಿಗೆ", "ನನ್ನ ಗಂಡನಿಗೆ", "ಎನ್ನ ತಾಯಿಗೆ", "ನನ್ನ ಕಾಯಿಲೆ", "ನನಗೆ ಔಷಧ", "ಗರ್ಭಿಣಿ"]),
]

# Hindi and Hinglish phrases: NEEDS REVIEW by a native speaker before field use
_HI_RULES: List[Tuple[str, str, List[str]]] = [
    ("U-HI", "URGENT", ["सांस नहीं", "सांस लेने में", "सीने में दर्द", "बेहोश", "एलर्जी", "दौरा पड़", "saans nahi", "behosh"]),
    ("D-HI", "DOSAGE", ["खुराक", "कितनी गोली", "कितनी दवा", "डोज़", "डोज", "kitni goli", "khurak"]),
    ("S-HI", "SELF_MEDICATION", ["कौन सी दवा", "कौन सा एंटीबायोटिक", "क्या मैं ले सकत", "दवा बंद कर", "kaun si dawa", "dawa band"]),
    ("P-HI", "PERSONAL_MEDICAL", ["मुझे बुखार", "मेरे बच्चे", "मेरी बेटी", "मेरे बेटे", "मेरे पति", "मेरी मां", "मेरी माँ", "गर्भवती", "mujhe bukhar"]),
]

_PRIORITY = ["URGENT", "DOSAGE", "SELF_MEDICATION", "PERSONAL_MEDICAL"]

_COMPILED: List[Tuple[str, str, Pattern]] = [(rid, cat, re.compile(rx, re.IGNORECASE)) for rid, cat, rx in _EN_RULES]

# Fixed messages. kn/en copied verbatim from lib/safety.ts; hi NEEDS native review.
_PRESCRIBING_KN = "AMR ಜಾಗೃತಿ ಔಷಧ ಸೂಚಿಸಲು ಅಥವಾ ಡೋಸ್ ಹೇಳಲು ಸಾಧ್ಯವಿಲ್ಲ. ಔಷಧಕ್ಕಾಗಿ ದಯವಿಟ್ಟು ಅರ್ಹ ವೈದ್ಯರ ಬಳಿ ತೆರಳಿ."
MESSAGES: Dict[str, Dict[str, str]] = {
    "URGENT": {
        "kn": "⚠️ ಇದು ತುರ್ತು ಪರಿಸ್ಥಿತಿ. ದಯವಿಟ್ಟು ತಕ್ಷಣ ಆರೋಗ್ಯ ಸಹಾಯವಾಣಿ **104** ಗೆ ಕರೆ ಮಾಡಿ ಅಥವಾ ಹತ್ತಿರದ ಆಸ್ಪತ್ರೆಗೆ ತೆರಳಿ. AMR ಜಾಗೃತಿ ಅಪ್ ತುರ್ತು ವೈದ್ಯಕೀಯ ಸಲಹೆ ನೀಡಲು ಸಾಧ್ಯವಿಲ್ಲ.",
        "en": "⚠️ This sounds like an emergency. Please call the health helpline **104** immediately or go to the nearest hospital. AMR Jagruti cannot provide emergency medical advice.",
        "hi": "⚠️ यह आपात स्थिति लगती है। कृपया तुरंत स्वास्थ्य हेल्पलाइन **104** पर कॉल करें या नज़दीकी अस्पताल जाएं। AMR जागृति आपातकालीन चिकित्सा सलाह नहीं दे सकता।",
    },
    "DOSAGE": {
        "kn": _PRESCRIBING_KN,
        "en": "AMR Jagruti cannot recommend, prescribe, or suggest doses of any medicine. Please consult a qualified doctor for any prescription.",
        "hi": "AMR जागृति कोई दवा या उसकी खुराक नहीं बता सकता। दवा के लिए कृपया योग्य डॉक्टर से सलाह लें।",
    },
    "SELF_MEDICATION": {
        "kn": _PRESCRIBING_KN,
        "en": "AMR Jagruti cannot advise anyone to take, give, start or stop a medicine. Please ask the ANM or a qualified doctor before using any antibiotic.",
        "hi": "AMR जागृति किसी को दवा लेने, देने, शुरू करने या बंद करने की सलाह नहीं दे सकता। कोई भी एंटीबायोटिक लेने से पहले ANM या योग्य डॉक्टर से पूछें।",
    },
    "PERSONAL_MEDICAL": {
        "kn": "ಇದು ವ್ಯಕ್ತಿಗತ ಆರೋಗ್ಯ ಪ್ರಶ್ನೆ. ದಯವಿಟ್ಟು ANM ಅಥವಾ ವೈದ್ಯರ ಬಳಿ ತೆರಳಿ. AMR ಜಾಗೃತಿ ಶಿಕ್ಷಣ ಸಾಧನ ಮಾತ್ರ, ವ್ಯಕ್ತಿಗತ ಚಿಕಿತ್ಸೆ ಅಲ್ಲ.",
        "en": "This appears to be a personal health question. Please consult an ANM or doctor. AMR Jagruti is an education tool only — it cannot provide personal medical advice or treatment.",
        "hi": "यह व्यक्तिगत स्वास्थ्य प्रश्न लगता है। कृपया ANM या डॉक्टर से मिलें। AMR जागृति केवल शिक्षा का साधन है, व्यक्तिगत इलाज नहीं।",
    },
}

# what the ASHA / supervisor must do (simulated referral)
_ACTIONS: Dict[str, Tuple[str, str]] = {
    "URGENT": ("refer_emergency_104", "Urgent: confirm today that the household called 104 or reached the nearest hospital."),
    "DOSAGE": ("refer_doctor_prescription", "Refer to a qualified doctor for any medicine or dose question."),
    "SELF_MEDICATION": ("refer_anm_self_medication", "Refer to the ANM or doctor; counsel against self-medication at the next visit."),
    "PERSONAL_MEDICAL": ("refer_anm_personal", "Refer the person to the ANM or doctor for their health concern."),
}


def _normalise(text: str) -> str:
    text = unicodedata.normalize("NFC", text).replace("’", "'").replace("‘", "'")
    return re.sub(r"\s+", " ", text).strip().lower()


def classify(text: str) -> SafetyResult:
    t = _normalise(text or "")
    hits: List[Tuple[str, str]] = []
    for rid, cat, rx in _COMPILED:
        if rx.search(t):
            hits.append((cat, rid))
    for rid, cat, phrases in _KN_RULES + _HI_RULES:
        if any(p.lower() in t for p in phrases):
            hits.append((cat, rid))
    if not hits:
        return SafetyResult(triggered=False, category="SAFE")
    cat, rid = min(hits, key=lambda h: _PRIORITY.index(h[0]))
    return SafetyResult(
        triggered=True, category=cat, ruleId=rid, message=MESSAGES[cat],
        helpline="104" if cat == "URGENT" else None,
    )


def escalation_for(result: SafetyResult) -> Optional[EscalationTask]:
    # privacy: the task stores category and rule id only, never the person's words
    if not result.triggered:
        return None
    key, text = _ACTIONS[result.category]
    return EscalationTask(
        id=f"esc-{uuid.uuid4().hex[:10]}", category=result.category, ruleId=result.ruleId or "",
        actionKey=key, action=text,
    )
