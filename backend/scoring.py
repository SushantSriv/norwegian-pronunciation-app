# -*- coding: utf-8 -*-
"""Pure, model-free scoring helpers: word-level alignment and phoneme
similarity. Kept separate from main.py so they're testable without loading
Whisper or touching the network.
"""
from typing import List, Optional, Tuple

AlignmentChunk = Tuple[str, Optional[int], Optional[int]]  # (kind, ref_idx, hyp_idx)


def align_words(ref_words: List[str], hyp_words: List[str]) -> List[AlignmentChunk]:
    """Needleman-Wunsch style word-level alignment.

    Returns chunks in reference order: ("equal"|"substitute", ref_idx, hyp_idx),
    ("delete", ref_idx, None), or ("insert", None, hyp_idx). Unlike naively
    zipping the two word lists, this correctly re-syncs after any dropped or
    extra word instead of cascading every later index out of alignment.
    """
    n, m = len(ref_words), len(hyp_words)
    dp = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        dp[i][0] = i
    for j in range(1, m + 1):
        dp[0][j] = j
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            sub_cost = 0 if ref_words[i - 1] == hyp_words[j - 1] else 1
            dp[i][j] = min(
                dp[i - 1][j - 1] + sub_cost,  # match / substitute
                dp[i - 1][j] + 1,  # deletion (ref word missing from hyp)
                dp[i][j - 1] + 1,  # insertion (extra hyp word)
            )

    chunks: List[AlignmentChunk] = []
    i, j = n, m
    while i > 0 or j > 0:
        if (
            i > 0
            and j > 0
            and dp[i][j]
            == dp[i - 1][j - 1] + (0 if ref_words[i - 1] == hyp_words[j - 1] else 1)
        ):
            kind = "equal" if ref_words[i - 1] == hyp_words[j - 1] else "substitute"
            chunks.append((kind, i - 1, j - 1))
            i -= 1
            j -= 1
        elif i > 0 and dp[i][j] == dp[i - 1][j] + 1:
            chunks.append(("delete", i - 1, None))
            i -= 1
        else:
            chunks.append(("insert", None, j - 1))
            j -= 1

    chunks.reverse()
    return chunks


def _levenshtein(a: str, b: str) -> int:
    n, m = len(a), len(b)
    if a == b:
        return 0
    if n == 0:
        return m
    if m == 0:
        return n
    prev = list(range(m + 1))
    for i in range(1, n + 1):
        curr = [i] + [0] * m
        for j in range(1, m + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            curr[j] = min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
        prev = curr
    return prev[m]


def phoneme_similarity(expected_ipa: str, heard_ipa: str) -> float:
    """Normalized character-level similarity between two IPA strings, in
    [0, 1]. Used as a proxy for how close a mispronounced word sounded to
    the target, instead of just marking it flatly wrong.
    """
    if not expected_ipa and not heard_ipa:
        return 1.0
    longest = max(len(expected_ipa), len(heard_ipa), 1)
    distance = _levenshtein(expected_ipa, heard_ipa)
    return max(0.0, 1 - distance / longest)
