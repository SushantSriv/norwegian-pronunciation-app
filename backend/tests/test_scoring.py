import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scoring import align_words, phoneme_similarity  # noqa: E402


def test_align_words_all_equal():
    chunks = align_words(["jeg", "liker", "kaffe"], ["jeg", "liker", "kaffe"])
    assert chunks == [("equal", 0, 0), ("equal", 1, 1), ("equal", 2, 2)]


def test_align_words_catches_every_mismatch_not_just_first():
    # A naive zip() would only ever catch "hus" vs "hos" here and then
    # cascade every later index out of sync once "sol" is dropped.
    ref = ["jeg", "liker", "hus", "og", "sol"]
    hyp = ["jeg", "liker", "hos", "og"]
    chunks = align_words(ref, hyp)

    kinds_by_ref_idx = {c[1]: c[0] for c in chunks if c[1] is not None}
    assert kinds_by_ref_idx[0] == "equal"
    assert kinds_by_ref_idx[1] == "equal"
    assert kinds_by_ref_idx[2] == "substitute"  # hus -> hos
    assert kinds_by_ref_idx[3] == "equal"
    assert kinds_by_ref_idx[4] == "delete"  # "sol" never said


def test_align_words_handles_insertion():
    chunks = align_words(["hei"], ["hei", "hei"])
    kinds = [c[0] for c in chunks]
    assert "insert" in kinds
    assert any(kind == "equal" and ref_idx == 0 for kind, ref_idx, _ in chunks)


def test_phoneme_similarity_identical_is_one():
    assert phoneme_similarity("mɑːt", "mɑːt") == 1.0


def test_phoneme_similarity_completely_different_is_low():
    assert phoneme_similarity("mɑːt", "hɛɪ") < 0.3


def test_phoneme_similarity_partial_overlap_between_extremes():
    score = phoneme_similarity("sɔl", "sɔlː")
    assert 0.5 < score < 1.0


def test_phoneme_similarity_both_empty_is_one():
    assert phoneme_similarity("", "") == 1.0
