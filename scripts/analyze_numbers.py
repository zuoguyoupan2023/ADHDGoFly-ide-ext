"""
Analyze & delete numeric entries from ZH_word.json and EN_word.json.

Usage:
  python3 analyze_numbers.py                   # list all entries (preview)
  python3 analyze_numbers.py --dry-run          # preview what would be deleted
  python3 analyze_numbers.py --delete           # DELETE from both files (creates .bak)
"""

import json, re, shutil, os, sys

DICT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ZH_PATH = os.path.join(DICT_DIR, 'dictionaries', 'ZH_word.json')
EN_PATH = os.path.join(DICT_DIR, 'dictionaries', 'EN_word.json')

# ── English cardinal numbers to DELETE (pure number words) ────────
EN_CARDINAL_DELETE = {
    'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
    'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety',
    'hundred', 'thousand',
}
# KEEP these (have other meanings / uses):
#   first, second, third, ... (ordinal → adjective)
#   million, billion, trillion (large number nouns)
#   zero (temperature, programming, etc. — borderline but keep)
#   hundredth, thousandth, millionth (ordinals)

# ── Build regex for hyphenated cardinals: twenty-one, thirty-two, etc.
EN_HYPHEN_PATTERN = re.compile(
    r'^(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)-'
    r'(?:one|two|three|four|five|six|seven|eight|nine)$',
    re.IGNORECASE
)

def is_pure_digits(word):
    return bool(re.fullmatch(r'\d+', word))

def is_pure_cardinal(word):
    """Check if word is a pure English cardinal number to delete."""
    return word.lower() in EN_CARDINAL_DELETE or bool(EN_HYPHEN_PATTERN.match(word))


def count_entries(data):
    words = data.get('words', {})
    pure_digits = []
    cardinals = []
    for w in words:
        if is_pure_digits(w):
            pure_digits.append(w)
        elif is_pure_cardinal(w):
            cardinals.append(w)
    return pure_digits, cardinals


def format_list(items, limit=30):
    items.sort(key=lambda x: (len(x), x))
    s = ', '.join(repr(x) for x in items[:limit])
    if len(items) > limit:
        s += f', ... ({len(items) - limit} more)'
    return s


def do_delete(data, pure_digits, cardinals):
    words = data.get('words', {})
    deleted = {'digits': 0, 'cardinals': 0}
    for w in pure_digits:
        if w in words:
            del words[w]
            deleted['digits'] += 1
    for w in cardinals:
        if w in words:
            del words[w]
            deleted['cardinals'] += 1
    return deleted


def main():
    preview = '--delete' not in sys.argv
    dry_run = '--dry-run' in sys.argv

    if preview:
        print("PREVIEW MODE — no changes. Use --delete to actually delete, or --dry-run to preview deletions.")
    if dry_run:
        print("DRY RUN — will show what would be deleted.\n")

    # Load ZH
    with open(ZH_PATH, 'r') as f:
        zh_data = json.load(f)
    zh_words = zh_data.get('words', {})

    # Load EN
    with open(EN_PATH, 'r') as f:
        en_data = json.load(f)
    en_words = en_data.get('words', {})

    print(f"{'='*65}")
    print(f"  ZH_word.json: {len(zh_words):>7,} entries")
    print(f"  EN_word.json: {len(en_words):>7,} entries")
    print(f"{'='*65}")

    # ── ZH ──────────────────────────────────────────────────────
    zh_digits, zh_cardinals = count_entries(zh_data)
    print(f"\n{'─'*65}")
    print(f"  ZH_word.json — pure digits: {len(zh_digits)}, cardinals: {len(zh_cardinals)}")
    print(f"{'─'*65}")
    if zh_digits:
        print(f"  Digits: {format_list(zh_digits)}")
    if zh_cardinals:
        print(f"  Cardinals: {format_list(zh_cardinals)}")

    # ── EN ──────────────────────────────────────────────────────
    en_digits, en_cardinals = count_entries(en_data)
    print(f"\n{'─'*65}")
    print(f"  EN_word.json — pure digits: {len(en_digits)}, cardinals: {len(en_cardinals)}")
    print(f"{'─'*65}")
    if en_digits:
        print(f"  Digits: {format_list(en_digits, limit=40)}")
    if en_cardinals:
        print(f"  Cardinals: {format_list(en_cardinals, limit=40)}")

    # ── Execute deletion ────────────────────────────────────────
    total_to_delete = len(en_digits) + len(en_cardinals) + len(zh_digits) + len(zh_cardinals)
    print(f"\n{'='*65}")
    print(f"  Total entries to delete: {total_to_delete}")

    if not preview or dry_run:
        # Make backup
        if not dry_run:
            for src in [ZH_PATH, EN_PATH]:
                shutil.copy2(src, src + '.bak')
            print(f"  Backups created: *.bak")

        zh_del = do_delete(zh_data, zh_digits, zh_cardinals)
        en_del = do_delete(en_data, en_digits, en_cardinals)

        if not dry_run:
            with open(ZH_PATH, 'w') as f:
                json.dump(zh_data, f, ensure_ascii=False)
            with open(EN_PATH, 'w') as f:
                json.dump(en_data, f, ensure_ascii=False)

        print(f"\n  Deleted from ZH: {sum(zh_del.values())} entries")
        print(f"  Deleted from EN: {sum(en_del.values())} entries")
        print(f"  Total deleted:   {sum(zh_del.values()) + sum(en_del.values())}")

        if dry_run:
            print(f"\n  To actually delete, run: python3 {sys.argv[0]} --delete")
    else:
        print(f"\n  To delete, run: python3 {sys.argv[0]} --delete")


if __name__ == '__main__':
    main()
