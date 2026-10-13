"""Source-inspection tests for the Journal's daily prompt (PASTE 857).

The Journal box (#iDump) asks three things of every day — Spiritually / Emotionally / Physically —
as three quiet grey lines seeded on the first tap; a box holding only the untouched seed is empty to
every path; the three sections ride the one brain_dump column and stay private. These tests read the
source (the house style of test_prayer_flag.py); the live browser proof is golden_ht857_prompt.py.
"""
from pathlib import Path

REPO = Path(__file__).parent.parent  # ht/ root


def _js():
    return (REPO / 'app.js').read_text(encoding='utf-8')


def _css():
    return (REPO / 'app.css').read_text(encoding='utf-8')


def _export():
    return (REPO / 'tools' / 'export_day.py').read_text(encoding='utf-8')


def _fn_body(src, decl):
    """The text of a `function name(...)` block, decl -> the next top-level `\\n}`."""
    start = src.find(decl)
    assert start >= 0, 'missing: ' + decl
    end = src.find('\n}', start)
    assert end > start, 'unterminated: ' + decl
    return src[start:end]


def test_journal_prompt_one_string_table():
    """The three words live in ONE table so both surfaces change together."""
    src = _js()
    assert "HT857_PROMPT = ['Spiritually', 'Emotionally', 'Physically']" in src
    # the seed is BUILT from the table, never a second hand-written copy of the words
    assert 'function ht857Seed()' in src
    assert 'HT857_PROMPT.map(' in _fn_body(src, 'function ht857Seed()')


def test_journal_prompt_helpers_published():
    """The empty/store/sections/seed helpers exist and are published on __HT857 (getter surface)."""
    src = _js()
    for decl in ('function ht857Empty(', 'function ht857Store(',
                 'function ht857Sections(', 'function ht857Grey('):
        assert decl in src, 'missing ' + decl
    assert 'window.__HT857 = {' in src
    for k in ('seed:', 'empty:', 'store:', 'sections:', 'caret:'):
        assert k in src


def test_journal_prompt_empty_is_single_home():
    """ht857Empty strips the label scaffold and is what ht857Store uses — the one emptiness rule."""
    src = _js()
    empty = _fn_body(src, 'function ht857Empty(')
    assert 'Spiritually|Emotionally|Physically' in src  # the label regex
    assert '.trim()' in empty
    store = _fn_body(src, 'function ht857Store(')
    assert 'ht857Empty(text)' in store and "? ''" in store  # seed-only -> ''


def test_journal_prompt_seeded_on_first_tap_only_idump():
    """The seed fires on focus of an EMPTY #iDump, places the caret, and does NOT write S.priv."""
    src = _js()
    bind = _fn_body(src, 'function bindDump()')
    assert "t.addEventListener('focus'" in bind
    assert 'ht857Seed()' in bind
    assert 'setSelectionRange(' in bind and 'ht857Caret()' in bind
    # the focus seed block must not queue a save or set brain_dump (seeding stores nothing)
    focus_start = bind.find("t.addEventListener('focus'")
    focus_end = bind.find('});', focus_start)
    focus_block = bind[focus_start:focus_end]
    assert 'queuePriv' not in focus_block
    assert 'S.priv.brain_dump' not in focus_block


def test_journal_prompt_empty_to_every_path():
    """The ONE journal write path (HT-29 S1) stores ht857Store(...) for brain_dump — the single point
    that makes a seed-only box empty to every reader (the N3 save, HT-28c, the mirrors, the counts)."""
    src = _js()
    # the capture-phase one-input-path for the journal boxes writes S.priv[field]; #iDump is guarded
    assert "S.priv[field] = (field === 'brain_dump') ? ht857Store(t.value) : t.value" in src
    assert "if(field === 'brain_dump') ht857Grey(t)" in src


def test_journal_prompt_cleared_on_blur():
    """A blur listener clears an untouched seed so the grey prompt (and 'tap to write') returns."""
    bind = _fn_body(_js(), 'function bindDump()')
    blur_start = bind.find("t.addEventListener('blur'")
    assert blur_start >= 0
    blur_block = bind[blur_start:blur_start + 320]
    assert 'ht857Empty(t.value)' in blur_block
    assert "t.value = ''" in blur_block
    assert "S.priv.brain_dump = ''" in blur_block


def test_journal_prompt_grey_is_muted_ink():
    """The grey is the theme's muted ink token, never a new colour."""
    css = _css()
    assert 'textarea.ht857-seed' in css
    assert 'var(--muted)' in css
    # and the class is toggled by the untouched-seed state, not left on
    grey = _fn_body(_js(), 'function ht857Grey(')
    assert "classList.toggle('ht857-seed'" in grey


def test_journal_prompt_supersedes_s410():
    """The supersession of HT-30 S4.10 (for #iDump only) is recorded where S4.10 lives."""
    src = _js()
    assert src.count('S4.10') >= 2
    # both S4.10 comments name PASTE 857 as the supersession, scoped to #iDump
    assert 'SUPERSEDED by PASTE 857' in src or 'PASTE 857 SUPERSEDES' in src
    assert src.count('PASTE 857') >= 2


def test_journal_prompt_export_stays_private():
    """The public day export (job 852) carries NO journal text — the three sections stay private."""
    exp = _export()
    # the exported record is counts + rating only; no journal column is selected for export
    assert 'brain_dump' not in exp.split('def export_days')[1]  # not read in the export body
    assert 'R47.3' in exp
    assert 'PASTE 857' in exp  # the decision is recorded in the export's own docstring
