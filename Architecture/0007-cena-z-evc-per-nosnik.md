# ADR 0007 — Wyprowadzenie ceny z EVC per nośnik i typ monetyzacji

- Status: Proponowany
- Data: 2026-06-26
- Powiązane: ADR 0002 (jeden nośnik przychodu), ADR 0003 (override monetyzacji), ADR 0005 (EVC jako podstawa wyceny), ADR 0006 (sprzężenie surplus → adopcja)

## Kontekst

ADR 0005 wprowadza tryb „cena z EVC", ale opisuje wyprowadzenie ceny tylko dla nośników `cohort`
(`base_arpu`) i `plan` (`base_price`). Nośniki `pack` i `feature` (ADR 0002) monetyzują przez
`MonetizationConfig` — `price_per_credit`, `price_per_outcome`, `addon_monthly_fee`, model hybrydowy.
Jednostka rozliczeniowa jest tam **innej natury** niż ARPU: kredyt to jednostka **zużycia/kosztu**
(tokeny), outcome to jednostka **zdarzenia wartości** (np. deflekcja). Trzeba rozstrzygnąć, jak (i czy)
wyprowadzać z EVC cenę dla każdego z nich, bez psucia spójności value‑based.

## Decyzja

1. **Wspólny interfejs.** EVC oddaje warstwie cenowej **jedną** wielkość:
   `targetCapturePerUserMonth = capture × NetValue` (na aktywnego użytkownika AI na miesiąc). To jedyny
   kanał, którym EVC dotyka ceny.

2. **v1 — back‑solve tylko pokręteł „subscription‑like".** Tam, gdzie cena to płaska kwota na
   użytkownika/miesiąc, ustawiamy ją wprost na `targetCapturePerUserMonth`:
   - `cohort` → `base_arpu` (uplift),
   - `plan` → `base_price` (na seat),
   - monetyzacja `addon` → `addon_monthly_fee`.
   Jeden‑do‑jednego, **capture gwarantowane** niezależnie od zużycia.

3. **Usage/credit = cost‑plus z natury → EVC tylko benchmarkuje.** Kredyt jest jednostką **kosztu**
   (tokeny). Wyprowadzając `price_per_credit` z wartości, przywiązalibyśmy cenę klienta do struktury
   kosztów vendora — czyli cost‑plus, **odwrotność** value‑based pricingu. Dlatego dla `usage` EVC
   **nie steruje** ceną, lecz pokazuje **benchmark**: „EVC sugeruje `targetCapturePerUserMonth` vs Twoja
   cena cost‑plus daje X" — kontrola, nie napęd.

4. **Outcome = najczystszy value‑based → osobny follow‑up.** Gdy jednostka rozliczeniowa pokrywa się z
   jednostką wartości (deflekcja warta `v` klientowi), `price_per_outcome = capture × v` jest **wprost**
   ceną value‑based, a przychód skaluje się z dostarczoną wartością. To najlepszy mariaż z EVC, ale
   wymaga **nowego inputu** „wartość per outcome" (dekompozycja per‑event, nie per‑user/mc). Grunt jest
   gotowy (`outcomes_per_user_month`, deflekcje w archetypie agenta), więc traktujemy outcome jako
   dedykowany, priorytetowy follow‑up — nie wciskamy go w generyczny back‑solve.

5. **Hybrid = odłożone.** Wymaga reguły podziału `targetCapturePerUserMonth` między `hybrid_monthly_fee`
   a overage — osobna decyzja.

## Konsekwencje

Pozytywne:
- Jeden czysty interfejs EVC→cena (`targetCapturePerUserMonth`) zamiast logiki per‑typ rozsianej po silniku.
- Zachowana czystość value‑based tam, gdzie ma sens; uczciwe odcięcie się od cost‑plus (`usage`).
- Zgodność z ADR 0002 — EVC nadal nie tworzy nośnika, tylko wyznacza cenę istniejącego.

Negatywne / koszty:
- Dwa tryby do pokazania w UI dla EVC: **sterownik** (subscription‑like) vs **benchmark** (`usage`).

Wymaga dalszych decyzji:
- **Outcome‑based pricing** z inputem „wartość per outcome" (klejnot value‑based) — osobny ADR.
- **Hybrid** — reguła podziału fee vs overage.
