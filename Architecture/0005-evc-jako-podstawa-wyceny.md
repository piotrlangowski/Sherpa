# ADR 0005 — EVC jako podstawa wyceny (jeden silnik, dwie soczewki)

- Status: Proponowany
- Data: 2026-06-26
- Powiązane: ADR 0001 (typy modelowania), ADR 0002 (jeden nośnik przychodu), ADR 0003 (override monetyzacji), ADR 0004 (walidacja "zastąp, nie dodawaj"), ADR 0006 (sprzężenie surplus → adopcja), ADR 0007 (cena z EVC per nośnik), ADR 0008 (jedna waluta bazowa)

## Kontekst

EVC (Economic Value to Customer) jest dziś policzone na samym końcu, jako krok 5 kreatora scenariusza.
`calculateEVC` czyta gotowy `timeline` i zwraca pasmo cen (`priceFloor` / `priceTarget` / `priceCeiling`),
które **nigdzie nie wraca do modelu** — jest jedynie diagnostyką o wadze `info`. Cena nośnika
(`base_arpu` kohorty, `base_price` planu) pozostaje wolnym inputem wpisanym „z palca", a EVC tylko ją
po fakcie komentuje.

To jest odwrócona przyczynowość. W spójnym modelu finansowym **cena jest funkcją wartości dostarczonej
klientowi**: znając wartość usługi dla jednego klienta oraz bazę/kohorty i koszt dostarczenia, można
wyprowadzić przychodowość i dochodowość — a nie odwrotnie. EVC nie jest więc dodatkiem na końcu, tylko
naturalnym **fundamentem** wyceny.

Drugi, ukryty fakt: Sherpa już dziś liczy **P&L dostawcy (vendora)** metodą bottom‑up. Uplift ARPU
kohorty, redukcja churnu, akwizycja — to przyrostowy rachunek wyników SaaS‑a, który dokłada AI.
**Jedyną** soczewką *klienta* (jego NBA, koszt przejścia, wartość dla niego) jest właśnie EVC. Brakuje
mostu między tymi dwiema stronami tej samej transakcji — i to jest unikalna wartość, którą Sherpa może
pokazać: relację między tym, co dzieje się w P&L dostawcy, a wartością po stronie klienta.

Rozważono propozycję osobnego trybu „Vendor Business Case" — odrębnego kreatora z własnymi krokami
Volume / EVC / Capture / COGS. **Odrzucono.** Powielałby silnik adopcji (kohorty i krzywa S już
istnieją — ADR 0001, S‑curve), powielałby silnik COGS (tokeny + CAPEX/OPEX już są) i — co najgroźniejsze —
tworzyłby **drugie źródło prawdy o cenie i przychodzie**, otwierając na nowo drzwi do podwójnego
liczenia, które ADR 0001–0004 z trudem zamknął.

Diagnozą obciążone jest też samo obecne `calculateEVC`: miesza jednostki (per‑klient NBA z
12‑miesięcznym **agregatem** labor savings) i trzyma `incrementalVendorRevenue` (przychód *vendora*)
wewnątrz obiektu opisującego „wartość *dla klienta*". Ta konflacja jest m.in. źródłem zamieszania
walutowego i zakresowego (incydent EUR‑vs‑USD: EVC podane w jednej walucie, reszta modelu w innej).

## Decyzja

EVC przestaje być dodatkiem po fakcie, a staje się **podstawą (sufitem) wyceny**: dyscyplinuje cenę
istniejącego nośnika przychodu. Ten sam scenariusz prezentujemy jako **dwie soczewki** zasilane z
**jednego silnika** (`calculateScenario`). Trzy elementy decyzji:

### 1. Unit‑EVC — składniki egzogeniczne względem ceny vendora

Wartość liczymy **na jednostkę** (klient/miesiąc), z elementów, które **nie zależą od ceny**, jaką
vendor ostatecznie weźmie:

| Wielkość | Wzór |
|---|---|
| Net Created Value | `(Extra Value + Labor Savings klienta) − Switching Cost` |
| Unit EVC | `NBA + Net Created Value` |
| ARPU (cena) | `NBA + capture × Net Created Value` |
| Customer Surplus | `(1 − capture) × Net Created Value` |
| Vendor Unit Gross Profit | `ARPU − Unit COGS` |

`Unit COGS` pochodzi z istniejącego silnika (tokeny + CAPEX/OPEX). `capture` ∈ [0, 1] to udział
stworzonej wartości przechwytywany przez dostawcę.

### 2. Tryb „cena z EVC" (foundational)

Gdy tryb jest włączony, cena nośnika — `base_arpu` dla `carrier = cohort`, `base_price` dla
`carrier = plan` — jest **wyprowadzana** z `Unit EVC × capture target`, po czym istniejący
`calculateScenario` liczy przychód, NPV, payback i PI bez żadnych zmian w mechanice.

**Brak cyklu (kluczowy argument):** wszystkie składniki Net Created Value (NBA, Extra Value, Switching
Cost, labor savings po stronie klienta) są niezależne od ceny vendora — zależą od użycia i wartości
biznesowej, nie od tego, ile vendor policzy. Dlatego `cena = f(wartość)` nie tworzy pętli
`cena → przychód → cena`. Warunkiem poprawności jest **wyłączenie** `incrementalVendorRevenue` z
obiektu wartości (to przychód vendora, nie wartość klienta) — naprawa konflacji opisanej w Kontekście.

### 3. Jeden silnik, dwie soczewki + Value Pie

Ten sam policzony scenariusz pokazujemy dwojako:

- **Soczewka klienta:** Unit EVC, Customer Surplus, „czy klientowi się to opłaca".
- **Soczewka vendora:** ARR/MRR, gross margin po COGS, NPV / payback / PI (istniejące KPI).
- **Most — Value Pie:** `Net Created Value` rozbite na trzy części: **Customer Surplus / Vendor Gross
  Profit / COGS**. Jeden suwak (`capture %`) przesuwa wartość między klientem a dostawcą — i to jest
  wizualna esencja relacji obu soczewek.

### Zasada nadrzędna — zgodność z ADR 0001–0002

EVC **nie jest nowym nośnikiem przychodu**. To sposób **wyznaczenia ceny** istniejącego nośnika
(kohorta albo plan). W scenariuszu nadal obowiązuje **dokładnie jeden nośnik** (ADR 0002), a
`validateRevenueIntegrity` pozostaje bez zmian. EVC dyscyplinuje cenę nośnika — nie dokłada drugiego
strumienia pieniądza.

## Konsekwencje

Pozytywne:
- Cena zyskuje **proweniencję wartościową** — przestaje być liczbą z palca, a staje się funkcją
  wartości dla klienta.
- Powstaje **unikalny wgląd** (podział pie klient/vendor/COGS), niedostępny w zwykłych kalkulatorach ROI.
- Pełna **spójność z ADR 0002** — brak nowego nośnika, brak ryzyka podwójnego liczenia.
- **Naprawa konflacji** jednostek i waluty w EVC (per‑unit zamiast agregatu; przychód vendora poza
  obiektem wartości).

Negatywne / koszty:
- Wymaga **normalizacji EVC do per‑unit/miesiąc** — refactor `calculateEVC` i migracja pól
  `evc_*_annual_*` w schemacie.
- Wymaga **trybu derived‑price** i propagacji wyprowadzonej ceny do nośnika.
- Wymaga **dual‑lens UI** (przełącznik soczewek + Value Pie).

Wymaga dalszych decyzji (świadomie odroczone do osobnych ADR):
- **Sprzężenie surplus → adopcja:** większy surplus klienta (niższy `capture`) powinien przyspieszać
  krzywą S i obniżać churn, kosztem przychodu na jednostkę. Wynika z tego **optymalny `capture rate`
  maksymalizujący NPV vendora** — to north‑star follow‑up i najmocniejszy wyróżnik narzędzia.
- **Monetyzacja usage/outcome** (`carrier = pack/feature`): tam „ceną" jest `price_per_credit` /
  `price_per_outcome`, nie ARPU — jak wtedy działa wyprowadzenie ceny z EVC.
- **Waluty:** EVC i reszta modelu muszą operować w jednej walucie ustawień (domknięcie incydentu
  EUR‑vs‑USD).
