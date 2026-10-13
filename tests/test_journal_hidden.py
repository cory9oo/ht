"""Source-inspection tests for the HT876 journal-hidden feature flag (paste 876)."""
from pathlib import Path

REPO = Path(__file__).parent.parent  # ht/ root


def _src():
    return (REPO / 'app.js').read_text(encoding='utf-8')


def test_journal_hidden_constant_is_false():
    """HT876_JOURNAL must default to false."""
    assert 'HT876_JOURNAL = false' in _src()


def test_journal_hidden_helper_exists():
    """h876Journal() function must be defined and expose the runtime override."""
    src = _src()
    assert 'function h876Journal()' in src
    assert '__HT876_JOURNAL' in src


def test_journal_hidden_published_getter():
    """window.__HT876J.on is the published test handle."""
    assert '__HT876J' in _src()


def test_journal_hidden_dumpbox_id_set():
    """lab.id must be set to 'dumpBox' when the #iDump label is created dynamically."""
    assert "lab.id = 'dumpBox'" in _src()


def test_journal_hidden_gates_wire():
    """wire() must gate dumpBox display behind h876Journal()."""
    src = _src()
    assert 'dumpBox' in src
    assert "h876Journal() ? '' : 'none'" in src


def test_journal_hidden_data_kept():
    """The brain_dump column, ht857Store, and HT857_PROMPT must remain in the source."""
    src = _src()
    assert 'brain_dump' in src
    assert 'ht857Store' in src
    assert 'HT857_PROMPT' in src
