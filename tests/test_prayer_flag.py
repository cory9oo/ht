"""Source-inspection tests for the HT33 prayer-journal feature flag (paste 850)."""
from pathlib import Path

REPO = Path(__file__).parent.parent  # ht/ root


def _src():
    return (REPO / 'app.js').read_text(encoding='utf-8')


def _html():
    return (REPO / 'index.html').read_text(encoding='utf-8')


def test_prayer_flag_constant_is_false():
    """HT33_PRAYER_JOURNAL must default to false."""
    assert 'HT33_PRAYER_JOURNAL = false' in _src()


def test_prayer_flag_helper_exists():
    """h33Prayer() function must be defined and expose the runtime override."""
    src = _src()
    assert 'function h33Prayer()' in src
    assert '__HT33_PRAYER' in src


def test_prayer_flag_published_getter():
    """window.__HT33PRAY.on is the published test handle."""
    assert '__HT33PRAY' in _src()


def test_prayer_flag_prayerbox_id_in_html():
    """index.html must carry id='prayerBox' on the prayer label."""
    assert 'id="prayerBox"' in _html()


def test_prayer_flag_gates_paintjournalinputs():
    """paintJournalInputs must gate prayer value and counter behind h33Prayer()."""
    src = _src()
    fn_start = src.find('function paintJournalInputs()')
    fn_end = src.find('\n}', fn_start)
    fn_body = src[fn_start:fn_end]
    assert 'h33Prayer()' in fn_body
    assert 'iPrayer' in fn_body


def test_prayer_flag_gates_htwhisper():
    """htWhisper must gate the prayer count behind h33Prayer()."""
    src = _src()
    fn_start = src.find('function htWhisper(')
    fn_end = src.find('\n}', fn_start)
    fn_body = src[fn_start:fn_end]
    assert 'h33Prayer()' in fn_body


def test_prayer_flag_gates_journal_archive_filter():
    """paintJournal filter must guard p.prayer behind h33Prayer()."""
    src = _src()
    fn_start = src.find('function paintJournal()')
    fn_end = src.find('\n}', fn_start)
    fn_body = src[fn_start:fn_end]
    assert 'h33Prayer()' in fn_body
    assert 'p.prayer' in fn_body


def test_prayer_flag_gates_journal_archive_render():
    """paintJournal must emit the prayer paragraph only when h33Prayer() is true."""
    src = _src()
    fn_start = src.find('function paintJournal()')
    fn_end = src.find('\n}', fn_start)
    fn_body = src[fn_start:fn_end]
    assert 'if(p.prayer && h33Prayer())' in fn_body
